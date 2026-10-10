package auth

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

// fakeIdP is a minimal OIDC provider that signs real RS256 ID tokens.
type fakeIdP struct {
	srv       *httptest.Server
	key       *rsa.PrivateKey
	claims    map[string]any
	gotVerify string // PKCE verifier sent to /token
	challenge string // PKCE challenge sent to /authorize
}

func newFakeIdP(t *testing.T) *fakeIdP {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	f := &fakeIdP{key: key}
	mux := http.NewServeMux()
	f.srv = httptest.NewServer(mux)
	t.Cleanup(f.srv.Close)
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer":                                f.srv.URL,
			"authorization_endpoint":                f.srv.URL + "/authorize",
			"token_endpoint":                        f.srv.URL + "/token",
			"jwks_uri":                              f.srv.URL + "/keys",
			"end_session_endpoint":                  f.srv.URL + "/logout",
			"id_token_signing_alg_values_supported": []string{"RS256"},
		})
	})
	mux.HandleFunc("/keys", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kty": "RSA", "alg": "RS256", "use": "sig", "kid": "k1",
			"n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
		}}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		f.gotVerify = r.Form.Get("code_verifier")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": "at", "token_type": "Bearer", "expires_in": 300,
			"id_token": f.sign(t, f.claims),
		})
	})
	return f
}

func (f *fakeIdP) sign(t *testing.T, claims map[string]any) string {
	t.Helper()
	header, _ := json.Marshal(map[string]string{"alg": "RS256", "kid": "k1", "typ": "JWT"})
	payload, _ := json.Marshal(claims)
	signing := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(payload)
	sum := sha256.Sum256([]byte(signing))
	sig, err := rsa.SignPKCS1v15(rand.Reader, f.key, crypto.SHA256, sum[:])
	if err != nil {
		t.Fatal(err)
	}
	return signing + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func baseClaims(issuer, nonce string) map[string]any {
	now := time.Now()
	return map[string]any{
		"iss": issuer, "aud": "cloudterm", "sub": "user-123",
		"iat": now.Unix(), "exp": now.Add(5 * time.Minute).Unix(),
		"nonce": nonce, "email": "Priya@Sycamore.example", "email_verified": true,
		"name": "Priya", "groups": []string{"cloudterm-operators"},
	}
}

func newTestSSO(issuer string) *OIDCProvider {
	return newOIDCProvider(ProviderConfig{
		ID: "okta", Type: "oidc", Label: "Okta",
		Issuer: issuer, ClientID: "cloudterm", ClientSecret: "s3cret",
		RedirectURL:    "https://cloudterm.example/api/auth/sso/okta/callback",
		AllowedDomains: []string{"sycamore.example"},
		AdminGroups:    []string{"cloudterm-admins"},
		OperatorGroups: []string{"cloudterm-operators"},
		ViewerGroups:   []string{"cloudterm-auditors"},
	})
}

func startFlow(t *testing.T, s *OIDCProvider) LoginState {
	t.Helper()
	target, st, err := s.Start(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(target)
	q := u.Query()
	if q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" {
		t.Fatalf("PKCE missing from authorize URL: %s", target)
	}
	if q.Get("nonce") != st.Nonce || q.Get("state") != st.State {
		t.Fatalf("state and nonce must be in the authorize URL")
	}
	return st
}

func TestSSOHappyPathMapsGroupsAndUsesPKCE(t *testing.T) {
	idp := newFakeIdP(t)
	s := newTestSSO(idp.srv.URL)
	st := startFlow(t, s)
	idp.claims = baseClaims(idp.srv.URL, st.Nonce)

	id, _, err := s.Callback(context.Background(), st, st.State, "code-1", "")
	if err != nil {
		t.Fatal(err)
	}
	if id.Role != RoleOperator || id.Email != "priya@sycamore.example" || id.Subject != "user-123" {
		t.Fatalf("identity %+v", id)
	}
	if idp.gotVerify != st.Verifier {
		t.Fatal("token request must carry the PKCE verifier")
	}

	idp.claims["groups"] = []string{"cloudterm-operators", "cloudterm-admins"}
	st = startFlow(t, s)
	idp.claims["nonce"] = st.Nonce
	id, _, err = s.Callback(context.Background(), st, st.State, "code-2", "")
	if err != nil || id.Role != RoleAdmin {
		t.Fatalf("admin group must win: %+v %v", id, err)
	}
}

func TestSSORefusals(t *testing.T) {
	idp := newFakeIdP(t)
	s := newTestSSO(idp.srv.URL)

	cases := []struct {
		name   string
		mutate func(c map[string]any, st *LoginState) (gotState string)
		want   string
	}{
		{"state mismatch", func(c map[string]any, st *LoginState) string { return "attacker" }, "state did not match"},
		{"state from another provider", func(c map[string]any, st *LoginState) string { st.Provider = "google"; return st.State }, "different provider"},
		{"nonce replay", func(c map[string]any, st *LoginState) string { c["nonce"] = "old-nonce"; return st.State }, "nonce"},
		{"wrong audience", func(c map[string]any, st *LoginState) string { c["aud"] = "other-app"; return st.State }, "ID token rejected"},
		{"expired token", func(c map[string]any, st *LoginState) string {
			c["exp"] = time.Now().Add(-time.Minute).Unix()
			return st.State
		}, "ID token rejected"},
		{"unverified email", func(c map[string]any, st *LoginState) string { c["email_verified"] = false; return st.State }, "not verified"},
		{"foreign domain", func(c map[string]any, st *LoginState) string { c["email"] = "eve@gmail.com"; return st.State }, "not allowed"},
		{"no CloudTerm group", func(c map[string]any, st *LoginState) string { c["groups"] = []string{"everyone"}; return st.State }, "not a member"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			st := startFlow(t, s)
			idp.claims = baseClaims(idp.srv.URL, st.Nonce)
			got := tc.mutate(idp.claims, &st)
			_, _, err := s.Callback(context.Background(), st, got, "code", "")
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("want refusal containing %q, got %v", tc.want, err)
			}
		})
	}

	t.Run("forged signature", func(t *testing.T) {
		st := startFlow(t, s)
		idp.claims = baseClaims(idp.srv.URL, st.Nonce)
		other, _ := rsa.GenerateKey(rand.Reader, 2048)
		real := idp.key
		idp.key = other
		defer func() { idp.key = real }()
		if _, _, err := s.Callback(context.Background(), st, st.State, "code", ""); err == nil || !strings.Contains(err.Error(), "ID token rejected") {
			t.Fatalf("token signed by another key must be rejected, got %v", err)
		}
	})
}

func TestLoginStateCookieIsTamperProof(t *testing.T) {
	svc := newService(testSecret, Options{})
	v := svc.EncodeState(LoginState{Provider: "okta", State: "s", Nonce: "n", Verifier: "v"})
	if st, err := svc.DecodeState(v); err != nil || st.Nonce != "n" {
		t.Fatalf("round trip: %+v %v", st, err)
	}
	if _, err := svc.DecodeState(v + "x"); err == nil {
		t.Fatal("tampered state cookie accepted")
	}
}

func TestOIDCSignOutRedirectsToIDPEndSession(t *testing.T) {
	idp := newFakeIdP(t)
	p := newTestSSO(idp.srv.URL)
	ctx := context.Background()

	target, err := p.LogoutURL(ctx, "the-id-token", "https://desk.example/")
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(target)
	if err != nil {
		t.Fatal(err)
	}
	if u.Path != "/logout" {
		t.Fatalf("must target the IdP's end_session_endpoint, got %q", target)
	}
	if u.Query().Get("id_token_hint") != "the-id-token" {
		t.Error("the session's ID token must ride along as id_token_hint")
	}
	if u.Query().Get("post_logout_redirect_uri") != "https://desk.example/" {
		t.Error("the landing page must be the post_logout_redirect_uri")
	}

	// Without a hint the redirect still works; without an endpoint it does not.
	target, err = p.LogoutURL(ctx, "", "https://desk.example/")
	if err != nil || !strings.Contains(target, "/logout") {
		t.Fatalf("logout without a hint: %q %v", target, err)
	}
}
