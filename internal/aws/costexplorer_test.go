package aws

import (
	"testing"

	cetypes "github.com/aws/aws-sdk-go-v2/service/costexplorer/types"
)

func TestBuildFilter_Empty(t *testing.T) {
	params := CostQueryParams{
		Start:       "2024-01-01",
		End:         "2024-01-31",
		Granularity: "MONTHLY",
	}
	f := BuildFilter(params)
	if f == nil {
		t.Fatal("expected non-nil filter (record-type exclusion always present)")
	}
	if f.Not == nil {
		t.Fatal("expected Not expression for record-type exclusion")
	}
}

func TestBuildFilter_SingleAccount(t *testing.T) {
	params := CostQueryParams{
		Start:    "2024-01-01",
		End:      "2024-01-31",
		Accounts: []string{"111111111111"},
	}
	f := BuildFilter(params)
	if f == nil {
		t.Fatal("expected non-nil filter")
	}
	if f.And == nil {
		t.Fatal("expected And expression (record-type exclusion + account filter)")
	}
	if len(f.And) != 2 {
		t.Errorf("expected 2 And clauses (exclusion + account), got %d", len(f.And))
	}
}

func TestBuildFilter_MultipleFilters(t *testing.T) {
	params := CostQueryParams{
		Start:    "2024-01-01",
		End:      "2024-01-31",
		Accounts: []string{"111111111111"},
		Services: []string{"Amazon Elastic Compute Cloud - Compute"},
		Regions:  []string{"us-east-1"},
	}
	f := BuildFilter(params)
	if f == nil {
		t.Fatal("expected non-nil filter")
	}
	if f.And == nil {
		t.Fatal("expected And expression for multiple filters")
	}
	if len(f.And) != 4 {
		t.Errorf("expected 4 And clauses (exclusion + 3 user filters), got %d", len(f.And))
	}
}

func TestBuildFilter_WithTags(t *testing.T) {
	params := CostQueryParams{
		Start: "2024-01-01",
		End:   "2024-01-31",
		TagFilters: []TagFilter{
			{Key: "Environment", Values: []string{"prod", "staging"}},
			{Key: "Customer", Values: []string{"Acme"}},
		},
	}
	f := BuildFilter(params)
	if f == nil {
		t.Fatal("expected non-nil filter")
	}
	if f.And == nil {
		t.Fatal("expected And expression")
	}
	if len(f.And) != 3 {
		t.Errorf("expected 3 And clauses (exclusion + 2 tags), got %d", len(f.And))
	}
	if f.And[1].Tags == nil {
		t.Fatal("expected Tags in second clause")
	}
	if *f.And[1].Tags.Key != "Environment" {
		t.Errorf("expected Environment tag key, got %s", *f.And[1].Tags.Key)
	}
}

func TestBuildFilter_SkipsEmptyTag(t *testing.T) {
	params := CostQueryParams{
		Start: "2024-01-01",
		End:   "2024-01-31",
		TagFilters: []TagFilter{
			{Key: "", Values: []string{"prod"}},
			{Key: "Environment", Values: []string{}},
			{Key: "Customer", Values: []string{"Acme"}},
		},
	}
	f := BuildFilter(params)
	if f == nil {
		t.Fatal("expected non-nil filter")
	}
	if f.And == nil {
		t.Fatal("expected And (exclusion + Customer)")
	}
	if len(f.And) != 2 {
		t.Errorf("expected 2 And clauses (exclusion + Customer), got %d", len(f.And))
	}
	if f.And[1].Tags == nil || *f.And[1].Tags.Key != "Customer" {
		t.Errorf("expected Customer tag in second clause")
	}
}

func TestBuildBreakdown(t *testing.T) {
	agg := map[string]float64{
		"Amazon EC2":   500.0,
		"Amazon S3":    200.0,
		"Amazon RDS":   300.0,
		"Tiny Service": 0.005,
	}

	bd := buildBreakdown(agg, "USD")
	if bd.Currency != "USD" {
		t.Errorf("expected USD, got %s", bd.Currency)
	}
	if len(bd.Items) != 3 {
		t.Errorf("expected 3 items, got %d", len(bd.Items))
	}
	if bd.Items[0].Name != "Amazon EC2" {
		t.Errorf("expected Amazon EC2 first, got %s", bd.Items[0].Name)
	}
	if bd.Items[1].Name != "Amazon RDS" {
		t.Errorf("expected Amazon RDS second, got %s", bd.Items[1].Name)
	}
	expectedTotal := 1000.0
	if bd.Total != expectedTotal {
		t.Errorf("expected total %.2f, got %.2f", expectedTotal, bd.Total)
	}
}

func TestTopN(t *testing.T) {
	m := map[string]float64{"A": 100, "B": 300, "C": 200, "D": 50, "E": 400}
	top3 := topN(m, 3)
	if len(top3) != 3 {
		t.Fatalf("expected 3, got %d", len(top3))
	}
	if top3[0] != "E" {
		t.Errorf("expected E first, got %s", top3[0])
	}
	if top3[1] != "B" {
		t.Errorf("expected B second, got %s", top3[1])
	}
	if top3[2] != "C" {
		t.Errorf("expected C third, got %s", top3[2])
	}
	top10 := topN(m, 10)
	if len(top10) != 5 {
		t.Errorf("expected 5 (all), got %d", len(top10))
	}
}

func TestContains(t *testing.T) {
	tests := []struct {
		name   string
		slice  []string
		search string
		want   bool
	}{
		{"found", []string{"a", "b", "c"}, "b", true},
		{"not found", []string{"a", "b", "c"}, "d", false},
		{"empty slice", []string{}, "a", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := contains(tt.slice, tt.search)
			if got != tt.want {
				t.Errorf("contains(%v, %q) = %v, want %v", tt.slice, tt.search, got, tt.want)
			}
		})
	}
}

func TestPreviousPeriod(t *testing.T) {
	params := CostQueryParams{Start: "2024-02-01", End: "2024-03-01", Granularity: "MONTHLY"}
	prev := previousPeriod(params)
	if prev.Start != "2024-01-03" {
		t.Errorf("expected start 2024-01-03, got %s", prev.Start)
	}
	if prev.End != "2024-02-01" {
		t.Errorf("expected end 2024-02-01, got %s", prev.End)
	}
}

func TestPreviousPeriod_InvalidDate(t *testing.T) {
	params := CostQueryParams{Start: "invalid", End: "2024-03-01"}
	prev := previousPeriod(params)
	if prev.Start != "invalid" {
		t.Errorf("expected unchanged start for invalid date, got %s", prev.Start)
	}
}

func TestParseFloat(t *testing.T) {
	tests := []struct {
		input string
		want  float64
	}{
		{"123.45", 123.45},
		{"0.0", 0.0},
		{"-42.5", -42.5},
		{"1234567.89", 1234567.89},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := parseFloat(tt.input)
			if got != tt.want {
				t.Errorf("parseFloat(%q) = %f, want %f", tt.input, got, tt.want)
			}
		})
	}
}

func TestGranularity(t *testing.T) {
	tests := []struct {
		input string
		want  cetypes.Granularity
	}{
		{"DAILY", cetypes.GranularityDaily},
		{"daily", cetypes.GranularityDaily},
		{"MONTHLY", cetypes.GranularityMonthly},
		{"monthly", cetypes.GranularityMonthly},
		{"unknown", cetypes.GranularityMonthly},
		{"", cetypes.GranularityMonthly},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := granularity(tt.input)
			if got != tt.want {
				t.Errorf("granularity(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestCacheKey_Deterministic(t *testing.T) {
	params := CostQueryParams{Start: "2024-01-01", End: "2024-01-31", Granularity: "MONTHLY", Accounts: []string{"111"}}
	k1 := cacheKey("summary", params)
	k2 := cacheKey("summary", params)
	if k1 != k2 {
		t.Errorf("cache keys should be deterministic: %s != %s", k1, k2)
	}
}

func TestCacheKey_DifferentEndpoints(t *testing.T) {
	params := CostQueryParams{Start: "2024-01-01", End: "2024-01-31"}
	k1 := cacheKey("summary", params)
	k2 := cacheKey("by-service", params)
	if k1 == k2 {
		t.Error("cache keys should differ for different endpoints")
	}
}
