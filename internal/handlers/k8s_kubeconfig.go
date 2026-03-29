package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"

	"cloudterm-go/internal/k8s"
	"k8s.io/client-go/tools/clientcmd"
)


// handleK8sKubeconfigUpload parses an uploaded kubeconfig and returns available clusters
func (h *Handler) handleK8sKubeconfigUpload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	if r.Method != "POST" {
		json.NewEncoder(w).Encode(map[string]string{"error": "method not allowed"})
		return
	}

	// Parse multipart form with kubeconfig file
	if err := r.ParseMultipartForm(10 * 1024 * 1024); err != nil { // 10MB max
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("parse form: %v", err)})
		return
	}

	file, _, err := r.FormFile("kubeconfig")
	if err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("get kubeconfig file: %v", err)})
		return
	}
	defer file.Close()

	// Read kubeconfig content
	content, err := io.ReadAll(file)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("read file: %v", err)})
		return
	}

	// Parse kubeconfig using k8s clientcmd
	clientConfig, err := clientcmd.NewClientConfigFromBytes(content)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("parse kubeconfig: %v", err)})
		return
	}

	// Get the raw config
	rawConfig, err := clientConfig.RawConfig()
	if err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("load raw config: %v", err)})
		return
	}

	// Extract clusters
	clusters := k8s.ExtractClustersFromKubeconfig(&rawConfig)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"clusters": clusters,
		"contexts": rawConfig.Contexts,
	})
}

// handleK8sKubeconfigConnect establishes connection using kubeconfig data
func (h *Handler) handleK8sKubeconfigConnect(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	var req struct {
		Server      string `json:"server"`
		CAData      string `json:"ca_data"`
		ClusterName string `json:"cluster_name"`
		ExecCommand string `json:"exec_command"`
		ExecArgs    []string `json:"exec_args"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
		return
	}

	// Execute the tsh command to get bearer token
	var token string
	if req.ExecCommand != "" {
		cmd := exec.Command(req.ExecCommand, req.ExecArgs...)
		output, err := cmd.Output()
		if err != nil {
			json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("exec tsh: %v", err)})
			return
		}
		
		// Parse the output to extract token
		var execOutput map[string]interface{}
		if err := json.Unmarshal(output, &execOutput); err != nil {
			json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("parse exec output: %v", err)})
			return
		}
		
		if t, ok := execOutput["status"].(map[string]interface{})["token"].(string); ok {
			token = t
		} else {
			json.NewEncoder(w).Encode(map[string]string{"error": "token not found in exec output"})
			return
		}
	} else {
		json.NewEncoder(w).Encode(map[string]string{"error": "no exec command provided"})
		return
	}

	// Store connection in pool with kubeconfig prefix
	poolConn, err := h.k8sPool.Connect("kubeconfig", req.ClusterName, "direct", req.Server, token, req.CAData)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("store connection: %v", err)})
		return
	}

	h.logger.Printf("K8s: connected to cluster via kubeconfig: %s", req.ClusterName)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"cluster_id": fmt.Sprintf("kubeconfig:%s:direct", req.ClusterName),
		"status":     "connected",
		"version":    poolConn.Client.Discovery().RESTClient().Get().URL().String(),
	})
}
