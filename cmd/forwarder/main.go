package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"sync"
	"syscall"
	"time"
)

// ForwarderSession tracks an active SSM port forwarding session with its
// associated socat relay process.
type ForwarderSession struct {
	InstanceID   string    `json:"instance_id"`
	InstanceName string    `json:"instance_name"`
	LocalPort    int       `json:"local_port"`
	AWSProfile   string    `json:"aws_profile"`
	AWSRegion    string    `json:"aws_region"`
	StartedAt    time.Time `json:"started_at"`
	ssmProcess   *exec.Cmd
	socatProcess *exec.Cmd
}

var (
	activeSessions = make(map[string]*ForwarderSession)
	allocatedPorts = make(map[int]bool)
	mu             sync.RWMutex

	portRangeStart int
	portRangeEnd   int

	logger *log.Logger
)

func main() {
	logger = log.New(os.Stdout, "[forwarder] ", log.LstdFlags|log.Lshortfile)

	port := envInt("PORT", 5001)
	portRangeStart = envInt("PORT_RANGE_START", 33890)
	portRangeEnd = envInt("PORT_RANGE_END", 33999)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/sessions", handleSessions)
	mux.HandleFunc("/start", handleStart)
	mux.HandleFunc("/stop", handleStop)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	done := make(chan os.Signal, 1)
	signal.Notify(done, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		logger.Printf("Starting forwarder on :%d (port range %d-%d)", port, portRangeStart, portRangeEnd)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatalf("Server error: %v", err)
		}
	}()

	<-done
	logger.Println("Shutting down...")

	cleanupAll()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Printf("Shutdown error: %v", err)
	}
	logger.Println("Server stopped")
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

func handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	mu.RLock()
	resp := map[string]any{
		"status":           "healthy",
		"active_sessions":  len(activeSessions),
		"allocated_ports":  len(allocatedPorts),
	}
	mu.RUnlock()
	writeJSON(w, http.StatusOK, resp)
}

func handleSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	mu.RLock()
	sessions := make([]*ForwarderSession, 0, len(activeSessions))
	for _, s := range activeSessions {
		sessions = append(sessions, s)
	}
	mu.RUnlock()
	writeJSON(w, http.StatusOK, sessions)
}

func handleStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		InstanceID   string `json:"instance_id"`
		InstanceName string `json:"instance_name"`
		AWSProfile   string `json:"aws_profile"`
		AWSRegion    string `json:"aws_region"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.InstanceID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "instance_id is required"})
		return
	}

	// Return existing session if already running.
	mu.RLock()
	if existing, ok := activeSessions[req.InstanceID]; ok {
		mu.RUnlock()
		logger.Printf("Session already exists for %s on port %d", req.InstanceID, existing.LocalPort)
		writeJSON(w, http.StatusOK, map[string]any{
			"status":        "already_running",
			"instance_id":   existing.InstanceID,
			"port":          existing.LocalPort,
			"instance_name": existing.InstanceName,
		})
		return
	}
	mu.RUnlock()

	// Allocate a port.
	allocatedPort, err := getAvailablePort()
	if err != nil {
		logger.Printf("No available port: %v", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "no available ports"})
		return
	}

	internalPort := allocatedPort + 10000

	// Start SSM port forwarding.
	ssmCmd := exec.Command("aws", "ssm", "start-session",
		"--target", req.InstanceID,
		"--document-name", "AWS-StartPortForwardingSession",
		"--parameters", fmt.Sprintf("portNumber=3389,localPortNumber=%d", internalPort),
		"--profile", req.AWSProfile,
		"--region", req.AWSRegion,
	)
	ssmCmd.Stdout = os.Stdout
	ssmCmd.Stderr = os.Stderr

	if err := ssmCmd.Start(); err != nil {
		logger.Printf("Failed to start SSM session for %s: %v", req.InstanceID, err)
		mu.Lock()
		delete(allocatedPorts, allocatedPort)
		mu.Unlock()
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to start SSM session"})
		return
	}
	logger.Printf("SSM process started for %s (pid %d, internal port %d)", req.InstanceID, ssmCmd.Process.Pid, internalPort)

	// Give SSM time to establish the tunnel.
	time.Sleep(2 * time.Second)

	// Start socat relay.
	socatCmd := exec.Command("socat",
		fmt.Sprintf("TCP-LISTEN:%d,fork,reuseaddr,bind=0.0.0.0", allocatedPort),
		fmt.Sprintf("TCP:127.0.0.1:%d", internalPort),
	)
	socatCmd.Stdout = os.Stdout
	socatCmd.Stderr = os.Stderr

	if err := socatCmd.Start(); err != nil {
		logger.Printf("Failed to start socat for %s: %v", req.InstanceID, err)
		_ = ssmCmd.Process.Kill()
		mu.Lock()
		delete(allocatedPorts, allocatedPort)
		mu.Unlock()
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to start socat relay"})
		return
	}
	logger.Printf("Socat relay started for %s (pid %d, port %d -> %d)", req.InstanceID, socatCmd.Process.Pid, allocatedPort, internalPort)

	sess := &ForwarderSession{
		InstanceID:   req.InstanceID,
		InstanceName: req.InstanceName,
		LocalPort:    allocatedPort,
		AWSProfile:   req.AWSProfile,
		AWSRegion:    req.AWSRegion,
		StartedAt:    time.Now(),
		ssmProcess:   ssmCmd,
		socatProcess: socatCmd,
	}

	mu.Lock()
	activeSessions[req.InstanceID] = sess
	mu.Unlock()

	go monitorSession(req.InstanceID)

	writeJSON(w, http.StatusOK, map[string]any{
		"status":        "started",
		"instance_id":   req.InstanceID,
		"port":          allocatedPort,
		"instance_name": req.InstanceName,
	})
}

func handleStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		InstanceID string `json:"instance_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.InstanceID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "instance_id is required"})
		return
	}

	mu.Lock()
	sess, ok := activeSessions[req.InstanceID]
	if !ok {
		mu.Unlock()
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no active session for instance"})
		return
	}
	delete(activeSessions, req.InstanceID)
	delete(allocatedPorts, sess.LocalPort)
	mu.Unlock()

	killProcess(sess.socatProcess, "socat", req.InstanceID)
	killProcess(sess.ssmProcess, "ssm", req.InstanceID)

	logger.Printf("Session stopped for %s (port %d freed)", req.InstanceID, sess.LocalPort)
	writeJSON(w, http.StatusOK, map[string]any{
		"status":      "stopped",
		"instance_id": req.InstanceID,
	})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// getAvailablePort finds the first unallocated and unused port in the range.
func getAvailablePort() (int, error) {
	mu.Lock()
	defer mu.Unlock()

	for p := portRangeStart; p <= portRangeEnd; p++ {
		if allocatedPorts[p] {
			continue
		}
		// Verify the port is actually free on the host.
		ln, err := net.Listen("tcp", fmt.Sprintf(":%d", p))
		if err != nil {
			continue
		}
		ln.Close()

		allocatedPorts[p] = true
		return p, nil
	}
	return 0, fmt.Errorf("all ports in range %d-%d are exhausted", portRangeStart, portRangeEnd)
}

// monitorSession waits for the SSM process to exit, then cleans up.
func monitorSession(instanceID string) {
	mu.RLock()
	sess, ok := activeSessions[instanceID]
	if !ok {
		mu.RUnlock()
		return
	}
	ssmCmd := sess.ssmProcess
	mu.RUnlock()

	err := ssmCmd.Wait()
	logger.Printf("SSM process exited for %s: %v", instanceID, err)

	mu.Lock()
	sess, ok = activeSessions[instanceID]
	if !ok {
		mu.Unlock()
		return
	}
	delete(activeSessions, instanceID)
	delete(allocatedPorts, sess.LocalPort)
	mu.Unlock()

	killProcess(sess.socatProcess, "socat", instanceID)
	logger.Printf("Cleaned up session for %s (port %d freed)", instanceID, sess.LocalPort)
}

// cleanupAll terminates every active session. Called during graceful shutdown.
func cleanupAll() {
	mu.Lock()
	sessions := make(map[string]*ForwarderSession, len(activeSessions))
	for k, v := range activeSessions {
		sessions[k] = v
	}
	activeSessions = make(map[string]*ForwarderSession)
	allocatedPorts = make(map[int]bool)
	mu.Unlock()

	for id, sess := range sessions {
		killProcess(sess.socatProcess, "socat", id)
		killProcess(sess.ssmProcess, "ssm", id)
		logger.Printf("Cleaned up session for %s", id)
	}
}

// killProcess sends SIGKILL to a process if it is still running.
func killProcess(cmd *exec.Cmd, name, instanceID string) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	if err := cmd.Process.Kill(); err != nil {
		logger.Printf("Failed to kill %s process for %s: %v", name, instanceID, err)
	}
}

// writeJSON encodes v as JSON and writes it with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		logger.Printf("Failed to write JSON response: %v", err)
	}
}

// envInt reads an environment variable as int, returning defaultVal if unset
// or unparseable.
func envInt(key string, defaultVal int) int {
	s := os.Getenv(key)
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		logger.Printf("Invalid %s value %q, using default %d", key, s, defaultVal)
		return defaultVal
	}
	return v
}
