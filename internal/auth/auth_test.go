package auth

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var testSecret = []byte("0123456789abcdef0123456789abcdef")

func TestPlaintextPasswordsAreMigrated(t *testing.T) {
	path := filepath.Join(t.TempDir(), "users.json")
	legacy := `[{"id":"admin","email":"admin@local","name":"x","role":"admin","tenant_id":"local","password":"cloudterm"}]`
	if err := os.WriteFile(path, []byte(legacy), 0600); err != nil {
		t.Fatal(err)
	}
	s, err := Open(path, testSecret, Options{})
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	if strings.Contains(string(raw), `"password":`) || strings.Contains(string(raw), "cloudterm\"") {
		t.Fatalf("plaintext password still on disk: %s", raw)
	}
	var stored []User
	_ = json.Unmarshal(raw, &stored)
	if !strings.HasPrefix(stored[0].PasswordHash, "$2") {
		t.Fatalf("expected bcrypt hash, got %q", stored[0].PasswordHash)
	}
	u, err := s.Login("ADMIN@local", "cloudterm", "ip")
	if err != nil || u.Role != RoleAdmin || u.PasswordHash != "" {
		t.Fatalf("login after migration: %+v %v", u, err)
	}
}

func TestNewInstallGeneratesAdminPassword(t *testing.T) {
	t.Setenv("CLOUDTERM_ADMIN_PASSWORD", "")
	s, err := Open(filepath.Join(t.TempDir(), "users.json"), testSecret, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if len(s.InitialAdminPassword) < 16 {
		t.Fatalf("weak generated password %q", s.InitialAdminPassword)
	}
	if _, err := s.Login("admin@local", "cloudterm", "ip"); err == nil {
		t.Fatal("the old default password must not work on a new install")
	}
	if _, err := s.Login("admin@local", s.InitialAdminPassword, "ip"); err != nil {
		t.Fatal(err)
	}
}

func TestLockoutAfterRepeatedFailures(t *testing.T) {
	t.Setenv("CLOUDTERM_ADMIN_PASSWORD", "correct-horse-battery")
	s, err := Open(filepath.Join(t.TempDir(), "users.json"), testSecret, Options{})
	if err != nil {
		t.Fatal(err)
	}
	var last error
	for i := 0; i < maxFailures; i++ {
		_, last = s.Login("admin@local", "wrong", "10.0.0.9")
	}
	if !errors.Is(last, ErrLocked) {
		t.Fatalf("expected lockout, got %v", last)
	}
	if _, err := s.Login("admin@local", "correct-horse-battery", "10.0.0.9"); !errors.Is(err, ErrLocked) {
		t.Fatalf("correct password must stay locked during lockout, got %v", err)
	}
	if _, err := s.Login("admin@local", "correct-horse-battery", "10.0.0.10"); err != nil {
		t.Fatalf("another address is not locked: %v", err)
	}
}

func TestSessionsRevokeExpireAndRejectTampering(t *testing.T) {
	t.Setenv("CLOUDTERM_ADMIN_PASSWORD", "correct-horse-battery")
	s, err := Open(filepath.Join(t.TempDir(), "users.json"), testSecret, Options{MaxAge: time.Hour, Idle: 50 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	u, _ := s.Login("admin@local", "correct-horse-battery", "ip")
	tok, c, err := s.Issue(u, MethodPassword)
	if err != nil {
		t.Fatal(err)
	}
	if got, err := s.Parse(tok); err != nil || got.UserID != "admin" || got.Method != MethodPassword {
		t.Fatalf("parse: %+v %v", got, err)
	}
	body, sig, _ := strings.Cut(tok, ".")
	if _, err := s.Parse(body + "x." + sig); err == nil {
		t.Fatal("tampered body accepted")
	}
	other, _ := Open(filepath.Join(t.TempDir(), "u.json"), []byte("ffffffffffffffffffffffffffffffff"), Options{})
	if _, err := other.Parse(tok); err == nil {
		t.Fatal("token from another secret accepted")
	}

	time.Sleep(80 * time.Millisecond)
	if _, err := s.Parse(tok); !errors.Is(err, ErrSessionEnded) {
		t.Fatalf("idle session must end, got %v", err)
	}

	tok2, c2, _ := s.Issue(u, MethodPassword)
	s.Revoke(c2)
	if _, err := s.Parse(tok2); !errors.Is(err, ErrSessionEnded) {
		t.Fatalf("revoked session must end, got %v", err)
	}
	_ = c
}

func TestLoadSecretPersistsAndRejectsShortSecrets(t *testing.T) {
	path := filepath.Join(t.TempDir(), "auth.key")
	a, err := LoadSecret("", path)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := LoadSecret("", path)
	if string(a) != string(b) || len(a) < 32 {
		t.Fatal("secret must persist across restarts")
	}
	if _, err := LoadSecret("short", path); err == nil {
		t.Fatal("short AUTH_SECRET accepted")
	}
}

func TestSignedValuesCarryExpiry(t *testing.T) {
	s := newService(testSecret, Options{})

	got, ok := s.VerifyValue(s.SignValue("okta|request-1"))
	if !ok || got != "okta|request-1" {
		t.Fatalf("round trip: %q %v", got, ok)
	}
	if _, ok := s.VerifyValue(s.signValue("stale", time.Now().Add(-time.Second))); ok {
		t.Fatal("an expired signed value must be refused")
	}
	// A value in the pre-expiry format (raw payload, no envelope) is refused.
	legacy := base64.RawURLEncoding.EncodeToString([]byte("never")) + "." + s.mac(base64.RawURLEncoding.EncodeToString([]byte("never")))
	if _, ok := s.VerifyValue(legacy); ok {
		t.Fatal("a value without an expiry must be refused")
	}
	// A tampered payload is refused.
	signed := s.SignValue("a")
	_, sig, _ := strings.Cut(signed, ".")
	other, _, _ := strings.Cut(s.SignValue("b"), ".")
	if _, ok := s.VerifyValue(other + "." + sig); ok {
		t.Fatal("a value signed for different content must be refused")
	}
}

func TestRoleChangesApplyToLiveSessions(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "users.json"), testSecret, Options{})
	if err != nil {
		t.Fatal(err)
	}
	u, err := s.UpsertSSOUser("okta", "https://okta.example", "sub-1", "priya@sycamore.example", "Priya", RoleAdmin, "")
	if err != nil {
		t.Fatal(err)
	}
	tok, _, err := s.Issue(u, MethodSSO)
	if err != nil {
		t.Fatal(err)
	}
	c, err := s.Parse(tok)
	if err != nil || c.Role != RoleAdmin {
		t.Fatalf("fresh session: %+v %v", c, err)
	}

	// The IdP demotes Priya at her next sign-in: the stored role changes, and
	// the live session must follow on its next request.
	if _, err := s.UpsertSSOUser("okta", "https://okta.example", "sub-1", "priya@sycamore.example", "Priya", RoleViewer, ""); err != nil {
		t.Fatal(err)
	}
	c, err = s.Parse(tok)
	if err != nil || c.Role != RoleViewer {
		t.Fatalf("a demotion must reach the live session: %+v %v", c, err)
	}

	// A user removed from the store has no sessions left.
	s.mu.Lock()
	for i := range s.users {
		if s.users[i].ID == u.ID {
			s.users = append(s.users[:i], s.users[i+1:]...)
			break
		}
	}
	s.mu.Unlock()
	if _, err := s.Parse(tok); !errors.Is(err, ErrDisabled) {
		t.Fatalf("a deleted user's session must end, got %v", err)
	}
}

func TestSSOUsersAreSeparatePerProvider(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "users.json"), testSecret, Options{})
	if err != nil {
		t.Fatal(err)
	}
	a, _ := s.UpsertSSOUser("okta", "https://okta.example", "sub-1", "priya@sycamore.example", "Priya", RoleAdmin, "")
	b, _ := s.UpsertSSOUser("google", "https://accounts.google.com", "sub-1", "priya@sycamore.example", "Priya", RoleViewer, "")
	if a.ID == b.ID {
		t.Fatal("the same email from two providers must be two users")
	}
	again, _ := s.UpsertSSOUser("okta", "https://okta.example", "sub-1", "priya@sycamore.example", "Priya", RoleOperator, "")
	if again.ID != a.ID || again.Role != RoleOperator || again.Provider != "sso:okta" {
		t.Fatalf("role must follow the IdP on each sign-in: %+v", again)
	}
}
