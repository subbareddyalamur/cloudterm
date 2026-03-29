package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"cloudterm-go/internal/k8s"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
	"sigs.k8s.io/yaml"
)

// handleK8sKubeconfigUpload parses an uploaded kubeconfig and returns available clusters
func (h *Handler) handleK8sKubeconfigUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form with kubeconfig file
	if err := r.ParseMultipartForm(10 * 1024 * 1024); err != nil { // 10MB max
		http.Error(w, fmt.Sprintf("parse form: %v", err), http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("kubeconfig")
	if err != nil {
		http.Error(w, fmt.Sprintf("get kubeconfig file: %v", err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Read kubeconfig content
	content, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, fmt.Sprintf("read file: %v", err), http.StatusBadRequest)
		return
	}

	// Parse kubeconfig YAML
	config := &clientcmdapi.Config{}
	if err := yaml.Unmarshal(content, config); err != nil {
		http.Error(w, fmt.Sprintf("parse kubeconfig: %v", err), http.StatusBadRequest)
		return
	}

	// Extract clusters
	clusters := k8s.ExtractClustersFromKubeconfig(config)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"clusters": clusters,
		"contexts": config.Contexts,
	})
}

// handleK8sKubeconfigConnect establishes connection using kubeconfig data
func (h *Handler) handleK8sKubeconfigConnect(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Server   string `json:"server"`
		Token    string `json:"token"`
		CAData   string `json:"ca_data"`
		ClusterName string `json:"cluster_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Store connection in pool with kubeconfig prefix
	poolConn, err := h.k8sPool.Connect("kubeconfig", req.ClusterName, "direct", req.Server, req.Token, req.CAData)
	if err != nil {
		http.Error(w, fmt.Sprintf("store connection: %v", err), http.StatusInternalServerError)
		return
	}

	h.logger.Printf("K8s: connected to cluster via kubeconfig: %s", req.ClusterName)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"cluster_id": fmt.Sprintf("kubeconfig:%s:direct", req.ClusterName),
		"status":     "connected",
		"version":    poolConn.Client.Discovery().RESTClient().Get().URL().String(),
	})
}
