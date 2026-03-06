package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"cloudterm-go/internal/audit"
	"cloudterm-go/internal/aws"
)

// handleCloneStart creates an AMI from the source instance and starts background polling.
// POST /clone/start
func (h *Handler) handleCloneStart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceID string `json:"instance_id"`
		CloneName  string `json:"clone_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.InstanceID == "" || req.CloneName == "" {
		jsonError(w, "instance_id and clone_name required", http.StatusBadRequest)
		return
	}

	cloneID, err := h.discovery.StartClone(r.Context(), req.InstanceID, req.CloneName)
	if err != nil {
		h.logger.Printf("clone start error: %v", err)
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	h.audit.Log(audit.AuditEvent{Action: "clone_start", InstanceID: req.InstanceID, Details: fmt.Sprintf("Clone %s, AMI name: %s", cloneID, req.CloneName)})
	jsonResponse(w, map[string]string{"id": cloneID, "message": "Clone started"})
}

// handleCloneStatus returns the current status of a clone operation.
// GET /clone/status/{id}
func (h *Handler) handleCloneStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		jsonError(w, "clone ID required", http.StatusBadRequest)
		return
	}

	status, err := h.discovery.GetCloneStatus(id)
	if err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}

	jsonResponse(w, status)
}

// handleCloneSettings returns pre-filled launch settings for a clone.
// GET /clone/settings/{id}
func (h *Handler) handleCloneSettings(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		jsonError(w, "clone ID required", http.StatusBadRequest)
		return
	}

	settings, err := h.discovery.GetCloneSettings(r.Context(), id)
	if err != nil {
		h.logger.Printf("clone settings error: %v", err)
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	jsonResponse(w, settings)
}

// handleCloneLaunch creates a new instance from the clone AMI.
// POST /clone/launch/{id}
func (h *Handler) handleCloneLaunch(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		jsonError(w, "clone ID required", http.StatusBadRequest)
		return
	}

	var settings aws.CloneSettings
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	newID, err := h.discovery.LaunchClone(r.Context(), id, settings)
	if err != nil {
		h.logger.Printf("clone launch error: %v", err)
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	h.audit.Log(audit.AuditEvent{Action: "clone_launch", InstanceID: newID, Details: fmt.Sprintf("Cloned from %s", id)})
	jsonResponse(w, map[string]string{"instance_id": newID, "message": "Instance launched"})
}
