package handlers

import (
	"bytes"
	"context"
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
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"cloudterm-go/internal/audit"
	"cloudterm-go/internal/aws"
	"cloudterm-go/internal/config"
	"cloudterm-go/internal/guacamole"
	"cloudterm-go/internal/llm"
	"cloudterm-go/internal/session"
	"cloudterm-go/internal/suggest"
	"cloudterm-go/internal/teleport"
	"cloudterm-go/internal/types"
	"cloudterm-go/internal/vault"

	"cloudterm-go/internal/k8s"

	"github.com/gorilla/websocket"
)

// Handler serves HTTP and WebSocket requests for CloudTerm.
type Handler struct {
	cfg          *config.Config
	discovery    *aws.Discovery
	sessions     *session.Manager
	logger       *log.Logger
	audit        *audit.Logger
	accounts     *aws.AccountStore
	suggest      *suggest.Engine
	vault        *vault.Store
	costExplorer *aws.CostExplorerService
	eksService   *aws.EKSService
	k8sPool      *k8s.ClientPool
	teleport     *teleport.Service
	observers    map[string]*suggest.Observer
	obsMu        sync.Mutex
	upgrader     websocket.Upgrader
	clients      map[*websocket.Conn][]string
	clientsMu    sync.Mutex
	templates    *template.Template
}

// New creates a Handler wired to the given dependencies.
func New(cfg *config.Config, discovery *aws.Discovery, sessions *session.Manager, logger *log.Logger, auditLogger *audit.Logger, accounts *aws.AccountStore, suggestEngine *suggest.Engine, vaultStore *vault.Store) *Handler {
	tmpl := template.Must(template.ParseGlob(filepath.Join("web", "templates", "*.html")))

	costSvc := aws.NewCostExplorerService(cfg, accounts, logger)
	eksSvc := aws.NewEKSService(cfg, accounts, logger)

	tokenRefresher := func(accountID, region, clusterName string) (string, error) {
		return eksSvc.GetToken(context.Background(), accountID, region, clusterName)
	}
	k8sPool := k8s.NewClientPool(logger, tokenRefresher)

	return &Handler{
		cfg:          cfg,
		discovery:    discovery,
		sessions:     sessions,
		logger:       logger,
		audit:        auditLogger,
		accounts:     accounts,
		suggest:      suggestEngine,
		vault:        vaultStore,
		costExplorer: costSvc,
		eksService:   eksSvc,
		k8sPool:      k8sPool,
		teleport:     teleport.NewService(logger),
		observers:    make(map[string]*suggest.Observer),
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

	// React frontend assets
	mux.Handle("GET /assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir(filepath.Join("web", "frontend", "dist", "assets")))))

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
	mux.HandleFunc("GET /guac-ws/", h.handleGuacWebSocketProxy)
	mux.HandleFunc("POST /upload-file", h.handleUploadFile)
	mux.HandleFunc("POST /download-file", h.handleDownloadFile)
	mux.HandleFunc("POST /browse-directory", h.handleBrowseDirectory)
	mux.HandleFunc("POST /broadcast-command", h.handleBroadcastCommand)
	mux.HandleFunc("POST /express-upload", h.handleExpressUpload)
	mux.HandleFunc("POST /express-download", h.handleExpressDownload)
	mux.HandleFunc("POST /export-session", h.handleExportSession)
	mux.Handle("GET /exports/", http.StripPrefix("/exports/", http.FileServer(http.Dir(h.cfg.TerminalExportDir))))

	// Port forwarding proxy
	mux.HandleFunc("POST /start-port-forward", h.handleStartPortForward)
	mux.HandleFunc("POST /stop-port-forward", h.handleStopPortForward)
	mux.HandleFunc("GET /active-tunnels", h.handleActiveTunnels)

	// Recordings
	mux.HandleFunc("GET /recordings", h.handleListRecordings)
	mux.HandleFunc("GET /recordings/", h.handleServeRecording)
	mux.HandleFunc("DELETE /recordings/", h.handleDeleteRecording)
	mux.HandleFunc("POST /toggle-recording", h.handleToggleRecording)
	mux.HandleFunc("POST /convert-recording", h.handleConvertRecording)
	mux.HandleFunc("GET /convert-status/", h.handleConvertStatus)

	// AWS accounts management
	mux.HandleFunc("GET /aws-accounts", h.handleListAWSAccounts)
	mux.HandleFunc("POST /aws-accounts", h.handleAddAWSAccount)
	mux.HandleFunc("DELETE /aws-accounts/", h.handleDeleteAWSAccount)
	mux.HandleFunc("POST /aws-accounts/scan/", h.handleScanAWSAccount)

	// API — audit & metrics
	mux.HandleFunc("GET /audit-log", h.handleAuditLog)
	mux.HandleFunc("GET /instance-metrics", h.handleInstanceMetrics)
	mux.HandleFunc("GET /instance-details", h.handleInstanceDetails)
	mux.HandleFunc("GET /suggest-status", h.handleSuggestStatus)
	mux.HandleFunc("GET /vault/credentials", h.handleVaultList)
	mux.HandleFunc("POST /vault/credentials", h.handleVaultSave)
	mux.HandleFunc("DELETE /vault/credentials", h.handleVaultDelete)
	mux.HandleFunc("GET /vault/match", h.handleVaultMatch)
	mux.HandleFunc("GET /db-viewer", h.handleDBViewer)

	// AI Agent
	mux.HandleFunc("POST /ai-agent/chat", h.handleAIChat)
	mux.HandleFunc("GET /ai-agent/context", h.handleAIContext)

	// Clone instance
	mux.HandleFunc("POST /clone/start", h.handleCloneStart)
	mux.HandleFunc("GET /clone/status/{id}", h.handleCloneStatus)
	mux.HandleFunc("GET /clone/settings/{id}", h.handleCloneSettings)
	mux.HandleFunc("POST /clone/launch/{id}", h.handleCloneLaunch)

	// Topology & Reachability
	mux.HandleFunc("GET /topology/{instanceId}", h.handleTopology)
	mux.HandleFunc("POST /topology/deep-analyze", h.handleTopologyDeepAnalyze)
	mux.HandleFunc("GET /topology/exposure/{instanceId}", h.handleTopologyExposure)
	mux.HandleFunc("GET /topology/conflicts/{instanceId}", h.handleTopologyConflicts)

	// Cost Explorer
	mux.HandleFunc("GET /cost-explorer/summary", h.handleCostSummary)
	mux.HandleFunc("GET /cost-explorer/by-service", h.handleCostByService)
	mux.HandleFunc("GET /cost-explorer/by-account", h.handleCostByAccount)
	mux.HandleFunc("GET /cost-explorer/by-tag", h.handleCostByTag)
	mux.HandleFunc("GET /cost-explorer/trend", h.handleCostTrend)
	mux.HandleFunc("GET /cost-explorer/details", h.handleCostDetails)
	mux.HandleFunc("GET /cost-explorer/comprehensive", h.handleCostComprehensive)
	mux.HandleFunc("GET /cost-explorer/filters", h.handleCostFilters)

	// K8s / EKS routes
	mux.HandleFunc("GET /api/k8s/clusters", h.handleK8sListClusters)
	mux.HandleFunc("POST /api/k8s/connect", h.handleK8sConnect)
	mux.HandleFunc("POST /api/k8s/disconnect/{cluster...}", h.handleK8sDisconnect)
	mux.HandleFunc("GET /api/k8s/namespaces", h.handleK8sNamespaces)
	mux.HandleFunc("GET /api/k8s/categories", h.handleK8sCategories)
	mux.HandleFunc("GET /api/k8s/resources/{type}", h.handleK8sListResources)
	mux.HandleFunc("GET /api/k8s/resource/{type}/{name}", h.handleK8sGetResource)
	mux.HandleFunc("GET /api/k8s/crds", h.handleK8sListCRDs)
	mux.HandleFunc("GET /api/k8s/crds/{name}/resources", h.handleK8sCRDResources)
	mux.HandleFunc("POST /api/k8s/kubeconfig/upload", h.handleK8sKubeconfigUpload)
	mux.HandleFunc("POST /api/k8s/kubeconfig/connect", h.handleK8sKubeconfigConnect)

	// Teleport Web SSO routes
	mux.HandleFunc("POST /api/teleport/request-credentials", h.handleTeleportRequestCredentials)
	mux.HandleFunc("GET /api/teleport/status", h.handleTeleportStatus)
	// Catch-all for the reverse proxy callback route
	mux.HandleFunc("GET /api/teleport/proxy/", h.handleTeleportProxy)
	mux.HandleFunc("POST /api/teleport/proxy/", h.handleTeleportProxy)

	// k8s routes handled by React SPA catch-all
	mux.HandleFunc("GET /ws/k8s/logs", h.handleK8sLogs)
	mux.HandleFunc("GET /ws/k8s/exec", h.handleK8sExec)

	// API — user preferences
	mux.HandleFunc("GET /preferences", h.handleGetPreferences)
	mux.HandleFunc("PUT /preferences", h.handlePutPreferences)

	// WebSocket
	mux.HandleFunc("GET /ws", h.handleWebSocket)

	// SPA catch-all: serve React index.html for unmatched GET routes
	mux.HandleFunc("GET /", h.serveSPA)

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

// serveSPA serves the React frontend's index.html for client-side routing.
func (h *Handler) serveSPA(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, filepath.Join("web", "frontend", "dist", "index.html"))
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
		"mode":        h.cfg.RDPMode,
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
		PortNumber:   3389,
	}
	// Resolve credentials for manual accounts.
	if strings.HasPrefix(req.AWSProfile, "manual:") {
		acctID := strings.TrimPrefix(req.AWSProfile, "manual:")
		if acct, ok := h.accounts.Get(acctID); ok {
			fwdReq.AWSAccessKeyID = acct.AccessKeyID
			fwdReq.AWSSecretAccessKey = acct.SecretAccessKey
			fwdReq.AWSSessionToken = acct.SessionToken
		}
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

	if resp.StatusCode != http.StatusOK {
		var fwdErr struct {
			Error string `json:"error"`
		}
		json.NewDecoder(resp.Body).Decode(&fwdErr)
		msg := fwdErr.Error
		if msg == "" {
			msg = fmt.Sprintf("forwarder returned HTTP %d", resp.StatusCode)
		}
		jsonError(w, msg, http.StatusBadGateway)
		return
	}

	var fwdResp types.ForwarderStartResponse
	if err := json.NewDecoder(resp.Body).Decode(&fwdResp); err != nil {
		jsonError(w, "failed to decode forwarder response", http.StatusBadGateway)
		return
	}

	// Split ".\username" or "DOMAIN\username" into separate domain + username
	// FreeRDP needs these as separate parameters for proper NLA/CredSSP auth.
	rdpUsername := req.Username
	rdpDomain := ""
	if idx := strings.Index(req.Username, `\`); idx >= 0 {
		rdpDomain = req.Username[:idx]
		rdpUsername = req.Username[idx+1:]
	}

	// Generate encrypted Guacamole token
	connParams := guacamole.ConnectionParams{
		Hostname:          h.cfg.SSMForwarderHost,
		Port:              fmt.Sprintf("%d", fwdResp.Port),
		Username:          rdpUsername,
		Password:          req.Password,
		Domain:            rdpDomain,
		Security:          req.Security,
		IgnoreCert:        "true",
		ResizeMethod:      "display-update",
		DisableCopy:       "false",
		DisablePaste:      "false",
		ClipboardEncoding: "UTF-8",
	}
	recording := false
	if (h.cfg.AutoRecord || req.Record) && h.cfg.SessionRecordingDir != "" {
		connParams.RecordingPath = h.cfg.SessionRecordingDir
		connParams.RecordingName = session.RecordingFilename(req.InstanceID, req.InstanceName, "guac")
		recording = true
	}
	token, err := guacamole.GenerateToken(h.cfg.GuacCryptSecret, connParams)
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
		Recording:    recording,
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

func (h *Handler) handleGuacWebSocketProxy(w http.ResponseWriter, r *http.Request) {
	target := fmt.Sprintf("ws://%s:%d/%s", h.cfg.GuacLiteHost, h.cfg.GuacLitePort, r.URL.RawQuery)
	if r.URL.RawQuery != "" {
		target = fmt.Sprintf("ws://%s:%d/?%s", h.cfg.GuacLiteHost, h.cfg.GuacLitePort, r.URL.RawQuery)
	}

	dialer := websocket.Dialer{
		Subprotocols: []string{"guacamole"},
	}
	backendConn, _, err := dialer.Dial(target, nil)
	if err != nil {
		h.logger.Printf("guac-ws proxy: failed to dial guac-lite at %s: %v", target, err)
		http.Error(w, "failed to connect to guac-lite", http.StatusBadGateway)
		return
	}
	defer backendConn.Close()

	upgrader := websocket.Upgrader{
		CheckOrigin:  func(r *http.Request) bool { return true },
		Subprotocols: []string{"guacamole"},
	}
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.Printf("guac-ws proxy: upgrade failed: %v", err)
		return
	}
	defer clientConn.Close()

	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			mt, msg, err := backendConn.ReadMessage()
			if err != nil {
				return
			}
			if err := clientConn.WriteMessage(mt, msg); err != nil {
				return
			}
		}
	}()

	for {
		mt, msg, err := clientConn.ReadMessage()
		if err != nil {
			break
		}
		if err := backendConn.WriteMessage(mt, msg); err != nil {
			break
		}
	}

	<-done
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

func (h *Handler) handleExpressUpload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(500 << 20); err != nil {
		jsonError(w, "failed to parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	instanceID := r.FormValue("instance_id")
	remotePath := r.FormValue("remote_path")
	bucket := r.FormValue("s3_bucket")
	if instanceID == "" || remotePath == "" || bucket == "" {
		jsonError(w, "instance_id, remote_path, and s3_bucket are required", http.StatusBadRequest)
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

	if err := h.discovery.ExpressUpload(profile, region, bucket, instanceID, remotePath, platform, data, sendProgress); err != nil {
		sendProgress(aws.TransferProgress{Progress: 100, Message: err.Error(), Status: "error"})
		return
	}

	h.audit.Log(audit.AuditEvent{
		Action:     "express_upload",
		InstanceID: instanceID,
		Profile:    profile,
		Region:     region,
		Details:    fmt.Sprintf("path=%s bucket=%s", remotePath, bucket),
	})

	sendProgress(aws.TransferProgress{Progress: 100, Message: "Express upload complete", Status: "complete"})
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

func (h *Handler) handleExpressDownload(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceID string `json:"instance_id"`
		RemotePath string `json:"remote_path"`
		AWSProfile string `json:"aws_profile"`
		AWSRegion  string `json:"aws_region"`
		Platform   string `json:"platform"`
		S3Bucket   string `json:"s3_bucket"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.InstanceID == "" || req.RemotePath == "" || req.S3Bucket == "" {
		jsonError(w, "instance_id, remote_path, and s3_bucket are required", http.StatusBadRequest)
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

	fileData, filename, err := h.discovery.ExpressDownload(profile, region, req.S3Bucket, req.InstanceID, req.RemotePath, platform, sendProgress)
	if err != nil {
		sendProgress(aws.TransferProgress{Progress: 100, Message: err.Error(), Status: "error"})
		return
	}

	h.audit.Log(audit.AuditEvent{
		Action:     "express_download",
		InstanceID: req.InstanceID,
		Profile:    profile,
		Region:     region,
		Details:    fmt.Sprintf("path=%s bucket=%s", req.RemotePath, req.S3Bucket),
	})

	finalMsg := struct {
		Progress int    `json:"progress"`
		Message  string `json:"message"`
		Status   string `json:"status"`
		Data     string `json:"data"`
		Filename string `json:"filename"`
	}{
		Progress: 100,
		Message:  "Express download complete",
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
// Session Export
// ---------------------------------------------------------------------------

func (h *Handler) handleExportSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `json:"session_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.SessionID == "" {
		jsonError(w, "session_id is required", http.StatusBadRequest)
		return
	}

	filename, err := h.sessions.ExportSession(req.SessionID, h.cfg.TerminalExportDir)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	jsonResponse(w, map[string]string{
		"filename": filename,
		"url":      "/exports/" + filename,
	})
}

// ---------------------------------------------------------------------------
// Recordings handlers
// ---------------------------------------------------------------------------

func (h *Handler) handleListRecordings(w http.ResponseWriter, r *http.Request) {
	dir := h.cfg.SessionRecordingDir
	entries, err := os.ReadDir(dir)
	if err != nil {
		jsonResponse(w, []interface{}{})
		return
	}

	type recording struct {
		Name    string `json:"name"`
		Size    int64  `json:"size"`
		ModTime string `json:"mod_time"`
		Type    string `json:"type"`    // "ssh" or "rdp"
		HasMP4  bool   `json:"has_mp4"` // true if converted .mp4 exists
	}

	var recs []recording
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		ext := filepath.Ext(name)
		var recType string
		switch ext {
		case ".cast":
			recType = "ssh"
		case ".guac":
			recType = "rdp"
		default:
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		// Check if a converted .mp4 file exists.
		base := strings.TrimSuffix(name, ext)
		mp4Path := filepath.Join(dir, base+".mp4")
		_, mp4Err := os.Stat(mp4Path)
		recs = append(recs, recording{
			Name:    name,
			Size:    info.Size(),
			ModTime: info.ModTime().Format("2006-01-02T15:04:05Z"),
			Type:    recType,
			HasMP4:  mp4Err == nil,
		})
	}

	// Sort newest first.
	sort.Slice(recs, func(i, j int) bool {
		return recs[i].ModTime > recs[j].ModTime
	})

	if recs == nil {
		recs = []recording{}
	}
	jsonResponse(w, recs)
}

func (h *Handler) handleServeRecording(w http.ResponseWriter, r *http.Request) {
	filename := filepath.Base(r.URL.Path[len("/recordings/"):])
	if filename == "" || filename == "." {
		jsonError(w, "filename required", http.StatusBadRequest)
		return
	}
	path := filepath.Join(h.cfg.SessionRecordingDir, filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		jsonError(w, "recording not found", http.StatusNotFound)
		return
	}
	http.ServeFile(w, r, path)
}

func (h *Handler) handleDeleteRecording(w http.ResponseWriter, r *http.Request) {
	filename := filepath.Base(r.URL.Path[len("/recordings/"):])
	if filename == "" || filename == "." {
		jsonError(w, "filename required", http.StatusBadRequest)
		return
	}
	path := filepath.Join(h.cfg.SessionRecordingDir, filename)
	if err := os.Remove(path); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]string{"status": "deleted"})
}

func (h *Handler) handleToggleRecording(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `json:"session_id"`
		Action    string `json:"action"` // "start" or "stop"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	var err error
	if req.Action == "start" {
		err = h.sessions.StartRecording(req.SessionID)
	} else {
		err = h.sessions.StopRecording(req.SessionID)
	}

	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	s, ok := h.sessions.GetSession(req.SessionID)
	recording := false
	if ok {
		recording = s.IsRecording()
	}
	jsonResponse(w, map[string]interface{}{"recording": recording})
}

// ---------------------------------------------------------------------------
// Recording conversion (proxy to converter sidecar)
// ---------------------------------------------------------------------------

func (h *Handler) converterURL(path string) string {
	return fmt.Sprintf("http://%s:%d%s", h.cfg.ConverterHost, h.cfg.ConverterPort, path)
}

func (h *Handler) handleConvertRecording(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Filename string `json:"filename"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Filename == "" {
		jsonError(w, "filename required", http.StatusBadRequest)
		return
	}

	body, _ := json.Marshal(map[string]string{"filename": req.Filename})
	resp, err := http.Post(h.converterURL("/convert"), "application/json", bytes.NewReader(body))
	if err != nil {
		jsonError(w, "converter unavailable: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func (h *Handler) handleConvertStatus(w http.ResponseWriter, r *http.Request) {
	jobID := strings.TrimPrefix(r.URL.Path, "/convert-status/")
	if jobID == "" {
		jsonError(w, "job_id required", http.StatusBadRequest)
		return
	}

	resp, err := http.Get(h.converterURL("/status/" + jobID))
	if err != nil {
		jsonError(w, "converter unavailable: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

// ---------------------------------------------------------------------------
// AWS Accounts management handlers
// ---------------------------------------------------------------------------

func (h *Handler) handleListAWSAccounts(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, h.accounts.List())
}

func (h *Handler) handleAddAWSAccount(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name            string `json:"name"`
		AccessKeyID     string `json:"access_key_id"`
		SecretAccessKey string `json:"secret_access_key"`
		SessionToken    string `json:"session_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.AccessKeyID == "" || req.SecretAccessKey == "" {
		jsonError(w, "access_key_id and secret_access_key are required", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		req.Name = "Account " + req.AccessKeyID[:4] + "..."
	}

	acct, err := h.accounts.Add(req.Name, req.AccessKeyID, req.SecretAccessKey, req.SessionToken)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Return masked version
	masked := acct
	if len(masked.SecretAccessKey) > 4 {
		masked.SecretAccessKey = "****" + masked.SecretAccessKey[len(masked.SecretAccessKey)-4:]
	}
	if masked.SessionToken != "" {
		masked.SessionToken = "****"
	}
	jsonResponse(w, masked)
}

func (h *Handler) handleDeleteAWSAccount(w http.ResponseWriter, r *http.Request) {
	id := filepath.Base(r.URL.Path)
	if id == "" {
		jsonError(w, "account id required", http.StatusBadRequest)
		return
	}
	if err := h.accounts.Remove(id); err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	// Also remove this account's instances from the discovery cache.
	h.discovery.RemoveAccountInstances(id)
	jsonResponse(w, map[string]string{"status": "deleted"})
}

func (h *Handler) handleScanAWSAccount(w http.ResponseWriter, r *http.Request) {
	id := filepath.Base(r.URL.Path)
	if id == "" {
		jsonError(w, "account id required", http.StatusBadRequest)
		return
	}

	acct, ok := h.accounts.Get(id)
	if !ok {
		jsonError(w, "account not found", http.StatusNotFound)
		return
	}

	count, err := h.discovery.ScanAccount(acct)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]interface{}{
		"instances_found": count,
		"account_name":    acct.Name,
	})
}

// ---------------------------------------------------------------------------
// Port Forwarding proxy handlers
// ---------------------------------------------------------------------------

func (h *Handler) handleStartPortForward(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceID   string `json:"instance_id"`
		InstanceName string `json:"instance_name"`
		AWSProfile   string `json:"aws_profile"`
		AWSRegion    string `json:"aws_region"`
		PortNumber   int    `json:"port_number"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.InstanceID == "" || req.PortNumber <= 0 {
		jsonError(w, "instance_id and port_number are required", http.StatusBadRequest)
		return
	}

	// Look up profile/region if not provided.
	if req.AWSProfile == "" || req.AWSRegion == "" {
		if p, rg, err := h.discovery.GetInstanceConfig(req.InstanceID); err == nil {
			req.AWSProfile = p
			req.AWSRegion = rg
		}
	}

	fwdReq := types.ForwarderStartRequest{
		InstanceID:   req.InstanceID,
		InstanceName: req.InstanceName,
		AWSProfile:   req.AWSProfile,
		AWSRegion:    req.AWSRegion,
		PortNumber:   req.PortNumber,
	}
	// Resolve credentials for manual accounts.
	if strings.HasPrefix(req.AWSProfile, "manual:") {
		acctID := strings.TrimPrefix(req.AWSProfile, "manual:")
		if acct, ok := h.accounts.Get(acctID); ok {
			fwdReq.AWSAccessKeyID = acct.AccessKeyID
			fwdReq.AWSSecretAccessKey = acct.SecretAccessKey
			fwdReq.AWSSessionToken = acct.SessionToken
		}
	}
	body, _ := json.Marshal(fwdReq)

	fwdURL := fmt.Sprintf("%s/start", h.forwarderURL())
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

func (h *Handler) handleStopPortForward(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceID string `json:"instance_id"`
		PortNumber int    `json:"port_number"`
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

func (h *Handler) handleActiveTunnels(w http.ResponseWriter, r *http.Request) {
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

	// writeMu serialises writes to this single connection.
	var writeMu sync.Mutex
	done := make(chan struct{})

	defer func() {
		close(done)

		h.clientsMu.Lock()
		sessionIDs := h.clients[conn]
		delete(h.clients, conn)
		h.clientsMu.Unlock()

		h.sessions.CloseSessionsForClient(sessionIDs)
		conn.Close()
	}()

	// Keepalive: send WebSocket pings every 30s; tolerate up to 5 min of
	// silence so that background-tab throttling or brief network blips
	// don't kill long-running sessions.
	const wsReadDeadline = 5 * time.Minute
	conn.SetReadDeadline(time.Now().Add(wsReadDeadline))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(wsReadDeadline))
		return nil
	})

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				writeMu.Lock()
				err := conn.WriteMessage(websocket.PingMessage, nil)
				writeMu.Unlock()
				if err != nil {
					return
				}
			case <-done:
				return
			}
		}
	}()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				h.logger.Printf("websocket read: %v", err)
			}
			break
		}

		// Any message from client resets the read deadline.
		conn.SetReadDeadline(time.Now().Add(wsReadDeadline))

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

		case "keepalive":

		case "suggest_request":
			h.wsSuggestRequest(conn, &writeMu, msg.Payload)

		case "suggest_toggle":
			h.wsSuggestToggle(msg.Payload)

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
		InstanceID   string `json:"instance_id"`
		InstanceName string `json:"instance_name"`
		SessionID    string `json:"session_id"`
		AWSProfile   string `json:"aws_profile"`
		AWSRegion    string `json:"aws_region"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		h.logger.Printf("wsStartSession unmarshal: %v", err)
		return
	}

	instanceID := msg.InstanceID
	instanceName := msg.InstanceName
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

	// Resolve credentials for manual accounts (profile = "manual:<id>").
	var creds *session.AWSCreds
	if strings.HasPrefix(awsProfile, "manual:") {
		acctID := strings.TrimPrefix(awsProfile, "manual:")
		if acct, ok := h.accounts.Get(acctID); ok {
			creds = &session.AWSCreds{
				AccessKeyID:     acct.AccessKeyID,
				SecretAccessKey: acct.SecretAccessKey,
				SessionToken:    acct.SessionToken,
			}
			h.logger.Printf("Using manual credentials for account %s (%s)", acctID, acct.Name)
		} else {
			h.logger.Printf("wsStartSession: manual account %s not found", acctID)
		}
	}

	onOutput := func(data []byte) {
		h.obsMu.Lock()
		obs := h.observers[sessionID]
		h.obsMu.Unlock()
		if obs != nil {
			obs.FeedOutput(data)
		}
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

	if err := h.sessions.StartSession(instanceID, instanceName, sessionID, awsProfile, awsRegion, creds, onOutput); err != nil {
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

	if h.suggest != nil {
		var obs *suggest.Observer
		obs = suggest.NewObserver(
			func(cmd, output string) {
				if cmd == "" {
					return
				}
				exitCode := 0
				if suggest.ContainsErrorSignal(output) {
					exitCode = 1
				}
				h.suggest.LearnCommand("", cmd, exitCode, "")

				errOut, resCMD, resolved := obs.WasErrorResolved()
				if resolved && errOut != "" && resCMD != "" {
					h.suggest.LearnResolution(errOut, resCMD)
				}
			},
			func(output string) {
				insights := h.suggest.AnalyzeOutput("", output)
				for _, insight := range insights {
					writeMu.Lock()
					conn.WriteJSON(types.WSMessage{
						Type: "log_insight",
						Payload: types.LogInsightMsg{
							SessionID:    sessionID,
							ErrorSummary: insight.ErrorSummary,
							SuggestedFix: insight.SuggestedFix,
							Confidence:   insight.Confidence,
						},
					})
					writeMu.Unlock()
				}
			},
		)
		h.obsMu.Lock()
		h.observers[sessionID] = obs
		h.obsMu.Unlock()
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

	// Check if recording was auto-started.
	isRecording := false
	if sess, ok := h.sessions.GetSession(sessionID); ok {
		isRecording = sess.IsRecording()
	}

	writeMu.Lock()
	conn.WriteJSON(types.WSMessage{
		Type: "session_started",
		Payload: types.SessionEventMsg{
			InstanceID: instanceID,
			SessionID:  sessionID,
			Recording:  isRecording,
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
	h.obsMu.Lock()
	obs := h.observers[msg.SessionID]
	h.obsMu.Unlock()
	if obs != nil {
		obs.FeedInput([]byte(msg.Input))
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

	h.obsMu.Lock()
	if obs, ok := h.observers[msg.SessionID]; ok {
		obs.Close()
		delete(h.observers, msg.SessionID)
	}
	h.obsMu.Unlock()

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

func (h *Handler) handleInstanceDetails(w http.ResponseWriter, r *http.Request) {
	instanceID := r.URL.Query().Get("id")
	if instanceID == "" {
		jsonError(w, "id is required", http.StatusBadRequest)
		return
	}

	details, err := h.discovery.GetInstanceDetails(r.Context(), instanceID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, details)
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
// AI Agent
// ---------------------------------------------------------------------------

// getAIProvider builds an LLM provider from preferences (falling back to env/config).
func (h *Handler) getAIProvider() (llm.Provider, error) {
	// Read preferences for overrides
	provider := h.cfg.AIProvider
	model := h.cfg.AIModel
	region := h.cfg.AIBedrockRegion
	profile := h.cfg.AIBedrockProfile
	anthropicKey := h.cfg.AIAnthropicKey
	openaiKey := h.cfg.AIOpenAIKey
	geminiKey := h.cfg.AIGeminiKey
	ollamaURL := h.cfg.AIOllamaURL

	if data, err := os.ReadFile(h.cfg.PreferencesFile); err == nil {
		var prefs map[string]interface{}
		if json.Unmarshal(data, &prefs) == nil {
			if v, ok := prefs["aiProvider"].(string); ok && v != "" {
				provider = v
			}
			if v, ok := prefs["aiModel"].(string); ok && v != "" {
				model = v
			}
			if v, ok := prefs["aiBedrockRegion"].(string); ok && v != "" {
				region = v
			}
			if v, ok := prefs["aiBedrockProfile"].(string); ok && v != "" {
				profile = v
			}
			if v, ok := prefs["aiAnthropicKey"].(string); ok && v != "" {
				anthropicKey = v
			}
			if v, ok := prefs["aiOpenAIKey"].(string); ok && v != "" {
				openaiKey = v
			}
			if v, ok := prefs["aiGeminiKey"].(string); ok && v != "" {
				geminiKey = v
			}
			if v, ok := prefs["aiOllamaUrl"].(string); ok && v != "" {
				ollamaURL = v
			}
		}
	}

	if model == "" {
		return nil, fmt.Errorf("AI model not configured. Go to Settings → AI Agent to set a model.")
	}

	switch provider {
	case "bedrock":
		return llm.NewBedrockProvider(region, profile, model, h.cfg.AITemperature)
	case "anthropic":
		return llm.NewAnthropicProvider(anthropicKey, model, h.cfg.AITemperature)
	case "openai":
		return llm.NewOpenAIProvider(openaiKey, model, h.cfg.AITemperature)
	case "gemini":
		return llm.NewGeminiProvider(geminiKey, model, h.cfg.AITemperature)
	case "ollama":
		return llm.NewOllamaProvider(ollamaURL, model, h.cfg.AITemperature)
	default:
		return nil, fmt.Errorf("unknown AI provider: %s", provider)
	}
}

// handleAIChat streams an AI assistant response via SSE. Server-side networking
// tools are executed transparently; run_command tool calls are forwarded to the
// client for user approval.
func (h *Handler) handleAIChat(w http.ResponseWriter, r *http.Request) {
	provider, err := h.getAIProvider()
	if err != nil {
		jsonError(w, err.Error(), http.StatusServiceUnavailable)
		return
	}

	var req struct {
		Messages         []llm.Message `json:"messages"`
		ActiveInstanceID string        `json:"active_instance_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Set up SSE
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	// Build system prompt with instance context
	summaries := h.discovery.GetInstanceSummaries()
	var instanceSummaries []llm.InstanceSummary
	var activeSummary *llm.InstanceSummary
	for _, s := range summaries {
		is := llm.InstanceSummary{
			InstanceID: s["instance_id"],
			Name:       s["name"],
			Platform:   s["platform"],
			State:      s["state"],
			PrivateIP:  s["private_ip"],
			PublicIP:   s["public_ip"],
			Region:     s["region"],
		}
		instanceSummaries = append(instanceSummaries, is)
		if s["instance_id"] == req.ActiveInstanceID {
			copy := is
			activeSummary = &copy
		}
	}
	system := llm.BuildSystemPrompt(instanceSummaries, activeSummary)
	messages := sanitizeToolMessages(req.Messages)

	// Tool execution loop — server handles networking tools, client handles run_command
	const maxIterations = 10
	for i := 0; i < maxIterations; i++ {
		ch, err := provider.ChatStream(r.Context(), system, messages, llm.AgentTools, h.cfg.AIMaxTokens)
		if err != nil {
			h.writeSSE(w, flusher, map[string]interface{}{"type": "error", "error": err.Error()})
			return
		}

		var assistantText strings.Builder
		var toolCalls []llm.ToolCall

		for chunk := range ch {
			switch chunk.Type {
			case "text":
				assistantText.WriteString(chunk.Text)
				h.writeSSE(w, flusher, map[string]interface{}{"type": "text", "text": chunk.Text})
			case "tool_call":
				toolCalls = append(toolCalls, *chunk.ToolCall)
			case "error":
				h.writeSSE(w, flusher, map[string]interface{}{"type": "error", "error": chunk.Error})
				return
			}
		}

		// No tool calls — conversation turn complete
		if len(toolCalls) == 0 {
			messages = append(messages, llm.Message{
				Role:    llm.RoleAssistant,
				Content: assistantText.String(),
			})
			h.writeSSE(w, flusher, map[string]interface{}{"type": "done", "messages": messages})
			return
		}

		// Build assistant message with all tool calls
		assistantMsg := llm.Message{
			Role:      llm.RoleAssistant,
			Content:   assistantText.String(),
			ToolCalls: toolCalls,
		}
		messages = append(messages, assistantMsg)

		// Execute tool calls
		hasRunCommand := false
		for _, tc := range toolCalls {
			if tc.Name == "run_command" {
				hasRunCommand = true
				tcCopy := tc
				h.writeSSE(w, flusher, map[string]interface{}{"type": "tool_call", "tool_call": &tcCopy})
				continue
			}

			// Server-side networking tool — execute and add result
			result := h.executeNetworkingTool(r.Context(), tc)
			messages = append(messages, llm.Message{
				Role:       llm.RoleTool,
				Content:    result,
				ToolCallID: tc.ID,
			})
		}

		if hasRunCommand {
			// Client handles run_command — send current messages so it can continue
			h.writeSSE(w, flusher, map[string]interface{}{"type": "done", "messages": messages})
			return
		}
		// All tools were server-side — loop back to re-prompt LLM
	}

	h.writeSSE(w, flusher, map[string]interface{}{"type": "error", "error": "too many tool iterations"})
}

// writeSSE writes a single SSE data event.
func (h *Handler) writeSSE(w http.ResponseWriter, flusher http.Flusher, data interface{}) {
	b, _ := json.Marshal(data)
	fmt.Fprintf(w, "data: %s\n\n", b)
	flusher.Flush()
}

// executeNetworkingTool dispatches a server-side networking tool call.
func (h *Handler) executeNetworkingTool(ctx context.Context, tc llm.ToolCall) string {
	var args struct {
		InstanceID string `json:"instance_id"`
	}
	json.Unmarshal(tc.Arguments, &args)

	var result string
	var err error
	switch tc.Name {
	case "describe_security_groups":
		result, err = h.discovery.DescribeSecurityGroups(ctx, args.InstanceID)
	case "describe_network_acls":
		result, err = h.discovery.DescribeNetworkACLs(ctx, args.InstanceID)
	case "describe_route_tables":
		result, err = h.discovery.DescribeRouteTables(ctx, args.InstanceID)
	case "describe_load_balancers":
		result, err = h.discovery.DescribeLoadBalancers(ctx, args.InstanceID)
	case "describe_instance":
		result, err = h.discovery.DescribeInstance(args.InstanceID)
	default:
		return fmt.Sprintf("unknown tool: %s", tc.Name)
	}
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return result
}

// handleAIContext returns current instance summaries for the AI agent.
// sanitizeToolMessages ensures every assistant tool_use has a matching tool_result.
// Bedrock requires tool_result blocks immediately after any tool_use.
// If the user sends a new message before completing tool approval, dangling
// tool_use blocks cause a validation error. We add synthetic "cancelled" results.
func sanitizeToolMessages(msgs []llm.Message) []llm.Message {
	result := make([]llm.Message, 0, len(msgs))
	for i, msg := range msgs {
		result = append(result, msg)
		if msg.Role != llm.RoleAssistant || len(msg.ToolCalls) == 0 {
			continue
		}
		// Collect tool_result IDs in the messages immediately following this assistant message
		answered := make(map[string]bool)
		for j := i + 1; j < len(msgs); j++ {
			if msgs[j].Role == llm.RoleTool && msgs[j].ToolCallID != "" {
				answered[msgs[j].ToolCallID] = true
			} else {
				break // stop at first non-tool message
			}
		}
		// Add synthetic results for any unanswered tool calls
		for _, tc := range msg.ToolCalls {
			if !answered[tc.ID] {
				result = append(result, llm.Message{
					Role:       llm.RoleTool,
					Content:    "Command was not executed — the user moved on without approving.",
					ToolCallID: tc.ID,
				})
			}
		}
	}
	return result
}

func (h *Handler) handleAIContext(w http.ResponseWriter, r *http.Request) {
	summaries := h.discovery.GetInstanceSummaries()
	jsonResponse(w, summaries)
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

func (h *Handler) wsSuggestRequest(conn *websocket.Conn, writeMu *sync.Mutex, payload interface{}) {
	if h.suggest == nil {
		return
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return
	}
	var req types.SuggestRequestMsg
	if json.Unmarshal(raw, &req) != nil {
		return
	}
	suggestions := h.suggest.Suggest(req.SessionID, req.Env, req.Line, "", 5)
	var items []types.SuggestItem
	for _, s := range suggestions {
		items = append(items, types.SuggestItem{Text: s.Text, Score: s.Score, Source: s.Source})
	}
	resp := types.WSMessage{
		Type: "suggest_response",
		Payload: types.SuggestResponseMsg{
			SessionID:   req.SessionID,
			Suggestions: items,
		},
	}
	writeMu.Lock()
	conn.WriteJSON(resp)
	writeMu.Unlock()
}

func (h *Handler) wsSuggestToggle(payload interface{}) {
	if h.suggest == nil {
		return
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return
	}
	var msg types.SuggestToggleMsg
	if json.Unmarshal(raw, &msg) != nil {
		return
	}
	h.suggest.SetEnabled(msg.SessionID, msg.Enabled)
}

func (h *Handler) handleSuggestStatus(w http.ResponseWriter, r *http.Request) {
	if h.suggest == nil {
		jsonResponse(w, map[string]interface{}{"enabled": false})
		return
	}
	jsonResponse(w, h.suggest.Stats())
}

func (h *Handler) handleVaultList(w http.ResponseWriter, r *http.Request) {
	if h.vault == nil {
		jsonResponse(w, []vault.VaultEntry{})
		return
	}
	resolveID := r.URL.Query().Get("resolve")
	if resolveID != "" {
		entry, err := h.vault.Get(resolveID)
		if err != nil {
			jsonError(w, "not found", http.StatusNotFound)
			return
		}
		jsonResponse(w, entry)
		return
	}
	jsonResponse(w, h.vault.List())
}

func (h *Handler) handleVaultSave(w http.ResponseWriter, r *http.Request) {
	if h.vault == nil {
		jsonError(w, "vault not configured", http.StatusServiceUnavailable)
		return
	}
	var entry vault.VaultEntry
	if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
		jsonError(w, "invalid request: "+err.Error(), http.StatusBadRequest)
		return
	}
	if entry.Rule.ID == "" {
		entry.Rule.ID = fmt.Sprintf("v-%d", time.Now().UnixNano())
	}
	switch entry.Rule.Type {
	case "instance":
		entry.Rule.Priority = 1
	case "substring":
		entry.Rule.Priority = 2
	case "pattern":
		entry.Rule.Priority = 3
	case "environment":
		entry.Rule.Priority = 4
	case "account":
		entry.Rule.Priority = 5
	case "global":
		entry.Rule.Priority = 6
	default:
		jsonError(w, "invalid rule type", http.StatusBadRequest)
		return
	}
	if err := h.vault.Save(entry); err != nil {
		jsonError(w, "save failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]string{"status": "ok", "id": entry.Rule.ID})
}

func (h *Handler) handleVaultDelete(w http.ResponseWriter, r *http.Request) {
	if h.vault == nil {
		jsonError(w, "vault not configured", http.StatusServiceUnavailable)
		return
	}
	id := r.URL.Query().Get("id")
	if id == "" {
		jsonError(w, "id is required", http.StatusBadRequest)
		return
	}
	if err := h.vault.Delete(id); err != nil {
		jsonError(w, "delete failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]string{"status": "ok"})
}

func (h *Handler) handleVaultMatch(w http.ResponseWriter, r *http.Request) {
	if h.vault == nil {
		jsonError(w, "vault not configured", http.StatusServiceUnavailable)
		return
	}
	instanceID := r.URL.Query().Get("instance_id")
	name := r.URL.Query().Get("name")
	env := r.URL.Query().Get("env")
	account := r.URL.Query().Get("account")

	entry, err := h.vault.FindMatch(instanceID, name, env, account)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		jsonResponse(w, map[string]string{"error": "no match"})
		return
	}
	redacted := *entry
	redacted.Credential.Password = ""
	jsonResponse(w, redacted)
}

func (h *Handler) handleDBViewer(w http.ResponseWriter, r *http.Request) {
	dbName := r.URL.Query().Get("db")
	if dbName != "suggest" && dbName != "vault" {
		jsonResponse(w, map[string][]string{"databases": {"suggest", "vault"}})
		return
	}

	if dbName == "suggest" {
		if h.suggest == nil {
			jsonError(w, "suggest engine not initialized", http.StatusServiceUnavailable)
			return
		}
		buckets := h.suggest.BrowseStore()
		jsonResponse(w, map[string]interface{}{"db": "suggest", "file": "suggest.db", "buckets": buckets})
		return
	}

	if h.vault == nil {
		jsonError(w, "vault not initialized", http.StatusServiceUnavailable)
		return
	}
	buckets := h.vault.Browse()
	jsonResponse(w, map[string]interface{}{"db": "vault", "file": "vault.db", "buckets": buckets})
}
