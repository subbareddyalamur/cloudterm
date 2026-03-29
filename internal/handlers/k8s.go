package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"cloudterm-go/internal/k8s"

	"k8s.io/client-go/dynamic"
)

// handleK8sListClusters discovers EKS clusters for a given account and region.
func (h *Handler) handleK8sListClusters(w http.ResponseWriter, r *http.Request) {
	accountID := r.URL.Query().Get("accountId")
	region := r.URL.Query().Get("region")
	if accountID == "" || region == "" {
		http.Error(w, "accountId and region required", http.StatusBadRequest)
		return
	}

	clusters, err := h.eksService.ListClusters(r.Context(), accountID, region)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(clusters)
}

// handleK8sConnect establishes a connection to an EKS cluster.
func (h *Handler) handleK8sConnect(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AccountID string `json:"account_id"`
		Region    string `json:"region"`
		Cluster   string `json:"cluster"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Get cluster info for endpoint and CA cert
	clusters, err := h.eksService.ListClusters(r.Context(), req.AccountID, req.Region)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var target *k8s.EKSClusterInfo
	for _, c := range clusters {
		if c.Name == req.Cluster {
			target = &k8s.EKSClusterInfo{
				Endpoint: c.Endpoint,
				CACert:   c.CACert,
			}
			break
		}
	}
	if target == nil {
		http.Error(w, "cluster not found", http.StatusNotFound)
		return
	}

	// Generate token
	token, err := h.eksService.GetToken(r.Context(), req.AccountID, req.Region, req.Cluster)
	if err != nil {
		http.Error(w, fmt.Sprintf("generate token: %v", err), http.StatusInternalServerError)
		return
	}

	// Connect via client pool
	conn, err := h.k8sPool.Connect(req.AccountID, req.Region, req.Cluster, target.Endpoint, token, target.CACert)
	if err != nil {
		http.Error(w, fmt.Sprintf("connect: %v", err), http.StatusInternalServerError)
		return
	}

	clusterID := fmt.Sprintf("%s:%s:%s", req.AccountID, req.Region, req.Cluster)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"cluster_id": clusterID,
		"status":     "connected",
		"version":    conn.Client.Discovery().RESTClient().Get().URL().String(),
	})
}

// handleK8sDisconnect removes a cluster connection from the pool.
func (h *Handler) handleK8sDisconnect(w http.ResponseWriter, r *http.Request) {
	clusterID := r.PathValue("cluster")
	parts := strings.SplitN(clusterID, ":", 3)
	if len(parts) != 3 {
		http.Error(w, "invalid cluster ID", http.StatusBadRequest)
		return
	}
	h.k8sPool.Disconnect(parts[0], parts[1], parts[2])
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "disconnected"})
}

// handleK8sNamespaces lists namespaces in a connected cluster.
func (h *Handler) handleK8sNamespaces(w http.ResponseWriter, r *http.Request) {
	conn, err := h.getK8sConn(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	
	nsList, err := conn.Client.CoreV1().Namespaces().List(ctx, k8s.ListOpts())
	if err != nil {
		// Fall back to common namespaces if API call fails
		namespaces := []string{"default", "kube-system", "kube-public", "kube-node-lease"}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(namespaces)
		return
	}
	var names []string
	for _, ns := range nsList.Items {
		names = append(names, ns.Name)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(names)
}

// handleK8sCategories returns resource types organized by category.
func (h *Handler) handleK8sCategories(w http.ResponseWriter, r *http.Request) {
	conn, err := h.getK8sConn(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	cats, err := k8s.Categories(conn.Client)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cats)
}

// handleK8sListResources lists instances of a resource type.
func (h *Handler) handleK8sListResources(w http.ResponseWriter, r *http.Request) {
	conn, err := h.getK8sConn(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	resourceType := r.PathValue("type")
	group := r.URL.Query().Get("group")
	version := r.URL.Query().Get("version")
	namespace := r.URL.Query().Get("namespace")

	if version == "" {
		version = "v1"
	}

	dynClient, err := dynamic.NewForConfig(conn.RestCfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	items, err := k8s.ListResourcesDynamic(dynClient, group, version, resourceType, namespace, 100)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// handleK8sGetResource returns the full YAML of a single resource.
func (h *Handler) handleK8sGetResource(w http.ResponseWriter, r *http.Request) {
	conn, err := h.getK8sConn(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	resourceType := r.PathValue("type")
	name := r.PathValue("name")
	group := r.URL.Query().Get("group")
	version := r.URL.Query().Get("version")
	namespace := r.URL.Query().Get("namespace")

	if version == "" {
		version = "v1"
	}

	dynClient, err := dynamic.NewForConfig(conn.RestCfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	obj, err := k8s.GetResourceYAML(dynClient, group, version, resourceType, namespace, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	format := r.URL.Query().Get("format")
	w.Header().Set("Content-Type", "application/json")
	if format == "yaml" {
		w.Header().Set("Content-Type", "text/yaml")
	}
	json.NewEncoder(w).Encode(obj.Object)
}

// handleK8sListCRDs lists all Custom Resource Definitions.
func (h *Handler) handleK8sListCRDs(w http.ResponseWriter, r *http.Request) {
	conn, err := h.getK8sConn(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	dynClient, err := dynamic.NewForConfig(conn.RestCfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	crds, err := k8s.ListResourcesDynamic(dynClient, "apiextensions.k8s.io", "v1", "customresourcedefinitions", "", 0)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(crds)
}

// handleK8sCRDResources lists instances of a specific CRD.
func (h *Handler) handleK8sCRDResources(w http.ResponseWriter, r *http.Request) {
	conn, err := h.getK8sConn(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	crdName := r.PathValue("name")
	namespace := r.URL.Query().Get("namespace")

	// CRD name format: <plural>.<group>, e.g. certificates.cert-manager.io
	parts := strings.SplitN(crdName, ".", 2)
	if len(parts) != 2 {
		http.Error(w, "invalid CRD name format (expected <plural>.<group>)", http.StatusBadRequest)
		return
	}
	resource := parts[0]
	group := parts[1]

	dynClient, err := dynamic.NewForConfig(conn.RestCfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	items, err := k8s.ListResourcesDynamic(dynClient, group, "v1", resource, namespace, 100)
	if err != nil {
		// Try v1beta1 fallback
		items, err = k8s.ListResourcesDynamic(dynClient, group, "v1beta1", resource, namespace, 100)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// getK8sConn extracts the cluster connection from the request query param.
func (h *Handler) getK8sConn(r *http.Request) (*k8s.ClusterConnection, error) {
	clusterID := r.URL.Query().Get("cluster")
	if clusterID == "" {
		return nil, fmt.Errorf("cluster query param required")
	}
	parts := strings.SplitN(clusterID, ":", 3)
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid cluster ID format")
	}
	conn, ok := h.k8sPool.Get(parts[0], parts[1], parts[2])
	if !ok {
		return nil, fmt.Errorf("cluster not connected")
	}
	return conn, nil
}
