package teleport

import (
	"bytes"
	"log"
	"testing"
)

func TestService_CacheAndFetchCredentials(t *testing.T) {
	logger := log.New(&bytes.Buffer{}, "", 0)
	service := NewService(logger)

	sessionID := "test-session-123"
	cert := []byte("test-cert")
	key := []byte("test-key")

	// Initially should not exist
	gotCert, gotKey, ok := service.FetchCredentials(sessionID)
	if ok {
		t.Errorf("expected no credentials initially, got ok=true")
	}
	if gotCert != nil || gotKey != nil {
		t.Errorf("expected nil credentials initially, got cert=%v, key=%v", gotCert, gotKey)
	}

	// Cache credentials
	service.CacheCredentials(sessionID, cert, key)

	// Fetch credentials
	gotCert, gotKey, ok = service.FetchCredentials(sessionID)
	if !ok {
		t.Errorf("expected credentials to be found, got ok=false")
	}
	if string(gotCert) != string(cert) {
		t.Errorf("expected cert %q, got %q", cert, gotCert)
	}
	if string(gotKey) != string(key) {
		t.Errorf("expected key %q, got %q", key, gotKey)
	}

	// Fetch again, should be removed
	gotCert, gotKey, ok = service.FetchCredentials(sessionID)
	if ok {
		t.Errorf("expected credentials to be removed after first fetch, got ok=true")
	}
}
