package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"sync"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// OIDCProvider runs the authorization-code flow with PKCE, state, and nonce
// against one OpenID Connect IdP (Google, Entra ID, Okta, Auth0, Keycloak…).
type OIDCProvider struct {
	cfg      ProviderConfig
	policy   policy
	mu       sync.Mutex
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
	oauth    *oauth2.Config
}

func newOIDCProvider(cfg ProviderConfig) *OIDCProvider {
	if cfg.GroupsAttribute == "" {
		cfg.GroupsAttribute = "groups"
	}
	return &OIDCProvider{cfg: cfg, policy: policy{cfg: cfg}}
}

func (p *OIDCProvider) Config() ProviderConfig { return p.cfg }

// init discovers the provider lazily, so an IdP outage at boot does not stop
// the server; the break-glass admin can still sign in.
func (p *OIDCProvider) init(ctx context.Context) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.provider != nil {
		return nil
	}
	prov, err := oidc.NewProvider(ctx, p.cfg.Issuer)
	if err != nil {
		return fmt.Errorf("%s is unreachable: %w", p.cfg.Label, err)
	}
	p.provider = prov
	p.verifier = prov.Verifier(&oidc.Config{ClientID: p.cfg.ClientID})
	p.oauth = &oauth2.Config{
		ClientID:     p.cfg.ClientID,
		ClientSecret: p.cfg.ClientSecret,
		RedirectURL:  p.cfg.RedirectURL,
		Endpoint:     prov.Endpoint(),
		Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
	}
	return nil
}

// LoginState is kept in a signed, short-lived cookie between start and callback.
type LoginState struct {
	Provider string `json:"p"`
	State    string `json:"s"`
	Nonce    string `json:"n"`
	Verifier string `json:"v"`
}

func randomToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// Start returns the IdP URL to redirect to and the state to store.
func (p *OIDCProvider) Start(ctx context.Context) (string, LoginState, error) {
	if err := p.init(ctx); err != nil {
		return "", LoginState{}, err
	}
	st := LoginState{Provider: p.cfg.ID, State: randomToken(), Nonce: randomToken(), Verifier: oauth2.GenerateVerifier()}
	url := p.oauth.AuthCodeURL(st.State, oidc.Nonce(st.Nonce), oauth2.S256ChallengeOption(st.Verifier))
	return url, st, nil
}

// Callback validates the redirect back from the IdP. It returns the identity
// and the raw ID token, which the caller keeps for the id_token_hint of a
// later sign-out.
func (p *OIDCProvider) Callback(ctx context.Context, st LoginState, gotState, code, idpError string) (Identity, string, error) {
	id := Identity{ProviderID: p.cfg.ID}
	if idpError != "" {
		return id, "", &DeniedError{Reason: p.cfg.Label + " returned " + idpError}
	}
	if st.Provider != p.cfg.ID {
		return id, "", &DeniedError{Reason: "sign-in was started with a different provider"}
	}
	if st.State == "" || subtle.ConstantTimeCompare([]byte(st.State), []byte(gotState)) != 1 {
		return id, "", &DeniedError{Reason: "login state did not match; start sign-in again"}
	}
	if code == "" {
		return id, "", &DeniedError{Reason: "no authorization code"}
	}
	if err := p.init(ctx); err != nil {
		return id, "", err
	}
	tok, err := p.oauth.Exchange(ctx, code, oauth2.VerifierOption(st.Verifier))
	if err != nil {
		return id, "", &DeniedError{Reason: "code exchange failed: " + err.Error()}
	}
	rawID, _ := tok.Extra("id_token").(string)
	if rawID == "" {
		return id, "", &DeniedError{Reason: p.cfg.Label + " did not return an ID token"}
	}
	idt, err := p.verifier.Verify(ctx, rawID)
	if err != nil {
		return id, "", &DeniedError{Reason: "ID token rejected: " + err.Error()}
	}
	if subtle.ConstantTimeCompare([]byte(idt.Nonce), []byte(st.Nonce)) != 1 {
		return id, "", &DeniedError{Reason: "ID token nonce did not match"}
	}
	var raw map[string]any
	if err := idt.Claims(&raw); err != nil {
		return id, "", err
	}
	id.Issuer, id.Subject = idt.Issuer, idt.Subject
	id.Email = firstNonEmpty(stringClaim(raw, p.cfg.EmailAttribute), stringClaim(raw, "email"), stringClaim(raw, "preferred_username"), stringClaim(raw, "upn"))
	id.Name = firstNonEmpty(stringClaim(raw, p.cfg.NameAttribute), stringClaim(raw, "name"))
	id.Groups = groupsClaim(raw, p.cfg.GroupsAttribute)
	verified, _ := raw["email_verified"].(bool)
	if err := p.policy.decide(&id, verified); err != nil {
		return id, "", err
	}
	return id, rawID, nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func stringClaim(raw map[string]any, key string) string {
	if key == "" {
		return ""
	}
	v, _ := raw[key].(string)
	return v
}

// groupsClaim accepts a JSON array or a single string, as IdPs differ.
func groupsClaim(raw map[string]any, key string) []string {
	switch v := raw[key].(type) {
	case []any:
		out := make([]string, 0, len(v))
		for _, g := range v {
			if s, ok := g.(string); ok {
				out = append(out, s)
			}
		}
		return out
	case string:
		return strings.Split(v, ",")
	default:
		return nil
	}
}

// EndSessionURL is the IdP's RP-initiated logout endpoint from its discovery
// document, when it advertises one (OIDC Session Management). An empty URL
// means the IdP did not publish end_session_endpoint.
func (p *OIDCProvider) EndSessionURL(ctx context.Context) (string, error) {
	if err := p.init(ctx); err != nil {
		return "", err
	}
	var doc struct {
		EndSessionEndpoint string `json:"end_session_endpoint"`
	}
	if err := p.provider.Claims(&doc); err != nil {
		return "", err
	}
	return doc.EndSessionEndpoint, nil
}

// LogoutURL builds the IdP logout redirect: end_session_endpoint with the
// session's ID token as the hint and PUBLIC_URL as the landing page.
func (p *OIDCProvider) LogoutURL(ctx context.Context, idTokenHint, postLogoutRedirect string) (string, error) {
	endpoint, err := p.EndSessionURL(ctx)
	if err != nil || endpoint == "" {
		return "", err
	}
	q := url.Values{}
	if idTokenHint != "" {
		q.Set("id_token_hint", idTokenHint)
	}
	if postLogoutRedirect != "" {
		q.Set("post_logout_redirect_uri", postLogoutRedirect)
	}
	return endpoint + "?" + q.Encode(), nil
}

// EncodeState and DecodeState move LoginState through the signed cookie.
func (svc *Service) EncodeState(st LoginState) string {
	b, _ := json.Marshal(st)
	return svc.SignValue(string(b))
}

func (svc *Service) DecodeState(v string) (LoginState, error) {
	raw, ok := svc.VerifyValue(v)
	if !ok {
		return LoginState{}, errors.New("login state cookie is invalid")
	}
	var st LoginState
	if err := json.Unmarshal([]byte(raw), &st); err != nil {
		return LoginState{}, err
	}
	return st, nil
}
