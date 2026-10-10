package handlers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"cloudterm-go/internal/audit"
	"cloudterm-go/internal/auth"
	"cloudterm-go/internal/license"
	"cloudterm-go/internal/tenant"
)

const (
	sessionCookie = "ct_session"
	stateCookie   = "ct_oidc"
	samlCookie    = "ct_saml"
)

type claimsKey struct{}

func (h *Handler) SetIdentity(s *auth.Service, idps *auth.Registry) {
	h.authn = s
	h.idps = idps
}

func (h *Handler) SetLicense(c *license.Client) { h.lic = c }

func (h *Handler) denyCapability(w http.ResponseWriter, feature string) bool {
	if h.lic != nil && !h.lic.Allow(feature) {
		jsonError(w, "subscription does not allow "+feature, http.StatusPaymentRequired)
		return true
	}
	return false
}

func (h *Handler) mountEnterprise(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/auth/config", h.handleAuthConfig)
	mux.HandleFunc("POST /api/auth/login", h.handleLogin)
	mux.HandleFunc("GET /api/auth/sso/{id}/start", h.handleSSOStart)
	mux.HandleFunc("GET /api/auth/sso/{id}/callback", h.handleOIDCCallback)
	mux.HandleFunc("GET /api/auth/sso/start", h.handleSSOStart)
	mux.HandleFunc("GET /api/auth/sso/callback", h.handleOIDCCallback)
	mux.HandleFunc("GET /api/auth/saml/{id}/metadata", h.handleSAMLMetadata)
	mux.HandleFunc("POST /api/auth/saml/{id}/acs", h.handleSAMLACS)
	mux.HandleFunc("GET /api/auth/providers", h.handleProvidersAdmin)
	mux.HandleFunc("GET /api/auth/me", h.handleMe)
	mux.HandleFunc("POST /api/auth/logout", h.handleLogout)
	mux.HandleFunc("GET /api/license", h.handleLicense)
	mux.HandleFunc("POST /api/license/redeem", h.handleLicenseRedeem)
	mux.HandleFunc("GET /api/aws/onboarding", h.handleOnboarding)
	mux.HandleFunc("POST /aws-accounts/verify/", h.handleVerifyAWSAccount)
	mux.HandleFunc("GET /api/audit/export", h.handleAuditExport)
}

// ---------------------------------------------------------------------------
// Request identity
// ---------------------------------------------------------------------------

func clientIP(r *http.Request) string {
	if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
		first, _, _ := strings.Cut(xf, ",")
		return strings.TrimSpace(first)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func isHTTPS(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func sessionToken(r *http.Request) string {
	if c, err := r.Cookie(sessionCookie); err == nil && c.Value != "" {
		return c.Value
	}
	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}

// claims returns the signed-in person for this request, if any.
func (h *Handler) claims(r *http.Request) (auth.Claims, error) {
	if c, ok := r.Context().Value(claimsKey{}).(auth.Claims); ok {
		return c, nil
	}
	if h.authn == nil {
		return auth.Claims{}, errors.New("auth is not configured")
	}
	tok := sessionToken(r)
	if tok == "" {
		return auth.Claims{}, errors.New("not signed in")
	}
	return h.authn.Parse(tok)
}

// actorName is the STS session name and audit identity for a request.
func (h *Handler) actorName(r *http.Request) string {
	if c, err := h.claims(r); err == nil && c.UserID != "" {
		return c.Email
	}
	return "cloudterm"
}

// auditAuth records a sign-in event with who, from where, and why.
func (h *Handler) auditAuth(r *http.Request, action, outcome, email, uid string, role auth.Role, details string) {
	if h.audit == nil {
		return
	}
	h.audit.Log(audit.AuditEvent{
		Action:    action,
		Outcome:   outcome,
		UserID:    uid,
		UserEmail: email,
		Role:      string(role),
		TenantID:  tenant.ID(r),
		IP:        clientIP(r),
		UserAgent: r.UserAgent(),
		Details:   details,
	})
}

func (h *Handler) setSession(w http.ResponseWriter, r *http.Request, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		MaxAge:   int(h.authn.MaxAge().Seconds()),
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func clearCookie(w http.ResponseWriter, r *http.Request, name string) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: isHTTPS(r), SameSite: http.SameSiteLaxMode})
}

// localLoginPolicy is "all", "admin" (break-glass only), or "off".
// With SSO configured the default is "admin".
func (h *Handler) localLoginPolicy() string {
	if p := h.cfg.LocalLogin; p != "" {
		return p
	}
	if h.idps.Enabled() {
		return "admin"
	}
	return "all"
}

// ---------------------------------------------------------------------------
// Sign-in endpoints
// ---------------------------------------------------------------------------

func (h *Handler) handleAuthConfig(w http.ResponseWriter, r *http.Request) {
	providers := h.idps.Providers()
	if providers == nil {
		providers = []auth.ProviderInfo{}
	}
	jsonResponse(w, map[string]any{
		"required":        h.cfg.RequireAuth,
		"local":           h.localLoginPolicy(),
		"sso":             map[string]any{"enabled": len(providers) > 0, "providers": providers},
		"session_hours":   h.cfg.SessionMaxHours,
		"idle_minutes":    h.cfg.SessionIdleMinutes,
		"aws_access_mode": h.cfg.AWSAccessMode,
	})
}

func (h *Handler) handleLogin(w http.ResponseWriter, r *http.Request) {
	if h.authn == nil {
		jsonError(w, "auth is not configured", http.StatusServiceUnavailable)
		return
	}
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	policy := h.localLoginPolicy()
	if policy == "off" {
		h.auditAuth(r, "login_password", "denied", body.Email, "", "", "local sign-in is disabled")
		jsonError(w, "Sign in with single sign-on.", http.StatusForbidden)
		return
	}
	user, err := h.authn.Login(body.Email, body.Password, clientIP(r))
	if err != nil {
		reason := err.Error()
		h.auditAuth(r, "login_password", "denied", body.Email, "", "", reason)
		status := http.StatusUnauthorized
		msg := "That email and password were not accepted."
		if errors.Is(err, auth.ErrLocked) {
			status, msg = http.StatusTooManyRequests, "Too many failed attempts. Try again in 15 minutes."
		}
		jsonError(w, msg, status)
		return
	}
	method := auth.MethodPassword
	if policy == "admin" {
		if user.Role != auth.RoleAdmin {
			h.auditAuth(r, "login_password", "denied", user.Email, user.ID, user.Role, "only the break-glass admin may use a password while SSO is on")
			jsonError(w, "Sign in with single sign-on.", http.StatusForbidden)
			return
		}
		method = auth.MethodBreakGlass
	}
	tok, c, err := h.authn.Issue(user, method)
	if err != nil {
		jsonError(w, "could not start session", http.StatusInternalServerError)
		return
	}
	h.setSession(w, r, tok)
	action := "login_password"
	if method == auth.MethodBreakGlass {
		action = "login_break_glass"
	}
	h.auditAuth(r, action, "success", user.Email, user.ID, user.Role, "session "+c.SessionID[:8])
	jsonResponse(w, map[string]any{"user": user, "method": method, "expires_at": c.Exp})
}

// providerID reads {id} from the route; the legacy single-OIDC routes mean "oidc".
func providerID(r *http.Request) string {
	if id := r.PathValue("id"); id != "" {
		return id
	}
	return "oidc"
}

func (h *Handler) ssoFail(w http.ResponseWriter, r *http.Request, provider, reason, email string) {
	h.auditAuth(r, "login_sso", "denied", email, "", "", "provider="+provider+" "+reason)
	http.Redirect(w, r, "/?auth_error="+url.QueryEscape(reason), http.StatusFound)
}

// finishSSO turns a verified identity into a CloudTerm session.
func (h *Handler) finishSSO(w http.ResponseWriter, r *http.Request, id auth.Identity, protocol string) {
	user, err := h.authn.UpsertSSOUser(id.ProviderID, id.Issuer, id.Subject, id.Email, id.Name, id.Role, tenant.ID(r))
	if err != nil {
		h.ssoFail(w, r, id.ProviderID, "CloudTerm could not record this user: "+err.Error(), id.Email)
		return
	}
	tok, claims, err := h.authn.Issue(user, auth.MethodSSO)
	if err != nil {
		h.ssoFail(w, r, id.ProviderID, "could not start session", id.Email)
		return
	}
	h.setSession(w, r, tok)
	h.auditAuth(r, "login_sso", "success", user.Email, user.ID, user.Role,
		"provider="+id.ProviderID+" protocol="+protocol+" groups="+strings.Join(id.Groups, ",")+" session "+claims.SessionID[:8])
	http.Redirect(w, r, "/", http.StatusFound)
}

func (h *Handler) handleSSOStart(w http.ResponseWriter, r *http.Request) {
	id := providerID(r)
	if h.authn == nil {
		http.NotFound(w, r)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if p, ok := h.idps.OIDC(id); ok {
		target, st, err := p.Start(ctx)
		if err != nil {
			h.auditAuth(r, "login_sso", "error", "", "", "", "provider="+id+" "+err.Error())
			http.Redirect(w, r, "/?auth_error="+url.QueryEscape(p.Config().Label+" is unreachable. An admin can use the break-glass account."), http.StatusFound)
			return
		}
		http.SetCookie(w, &http.Cookie{
			Name: stateCookie, Value: h.authn.EncodeState(st), Path: "/api/auth/sso",
			MaxAge: 600, HttpOnly: true, Secure: isHTTPS(r), SameSite: http.SameSiteLaxMode,
		})
		http.Redirect(w, r, target, http.StatusFound)
		return
	}
	if p, ok := h.idps.SAML(id); ok {
		start, reqID, err := p.Start(ctx)
		if err != nil {
			h.auditAuth(r, "login_sso", "error", "", "", "", "provider="+id+" "+err.Error())
			http.Redirect(w, r, "/?auth_error="+url.QueryEscape(p.Config().Label+" is unreachable. An admin can use the break-glass account."), http.StatusFound)
			return
		}
		if isHTTPS(r) {
			// The IdP posts back cross-site, so this cookie must be SameSite=None.
			http.SetCookie(w, &http.Cookie{
				Name: samlCookie, Value: h.authn.SignValue(id + "|" + reqID), Path: "/api/auth/saml",
				MaxAge: 600, HttpOnly: true, Secure: true, SameSite: http.SameSiteNoneMode,
			})
		}
		start.Write(w, r)
		return
	}
	http.Redirect(w, r, "/?auth_error="+url.QueryEscape("That sign-in provider is not configured."), http.StatusFound)
}

func (h *Handler) handleOIDCCallback(w http.ResponseWriter, r *http.Request) {
	id := providerID(r)
	p, ok := h.idps.OIDC(id)
	if h.authn == nil || !ok {
		http.NotFound(w, r)
		return
	}
	c, err := r.Cookie(stateCookie)
	clearCookie(w, r, stateCookie)
	if err != nil {
		h.ssoFail(w, r, id, "Sign-in took too long or started in another browser. Try again.", "")
		return
	}
	st, err := h.authn.DecodeState(c.Value)
	if err != nil {
		h.ssoFail(w, r, id, "Sign-in state was tampered with or expired.", "")
		return
	}
	q := r.URL.Query()
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	ident, err := p.Callback(ctx, st, q.Get("state"), q.Get("code"), q.Get("error"))
	if err != nil {
		h.ssoFail(w, r, id, err.Error(), ident.Email)
		return
	}
	h.finishSSO(w, r, ident, "oidc")
}

func (h *Handler) handleSAMLMetadata(w http.ResponseWriter, r *http.Request) {
	p, ok := h.idps.SAML(r.PathValue("id"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	b, err := p.Metadata()
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/samlmetadata+xml")
	_, _ = w.Write(b)
}

func (h *Handler) handleSAMLACS(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, ok := h.idps.SAML(id)
	if h.authn == nil || !ok {
		http.NotFound(w, r)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	ident, reqID, err := p.ACS(ctx, r)
	if err != nil {
		h.ssoFail(w, r, id, err.Error(), ident.Email)
		return
	}
	if isHTTPS(r) {
		c, cerr := r.Cookie(samlCookie)
		clearCookie(w, r, samlCookie)
		v, valid := "", false
		if cerr == nil {
			v, valid = h.authn.VerifyValue(c.Value)
		}
		if !valid || v != id+"|"+reqID {
			h.ssoFail(w, r, id, "This sign-in was started in a different browser. Start again from CloudTerm.", ident.Email)
			return
		}
	}
	h.finishSSO(w, r, ident, "saml")
}

// handleProvidersAdmin shows what each IdP needs configured on its side.
func (h *Handler) handleProvidersAdmin(w http.ResponseWriter, r *http.Request) {
	c, err := h.claims(r)
	if err != nil || c.Role != auth.RoleAdmin {
		jsonError(w, "admin role required", http.StatusForbidden)
		return
	}
	type row struct {
		auth.ProviderInfo
		RedirectURL string       `json:"redirect_url,omitempty"`
		SP          *auth.SPInfo `json:"saml,omitempty"`
		Admin       []string     `json:"admin_groups,omitempty"`
		Operator    []string     `json:"operator_groups,omitempty"`
		Viewer      []string     `json:"viewer_groups,omitempty"`
		DefaultRole auth.Role    `json:"default_role,omitempty"`
	}
	out := []row{}
	for _, info := range h.idps.Providers() {
		rw := row{ProviderInfo: info}
		if p, ok := h.idps.OIDC(info.ID); ok {
			cfg := p.Config()
			rw.RedirectURL = cfg.RedirectURL
			rw.Admin, rw.Operator, rw.Viewer, rw.DefaultRole = cfg.AdminGroups, cfg.OperatorGroups, cfg.ViewerGroups, cfg.DefaultRole
		}
		if p, ok := h.idps.SAML(info.ID); ok {
			sp := p.SPInfo()
			cfg := p.Config()
			rw.SP = &sp
			rw.Admin, rw.Operator, rw.Viewer, rw.DefaultRole = cfg.AdminGroups, cfg.OperatorGroups, cfg.ViewerGroups, cfg.DefaultRole
		}
		out = append(out, rw)
	}
	jsonResponse(w, map[string]any{"providers": out, "local": h.localLoginPolicy()})
}

func (h *Handler) handleMe(w http.ResponseWriter, r *http.Request) {
	c, err := h.claims(r)
	if err != nil {
		jsonError(w, "not signed in", http.StatusUnauthorized)
		return
	}
	jsonResponse(w, map[string]any{
		"user_id": c.UserID, "email": c.Email, "name": c.Name, "role": c.Role,
		"tenant_id": c.TenantID, "method": c.Method, "expires_at": c.Exp,
	})
}

func (h *Handler) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := h.claims(r); err == nil {
		h.authn.Revoke(c)
		h.auditAuth(r, "logout", "success", c.Email, c.UserID, c.Role, "session "+safePrefix(c.SessionID))
	}
	clearCookie(w, r, sessionCookie)
	jsonResponse(w, map[string]string{"status": "signed out"})
}

func safePrefix(s string) string {
	if len(s) > 8 {
		return s[:8]
	}
	return s
}

// ---------------------------------------------------------------------------
// License and onboarding
// ---------------------------------------------------------------------------

const licenseNotice = "This gate is for honest expiry and renewals. A self-hosted binary can be patched. It is not DRM."

func (h *Handler) handleLicense(w http.ResponseWriter, r *http.Request) {
	controller := h.cfg != nil && h.cfg.LicenseControllerURL != ""
	ent, ok := Entitlement{}, false
	if h.lic != nil {
		ent, ok = h.lic.Current()
	}
	if !ok {
		jsonResponse(w, map[string]any{
			"plan": "unconfigured", "status": "active", "days_remaining": 0,
			"controller": controller, "deployment_id": h.cfg.DeploymentID, "notice": licenseNotice,
		})
		return
	}
	jsonResponse(w, map[string]any{
		"plan": ent.Plan, "status": ent.Status, "days_remaining": ent.DaysRemaining,
		"features": ent.Features, "grace_until": ent.GraceUntil, "expires_at": ent.ExpiresAt,
		"controller": controller, "deployment_id": h.cfg.DeploymentID,
		"signed": h.lic.HasPublicKey(), "notice": licenseNotice,
	})
}

// Entitlement is re-exported for handleLicense's zero value.
type Entitlement = license.Entitlement

func (h *Handler) handleLicenseRedeem(w http.ResponseWriter, r *http.Request) {
	if h.cfg == nil || h.cfg.LicenseControllerURL == "" {
		jsonError(w, "license controller is not configured", http.StatusServiceUnavailable)
		return
	}
	var in struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in); err != nil || in.Code == "" {
		jsonError(w, "coupon code required", http.StatusBadRequest)
		return
	}
	payload, _ := json.Marshal(map[string]string{"license_key": h.cfg.LicenseKey, "code": in.Code})
	resp, err := http.Post(h.cfg.LicenseControllerURL+"/v1/redeem", "application/json", bytes.NewReader(payload))
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if c, err := h.claims(r); err == nil {
		outcome := "success"
		if resp.StatusCode >= 300 {
			outcome = "denied"
		}
		h.auditAuth(r, "license_redeem", outcome, c.Email, c.UserID, c.Role, "coupon "+in.Code)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(out)
}

func (h *Handler) handleOnboarding(w http.ResponseWriter, r *http.Request) {
	ext := "cloudterm-local"
	if h.cfg != nil && h.cfg.ExternalID != "" {
		ext = h.cfg.ExternalID
	}
	jsonResponse(w, map[string]any{
		"external_id": ext,
		"role_name":   "CloudTermAccess",
		"template":    "deploy/cloudformation/cloudterm-access.yaml",
		"mode":        h.cfg.AWSAccessMode,
		"access_keys": !h.discovery.HubMode() || h.cfg.AllowAccessKeys,
	})
}

func (h *Handler) handleVerifyAWSAccount(w http.ResponseWriter, r *http.Request) {
	id := filepath.Base(r.URL.Path)
	acct, ok := h.accounts.Get(id)
	if !ok || acct.RoleARN == "" {
		jsonError(w, "role account not found", http.StatusNotFound)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	accountID, arn, err := h.discovery.VerifyRole(ctx, acct.RoleARN, acct.ExternalID)
	if err != nil {
		jsonResponse(w, map[string]any{"ok": false, "error": explainAssumeError(err)})
		return
	}
	jsonResponse(w, map[string]any{"ok": true, "account_id": accountID, "arn": arn})
}

// explainAssumeError turns STS failures into the fix an admin needs.
func explainAssumeError(err error) string {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "AccessDenied"):
		return "AWS refused AssumeRole. Check that the role's trust policy names this CloudTerm server's role and the same ExternalId. " + msg
	case strings.Contains(msg, "no EC2 IMDS role found"), strings.Contains(msg, "failed to refresh cached credentials"), strings.Contains(msg, "hub identity"):
		return "This server has no AWS identity to start from. Run it with an ECS task role or EC2 instance profile, or set CLOUDTERM_HUB_PROFILE for local testing. " + msg
	default:
		return msg
	}
}

// ---------------------------------------------------------------------------
// Audit export
// ---------------------------------------------------------------------------

func (h *Handler) handleAuditExport(w http.ResponseWriter, r *http.Request) {
	events := h.audit.Recent(10000, 0)
	if c, err := h.claims(r); err == nil && c.TenantID != "" {
		filtered := make([]audit.AuditEvent, 0, len(events))
		for _, ev := range events {
			if ev.TenantID == "" || ev.TenantID == c.TenantID {
				filtered = append(filtered, ev)
			}
		}
		events = filtered
	}
	w.Header().Set("Content-Disposition", "attachment; filename=cloudterm-audit.json")
	jsonResponse(w, events)
}

// ---------------------------------------------------------------------------
// Request gate
// ---------------------------------------------------------------------------

// publicPath lists what an anonymous browser may load: the sign-in page and
// its assets. Every other route requires a session when sign-in is required.
func publicPath(method, path string) bool {
	if path == "/health" || strings.HasPrefix(path, "/api/auth/") {
		return true // each auth endpoint checks what it needs
	}
	if method != http.MethodGet && method != http.MethodHead {
		return false
	}
	return path == "/" || path == "/index.html" ||
		strings.HasPrefix(path, "/assets/") || strings.HasPrefix(path, "/guacamole/") ||
		strings.HasPrefix(path, "/static/")
}

// adminOnly lists routes that change who or what CloudTerm can reach.
func adminOnly(method, path string) bool {
	switch {
	case strings.HasPrefix(path, "/aws-accounts") && method != http.MethodGet:
		return true
	case path == "/api/audit/export", path == "/api/license/redeem":
		return true
	case strings.HasPrefix(path, "/db-viewer"):
		return true
	}
	return false
}

// readOnlyAllowed lists the writes a viewer may still make.
func readOnlyAllowed(path string) bool {
	return path == "/preferences" || strings.HasPrefix(path, "/api/auth/")
}

// sameOrigin rejects cross-site writes and WebSocket upgrades (CSRF and CSWSH).
func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return strings.EqualFold(u.Host, r.Host)
}

// isSAMLACS is the one cross-site POST CloudTerm accepts: the IdP returning a
// signed assertion. It is bound to a pending request instead of an Origin.
func isSAMLACS(r *http.Request) bool {
	return r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/auth/saml/") && strings.HasSuffix(r.URL.Path, "/acs")
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// Hijack keeps WebSocket upgrades working through the recorder.
func (s *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hj, ok := s.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("hijack not supported")
	}
	return hj.Hijack()
}

func (s *statusRecorder) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (h *Handler) wrap(next http.Handler) http.Handler {
	limited := tenant.Middleware(600)(next)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hdr := w.Header()
		hdr.Set("X-Content-Type-Options", "nosniff")
		hdr.Set("Referrer-Policy", "same-origin")
		hdr.Set("X-Frame-Options", "SAMEORIGIN")
		if isHTTPS(r) {
			hdr.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}

		write := r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions
		upgrade := strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
		if (write || upgrade) && !sameOrigin(r) && !isSAMLACS(r) {
			jsonError(w, "cross-site request refused", http.StatusForbidden)
			return
		}

		var c auth.Claims
		signedIn := false
		if h.authn != nil {
			if tok := sessionToken(r); tok != "" {
				if parsed, err := h.authn.Parse(tok); err == nil {
					c, signedIn = parsed, true
					r = r.WithContext(context.WithValue(r.Context(), claimsKey{}, c))
				}
			}
		}

		required := h.cfg != nil && h.cfg.RequireAuth && h.authn != nil
		if required && !publicPath(r.Method, r.URL.Path) {
			if !signedIn {
				jsonError(w, "sign in required", http.StatusUnauthorized)
				return
			}
			if adminOnly(r.Method, r.URL.Path) && c.Role != auth.RoleAdmin {
				h.auditAuth(r, "access_denied", "denied", c.Email, c.UserID, c.Role, r.Method+" "+r.URL.Path+" needs admin")
				jsonError(w, "admin role required", http.StatusForbidden)
				return
			}
			if write && c.Role == auth.RoleViewer && !readOnlyAllowed(r.URL.Path) {
				h.auditAuth(r, "access_denied", "denied", c.Email, c.UserID, c.Role, r.Method+" "+r.URL.Path+" is read-only for viewers")
				jsonError(w, "viewers have read-only access", http.StatusForbidden)
				return
			}
		}

		if !write || !signedIn || strings.HasPrefix(r.URL.Path, "/api/auth/") {
			limited.ServeHTTP(w, r)
			return
		}
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		limited.ServeHTTP(rec, r)
		outcome := "success"
		if rec.status >= 400 {
			outcome = "denied"
		}
		h.audit.Log(audit.AuditEvent{
			Action:    "request",
			Outcome:   outcome,
			UserID:    c.UserID,
			UserEmail: c.Email,
			Role:      string(c.Role),
			TenantID:  c.TenantID,
			IP:        clientIP(r),
			UserAgent: r.UserAgent(),
			Details:   r.Method + " " + r.URL.Path + " " + http.StatusText(rec.status),
		})
	})
}

// preferencesPath keeps each signed-in person's preferences separate.
func (h *Handler) preferencesPath(r *http.Request) string {
	fallback := "preferences.json"
	if h.cfg != nil && h.cfg.PreferencesFile != "" {
		fallback = h.cfg.PreferencesFile
	}
	c, err := h.claims(r)
	if err != nil || c.UserID == "" {
		return fallback
	}
	tenantID := c.TenantID
	if tenantID == "" {
		tenantID = tenant.ID(r)
	}
	base := "."
	if h.cfg != nil && h.cfg.DataDir != "" {
		base = h.cfg.DataDir
	}
	dir := filepath.Join(base, "prefs", safeSegment(tenantID), safeSegment(c.UserID))
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fallback
	}
	return filepath.Join(dir, "preferences.json")
}

func safeSegment(s string) string {
	return strings.NewReplacer("/", "_", "\\", "_", "..", "_", ":", "_").Replace(s)
}
