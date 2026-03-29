package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"

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

	// Extract clusters with exec info
	type ClusterWithExec struct {
		Name       string `json:"name"`
		Server     string `json:"server"`
		CertAuth   string `json:"certificateAuthority,omitempty"`
		ExecCmd    string `json:"exec_cmd,omitempty"`
		ExecArgs   []string `json:"exec_args,omitempty"`
	}
	
	var clusters []ClusterWithExec
	for name, cluster := range rawConfig.Clusters {
		kc := ClusterWithExec{
			Name:   name,
			Server: cluster.Server,
		}
		if len(cluster.CertificateAuthorityData) > 0 {
			kc.CertAuth = base64.StdEncoding.EncodeToString(cluster.CertificateAuthorityData)
		}
		
		// Find the user for this cluster and extract exec command
		for _, ctx := range rawConfig.Contexts {
			if ctx.Cluster == name {
				if user, ok := rawConfig.AuthInfos[ctx.AuthInfo]; ok && user.Exec != nil {
					kc.ExecCmd = user.Exec.Command
					kc.ExecArgs = user.Exec.Args
				}
				break
			}
		}
		
		clusters = append(clusters, kc)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"clusters": clusters,
	})
}

// handleK8sKubeconfigConnect establishes connection using kubeconfig data
func (h *Handler) handleK8sKubeconfigConnect(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	var req struct {
		Server      string   `json:"server"`
		CAData      string   `json:"ca_data"`
		ClusterName string   `json:"cluster_name"`
		ExecCmd     string   `json:"exec_cmd"`
		ExecArgs    []string `json:"exec_args"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
		return
	}

	if req.ExecCmd == "" {
		json.NewEncoder(w).Encode(map[string]string{"error": "exec command required"})
		return
	}

	// Execute the tsh command to get credentials
	cmd := exec.Command(req.ExecCmd, req.ExecArgs...)
	output, err := cmd.Output()
	if err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("exec failed: %v", err)})
		return
	}

	// Parse the ExecCredential output
	var execCred struct {
		Status struct {
			ClientCertificateData string `json:"clientCertificateData"`
			ClientKeyData         string `json:"clientKeyData"`
		} `json:"status"`
	}
	if err := json.Unmarshal(output, &execCred); err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("parse exec output: %v", err)})
		return
	}

	if execCred.Status.ClientCertificateData == "" || execCred.Status.ClientKeyData == "" {
		json.NewEncoder(w).Encode(map[string]string{"error": "no client credentials in exec output"})
		return
	}

	// Connect using certificate-based auth
	poolConn, err := h.k8sPool.ConnectWithCerts(req.Server, req.CAData, 
		execCred.Status.ClientCertificateData, execCred.Status.ClientKeyData)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("connect: %v", err)})
		return
	}

	h.logger.Printf("K8s: connected to cluster via kubeconfig exec: %s", req.ClusterName)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"cluster_id": fmt.Sprintf("kubeconfig:%s:certs", req.ClusterName),
		"status":     "connected",
		"version":    poolConn.Client.Discovery().RESTClient().Get().URL().String(),
	})
}
