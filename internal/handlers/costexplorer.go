package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"cloudterm-go/internal/aws"
)

func (h *Handler) handleCostSummary(w http.ResponseWriter, r *http.Request) {
	params := parseCostParams(r)
	ctx := r.Context()

	summary, err := h.costExplorer.GetSummary(ctx, params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}

func (h *Handler) handleCostByService(w http.ResponseWriter, r *http.Request) {
	params := parseCostParams(r)
	ctx := r.Context()

	breakdown, err := h.costExplorer.GetCostByService(ctx, params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(breakdown)
}

func (h *Handler) handleCostByAccount(w http.ResponseWriter, r *http.Request) {
	params := parseCostParams(r)
	ctx := r.Context()

	breakdown, err := h.costExplorer.GetCostByAccount(ctx, params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(breakdown)
}

func (h *Handler) handleCostByTag(w http.ResponseWriter, r *http.Request) {
	params := parseCostParams(r)
	tagKey := r.URL.Query().Get("tag_key")
	if tagKey == "" {
		tagKey = "Environment"
	}
	ctx := r.Context()

	breakdown, err := h.costExplorer.GetCostByTag(ctx, params, tagKey)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(breakdown)
}

func (h *Handler) handleCostTrend(w http.ResponseWriter, r *http.Request) {
	params := parseCostParams(r)
	ctx := r.Context()

	trend, err := h.costExplorer.GetTrend(ctx, params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(trend)
}

func (h *Handler) handleCostDetails(w http.ResponseWriter, r *http.Request) {
	params := parseCostParams(r)
	ctx := r.Context()

	details, err := h.costExplorer.GetDetails(ctx, params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(details)
}

func (h *Handler) handleCostComprehensive(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	data, err := h.costExplorer.GetComprehensive(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func (h *Handler) handleCostFilters(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	start := q.Get("start")
	end := q.Get("end")
	if start == "" || end == "" {
		yesterday := time.Now().AddDate(0, 0, -1)
		end = yesterday.Format("2006-01-02")
		start = yesterday.AddDate(0, -1, 0).Format("2006-01-02")
	}
	ctx := r.Context()

	filters, err := h.costExplorer.GetFilters(ctx, start, end)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(filters)
}

func parseCostParams(r *http.Request) aws.CostQueryParams {
	q := r.URL.Query()

	now := time.Now()
	yesterday := now.AddDate(0, 0, -1)
	start := q.Get("start")
	end := q.Get("end")
	if start == "" {
		start = yesterday.AddDate(0, -1, 0).Format("2006-01-02")
	}
	if end == "" {
		end = yesterday.Format("2006-01-02")
	}

	gran := q.Get("granularity")
	if gran == "" {
		gran = "MONTHLY"
	}

	params := aws.CostQueryParams{
		Start:       start,
		End:         end,
		Granularity: gran,
	}

	if accounts := q.Get("accounts"); accounts != "" {
		params.Accounts = strings.Split(accounts, ",")
	}
	if services := q.Get("services"); services != "" {
		params.Services = strings.Split(services, ",")
	}
	if regions := q.Get("regions"); regions != "" {
		params.Regions = strings.Split(regions, ",")
	}

	tagKeys := []string{"Customer", "ProjectCode", "Environment", "Application", "Workload"}
	for _, key := range tagKeys {
		paramName := "tag_" + strings.ToLower(key)
		if values := q.Get(paramName); values != "" {
			params.TagFilters = append(params.TagFilters, aws.TagFilter{
				Key:    key,
				Values: strings.Split(values, ","),
			})
		}
	}

	if customKey := q.Get("tag_custom_key"); customKey != "" {
		if customValue := q.Get("tag_custom_value"); customValue != "" {
			params.TagFilters = append(params.TagFilters, aws.TagFilter{
				Key:    customKey,
				Values: strings.Split(customValue, ","),
			})
		}
	}

	return params
}
