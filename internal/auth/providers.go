package auth

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
)

// ProviderConfig is one identity provider. A deployment can list several,
// for example Okta over SAML for staff and Google over OIDC for contractors.
type ProviderConfig struct {
	ID    string `json:"id"`    // URL-safe, e.g. "okta"
	Type  string `json:"type"`  // "saml" or "oidc"
	Label string `json:"label"` // button text, e.g. "Okta"

	// OIDC
	Issuer          string `json:"issuer,omitempty"`
	ClientID        string `json:"client_id,omitempty"`
	ClientSecret    string `json:"client_secret,omitempty"`
	ClientSecretEnv string `json:"client_secret_env,omitempty"`
	RedirectURL     string `json:"redirect_url,omitempty"`

	// SAML
	MetadataURL  string `json:"metadata_url,omitempty"`
	MetadataFile string `json:"metadata_file,omitempty"`
	MetadataXML  string `json:"metadata_xml,omitempty"`

	// Attribute or claim names. Empty uses the common names for each IdP.
	EmailAttribute  string `json:"email_attribute,omitempty"`
	NameAttribute   string `json:"name_attribute,omitempty"`
	GroupsAttribute string `json:"groups_attribute,omitempty"`

	// Who may sign in, and with which role.
	AllowedDomains       []string `json:"allowed_domains,omitempty"`
	AdminGroups          []string `json:"admin_groups,omitempty"`
	OperatorGroups       []string `json:"operator_groups,omitempty"`
	ViewerGroups         []string `json:"viewer_groups,omitempty"`
	DefaultRole          Role     `json:"default_role,omitempty"`
	RequireEmailVerified *bool    `json:"require_email_verified,omitempty"`
}

var providerID = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,31}$`)

func (c *ProviderConfig) validate() error {
	if !providerID.MatchString(c.ID) {
		return fmt.Errorf("provider id %q must be lowercase letters, digits, and dashes", c.ID)
	}
	if c.Label == "" {
		c.Label = c.ID
	}
	switch c.DefaultRole {
	case "", RoleAdmin, RoleOperator, RoleViewer:
	default:
		return fmt.Errorf("provider %s: default_role %q is not admin, operator, or viewer", c.ID, c.DefaultRole)
	}
	if len(c.AdminGroups)+len(c.OperatorGroups)+len(c.ViewerGroups) == 0 && c.DefaultRole == "" {
		return fmt.Errorf("provider %s: map at least one group to a role, or set default_role", c.ID)
	}
	switch c.Type {
	case "oidc":
		if c.Issuer == "" || c.ClientID == "" {
			return fmt.Errorf("provider %s: OIDC needs issuer and client_id", c.ID)
		}
		if c.ClientSecret == "" && c.ClientSecretEnv != "" {
			c.ClientSecret = os.Getenv(c.ClientSecretEnv)
		}
	case "saml":
		if c.MetadataURL == "" && c.MetadataFile == "" && c.MetadataXML == "" {
			return fmt.Errorf("provider %s: SAML needs metadata_url, metadata_file, or metadata_xml", c.ID)
		}
	default:
		return fmt.Errorf("provider %s: type must be saml or oidc", c.ID)
	}
	return nil
}

// policy decides, for any protocol, whether a verified person may sign in and as what.
type policy struct {
	cfg ProviderConfig
}

func (p policy) requireVerified() bool {
	return p.cfg.RequireEmailVerified == nil || *p.cfg.RequireEmailVerified
}

// decide applies the domain and group rules. verified is the IdP's statement
// that it owns the email address; a signed SAML assertion counts as verified.
func (p policy) decide(id *Identity, verified bool) error {
	id.Email = strings.ToLower(strings.TrimSpace(id.Email))
	if id.Name == "" {
		id.Name = id.Email
	}
	if id.Email == "" || !strings.Contains(id.Email, "@") {
		return &DeniedError{Reason: "identity provider did not share an email address"}
	}
	if p.requireVerified() && !verified {
		return &DeniedError{Reason: "email address is not verified by the identity provider"}
	}
	if len(p.cfg.AllowedDomains) > 0 {
		_, domain, _ := strings.Cut(id.Email, "@")
		ok := false
		for _, d := range p.cfg.AllowedDomains {
			if strings.EqualFold(strings.TrimPrefix(d, "@"), domain) {
				ok = true
				break
			}
		}
		if !ok {
			return &DeniedError{Reason: "email domain " + domain + " is not allowed for " + p.cfg.Label}
		}
	}
	id.Role = p.roleFor(id.Groups)
	if id.Role == "" {
		return &DeniedError{Reason: "not a member of any CloudTerm group in " + p.cfg.Label}
	}
	return nil
}

func (p policy) roleFor(groups []string) Role {
	has := func(list []string) bool {
		for _, want := range list {
			for _, g := range groups {
				if strings.EqualFold(strings.TrimSpace(want), strings.TrimSpace(g)) {
					return true
				}
			}
		}
		return false
	}
	switch {
	case has(p.cfg.AdminGroups):
		return RoleAdmin
	case has(p.cfg.OperatorGroups):
		return RoleOperator
	case has(p.cfg.ViewerGroups):
		return RoleViewer
	default:
		return p.cfg.DefaultRole
	}
}

// Identity is a verified person from an IdP, with the CloudTerm role decided.
type Identity struct {
	ProviderID string
	Issuer     string
	Subject    string
	Email      string
	Name       string
	Groups     []string
	Role       Role
}

// DeniedError is a refusal the audit log records with its reason.
type DeniedError struct{ Reason string }

func (e *DeniedError) Error() string { return e.Reason }

// ProviderInfo is what the sign-in page may show about a provider.
type ProviderInfo struct {
	ID      string   `json:"id"`
	Label   string   `json:"label"`
	Type    string   `json:"type"`
	Domains []string `json:"domains,omitempty"`
}

// Registry holds every configured IdP in display order.
type Registry struct {
	order []string
	oidc  map[string]*OIDCProvider
	saml  map[string]*SAMLProvider
}

// RegistryOptions supplies what SAML needs to describe this service provider.
type RegistryOptions struct {
	PublicURL string // e.g. https://cloudterm.example.com
	DataDir   string // where the SAML signing key is kept
}

// LoadProviders reads a JSON array of ProviderConfig. A missing file is not an error.
func LoadProviders(path string) ([]ProviderConfig, error) {
	if path == "" {
		return nil, nil
	}
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []ProviderConfig
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return out, nil
}

func NewRegistry(cfgs []ProviderConfig, opt RegistryOptions) (*Registry, error) {
	r := &Registry{oidc: map[string]*OIDCProvider{}, saml: map[string]*SAMLProvider{}}
	base := strings.TrimRight(opt.PublicURL, "/")
	for i := range cfgs {
		c := cfgs[i]
		if err := c.validate(); err != nil {
			return nil, err
		}
		if _, dup := r.oidc[c.ID]; dup {
			return nil, fmt.Errorf("provider id %q is listed twice", c.ID)
		}
		if _, dup := r.saml[c.ID]; dup {
			return nil, fmt.Errorf("provider id %q is listed twice", c.ID)
		}
		switch c.Type {
		case "oidc":
			if c.RedirectURL == "" {
				if base == "" {
					return nil, fmt.Errorf("provider %s: set PUBLIC_URL or redirect_url", c.ID)
				}
				c.RedirectURL = base + "/api/auth/sso/" + c.ID + "/callback"
			}
			r.oidc[c.ID] = newOIDCProvider(c)
		case "saml":
			if base == "" {
				return nil, fmt.Errorf("provider %s: SAML needs PUBLIC_URL so the IdP knows where to send users back", c.ID)
			}
			sp, err := newSAMLProvider(c, base, opt.DataDir)
			if err != nil {
				return nil, err
			}
			r.saml[c.ID] = sp
		}
		r.order = append(r.order, c.ID)
	}
	return r, nil
}

func (r *Registry) Enabled() bool { return r != nil && len(r.order) > 0 }

func (r *Registry) Providers() []ProviderInfo {
	if r == nil {
		return nil
	}
	out := make([]ProviderInfo, 0, len(r.order))
	for _, id := range r.order {
		if p, ok := r.oidc[id]; ok {
			out = append(out, ProviderInfo{ID: id, Label: p.cfg.Label, Type: "oidc", Domains: p.cfg.AllowedDomains})
		}
		if p, ok := r.saml[id]; ok {
			out = append(out, ProviderInfo{ID: id, Label: p.cfg.Label, Type: "saml", Domains: p.cfg.AllowedDomains})
		}
	}
	return out
}

func (r *Registry) OIDC(id string) (*OIDCProvider, bool) {
	if r == nil {
		return nil, false
	}
	p, ok := r.oidc[id]
	return p, ok
}

func (r *Registry) SAML(id string) (*SAMLProvider, bool) {
	if r == nil {
		return nil, false
	}
	p, ok := r.saml[id]
	return p, ok
}

// redirectOrForm is how a sign-in starts: a redirect, or an auto-submitting
// form for IdPs that only accept HTTP-POST requests.
type redirectOrForm struct {
	URL  string
	Form []byte
}

func (s redirectOrForm) Write(w http.ResponseWriter, r *http.Request) {
	if s.URL != "" {
		http.Redirect(w, r, s.URL, http.StatusFound)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(s.Form)
}
