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
		Name       string   `json:"name"`
		Server     string   `json:"server"`
		CertAuth   string   `json:"certificateAuthority,omitempty"`
		ExecCmd    string   `json:"exec_cmd,omitempty"`
		ExecArgs   []string `json:"exec_args,omitempty"`
		IsTeleport bool     `json:"is_teleport,omitempty"`
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
				if user, ok := rawConfig.AuthInfos[ctx.AuthInfo]; ok {
					if user.Exec != nil {
						kc.ExecCmd = user.Exec.Command
						kc.ExecArgs = user.Exec.Args
					}
					// Teleport uses tsh/teleport in exec command, OR client certs in .tsh/keys
					if strings.Contains(kc.ExecCmd, "tsh") || strings.Contains(kc.ExecCmd, "teleport") {
						kc.IsTeleport = true
					}
					if strings.Contains(user.ClientCertificate, ".tsh/keys") || strings.Contains(user.ClientKey, ".tsh/keys") {
						kc.IsTeleport = true
					}
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

// handleK8sKubeconfigConnect establishes connection using kubeconfig data.
// Like OpenLens, it first tries to execute the kubeconfig's exec command locally.
// If that fails and the cluster is Teleport-managed, it falls back to Web SSO.
func (h *Handler) handleK8sKubeconfigConnect(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	var req struct {
		Server            string   `json:"server"`
		CAData            string   `json:"ca_data"`
		ClusterName       string   `json:"cluster_name"`
		ExecCmd           string   `json:"exec_cmd"`
		ExecArgs          []string `json:"exec_args"`
		IsTeleport        bool     `json:"is_teleport"`
		TeleportSessionID string   `json:"teleport_session_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
		return
	}

	// ── Phase 1: If we already have cached Teleport SSO credentials, use them ──
	if req.TeleportSessionID != "" {
		certData, keyData, ok := h.teleport.FetchCredentials(req.TeleportSessionID)
		if !ok {
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Teleport session expired. Please re-authenticate.",
			})
			return
		}
		clientCertB64 := base64.StdEncoding.EncodeToString(certData)
		clientKeyB64 := base64.StdEncoding.EncodeToString(keyData)

		poolConn, err := h.k8sPool.ConnectWithCerts(req.Server, req.CAData, clientCertB64, clientKeyB64)
		if err != nil {
			json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("connect: %v", err)})
			return
		}
		h.logger.Printf("K8s: connected to %s via Teleport SSO certs", req.ClusterName)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"cluster_id": fmt.Sprintf("kubeconfig:%s", req.ClusterName),
			"status":     "connected",
			"version":    poolConn.Client.Discovery().RESTClient().Get().URL().String(),
		})
		return
	}

	// ── Phase 2: Try executing the kubeconfig exec command locally (like OpenLens) ──
	if req.ExecCmd != "" {
		h.logger.Printf("K8s: executing kubeconfig exec: %s %v", req.ExecCmd, req.ExecArgs)
		cmd := exec.Command(req.ExecCmd, req.ExecArgs...)
		cmd.Env = append(os.Environ(),
			"HOME=/home/cloudterm",
			"TELEPORT_ADD_KEYS_TO_AGENT=no",
			"SSH_AUTH_SOCK=",
		)

		output, err := cmd.Output()
		if err != nil {
			// Exec failed — capture details
			var exitErr *exec.ExitError
			errMsg := err.Error()
			if errors.As(err, &exitErr) && len(exitErr.Stderr) > 0 {
				errMsg = string(exitErr.Stderr)
			}
			h.logger.Printf("K8s: exec failed for %s: %s", req.ClusterName, errMsg)

			// If this is a Teleport cluster, fall back to Web SSO
			isTeleport := req.IsTeleport ||
				strings.Contains(req.ExecCmd, "tsh") ||
				strings.Contains(req.ExecCmd, "teleport")

			if isTeleport {
				proxy := req.Server
				if strings.HasPrefix(proxy, "https://") {
					proxy = strings.TrimPrefix(proxy, "https://")
				}
				auth := "default"
				for _, arg := range req.ExecArgs {
					if strings.HasPrefix(arg, "--proxy=") {
						proxy = strings.TrimPrefix(arg, "--proxy=")
					}
					if strings.HasPrefix(arg, "--auth=") {
						auth = strings.TrimPrefix(arg, "--auth=")
					}
				}
				json.NewEncoder(w).Encode(map[string]string{
					"auth_required": "teleport",
					"proxy":         proxy,
					"auth_type":     auth,
					"message":       "Teleport session not found locally. Initiating Web SSO flow.",
				})
				return
			}

			// Not teleport — return the error directly
			json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("exec failed: %s", errMsg),
			})
			return
		}

		// Parse the ExecCredential response (K8s client-go exec credential API)
		var execCred struct {
			Status struct {
				Token                 string `json:"token"`
				ClientCertificateData string `json:"clientCertificateData"`
				ClientKeyData         string `json:"clientKeyData"`
			} `json:"status"`
		}
		if err := json.Unmarshal(output, &execCred); err != nil {
			json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("failed to parse exec credential output: %v", err),
			})
			return
		}

		// Token-based auth (EKS-style)
		if execCred.Status.Token != "" {
			poolConn, err := h.k8sPool.Connect(
				"kubeconfig", "exec", req.ClusterName,
				req.Server, execCred.Status.Token, req.CAData,
			)
			if err != nil {
				json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("connect: %v", err)})
				return
			}
			h.logger.Printf("K8s: connected to %s via exec token", req.ClusterName)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"cluster_id": fmt.Sprintf("kubeconfig:%s", req.ClusterName),
				"status":     "connected",
				"version":    poolConn.Client.Discovery().RESTClient().Get().URL().String(),
			})
			return
		}

		// Cert-based auth (Teleport-style)
		if execCred.Status.ClientCertificateData != "" && execCred.Status.ClientKeyData != "" {
			poolConn, err := h.k8sPool.ConnectWithCerts(
				req.Server, req.CAData,
				execCred.Status.ClientCertificateData,
				execCred.Status.ClientKeyData,
			)
			if err != nil {
				json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("connect: %v", err)})
				return
			}
			h.logger.Printf("K8s: connected to %s via exec certs", req.ClusterName)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"cluster_id": fmt.Sprintf("kubeconfig:%s", req.ClusterName),
				"status":     "connected",
				"version":    poolConn.Client.Discovery().RESTClient().Get().URL().String(),
			})
			return
		}

		json.NewEncoder(w).Encode(map[string]string{
			"error": "exec command succeeded but returned no token or certificates",
		})
		return
	}

	// ── Phase 3: No exec command — no way to authenticate ──
	json.NewEncoder(w).Encode(map[string]string{
		"error": "This kubeconfig has no exec command and no credentials. Cannot connect.",
	})
}
