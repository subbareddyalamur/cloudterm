package auth

import (
	"path/filepath"
	"testing"
)

// The shipped example must stay a valid configuration.
func TestShippedProviderExampleLoads(t *testing.T) {
	cfgs, err := LoadProviders(filepath.Join("..", "..", "deploy", "sso", "sso-providers.example.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(cfgs) != 5 {
		t.Fatalf("expected 5 example providers, got %d", len(cfgs))
	}
	for i := range cfgs {
		if err := cfgs[i].validate(); err != nil {
			t.Errorf("%s: %v", cfgs[i].ID, err)
		}
	}
}
