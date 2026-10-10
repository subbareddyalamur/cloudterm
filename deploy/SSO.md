# CloudTerm SSO operations guide

CloudTerm signs people in through any standards-compliant identity provider:
**OIDC** (Google, Entra ID, Okta, Auth0, Keycloak…) or **SAML 2.0** (Okta,
Entra ID, Google Workspace, ADFS, Shibboleth…), or several at once — staff on
Okta over SAML and contractors on Google over OIDC, say.

- Configuration reference: `deploy/sso/sso-providers.example.json` (one annotated entry per IdP style).
- Single OIDC provider can be configured with `OIDC_*` environment variables instead of the file.
- Security review of the implementation: sessions are HMAC-signed tokens; OIDC uses authorization-code + PKCE with state and nonce; SAML is SP-initiated only, rejects unsolicited responses, and answers each AuthnRequest exactly once.

## Production requirements

### 1. Serve HTTPS

Set `PUBLIC_URL=https://…`. SAML refuses to start without it, and two
protections depend on it:

- **Secure cookies.** The session, OIDC-state, and SAML-binding cookies are
  only marked `Secure` when the user's connection is HTTPS.
- **SAML browser binding.** The `ct_saml` cookie proves the assertion answers
  a sign-in started in the same browser. It needs `SameSite=None`, which
  browsers only honor on cookies marked `Secure` — so on plain HTTP the
  binding is skipped (sign-in still works, with one less defense).

A start-up log line warns when a SAML provider is configured without HTTPS.

### 2. Put CloudTerm behind a TLS-terminating proxy

CloudTerm reads `X-Forwarded-For` (audit IPs) and `X-Forwarded-Proto`
(cookie security) from its reverse proxy. By default it trusts these
headers from **any** peer, which is right for a single proxy in front and
wrong if the port is reachable directly.

Set `TRUSTED_PROXIES` to the proxy address or CIDR when anything else can
reach the port:

```bash
TRUSTED_PROXIES=10.0.0.0/8,203.0.113.7   # CIDRs and single IPs
```

With a list in place, forward headers are honored only from those peers, and
`X-Forwarded-For` is read from the right end — skipping the listed proxies —
so a caller cannot spoof a leftmost entry to forge audit IPs.

### 3. Run one replica (or sticky sessions)

The following live **in-process** and are not shared between replicas:

| State | Used by | Lost on restart |
|---|---|---|
| Pending SAML AuthnRequest / logout IDs | replay protection | in-flight sign-ins fail once; retry |
| Session revocations (`Revoke`) | sign-out, idle timeout | a signed-out token works again until its own expiry |
| Last-seen times | idle timeout | idle window restarts |
| Failed-login counters | lockout | lockout lifts |
| Stashed OIDC ID tokens | `id_token_hint` on sign-out | sign-out falls back to no hint |

For a single-instance deployment this is invisible. To scale horizontally
today, use **sticky sessions** and share `AUTH_SECRET` so any replica can
validate a token; move the session state to Postgres before dropping
stickiness. (User records themselves already live in Postgres when
`DATABASE_URL` is set.)

Also note: the SAML service-provider signing key (`saml-sp.key` /
`saml-sp.crt` in `DATA_DIR`) must be shared — or pre-generated on one node —
when multiple replicas serve SAML; the key identifies CloudTerm to the IdP.

## Roles and sessions

- Roles come from IdP groups (`admin_groups` / `operator_groups` /
  `viewer_groups`, first match wins) or `default_role`, checked at **every
  sign-in**.
- **Demotions are immediate**: the session's role follows the stored user
  record on each request, so removing someone from a group takes effect at
  her next sign-in and applies to her live sessions right away, not at
  session expiry.
- Disabling a user (in `users.json` / Postgres) kills her sessions on the
  next request.
- Sessions end on absolute age (`SESSION_MAX_HOURS`, default 8h), idle time
  (`SESSION_IDLE_MINUTES`, default 60m), or sign-out.

## Single logout (SLO)

Signing out of CloudTerm ends the local session and then continues to the
IdP's own logout when the IdP supports it:

- **SAML**: if the IdP metadata advertises a Single Logout endpoint,
  CloudTerm sends a signed-out user there (redirect or POST binding,
  whichever the IdP offers) and validates the returning `LogoutResponse` —
  which must answer a logout this process started, exactly once. CloudTerm
  does **not** accept IdP-initiated `LogoutRequest`s.
- **OIDC**: if discovery advertises `end_session_endpoint`, CloudTerm
  redirects there with `id_token_hint` (kept for the session's lifetime,
  in-process) and `post_logout_redirect_uri` = `PUBLIC_URL`. Register that
  URI at the IdP as a post-logout redirect. IdPs that demand `id_token_hint`
  will lose it after a restart (the stash is in-memory).

An IdP without SLO support gets local-only sign-out: the CloudTerm session
ends and the browser lands on the sign-in page.

## Federation metadata

`metadata_url` files (InCommon and friends) can list several IdPs. Use
`entity_id` to pick the one to trust; without it, CloudTerm refuses metadata
that contains more than one IdP rather than silently trusting an arbitrary
certificate:

```json
{
  "id": "shib",
  "type": "saml",
  "metadata_url": "https:// federation.example/metadata.xml",
  "entity_id": "https://idp.your-org.example/idp/shibboleth",
  "operator_groups": ["cloudterm-operators"]
}
```

## Environment reference (SSO)

| Variable | Meaning |
|---|---|
| `PUBLIC_URL` | Base URL users reach CloudTerm at; builds ACS/redirect/SLO URLs |
| `SSO_PROVIDERS_FILE` | JSON array of providers (default `DATA_DIR/sso-providers.json`) |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Single-OIDC-provider shorthand |
| `OIDC_REDIRECT_URL` | Overrides the default callback `…/api/auth/sso/oidc/callback` |
| `OIDC_ALLOWED_DOMAINS`, `OIDC_ADMIN_GROUPS`, `OIDC_OPERATOR_GROUPS`, `OIDC_VIEWER_GROUPS`, `OIDC_DEFAULT_ROLE` | Who may sign in, with which role |
| `OIDC_GROUPS_CLAIM` | Claim carrying groups (default `groups`) |
| `OIDC_REQUIRE_EMAIL_VERIFIED` | Default `true`; turn off for IdPs that never send `email_verified` |
| `TRUSTED_PROXIES` | IPs/CIDRs whose `X-Forwarded-*` headers are honored |
| `LOCAL_LOGIN` | `all` / `admin` (default with SSO) / `off` — break-glass password access |
| `REQUIRE_AUTH` | Whether every route needs a session |
| `AUTH_SECRET` | ≥32 chars; HMAC key for sessions and login cookies (auto-generated to `DATA_DIR/auth.key`) |

## Sign-in endpoints (for IdP configuration)

| Endpoint | Purpose |
|---|---|
| `GET /api/auth/sso/{id}/start` | Begin OIDC sign-in |
| `GET /api/auth/sso/{id}/callback` | OIDC redirect target |
| `GET /api/auth/saml/{id}/metadata` | SAML SP metadata (import into the IdP) |
| `POST /api/auth/saml/{id}/acs` | SAML assertion consumer |
| `GET\|POST /api/auth/saml/{id}/slo` | SAML logout response target |
| `GET /api/auth/logout` | Browser sign-out (continues to the IdP's logout) |
| `POST /api/auth/logout` | API sign-out (local session only) |
