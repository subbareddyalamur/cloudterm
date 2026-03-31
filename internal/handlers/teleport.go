package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
)

// handleTeleportRequestCredentials initiates a new tsh headless login
func (h *Handler) handleTeleportRequestCredentials(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req struct {
		ProxyURL string `json:"proxy"`
		AuthType string `json:"auth_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
		return
	}

	if req.ProxyURL == "" || req.AuthType == "" {
		json.NewEncoder(w).Encode(map[string]string{"error": "proxy and auth_type are required"})
		return
	}

	sessionID, err := h.teleport.StartLogin(req.ProxyURL, req.AuthType)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Determine the base URL dynamically from the request host
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	// Depending on frontend architecture, the proxy URL is standard
	authURL := scheme + "://" + r.Host + "/api/teleport/proxy/" + sessionID

	json.NewEncoder(w).Encode(map[string]string{
		"auth_url":    authURL,
		"callback_id": sessionID,
	})
}

// handleTeleportProxy transparently routes the SSO browser callback to the tsh listener
func (h *Handler) handleTeleportProxy(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/teleport/proxy/")
	parts := strings.SplitN(path, "/", 2)
	if len(parts) == 0 || parts[0] == "" {
		http.Error(w, "missing session ID", http.StatusBadRequest)
		return
	}
	sessionID := parts[0]

	// Strip the prefix so the reverse proxy forwards the correct path to tsh
	// Example: /api/teleport/proxy/abc-123/uuid -> /uuid
	if len(parts) > 1 {
		r.URL.Path = "/" + parts[1]
	} else {
		r.URL.Path = "/"
	}
	// Fix raw path if any
	r.URL.RawPath = ""

	h.teleport.ProxyRequest(sessionID, w, r)
}

// handleTeleportStatus checks if tsh login completed and connects to the cluster
func (h *Handler) handleTeleportStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	sessionID := r.URL.Query().Get("callback_id")
	if sessionID == "" {
		json.NewEncoder(w).Encode(map[string]string{"error": "missing callback_id"})
		return
	}

	status, errStr, certData, keyData := h.teleport.GetStatus(sessionID)
	if status == "pending" {
		json.NewEncoder(w).Encode(map[string]string{"status": "pending"})
		return
	} else if status == "failed" {
		h.teleport.Cleanup(sessionID)
		json.NewEncoder(w).Encode(map[string]string{"status": "failed", "error": errStr})
		return
	} else if status == "not_found" {
		json.NewEncoder(w).Encode(map[string]string{"status": "failed", "error": "session expired or invalid"})
		return
	}

	// If success, certData and keyData are populated.
	// We need the CA Data and Kubernetes Server URL from the kubeconfig to finish connection.
	// For Teleport, the proxy URL itself is often the kube server, or the tsh writes the kubeconfig.
	// Actually, the kubeconfig was uploaded previously and CloudTerm frontend should send it again 
	// or we parse the generated kubeconfig from tsh.
	
	// tsh login writes to ~/.tsh/keys/... and ALSO updates ~/.kube/config if --kube-cluster was passed.
	// Since we didn't pass --kube-cluster, we just get the client certs.
	// The frontend must now submit the original kubeconfig CA Data and Server URL.
	
	// Let's just return the raw cert and key, and let frontend call the standard connection
	// Wait, sending private keys to frontend is insecure.
	// Instead, we should cache them inside k8sPool using the sessionID, and the frontend 
	// can refer to them.

	// For security, just connect directly if frontend passes server and CA?
	// We can do this: store the certs in memory temporarily, return success.
	// The frontend then calls /api/k8s/kubeconfig/connect with callback_id.

	// Save them in teleport service temporarily for retrieval by Connect endpoint
	h.teleport.CacheCredentials(sessionID, certData, keyData)

	json.NewEncoder(w).Encode(map[string]string{
		"status":      "connected",
		"callback_id": sessionID,
		"message":     "credentials generated successfully",
	})
}
