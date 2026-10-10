package handlers

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"

	"cloudterm-go/internal/config"
)

func proxyRequest(remote, xff, proto string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "http://desk.example/", nil)
	r.RemoteAddr = remote
	if xff != "" {
		r.Header.Set("X-Forwarded-For", xff)
	}
	if proto != "" {
		r.Header.Set("X-Forwarded-Proto", proto)
	}
	return r
}

// TestProxyHeaderTrust covers TRUSTED_PROXIES: forward headers decide the
// audit IP and cookie security only when they arrive from a listed proxy.
func TestProxyHeaderTrust(t *testing.T) {
	open := &Handler{cfg: &config.Config{TrustedProxies: nil}} // no list: legacy behavior
	listed := &Handler{cfg: &config.Config{TrustedProxies: []string{"10.0.0.0/8"}}}

	// Without a list, header values are honored from anyone (deployments
	// behind a single TLS-terminating proxy).
	if got := open.clientIP(proxyRequest("203.0.113.9:4432", "1.2.3.4", "https")); got != "1.2.3.4" {
		t.Errorf("legacy clientIP = %q, want the forwarded address", got)
	}
	if !open.isHTTPS(proxyRequest("203.0.113.9:4432", "1.2.3.4", "https")) {
		t.Error("legacy isHTTPS must honor X-Forwarded-Proto")
	}

	// A listed proxy: the rightmost XFF entry it did not vouch for is the caller.
	if got := listed.clientIP(proxyRequest("10.0.0.5:4432", "9.9.9.9, 1.2.3.4, 10.0.0.5", "https")); got != "1.2.3.4" {
		t.Errorf("spoofed leftmost entries must be ignored, got %q", got)
	}
	if !listed.isHTTPS(proxyRequest("10.0.0.5:4432", "", "https")) {
		t.Error("a trusted proxy saying https must count as https")
	}

	// A peer outside the list: its headers are ignored entirely.
	if got := listed.clientIP(proxyRequest("203.0.113.9:4432", "8.8.8.8", "https")); got != "203.0.113.9" {
		t.Errorf("untrusted peer headers must be ignored, got %q", got)
	}
	if listed.isHTTPS(proxyRequest("203.0.113.9:4432", "8.8.8.8", "https")) {
		t.Error("an untrusted peer must not be able to claim https")
	}

	// Direct TLS needs no headers and no list.
	tlsReq := httptest.NewRequest(http.MethodGet, "https://desk.example/", nil)
	tlsReq.TLS = &tls.ConnectionState{}
	tlsReq.RemoteAddr = "203.0.113.9:4432"
	if !listed.isHTTPS(tlsReq) {
		t.Error("direct TLS must always count as https")
	}
	if got := listed.clientIP(tlsReq); got != "203.0.113.9" {
		t.Errorf("direct TLS client = %q, want the socket address", got)
	}
}
