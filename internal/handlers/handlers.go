package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"sync"

	"cloudterm-go/internal/audit"
	"cloudterm-go/internal/aws"
	"cloudterm-go/internal/config"
	"cloudterm-go/internal/guacamole"
	"cloudterm-go/internal/session"
	"cloudterm-go/internal/types"

	"github.com/gorilla/websocket"
)

// Handler serves HTTP and WebSocket requests for CloudTerm.
type Handler struct {
	cfg       *config.Config
	discovery *aws.Discovery
	sessions  *session.Manager
	logger    *log.Logger
	audit     *audit.Logger
	upgrader  websocket.Upgrader
	clients   map[*websocket.Conn][]string // conn -> session IDs
	clientsMu sync.Mutex
	templates *template.Template
}

// New creates a Handler wired to the given dependencies.
func New(cfg *config.Config, discovery *aws.Discovery, sessions *session.Manager, logger *log.Logger, auditLogger *audit.Logger) *Handler {
	tmpl := template.Must(template.ParseGlob(filepath.Join("web", "templates", "*.html")))

	return &Handler{
		cfg:       cfg,
		discovery: discovery,
		sessions:  sessions,
		logger:    logger,
		audit:     auditLogger,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		clients:   make(map[*websocket.Conn][]string),
		templates: tmpl,
	}
}

// Router returns an http.Handler with all application routes registered.
func (h *Handler) Router() http.Handler {
	mux := http.NewServeMux()

	// Static files
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.Dir(filepath.Join("web", "static")))))

	// Template pages
	mux.HandleFunc("GET /{$}", h.serveIndex)
	mux.HandleFunc("GET /rdp-client", h.serveRDPClient)

	// API — read
	mux.HandleFunc("GET /instances", h.handleInstances)
	mux.HandleFunc("GET /scan-instances", h.handleScanInstances)
	mux.HandleFunc("GET /scan-region", h.handleScanRegion)
	mux.HandleFunc("GET /scan-status", h.handleScanStatus)
	mux.HandleFunc("GET /fleet-stats", h.handleFleetStats)
	mux.HandleFunc("GET /fleet-summary", h.handleFleetSummary)
	mux.HandleFunc("GET /rdp-mode", h.handleRDPMode)
	mux.HandleFunc("GET /detect-rdp-clients", h.handleDetectRDPClients)
	mux.HandleFunc("GET /guacamole-sessions", h.handleGuacamoleSessions)

	// API — write
	mux.HandleFunc("POST /start-rdp-session", h.handleStartRDPSession)
	mux.HandleFunc("POST /launch-rdp-client", h.handleLaunchRDPClient)
	mux.HandleFunc("POST /stop-rdp-session", h.handleStopRDPSession)
	mux.HandleFunc("POST /start-guacamole-rdp", h.handleStartGuacamoleRDP)
	mux.HandleFunc("POST /stop-guacamole-rdp", h.handleStopGuacamoleRDP)
	mux.HandleFunc("POST /upload-file", h.handleUploadFile)
	mux.HandleFunc("POST /download-file", h.handleDownloadFile)
	mux.HandleFunc("POST /browse-directory", h.handleBrowseDirectory)
	mux.HandleFunc("POST /broadcast-command", h.handleBroadcastCommand)

	// API — audit & metrics
	mux.HandleFunc("GET /audit-log", h.handleAuditLog)
	mux.HandleFunc("GET /instance-metrics", h.handleInstanceMetrics)

	// API — user preferences
	mux.HandleFunc("GET /preferences", h.handleGetPreferences)
	mux.HandleFunc("PUT /preferences", h.handlePutPreferences)

	// WebSocket
	mux.HandleFunc("GET /ws", h.handleWebSocket)

	return mux
}

// ---------------------------------------------------------------------------
// Template pages
// ---------------------------------------------------------------------------

func (h *Handler) serveIndex(w http.ResponseWriter, r *http.Request) {
	data := map[string]string{
		"WSEndpoint": fmt.Sprintf("ws://%s/ws", r.Host),
		"RDPMode":    h.cfg.RDPMode,
		"GuacWSURL":  h.cfg.GuacWSURL,
	}
	if err := h.templates.ExecuteTemplate(w, "index.html", data); err != nil {
		h.logger.Printf("template index.html: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

func (h *Handler) serveRDPClient(w http.ResponseWriter, r *http.Request) {
	if err := h.templates.ExecuteTemplate(w, "rdp-client.html", nil); err != nil {
		h.logger.Printf("template rdp-client.html: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

// ---------------------------------------------------------------------------
// API handlers
// ---------------------------------------------------------------------------

func (h *Handler) handleInstances(w http.ResponseWriter, r *http.Request) {
	data, err := h.discovery.GetInstances()
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, data)
}

func (h *Handler) handleFleetStats(w http.ResponseWriter, r *http.Request) {
	stats := h.discovery.GetFleetStats()
	jsonResponse(w, stats)
}

func (h *Handler) handleFleetSummary(w http.ResponseWriter, r *http.Request) {
	summary := h.discovery.GetFleetSummary()
	jsonResponse(w, summary)
}

func (h *Handler) handleScanInstances(w http.ResponseWriter, r *http.Request) {
	force := r.URL.Query().Get("force") == "true"
	go h.discovery.Scan(force)
	jsonResponse(w, map[string]string{"status": "scan_started"})
}

func (h *Handler) handleScanRegion(w http.ResponseWriter, r *http.Request) {
	profile := r.URL.Query().Get("profile")
	region := r.URL.Query().Get("region")
	if profile == "" || region == "" {
		jsonError(w, "profile and region are required", http.StatusBadRequest)
		return
	}
	count, err := h.discovery.ScanRegion(profile, region)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]interface{}{"status": "ok", "instances": count})
}

func (h *Handler) handleScanStatus(w http.ResponseWriter, r *http.Request) {
	status := h.discovery.ScanStatus()
	jsonResponse(w, status)
}

func (h *Handler) handleRDPMode(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, map[string]string{
		"mode":       h.cfg.RDPMode,
		"guac_ws_url": h.cfg.GuacWSURL,
	})
}

// ---------------------------------------------------------------------------
// Guacamole RDP handlers
// ---------------------------------------------------------------------------

func (h *Handler) handleStartGuacamoleRDP(w http.ResponseWriter, r *http.Request) {
	var req types.GuacamoleTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Ask SSM forwarder to start port forwarding
	fwdReq := types.ForwarderStartRequest{
		InstanceID:   req.InstanceID,
		InstanceName: req.InstanceName,
		AWSProfile:   req.AWSProfile,
		AWSRegion:    req.AWSRegion,
	}
	body, err := json.Marshal(fwdReq)
	if err != nil {
		jsonError(w, "failed to marshal forwarder request", http.StatusInternalServerError)
		return
	}

	fwdURL := fmt.Sprintf("%s/start", h.forwarderURL())
	resp, err := http.Post(fwdURL, "application/json", bytes.NewReader(body))
	if err != nil {
		jsonError(w, fmt.Sprintf("failed to contact SSM forwarder: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	var fwdResp types.ForwarderStartResponse
	if err := json.NewDecoder(resp.Body).Decode(&fwdResp); err != nil {
		jsonError(w, "failed to decode forwarder response", http.StatusBadGateway)
		return
	}

	// Generate encrypted Guacamole token
	token, err := guacamole.GenerateToken(h.cfg.GuacCryptSecret, guacamole.ConnectionParams{
		Hostname:     h.cfg.SSMForwarderHost,
		Port:         fmt.Sprintf("%d", fwdResp.Port),
		Username:     req.Username,
		Password:     req.Password,
		Security:     "nla",
		IgnoreCert:   "true",
		ResizeMethod: "display-update",
	})
	if err != nil {
		jsonError(w, fmt.Sprintf("failed to generate guacamole token: %v", err), http.StatusInternalServerError)
		return
	}

	rdpClientURL := fmt.Sprintf("/rdp-client?token=%s&name=%s&id=%s&ws=%s",
		url.QueryEscape(token),
		url.QueryEscape(req.InstanceName),
		url.QueryEscape(req.InstanceID),
		url.QueryEscape(h.cfg.GuacWSURL),
	)

	jsonResponse(w, types.GuacamoleTokenResponse{
		Token:        token,
		URL:          rdpClientURL,
		InstanceID:   req.InstanceID,
		InstanceName: req.InstanceName,
		WSURL:        h.cfg.GuacWSURL,
	})
}

func (h *Handler) handleStopGuacamoleRDP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceID string `json:"instance_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	body, _ := json.Marshal(req)
	fwdURL := fmt.Sprintf("%s/stop", h.forwarderURL())
	resp, err := http.Post(fwdURL, "application/json", bytes.NewReader(body))
	if err != nil {
		jsonError(w, fmt.Sprintf("failed to contact SSM forwarder: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func (h *Handler) handleGuacamoleSessions(w http.ResponseWriter, r *http.Request) {
	fwdURL := fmt.Sprintf("%s/sessions", h.forwarderURL())
	resp, err := http.Get(fwdURL)
	if err != nil {
		jsonError(w, fmt.Sprintf("failed to contact SSM forwarder: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

// ---------------------------------------------------------------------------
// RDP client detection
// ---------------------------------------------------------------------------

type rdpClient struct {
	Name      string `json:"name"`
	Command   string `json:"command"`
	Available bool   `json:"available"`
}

func (h *Handler) handleDetectRDPClients(w http.ResponseWriter, r *http.Request) {
	var clients []rdpClient

	switch runtime.GOOS {
	case "darwin":
		clients = []rdpClient{
			{Name: "MacFreeRDP", Command: "MacFreeRDP", Available: commandExists("MacFreeRDP")},
			{Name: "Windows App", Command: "open -a 'Windows App'", Available: appExists("Windows App")},
			{Name: "Microsoft Remote Desktop", Command: "open -a 'Microsoft Remote Desktop'", Available: appExists("Microsoft Remote Desktop")},
		}
	case "linux":
		clients = []rdpClient{
			{Name: "xfreerdp", Command: "xfreerdp", Available: commandExists("xfreerdp")},
			{Name: "rdesktop", Command: "rdesktop", Available: commandExists("rdesktop")},
		}
	case "windows":
		clients = []rdpClient{
			{Name: "mstsc", Command: "mstsc.exe", Available: true},
		}
	default:
		clients = []rdpClient{}
	}

	jsonResponse(w, clients)
}

// commandExists returns true if the named program is in PATH.
func commandExists(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

// appExists checks for a macOS .app bundle in /Applications.
func appExists(name string) bool {
	path := filepath.Join("/Applications", name+".app")
	return dirExists(path)
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.IsDir()
}

// ---------------------------------------------------------------------------
// Native RDP handlers (stubs)
// ---------------------------------------------------------------------------

func (h *Handler) handleStartRDPSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceID   string `json:"instance_id"`
		InstanceName string `json:"instance_name"`
		AWSProfile   string `json:"aws_profile"`
		AWSRegion    string `json:"aws_region"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	h.logger.Printf("start-rdp-session requested for %s (native mode stub)", req.InstanceID)
	jsonResponse(w, map[string]string{
		"status":      "not_implemented",
		"instance_id": req.InstanceID,
		"message":     "native RDP session management is not yet implemented",
	})
}

func (h *Handler) handleLaunchRDPClient(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceID string `json:"instance_id"`
		Client     string `json:"client"`
		Port       int    `json:"port"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	h.logger.Printf("launch-rdp-client requested for %s with %s (native mode stub)", req.InstanceID, req.Client)
	jsonResponse(w, map[string]string{
		"status":      "not_implemented",
		"instance_id": req.InstanceID,
		"message":     "native RDP client launch is not yet implemented",
	})
}

func (h *Handler) handleStopRDPSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceID string `json:"instance_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	h.logger.Printf("stop-rdp-session requested for %s (native mode stub)", req.InstanceID)
	jsonResponse(w, map[string]string{
		"status":      "not_implemented",
		"instance_id": req.InstanceID,
		"message":     "native RDP session stop is not yet implemented",
	})
}

// ---------------------------------------------------------------------------
// File transfer handlers
// ---------------------------------------------------------------------------

func (h *Handler) handleUploadFile(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(500 << 20); err != nil { // 500 MB max
		jsonError(w, "failed to parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	instanceID := r.FormValue("instance_id")
	remotePath := r.FormValue("remote_path")
	if instanceID == "" || remotePath == "" {
		jsonError(w, "instance_id and remote_path are required", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		jsonError(w, "failed to read file", http.StatusInternalServerError)
		return
	}

	profile := r.FormValue("aws_profile")
	region := r.FormValue("aws_region")
	platform := r.FormValue("platform")
	if profile == "" || region == "" {
		if p, rg, err := h.discovery.GetInstanceConfig(instanceID); err == nil {
			profile = p
			region = rg
		}
	}
	if platform == "" {
		platform = "linux"
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.WriteHeader(http.StatusOK)

	sendProgress := func(p aws.TransferProgress) {
		line, _ := json.Marshal(p)
		w.Write(line)
		w.Write([]byte("\n"))
		flusher.Flush()
	}

	if err := h.discovery.UploadFile(profile, region, instanceID, remotePath, platform, data, sendProgress); err != nil {
		sendProgress(aws.TransferProgress{Progress: 100, Message: err.Error(), Status: "error"})
		return
	}

	h.audit.Log(audit.AuditEvent{
		Action:     "file_upload",
		InstanceID: instanceID,
		Profile:    profile,
		Region:     region,
		Details:    fmt.Sprintf("path=%s", remotePath),
	})

	sendProgress(aws.TransferProgress{Progress: 100, Message: "Upload complete", Status: "complete"})
}

func (h *Handler) handleDownloadFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceID string `json:"instance_id"`
		RemotePath string `json:"remote_path"`
		AWSProfile string `json:"aws_profile"`
		AWSRegion  string `json:"aws_region"`
		Platform   string `json:"platform"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.InstanceID == "" || req.RemotePath == "" {
		jsonError(w, "instance_id and remote_path are required", http.StatusBadRequest)
		return
	}

	profile := req.AWSProfile
	region := req.AWSRegion
	platform := req.Platform
	if profile == "" || region == "" {
		if p, rg, err := h.discovery.GetInstanceConfig(req.InstanceID); err == nil {
			profile = p
			region = rg
		}
	}
	if platform == "" {
		platform = "linux"
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.WriteHeader(http.StatusOK)

	sendProgress := func(p aws.TransferProgress) {
		line, _ := json.Marshal(p)
		w.Write(line)
		w.Write([]byte("\n"))
		flusher.Flush()
	}

	fileData, filename, err := h.discovery.DownloadFile(profile, region, req.InstanceID, req.RemotePath, platform, sendProgress)
	if err != nil {
		sendProgress(aws.TransferProgress{Progress: 100, Message: err.Error(), Status: "error"})
		return
	}

	h.audit.Log(audit.AuditEvent{
		Action:     "file_download",
		InstanceID: req.InstanceID,
		Profile:    profile,
		Region:     region,
		Details:    fmt.Sprintf("path=%s", req.RemotePath),
	})

	// Send file data as base64 in the final NDJSON message.
	finalMsg := struct {
		Progress int    `json:"progress"`
		Message  string `json:"message"`
		Status   string `json:"status"`
		Data     string `json:"data"`
		Filename string `json:"filename"`
	}{
		Progress: 100,
		Message:  "Download complete",
		Status:   "complete",
		Data:     base64.StdEncoding.EncodeToString(fileData),
		Filename: filename,
	}
	line, _ := json.Marshal(finalMsg)
	w.Write(line)
	w.Write([]byte("\n"))
	flusher.Flush()
}

// ---------------------------------------------------------------------------
// WebSocket handler
// ---------------------------------------------------------------------------

func (h *Handler) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.Printf("websocket upgrade: %v", err)
		return
	}

	h.clientsMu.Lock()
	h.clients[conn] = []string{}
	h.clientsMu.Unlock()

	defer func() {
		h.clientsMu.Lock()
		sessionIDs := h.clients[conn]
		delete(h.clients, conn)
		h.clientsMu.Unlock()

		h.sessions.CloseSessionsForClient(sessionIDs)
		conn.Close()
	}()

	// writeMu serialises writes to this single connection.
	var writeMu sync.Mutex

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				h.logger.Printf("websocket read: %v", err)
			}
			break
		}

		var msg types.WSMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			h.logger.Printf("websocket unmarshal: %v", err)
			continue
		}

		switch msg.Type {
		case "start_session":
			h.wsStartSession(conn, &writeMu, msg.Payload)

		case "terminal_input":
			h.wsTerminalInput(msg.Payload)

		case "terminal_resize":
			h.wsTerminalResize(msg.Payload)

		case "terminal_interrupt":
			h.wsTerminalInterrupt(msg.Payload)

		case "close_session":
			h.wsCloseSession(conn, msg.Payload)

		default:
			h.logger.Printf("unknown ws message type: %s", msg.Type)
		}
	}
}

// wsStartSession launches an SSM session and wires output back to the WebSocket.
func (h *Handler) wsStartSession(conn *websocket.Conn, writeMu *sync.Mutex, payload interface{}) {
	raw, err := json.Marshal(payload)
	if err != nil {
		h.logger.Printf("wsStartSession marshal payload: %v", err)
		return
	}
	var msg struct {
		InstanceID string `json:"instance_id"`
		SessionID  string `json:"session_id"`
		AWSProfile string `json:"aws_profile"`
		AWSRegion  string `json:"aws_region"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		h.logger.Printf("wsStartSession unmarshal: %v", err)
		return
	}

	instanceID := msg.InstanceID
	sessionID := msg.SessionID
	awsProfile := msg.AWSProfile
	awsRegion := msg.AWSRegion

	// If the client didn't send profile/region, look them up from cached instance data.
	if awsProfile == "" || awsRegion == "" {
		if p, r, err := h.discovery.GetInstanceConfig(instanceID); err == nil {
			awsProfile = p
			awsRegion = r
		} else {
			h.logger.Printf("wsStartSession: instance config lookup failed for %s: %v", instanceID, err)
		}
	}

	onOutput := func(data []byte) {
		writeMu.Lock()
		defer writeMu.Unlock()
		outMsg := types.WSMessage{
			Type: "terminal_output",
			Payload: types.TerminalOutputMsg{
				InstanceID: instanceID,
				SessionID:  sessionID,
				Output:     string(data),
			},
		}
		if err := conn.WriteJSON(outMsg); err != nil {
			h.logger.Printf("ws write output for session %s: %v", sessionID, err)
		}
	}

	if err := h.sessions.StartSession(instanceID, sessionID, awsProfile, awsRegion, onOutput); err != nil {
		h.logger.Printf("start session %s: %v", sessionID, err)
		writeMu.Lock()
		conn.WriteJSON(types.WSMessage{
			Type: "session_error",
			Payload: types.SessionEventMsg{
				InstanceID: instanceID,
				SessionID:  sessionID,
				Error:      err.Error(),
			},
		})
		writeMu.Unlock()
		return
	}

	// Audit log the session start.
	h.audit.Log(audit.AuditEvent{
		Action:     "session_start",
		InstanceID: instanceID,
		Profile:    awsProfile,
		Region:     awsRegion,
		Details:    fmt.Sprintf("session_id=%s", sessionID),
	})

	// Track this session against the connection for cleanup.
	h.clientsMu.Lock()
	h.clients[conn] = append(h.clients[conn], sessionID)
	h.clientsMu.Unlock()

	writeMu.Lock()
	conn.WriteJSON(types.WSMessage{
		Type: "session_started",
		Payload: types.SessionEventMsg{
			InstanceID: instanceID,
			SessionID:  sessionID,
		},
	})
	writeMu.Unlock()
}

func (h *Handler) wsTerminalInput(payload interface{}) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return
	}
	var msg types.TerminalInputMsg
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}
	if err := h.sessions.WriteInput(msg.SessionID, []byte(msg.Input)); err != nil {
		h.logger.Printf("write input session %s: %v", msg.SessionID, err)
	}
}

func (h *Handler) wsTerminalResize(payload interface{}) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return
	}
	var msg types.TerminalResizeMsg
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}
	if err := h.sessions.ResizeTerminal(msg.SessionID, msg.Rows, msg.Cols); err != nil {
		h.logger.Printf("resize session %s: %v", msg.SessionID, err)
	}
}

func (h *Handler) wsTerminalInterrupt(payload interface{}) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return
	}
	var msg struct {
		SessionID string `json:"session_id"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}
	if err := h.sessions.SendInterrupt(msg.SessionID); err != nil {
		h.logger.Printf("interrupt session %s: %v", msg.SessionID, err)
	}
}

func (h *Handler) wsCloseSession(conn *websocket.Conn, payload interface{}) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return
	}
	var msg struct {
		SessionID string `json:"session_id"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}

	if err := h.sessions.CloseSession(msg.SessionID); err != nil {
		h.logger.Printf("close session %s: %v", msg.SessionID, err)
	}

	// Remove from the client's tracked sessions.
	h.clientsMu.Lock()
	ids := h.clients[conn]
	for i, id := range ids {
		if id == msg.SessionID {
			h.clients[conn] = append(ids[:i], ids[i+1:]...)
			break
		}
	}
	h.clientsMu.Unlock()
}

// ---------------------------------------------------------------------------
// Audit, metrics, file browser, broadcast handlers
// ---------------------------------------------------------------------------

func (h *Handler) findPlatform(instanceID string) string {
	instances, _ := h.discovery.GetAllInstances()
	for _, inst := range instances {
		if inst.InstanceID == instanceID {
			return inst.Platform
		}
	}
	return "linux"
}

func (h *Handler) handleAuditLog(w http.ResponseWriter, r *http.Request) {
	limit := 50
	offset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	events := h.audit.Recent(limit, offset)
	if events == nil {
		events = []audit.AuditEvent{}
	}
	jsonResponse(w, events)
}

func (h *Handler) handleInstanceMetrics(w http.ResponseWriter, r *http.Request) {
	instanceID := r.URL.Query().Get("instance_id")
	if instanceID == "" {
		jsonError(w, "instance_id is required", http.StatusBadRequest)
		return
	}

	profile, region, err := h.discovery.GetInstanceConfig(instanceID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}

	platform := h.findPlatform(instanceID)

	metrics, err := h.discovery.GetInstanceMetrics(profile, region, instanceID, platform)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, metrics)
}

func (h *Handler) handleBrowseDirectory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceID string `json:"instance_id"`
		Path       string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.InstanceID == "" || req.Path == "" {
		jsonError(w, "instance_id and path are required", http.StatusBadRequest)
		return
	}

	profile, region, err := h.discovery.GetInstanceConfig(req.InstanceID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}

	platform := h.findPlatform(req.InstanceID)

	entries, err := h.discovery.BrowseDirectory(profile, region, req.InstanceID, req.Path, platform)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if entries == nil {
		entries = []aws.FileEntry{}
	}
	jsonResponse(w, entries)
}

func (h *Handler) handleBroadcastCommand(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceIDs []string `json:"instance_ids"`
		Command     string   `json:"command"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if len(req.InstanceIDs) == 0 || req.Command == "" {
		jsonError(w, "instance_ids and command are required", http.StatusBadRequest)
		return
	}

	var targets []aws.BroadcastTarget
	for _, id := range req.InstanceIDs {
		profile, region, err := h.discovery.GetInstanceConfig(id)
		if err != nil {
			continue
		}
		inst := h.discovery.GetInstance(id)
		name := id
		platform := "linux"
		if inst != nil {
			name = inst.Name
			platform = inst.Platform
		}
		targets = append(targets, aws.BroadcastTarget{
			InstanceID: id,
			Name:       name,
			Profile:    profile,
			Region:     region,
			Platform:   platform,
		})
	}

	if len(targets) == 0 {
		jsonError(w, "no valid instances found", http.StatusBadRequest)
		return
	}

	h.audit.Log(audit.AuditEvent{
		Action:  "broadcast_command",
		Details: fmt.Sprintf("targets=%d cmd=%s", len(targets), req.Command),
	})

	results := h.discovery.BroadcastCommand(targets, req.Command)
	jsonResponse(w, results)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("json encode: %v", err)
	}
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (h *Handler) forwarderURL() string {
	return fmt.Sprintf("http://%s:%d", h.cfg.SSMForwarderHost, h.cfg.SSMForwarderPort)
}

// ---------------------------------------------------------------------------
// User Preferences
// ---------------------------------------------------------------------------

func (h *Handler) handleGetPreferences(w http.ResponseWriter, r *http.Request) {
	data, err := os.ReadFile(h.cfg.PreferencesFile)
	if err != nil {
		// No preferences file yet — return empty object
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("{}"))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func (h *Handler) handlePutPreferences(w http.ResponseWriter, r *http.Request) {
	data, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MB max
	if err != nil {
		jsonError(w, "failed to read body", http.StatusBadRequest)
		return
	}
	// Validate it's valid JSON
	var check json.RawMessage
	if json.Unmarshal(data, &check) != nil {
		jsonError(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if err := os.WriteFile(h.cfg.PreferencesFile, data, 0644); err != nil {
		jsonError(w, "failed to save preferences: "+err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]string{"status": "ok"})
}
