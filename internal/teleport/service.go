package teleport

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// LoginSession represents an active headless tsh login process
type LoginSession struct {
	ID        string
	ProxyURL  string
	HomeDir   string
	LocalURL  *url.URL
	Cmd       *exec.Cmd
	Status    string // "pending", "success", "failed"
	Error     string
	CreatedAt time.Time
	Context   context.Context
	Cancel    context.CancelFunc
}

// Service manages active Teleport (tsh) headless login sessions
type Service struct {
	logins    map[string]*LoginSession
	certCache map[string][]byte
	keyCache  map[string][]byte
	mu        sync.RWMutex
	logger    *log.Logger
}

// NewService creates a new Teleport proxy service
func NewService(logger *log.Logger) *Service {
	return &Service{
		logins:    make(map[string]*LoginSession),
		certCache: make(map[string][]byte),
		keyCache:  make(map[string][]byte),
		logger:    logger,
	}
}

// StartLogin initiates a headless tsh login session and returns a session ID
func (s *Service) StartLogin(proxy, authType string) (string, error) {
	sessionID := uuid.New().String()
	
	// Create isolated home directory for this tsh session
	homeDir := filepath.Join(os.TempDir(), "cloudterm-teleport-"+sessionID)
	if err := os.MkdirAll(homeDir, 0700); err != nil {
		return "", fmt.Errorf("failed to create isolated home dir: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	
	args := []string{"login", "--proxy=" + proxy, "--browser=none"}
	if authType != "default" && authType != "" {
		args = append(args, "--auth="+authType)
	}
	cmd := exec.CommandContext(ctx, "tsh", args...)
	
	// Ensure isolated environment and disable agent
	cmd.Env = append(os.Environ(),
		"HOME="+homeDir,
		"TELEPORT_ADD_KEYS_TO_AGENT=no",
		"SSH_AUTH_SOCK=",
	)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		os.RemoveAll(homeDir)
		return "", fmt.Errorf("stdout pipe failed: %w", err)
	}
	
	// Important: Pipe stderr to capture errors if tsh fails immediately
	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		os.RemoveAll(homeDir)
		return "", fmt.Errorf("stderr pipe failed: %w", err)
	}

	session := &LoginSession{
		ID:        sessionID,
		ProxyURL:  proxy,
		HomeDir:   homeDir,
		Cmd:       cmd,
		Status:    "pending",
		CreatedAt: time.Now(),
		Context:   ctx,
		Cancel:    cancel,
	}

	s.mu.Lock()
	s.logins[sessionID] = session
	s.mu.Unlock()

	if err := cmd.Start(); err != nil {
		cancel()
		os.RemoveAll(homeDir)
		s.deleteSession(sessionID)
		return "", fmt.Errorf("failed to start tsh: %w", err)
	}

	localURLChan := make(chan *url.URL)
	errChan := make(chan error)

	// Goroutine to monitor stdout for the local callback URL
	go func() {
		reader := bufio.NewReader(io.MultiReader(stdout, stderr))
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				if err != io.EOF {
					s.logger.Printf("Teleport tsh error reading output: %v", err)
				}
				break
			}
			
			line = strings.TrimSpace(line)
			s.logger.Printf("tsh [%s]: %s", sessionID[:8], line)
			
			// Look for: http://127.0.0.1:port/path
			if strings.Contains(line, "http://127.0.0.1:") || strings.Contains(line, "http://localhost:") {
				// Extract the URL substring
				parts := strings.Split(line, "http")
				if len(parts) >= 2 {
					rawURL := strings.TrimSpace("http" + parts[1])
					parsedURL, parseErr := url.Parse(rawURL)
					if parseErr == nil {
						select {
						case localURLChan <- parsedURL:
						default:
						}
					}
				}
			} else if strings.Contains(strings.ToLower(line), "error") || strings.Contains(strings.ToLower(line), "failed") {
				select {
				case errChan <- fmt.Errorf("%s", line):
				default:
				}
			}
		}
	}()

	// Wait for the local URL to be emitted or command to fail
	select {
	case localURL := <-localURLChan:
		session.LocalURL = localURL
		s.logger.Printf("Teleport login %s mapped to %s", sessionID, localURL.String())
	case err := <-errChan:
		cancel()
		s.deleteSession(sessionID)
		os.RemoveAll(homeDir)
		return "", fmt.Errorf("tsh failed: %v", err)
	case <-time.After(30 * time.Second):
		cancel()
		s.deleteSession(sessionID)
		os.RemoveAll(homeDir)
		return "", fmt.Errorf("timeout waiting for tsh to provide local auth URL")
	}

	// Goroutine to wait for the command to finish after user finishes SSO
	go func() {
		defer cancel()
		err := cmd.Wait()
		
		s.mu.Lock()
		defer s.mu.Unlock()
		
		if err != nil {
			session.Status = "failed"
			session.Error = err.Error()
			s.logger.Printf("Teleport login %s failed: %v", sessionID, err)
		} else {
			session.Status = "success"
			s.logger.Printf("Teleport login %s succeeded!", sessionID)
		}
	}()

	return sessionID, nil
}

// ProxyRequest acts as a reverse proxy to the underlying headless tsh loopback server
func (s *Service) ProxyRequest(sessionID string, w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	session, ok := s.logins[sessionID]
	s.mu.RUnlock()

	if !ok {
		http.Error(w, "invalid or expired session", http.StatusNotFound)
		return
	}

	if session.LocalURL == nil {
		http.Error(w, "session not ready", http.StatusServiceUnavailable)
		return
	}

	// proxy to local address
	targetURL, _ := url.Parse(fmt.Sprintf("http://%s", session.LocalURL.Host))
	
	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	
	// Update request to look like it belongs to the target
	r.URL.Host = targetURL.Host
	r.URL.Scheme = targetURL.Scheme
	r.Header.Set("X-Forwarded-Host", r.Header.Get("Host"))
	r.Host = targetURL.Host

	proxy.ServeHTTP(w, r)
}

// GetStatus checks if the login session has completed and returns the certificates if successful
func (s *Service) GetStatus(sessionID string) (status, errStr string, certData, keyData []byte) {
	s.mu.RLock()
	session, ok := s.logins[sessionID]
	s.mu.RUnlock()

	if !ok {
		return "not_found", "session does not exist", nil, nil
	}

	if session.Status == "pending" {
		return "pending", "", nil, nil
	}

	if session.Status == "failed" {
		return "failed", session.Error, nil, nil
	}

	// If success, read the cert and key from ~/.tsh/keys/<proxy>
	// tsh stores them as ~/.tsh/keys/<proxy>/<user>-x509.pem and <user>.key
	// However, we just know the proxy name. Let's find them.
	proxyHost := session.ProxyURL
	if strings.Contains(proxyHost, ":") {
		proxyHost = strings.Split(proxyHost, ":")[0]
	}
	
	keysDir := filepath.Join(session.HomeDir, ".tsh", "keys", proxyHost)
	files, err := os.ReadDir(keysDir)
	if err != nil {
		return "failed", "could not read keys directory: " + err.Error(), nil, nil
	}

	var certFile, keyFile string
	for _, f := range files {
		if strings.HasSuffix(f.Name(), "-x509.pem") || strings.HasSuffix(f.Name(), "-cert.pub") && !strings.HasPrefix(f.Name(), "cas") {
			certFile = filepath.Join(keysDir, f.Name())
		}
		if !strings.HasSuffix(f.Name(), ".pub") && !strings.HasSuffix(f.Name(), ".pem") && !strings.Contains(f.Name(), "known_hosts") && !strings.Contains(f.Name(), "cas") {
			// This is typically <user> where <user>.pub exists
			// But tsh usually names it as the username without extension
			info, _ := f.Info()
			if !info.IsDir() {
				keyFile = filepath.Join(keysDir, f.Name())
			}
		}
	}
	
	// Wait, Teleport 12+ stores them directly in ~/.tsh/keys/<proxy>/<user>-x509.pem
	// The key is ~/.tsh/keys/<proxy>/<user>
	
	if certFile == "" || keyFile == "" {
		// Let's just find any files that might be the key and cert pair
		return "failed", "could not find cert or key in ~/.tsh/keys", nil, nil
	}

	certData, err = os.ReadFile(certFile)
	if err != nil {
		return "failed", "failed to read cert: " + err.Error(), nil, nil
	}
	keyData, err = os.ReadFile(keyFile)
	if err != nil {
		return "failed", "failed to read key: " + err.Error(), nil, nil
	}

	return "success", "", certData, keyData
}

// Cleanup removes the isolated home directory and stops the command
func (s *Service) Cleanup(sessionID string) {
	s.mu.Lock()
	session, ok := s.logins[sessionID]
	if ok {
		delete(s.logins, sessionID)
		session.Cancel()
		os.RemoveAll(session.HomeDir)
	}
	s.mu.Unlock()
}

func (s *Service) deleteSession(sessionID string) {
	s.mu.Lock()
	delete(s.logins, sessionID)
	s.mu.Unlock()
}

// CacheCredentials temporarily stores valid Teleport certificates
func (s *Service) CacheCredentials(sessionID string, cert, key []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.certCache[sessionID] = cert
	s.keyCache[sessionID] = key
}

// FetchCredentials retrieves and removes temporarily stored Teleport certificates
func (s *Service) FetchCredentials(sessionID string) (cert, key []byte, ok bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cert, okCert := s.certCache[sessionID]
	key, okKey := s.keyCache[sessionID]
	
	if okCert && okKey {
		delete(s.certCache, sessionID)
		delete(s.keyCache, sessionID)
		return cert, key, true
	}
	return nil, nil, false
}
