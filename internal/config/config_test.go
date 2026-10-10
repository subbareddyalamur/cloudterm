package config

import (
	"strings"
	"testing"
)

func TestParseTrustedProxies(t *testing.T) {
	warn, cleaned := parseTrustedProxies([]string{"10.0.0.5", "192.168.0.0/16", "not-an-ip", "2001:db8::7"})
	if len(warn) != 1 || !strings.Contains(warn[0], "not-an-ip") {
		t.Fatalf("invalid entries must be reported, got %v", warn)
	}
	want := []string{"10.0.0.5/32", "192.168.0.0/16", "2001:db8::7/128"}
	if len(cleaned) != len(want) {
		t.Fatalf("cleaned = %v, want %v", cleaned, want)
	}
	for i := range want {
		if cleaned[i] != want[i] {
			t.Errorf("cleaned[%d] = %q, want %q", i, cleaned[i], want[i])
		}
	}

	cfg := &Config{TrustedProxies: cleaned}
	if !cfg.IsTrustedProxy("10.0.0.5") {
		t.Error("a bare IP entry must match exactly itself")
	}
	if cfg.IsTrustedProxy("10.0.0.6") {
		t.Error("a bare IP entry must not cover neighbors")
	}
	if !cfg.IsTrustedProxy("192.168.44.2") {
		t.Error("a CIDR entry must cover its range")
	}
	if !cfg.IsTrustedProxy("2001:db8::7") {
		t.Error("an IPv6 entry must match")
	}
	if cfg.IsTrustedProxy("203.0.113.9") {
		t.Error("an unlisted address must not be trusted")
	}
	if cfg.IsTrustedProxy("junk") {
		t.Error("unparsable input is treated as untrusted, not a crash")
	}

	empty := &Config{}
	if !empty.IsTrustedProxy("203.0.113.9") {
		t.Error("with no list every peer is trusted (single-proxy deployments)")
	}
}
