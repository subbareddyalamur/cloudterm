package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"cloudterm-go/internal/aws"
)

func TestParseCostParams_Defaults(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/cost-explorer/summary", nil)
	params := parseCostParams(req)

	if params.Granularity != "MONTHLY" {
		t.Errorf("expected MONTHLY granularity, got %s", params.Granularity)
	}
	if params.Start == "" {
		t.Error("expected non-empty start date")
	}
	if params.End == "" {
		t.Error("expected non-empty end date")
	}
	if len(params.Accounts) != 0 {
		t.Errorf("expected empty accounts, got %v", params.Accounts)
	}
}

func TestParseCostParams_WithFilters(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet,
		"/cost-explorer/summary?start=2024-01-01&end=2024-01-31&granularity=DAILY&accounts=111,222&services=Amazon+EC2,Amazon+S3&regions=us-east-1",
		nil)
	params := parseCostParams(req)

	if params.Start != "2024-01-01" {
		t.Errorf("expected start 2024-01-01, got %s", params.Start)
	}
	if params.End != "2024-01-31" {
		t.Errorf("expected end 2024-01-31, got %s", params.End)
	}
	if params.Granularity != "DAILY" {
		t.Errorf("expected DAILY, got %s", params.Granularity)
	}
	if len(params.Accounts) != 2 {
		t.Errorf("expected 2 accounts, got %d", len(params.Accounts))
	}
	if len(params.Services) != 2 {
		t.Errorf("expected 2 services, got %d", len(params.Services))
	}
	if len(params.Regions) != 1 {
		t.Errorf("expected 1 region, got %d", len(params.Regions))
	}
}

func TestParseCostParams_WithTagFilters(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet,
		"/cost-explorer/summary?tag_customer=Acme&tag_environment=prod,staging&tag_custom_key=CostCenter&tag_custom_value=CC-100",
		nil)
	params := parseCostParams(req)

	if len(params.TagFilters) != 3 {
		t.Fatalf("expected 3 tag filters (customer + environment + custom), got %d", len(params.TagFilters))
	}

	found := map[string]bool{}
	for _, tf := range params.TagFilters {
		found[tf.Key] = true
		switch tf.Key {
		case "Customer":
			if len(tf.Values) != 1 || tf.Values[0] != "Acme" {
				t.Errorf("unexpected Customer values: %v", tf.Values)
			}
		case "Environment":
			if len(tf.Values) != 2 {
				t.Errorf("expected 2 Environment values, got %d", len(tf.Values))
			}
		case "CostCenter":
			if len(tf.Values) != 1 || tf.Values[0] != "CC-100" {
				t.Errorf("unexpected CostCenter values: %v", tf.Values)
			}
		}
	}

	if !found["Customer"] {
		t.Error("missing Customer tag filter")
	}
	if !found["Environment"] {
		t.Error("missing Environment tag filter")
	}
	if !found["CostCenter"] {
		t.Error("missing CostCenter custom tag filter")
	}
}

func TestParseCostParams_NoCustomTagWithoutKey(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet,
		"/cost-explorer/summary?tag_custom_value=CC-100",
		nil)
	params := parseCostParams(req)

	for _, tf := range params.TagFilters {
		if tf.Key == "CC-100" || tf.Key == "" {
			t.Error("custom tag filter should not be added without tag_custom_key")
		}
	}
}

func TestBuildFilter_Integration(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet,
		"/cost-explorer/by-service?accounts=111&services=Amazon+EC2&tag_environment=prod",
		nil)
	params := parseCostParams(req)
	filter := aws.BuildFilter(params)

	if filter == nil {
		t.Fatal("expected non-nil filter")
	}
	if filter.And == nil {
		t.Fatal("expected And expression for multiple filters")
	}
	if len(filter.And) != 4 {
		t.Errorf("expected 4 filter clauses (exclusion + account + service + tag), got %d", len(filter.And))
	}
}
