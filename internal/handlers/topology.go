package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"cloudterm-go/internal/aws"
)

// Routes to add in handlers.go Router():
//   mux.HandleFunc("GET /topology/{instanceId}", h.handleTopology)
//   mux.HandleFunc("POST /topology/deep-analyze", h.handleTopologyDeepAnalyze)
//   mux.HandleFunc("GET /topology/exposure/{instanceId}", h.handleTopologyExposure)
//   mux.HandleFunc("GET /topology/conflicts/{instanceId}", h.handleTopologyConflicts)

// TopologyCache holds cached VPC topology data with TTL.
type TopologyCache struct {
	mu    sync.RWMutex
	cache map[string]*topologyCacheEntry // key: "account:region:vpcId"
}

type topologyCacheEntry struct {
	data      *aws.VPCTopology
	fetchedAt time.Time
}

// NewTopologyCache creates a new topology cache.
func NewTopologyCache() *TopologyCache {
	return &TopologyCache{cache: make(map[string]*topologyCacheEntry)}
}

// Get retrieves cached topology if it exists and is fresh.
func (tc *TopologyCache) Get(key string, maxAge time.Duration) *aws.VPCTopology {
	tc.mu.RLock()
	defer tc.mu.RUnlock()
	entry, ok := tc.cache[key]
	if !ok || time.Since(entry.fetchedAt) > maxAge {
		return nil
	}
	return entry.data
}

// Set stores topology data in cache.
func (tc *TopologyCache) Set(key string, data *aws.VPCTopology) {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	tc.cache[key] = &topologyCacheEntry{data: data, fetchedAt: time.Now()}
}

var topoCache = NewTopologyCache()

const topologyCacheTTL = 5 * time.Minute

// handleTopology returns the full VPC topology for the VPC containing the given instance.
// GET /topology/{instanceId}
func (h *Handler) handleTopology(w http.ResponseWriter, r *http.Request) {
	instanceID := r.PathValue("instanceId")
	if instanceID == "" {
		http.Error(w, `{"error":"instance ID required"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	// Fetch topology (which will include cache lookup internally if implemented in Discovery)
	// For now, fetch directly and use our cache wrapper
	topo, err := h.discovery.FetchVPCTopology(ctx, instanceID)
	if err != nil {
		h.logger.Printf("topology fetch error for instance %s: %v", instanceID, err)
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(topo); err != nil {
		h.logger.Printf("error encoding topology response: %v", err)
	}
}

// analyzeRequest represents the request body for reachability analysis.
type analyzeRequest struct {
	SourceInstanceID string `json:"sourceInstanceId"`
	DestInstanceID   string `json:"destInstanceId,omitempty"`
	DestIP           string `json:"destIp,omitempty"`
	Protocol         string `json:"protocol"`
	Port             int    `json:"port"`
}

// handleTopologyDeepAnalyze runs AWS Network Insights analysis with SSE streaming.
// POST /topology/deep-analyze
func (h *Handler) handleTopologyDeepAnalyze(w http.ResponseWriter, r *http.Request) {
	var req analyzeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request body: %s"}`, err.Error()), http.StatusBadRequest)
		return
	}

	if req.SourceInstanceID == "" {
		http.Error(w, `{"error":"sourceInstanceId required"}`, http.StatusBadRequest)
		return
	}
	if req.DestInstanceID == "" && req.DestIP == "" {
		http.Error(w, `{"error":"either destInstanceId or destIp required"}`, http.StatusBadRequest)
		return
	}
	if req.Protocol == "" {
		http.Error(w, `{"error":"protocol required"}`, http.StatusBadRequest)
		return
	}

	// SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, `{"error":"streaming not supported"}`, http.StatusInternalServerError)
		return
	}

	ctx := r.Context()

	sendEvent := func(event aws.DeepAnalysisEvent) {
		data, err := json.Marshal(event)
		if err != nil {
			return
		}
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}

	err := h.discovery.DeepAnalyze(ctx, req.SourceInstanceID, req.DestInstanceID, req.DestIP, req.Protocol, int32(req.Port), sendEvent)
	if err != nil {
		h.logger.Printf("deep analysis error: %v", err)
		sendEvent(aws.DeepAnalysisEvent{
			Type:    "error",
			Message: err.Error(),
		})
	}
}

// handleTopologyExposure returns internet exposure analysis.
// GET /topology/exposure/{instanceId}
func (h *Handler) handleTopologyExposure(w http.ResponseWriter, r *http.Request) {
	instanceID := r.PathValue("instanceId")
	if instanceID == "" {
		http.Error(w, `{"error":"instance ID required"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	// Fetch topology
	topo, err := h.discovery.FetchVPCTopology(ctx, instanceID)
	if err != nil {
		h.logger.Printf("topology fetch error for exposure analysis: %v", err)
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	// Analyze exposure
	result := aws.AnalyzeExposure(topo)

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(result); err != nil {
		h.logger.Printf("error encoding exposure response: %v", err)
	}
}

// handleTopologyConflicts returns rule conflicts/issues.
// GET /topology/conflicts/{instanceId}
func (h *Handler) handleTopologyConflicts(w http.ResponseWriter, r *http.Request) {
	instanceID := r.PathValue("instanceId")
	if instanceID == "" {
		http.Error(w, `{"error":"instance ID required"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	// Fetch topology
	topo, err := h.discovery.FetchVPCTopology(ctx, instanceID)
	if err != nil {
		h.logger.Printf("topology fetch error for conflict analysis: %v", err)
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	// Analyze conflicts
	result := aws.AnalyzeRuleConflicts(topo)

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(result); err != nil {
		h.logger.Printf("error encoding conflicts response: %v", err)
	}
}
