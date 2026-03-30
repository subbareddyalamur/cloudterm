package handlers

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"

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

	var clientCertData, clientKeyData string

	// Try to execute tsh if this is a Teleport cluster
	if req.ExecCmd != "" && (strings.Contains(req.ExecCmd, "tsh") || strings.Contains(req.ExecCmd, "teleport")) {
		// Run tsh with HOME set so it finds ~/.tsh, and no keychain/agent
		cmd := exec.Command(req.ExecCmd, req.ExecArgs...)
		cmd.Env = append(os.Environ(),
			"HOME=/home/cloudterm",
			"TELEPORT_ADD_KEYS_TO_AGENT=no",
			"SSH_AUTH_SOCK=", // disable SSH agent - use files only
		)
		output, err := cmd.Output()
		if err != nil {
			// Capture stderr for a useful error
			var exitErr *exec.ExitError
			errMsg := err.Error()
			if errors.As(err, &exitErr) && len(exitErr.Stderr) > 0 {
				errMsg = string(exitErr.Stderr)
			}
			// Key is in macOS Keychain - give specific instructions
			if strings.Contains(errMsg, "SSH auth") || strings.Contains(errMsg, "logged in") || strings.Contains(errMsg, "key") {
				proxy := req.Server
				for _, arg := range req.ExecArgs {
					if strings.HasPrefix(arg, "--proxy=") {
						proxy = strings.TrimPrefix(arg, "--proxy=")
					}
				}
				json.NewEncoder(w).Encode(map[string]string{
					"error": fmt.Sprintf("Teleport private key is in macOS Keychain, not accessible from container.\n\nOne-time fix — run this on your local machine:\n\n  tsh logout\n  tsh login --proxy=%s --add-keys-to-agent=no\n\nThis stores the key on disk so CloudTerm can use it.\nAfter that, connecting will be automatic.", proxy),
				})
				return
			}
			json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("tsh failed: %s", errMsg)})
			return
		}
		// tsh executed successfully, parse output
		var execCred struct {
			Status struct {
				ClientCertificateData string `json:"clientCertificateData"`
				ClientKeyData         string `json:"clientKeyData"`
			} `json:"status"`
		}
		if err := json.Unmarshal(output, &execCred); err == nil {
			clientCertData = execCred.Status.ClientCertificateData
			clientKeyData = execCred.Status.ClientKeyData
		}
	}

	if clientCertData == "" || clientKeyData == "" {
		json.NewEncoder(w).Encode(map[string]string{"error": "tsh execution failed - no valid Teleport session. Please run 'tsh login --proxy=<your-teleport-proxy>' on your local machine to authenticate first, then use the connection mode."})
		return
	}

	// Connect using certificate-based auth
	poolConn, err := h.k8sPool.ConnectWithCerts(req.Server, req.CAData, 
		clientCertData, clientKeyData)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("connect: %v", err)})
		return
	}

	h.logger.Printf("K8s: connected to cluster via tsh credentials: %s", req.ClusterName)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"cluster_id": fmt.Sprintf("kubeconfig:%s:tsh", req.ClusterName),
		"status":     "connected",
		"version":    poolConn.Client.Discovery().RESTClient().Get().URL().String(),
	})
}
