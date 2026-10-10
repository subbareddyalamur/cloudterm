package handlers

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"cloudterm-go/internal/audit"
	"cloudterm-go/internal/auth"
	"cloudterm-go/internal/config"
)

func gateFixture(t *testing.T) (*Handler, http.Handler, map[auth.Role]string, string) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("CLOUDTERM_ADMIN_PASSWORD", "correct-horse-battery")
	svc, err := auth.Open(filepath.Join(dir, "users.json"), []byte("0123456789abcdef0123456789abcdef"), auth.Options{})
	if err != nil {
		t.Fatal(err)
	}
	_ = svc.AddUser(auth.User{ID: "op", Email: "op@x", Role: auth.RoleOperator}, "op-password-1")
	_ = svc.AddUser(auth.User{ID: "view", Email: "view@x", Role: auth.RoleViewer}, "view-password-1")
	logPath := filepath.Join(dir, "audit.log")
	h := &Handler{
		cfg:   &config.Config{RequireAuth: true, DataDir: dir},
		authn: svc,
		audit: audit.NewLogger(logPath),
	}
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	tokens := map[auth.Role]string{}
	for role, creds := range map[auth.Role][2]string{
		auth.RoleAdmin:    {"admin@local", "correct-horse-battery"},
		auth.RoleOperator: {"op@x", "op-password-1"},
		auth.RoleViewer:   {"view@x", "view-password-1"},
	} {
		u, err := svc.Login(creds[0], creds[1], "ip")
		if err != nil {
			t.Fatal(err)
		}
		tok, _, _ := svc.Issue(u, auth.MethodPassword)
		tokens[role] = tok
	}
	return h, h.wrap(ok), tokens, logPath
}

func call(t *testing.T, srv http.Handler, method, path, token, origin string) int {
	t.Helper()
	req := httptest.NewRequest(method, "http://desk.example"+path, strings.NewReader("{}"))
	if token != "" {
		req.AddCookie(&http.Cookie{Name: sessionCookie, Value: token})
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	return rec.Code
}

func TestGateDeniesByDefault(t *testing.T) {
	_, srv, tok, logPath := gateFixture(t)

	for _, p := range []string{"/upload-file", "/start-guacamole-rdp", "/start-port-forward", "/aws-accounts", "/vault/credentials"} {
		if got := call(t, srv, http.MethodPost, p, "", ""); got != http.StatusUnauthorized {
			t.Errorf("anonymous POST %s = %d, want 401", p, got)
		}
	}
	for _, p := range []string{"/instances", "/recordings", "/audit-log", "/ws", "/preferences"} {
		if got := call(t, srv, http.MethodGet, p, "", ""); got != http.StatusUnauthorized {
			t.Errorf("anonymous GET %s = %d, want 401", p, got)
		}
	}
	for _, p := range []string{"/", "/assets/app.js", "/health", "/api/auth/config"} {
		if got := call(t, srv, http.MethodGet, p, "", ""); got == http.StatusUnauthorized {
			t.Errorf("sign-in page asset %s must stay public", p)
		}
	}

	if got := call(t, srv, http.MethodPost, "/upload-file", tok[auth.RoleOperator], "https://evil.example"); got != http.StatusForbidden {
		t.Errorf("cross-site POST = %d, want 403", got)
	}
	if got := call(t, srv, http.MethodPost, "/api/auth/saml/okta/acs", "", "https://okta.example"); got == http.StatusForbidden || got == http.StatusUnauthorized {
		t.Errorf("IdP POST to the SAML ACS must reach the handler, got %d", got)
	}
	if got := call(t, srv, http.MethodPost, "/api/auth/login", "", "https://evil.example"); got != http.StatusForbidden {
		t.Errorf("cross-site password login = %d, want 403", got)
	}
	if got := call(t, srv, http.MethodPost, "/upload-file", tok[auth.RoleOperator], "http://desk.example"); got != http.StatusNoContent {
		t.Errorf("same-site operator POST = %d, want 204", got)
	}
	if got := call(t, srv, http.MethodPost, "/upload-file", tok[auth.RoleViewer], ""); got != http.StatusForbidden {
		t.Errorf("viewer POST = %d, want 403", got)
	}
	if got := call(t, srv, http.MethodGet, "/instances", tok[auth.RoleViewer], ""); got != http.StatusNoContent {
		t.Errorf("viewer GET = %d, want 204", got)
	}
	if got := call(t, srv, http.MethodPost, "/aws-accounts", tok[auth.RoleOperator], ""); got != http.StatusForbidden {
		t.Errorf("operator adding an AWS account = %d, want 403", got)
	}
	if got := call(t, srv, http.MethodPost, "/aws-accounts", tok[auth.RoleAdmin], ""); got != http.StatusNoContent {
		t.Errorf("admin adding an AWS account = %d, want 204", got)
	}

	raw, _ := os.ReadFile(logPath)
	log := string(raw)
	for _, want := range []string{`"action":"request"`, `"user_email":"op@x"`, `"action":"access_denied"`, `"user_email":"view@x"`} {
		if !strings.Contains(log, want) {
			t.Errorf("audit log missing %s", want)
		}
	}
}
