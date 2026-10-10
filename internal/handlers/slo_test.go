package handlers

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"cloudterm-go/internal/audit"
	"cloudterm-go/internal/auth"
	"cloudterm-go/internal/config"
)

// idpMetadataWithSLO is IdP metadata advertising a redirect-binding SLO endpoint.
const idpMetadataWithSLO = `<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example/metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example/slo"/>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example/sso"/>
  </IDPSSODescriptor>
</EntityDescriptor>`

func logoutFixture(t *testing.T) (*Handler, *auth.Service) {
	t.Helper()
	dir := t.TempDir()
	svc, err := auth.Open(filepath.Join(dir, "users.json"), []byte("0123456789abcdef0123456789abcdef"), auth.Options{})
	if err != nil {
		t.Fatal(err)
	}
	idps, err := auth.NewRegistry([]auth.ProviderConfig{{
		ID: "okta", Type: "saml", Label: "Okta",
		MetadataXML:    idpMetadataWithSLO,
		OperatorGroups: []string{"cloudterm-operators"},
	}}, auth.RegistryOptions{PublicURL: "https://desk.example", DataDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	h := &Handler{
		cfg:   &config.Config{RequireAuth: true, DataDir: dir, PublicURL: "https://desk.example"},
		authn: svc,
		idps:  idps,
		audit: audit.NewLogger(filepath.Join(dir, "audit.log")),
	}
	return h, svc
}

// TestSignOutContinuesToIDP: the browser sign-out ends the local session and,
// for a person who came in over SAML, continues to the IdP's logout endpoint.
// A second attempt with the same cookie must not produce another logout
// request — the session is gone.
func TestSignOutContinuesToIDP(t *testing.T) {
	h, svc := logoutFixture(t)

	priya, err := svc.UpsertSSOUser("okta", "https://idp.example/metadata", "priya@sycamore.example", "priya@sycamore.example", "Priya", auth.RoleOperator, "")
	if err != nil {
		t.Fatal(err)
	}
	tok, _, err := svc.Issue(priya, auth.MethodSSO)
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "https://desk.example/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookie, Value: tok})
	rec := httptest.NewRecorder()
	h.handleLogoutRedirect(rec, req)

	loc := rec.Header().Get("Location")
	if rec.Code != http.StatusFound || !strings.HasPrefix(loc, "https://idp.example/slo?SAMLRequest=") {
		t.Fatalf("sign-out must continue to the IdP logout, got %d %q", rec.Code, loc)
	}

	// The local session is gone even before the IdP round-trip completes.
	if _, err := svc.Parse(tok); err == nil {
		t.Fatal("the session must be revoked by sign-out")
	}

	// A replay of the same cookie lands on the sign-in page, nothing else.
	req2 := httptest.NewRequest(http.MethodGet, "https://desk.example/api/auth/logout", nil)
	req2.AddCookie(&http.Cookie{Name: sessionCookie, Value: tok})
	rec2 := httptest.NewRecorder()
	h.handleLogoutRedirect(rec2, req2)
	if loc := rec2.Header().Get("Location"); loc != "/" {
		t.Fatalf("a signed-out cookie must not start another IdP logout, got %q", loc)
	}
}

// TestSignOutLocalUserJustRedirects: password and break-glass sessions have no
// IdP to notify; sign-out lands on the sign-in page.
func TestSignOutLocalUserJustRedirects(t *testing.T) {
	h, svc := logoutFixture(t)
	t.Setenv("CLOUDTERM_ADMIN_PASSWORD", "correct-horse-battery")
	// A local user with a password.
	if err := svc.AddUser(auth.User{ID: "op@x", Email: "op@x", Role: auth.RoleOperator}, "pw-123456"); err != nil {
		t.Fatal(err)
	}
	u, err := svc.Login("op@x", "pw-123456", "test-ip")
	if err != nil {
		t.Fatal(err)
	}
	tok, _, err := svc.Issue(u, auth.MethodPassword)
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "https://desk.example/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookie, Value: tok})
	rec := httptest.NewRecorder()
	h.handleLogoutRedirect(rec, req)
	if rec.Code != http.StatusFound || rec.Header().Get("Location") != "/" {
		t.Fatalf("local sign-out must land on /, got %d %q", rec.Code, rec.Header().Get("Location"))
	}
}
