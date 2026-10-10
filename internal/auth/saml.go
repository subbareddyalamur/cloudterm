package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/crewjam/saml"
)

const (
	samlRequestTTL  = 10 * time.Minute
	samlMetadataTTL = 24 * time.Hour
	samlMaxPending  = 10000
)

// Common attribute names, so Okta, Entra ID, Google Workspace, ADFS, and
// Shibboleth work without per-IdP mapping. A provider can override each one.
var (
	samlEmailNames = []string{
		"email", "mail", "emailaddress", "Email", "EmailAddress",
		"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
		"urn:oid:0.9.2342.19200300.100.1.3",
		"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn",
	}
	samlNameNames = []string{
		"displayName", "name", "cn",
		"http://schemas.microsoft.com/identity/claims/displayname",
		"urn:oid:2.16.840.1.113730.3.1.241", "urn:oid:2.5.4.3",
	}
	samlGroupNames = []string{
		"groups", "group", "memberOf", "Groups",
		"http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
		"http://schemas.xmlsoap.org/claims/Group",
		"urn:oid:1.3.6.1.4.1.5923.1.1.1.7",
	}
)

// SAMLProvider is CloudTerm as a SAML 2.0 service provider for one IdP.
type SAMLProvider struct {
	cfg    ProviderConfig
	policy policy

	mu         sync.Mutex
	sp         *saml.ServiceProvider
	loadedAt   time.Time
	pending    map[string]time.Time // AuthnRequest ID -> expiry
	httpClient *http.Client
}

func newSAMLProvider(cfg ProviderConfig, base, dataDir string) (*SAMLProvider, error) {
	key, cert, err := loadSPKeypair(dataDir)
	if err != nil {
		return nil, fmt.Errorf("SAML signing key: %w", err)
	}
	root := base + "/api/auth/saml/" + cfg.ID
	metaURL, _ := url.Parse(root + "/metadata")
	acsURL, _ := url.Parse(root + "/acs")
	client := &http.Client{Timeout: 15 * time.Second}
	sp := &saml.ServiceProvider{
		EntityID:              metaURL.String(),
		Key:                   key,
		Certificate:           cert,
		MetadataURL:           *metaURL,
		AcsURL:                *acsURL,
		HTTPClient:            client,
		AllowIDPInitiated:     false,
		AuthnNameIDFormat:     saml.UnspecifiedNameIDFormat,
		MetadataValidDuration: 7 * 24 * time.Hour,
	}
	return &SAMLProvider{
		cfg: cfg, policy: policy{cfg: cfg}, sp: sp,
		pending: map[string]time.Time{}, httpClient: client,
	}, nil
}

func (p *SAMLProvider) Config() ProviderConfig { return p.cfg }

// SPInfo is what an admin pastes into the IdP's app configuration.
type SPInfo struct {
	EntityID    string `json:"entity_id"`
	ACSURL      string `json:"acs_url"`
	MetadataURL string `json:"metadata_url"`
	Fingerprint string `json:"certificate_sha256"`
}

func (p *SAMLProvider) SPInfo() SPInfo {
	sum := sha256.Sum256(p.sp.Certificate.Raw)
	return SPInfo{
		EntityID:    p.sp.EntityID,
		ACSURL:      p.sp.AcsURL.String(),
		MetadataURL: p.sp.MetadataURL.String(),
		Fingerprint: strings.ToUpper(hex.EncodeToString(sum[:])),
	}
}

// Metadata is the SP metadata XML the IdP can import.
func (p *SAMLProvider) Metadata() ([]byte, error) {
	b, err := xml.MarshalIndent(p.sp.Metadata(), "", "  ")
	if err != nil {
		return nil, err
	}
	return append([]byte(xml.Header), b...), nil
}

// ensureMetadata loads IdP metadata, refreshing daily so certificate rotation works.
func (p *SAMLProvider) ensureMetadata(ctx context.Context) error {
	p.mu.Lock()
	fresh := p.sp.IDPMetadata != nil && time.Since(p.loadedAt) < samlMetadataTTL
	p.mu.Unlock()
	if fresh {
		return nil
	}
	raw, err := p.fetchMetadata(ctx)
	if err != nil {
		p.mu.Lock()
		have := p.sp.IDPMetadata != nil
		p.mu.Unlock()
		if have {
			return nil // keep using the last good metadata
		}
		return fmt.Errorf("%s metadata: %w", p.cfg.Label, err)
	}
	ed, err := parseIDPMetadata(raw)
	if err != nil {
		return fmt.Errorf("%s metadata: %w", p.cfg.Label, err)
	}
	p.mu.Lock()
	p.sp.IDPMetadata = ed
	p.loadedAt = time.Now()
	p.mu.Unlock()
	return nil
}

func (p *SAMLProvider) fetchMetadata(ctx context.Context) ([]byte, error) {
	switch {
	case p.cfg.MetadataXML != "":
		return []byte(p.cfg.MetadataXML), nil
	case p.cfg.MetadataFile != "":
		return os.ReadFile(p.cfg.MetadataFile)
	default:
		if !strings.HasPrefix(p.cfg.MetadataURL, "https://") && !strings.HasPrefix(p.cfg.MetadataURL, "http://localhost") && !strings.HasPrefix(p.cfg.MetadataURL, "http://127.0.0.1") {
			return nil, errors.New("metadata_url must use https")
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.cfg.MetadataURL, nil)
		if err != nil {
			return nil, err
		}
		resp, err := p.httpClient.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("metadata URL returned %s", resp.Status)
		}
		return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	}
}

// parseIDPMetadata accepts an EntityDescriptor or an EntitiesDescriptor with one IdP.
func parseIDPMetadata(raw []byte) (*saml.EntityDescriptor, error) {
	var ed saml.EntityDescriptor
	if err := xml.Unmarshal(raw, &ed); err == nil && len(ed.IDPSSODescriptors) > 0 {
		return &ed, nil
	}
	var eds saml.EntitiesDescriptor
	if err := xml.Unmarshal(raw, &eds); err != nil {
		return nil, err
	}
	for i := range eds.EntityDescriptors {
		if len(eds.EntityDescriptors[i].IDPSSODescriptors) > 0 {
			return &eds.EntityDescriptors[i], nil
		}
	}
	return nil, errors.New("no IdP SSO descriptor found")
}

// Start creates an AuthnRequest and remembers its ID for the response.
func (p *SAMLProvider) Start(ctx context.Context) (redirectOrForm, string, error) {
	if err := p.ensureMetadata(ctx); err != nil {
		return redirectOrForm{}, "", err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if loc := p.sp.GetSSOBindingLocation(saml.HTTPRedirectBinding); loc != "" {
		req, err := p.sp.MakeAuthenticationRequest(loc, saml.HTTPRedirectBinding, saml.HTTPPostBinding)
		if err != nil {
			return redirectOrForm{}, "", err
		}
		u, err := req.Redirect("", p.sp)
		if err != nil {
			return redirectOrForm{}, "", err
		}
		p.rememberLocked(req.ID)
		return redirectOrForm{URL: u.String()}, req.ID, nil
	}
	loc := p.sp.GetSSOBindingLocation(saml.HTTPPostBinding)
	if loc == "" {
		return redirectOrForm{}, "", errors.New(p.cfg.Label + " metadata has no redirect or POST sign-in endpoint")
	}
	req, err := p.sp.MakeAuthenticationRequest(loc, saml.HTTPPostBinding, saml.HTTPPostBinding)
	if err != nil {
		return redirectOrForm{}, "", err
	}
	p.rememberLocked(req.ID)
	form := req.Post("")
	page := []byte(`<!doctype html><html><head><meta charset="utf-8"><title>Signing in</title></head><body onload="document.forms[0].submit()">` +
		string(form) + `<noscript><button type="submit" form="SAMLRequestForm">Continue</button></noscript></body></html>`)
	return redirectOrForm{Form: page}, req.ID, nil
}

func (p *SAMLProvider) rememberLocked(id string) {
	now := time.Now()
	for k, exp := range p.pending {
		if now.After(exp) {
			delete(p.pending, k)
		}
	}
	if len(p.pending) >= samlMaxPending {
		for k := range p.pending {
			delete(p.pending, k)
			break
		}
	}
	p.pending[id] = now.Add(samlRequestTTL)
}

// consume makes each AuthnRequest answerable once, which stops replays.
func (p *SAMLProvider) consume(id string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	exp, ok := p.pending[id]
	delete(p.pending, id)
	return ok && time.Now().Before(exp)
}

// ACS validates the IdP's POST to the assertion consumer service.
// It returns the request ID the response answered, for browser binding.
func (p *SAMLProvider) ACS(ctx context.Context, r *http.Request) (Identity, string, error) {
	id := Identity{ProviderID: p.cfg.ID}
	if err := r.ParseForm(); err != nil {
		return id, "", &DeniedError{Reason: "malformed SAML post"}
	}
	encoded := r.PostForm.Get("SAMLResponse")
	if encoded == "" {
		return id, "", &DeniedError{Reason: "no SAMLResponse in the post"}
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return id, "", &DeniedError{Reason: "SAMLResponse is not base64"}
	}
	var head struct {
		InResponseTo string `xml:"InResponseTo,attr"`
	}
	_ = xml.Unmarshal(raw, &head)
	if head.InResponseTo == "" {
		return id, "", &DeniedError{Reason: "unsolicited SAML response; start sign-in from CloudTerm"}
	}
	if !p.consume(head.InResponseTo) {
		return id, head.InResponseTo, &DeniedError{Reason: "SAML response does not answer a pending sign-in, or was already used"}
	}
	if err := p.ensureMetadata(ctx); err != nil {
		return id, head.InResponseTo, err
	}
	// ParseXMLResponse reads the cached IdP metadata, which another request
	// may be refreshing under p.mu; hold the lock for the whole validation
	// so no goroutine ever sees the metadata half-updated.
	p.mu.Lock()
	assertion, err := p.sp.ParseXMLResponse(raw, []string{head.InResponseTo}, p.sp.AcsURL)
	if err != nil {
		p.mu.Unlock()
		reason := err.Error()
		var ire *saml.InvalidResponseError
		if errors.As(err, &ire) && ire.PrivateErr != nil {
			reason = ire.PrivateErr.Error()
		}
		return id, head.InResponseTo, &DeniedError{Reason: "SAML response rejected: " + reason}
	}
	issuer := assertion.Issuer.Value
	if issuer == "" && p.sp.IDPMetadata != nil {
		issuer = p.sp.IDPMetadata.EntityID
	}
	p.mu.Unlock()

	id.Issuer = issuer
	nameID := ""
	if assertion.Subject != nil && assertion.Subject.NameID != nil {
		nameID = assertion.Subject.NameID.Value
	}
	id.Subject = nameID
	id.Email = firstNonEmpty(first(attrValues(assertion, withOverride(p.cfg.EmailAttribute, samlEmailNames))), emailLike(nameID))
	id.Name = first(attrValues(assertion, withOverride(p.cfg.NameAttribute, samlNameNames)))
	id.Groups = attrValues(assertion, withOverride(p.cfg.GroupsAttribute, samlGroupNames))
	if id.Subject == "" {
		id.Subject = id.Email
	}
	// The assertion is signed by the IdP, so its email counts as verified.
	if err := p.policy.decide(&id, true); err != nil {
		return id, head.InResponseTo, err
	}
	return id, head.InResponseTo, nil
}

func withOverride(override string, defaults []string) []string {
	if override != "" {
		return []string{override}
	}
	return defaults
}

func attrValues(a *saml.Assertion, names []string) []string {
	var out []string
	for _, st := range a.AttributeStatements {
		for _, attr := range st.Attributes {
			for _, n := range names {
				if strings.EqualFold(attr.Name, n) || (attr.FriendlyName != "" && strings.EqualFold(attr.FriendlyName, n)) {
					for _, v := range attr.Values {
						if s := strings.TrimSpace(v.Value); s != "" {
							out = append(out, s)
						}
					}
					break
				}
			}
		}
	}
	return out
}

func first(v []string) string {
	if len(v) == 0 {
		return ""
	}
	return v[0]
}

func emailLike(s string) string {
	if strings.Contains(s, "@") {
		return s
	}
	return ""
}

// loadSPKeypair keeps one SP signing key and certificate in dataDir (0600).
func loadSPKeypair(dataDir string) (*rsa.PrivateKey, *x509.Certificate, error) {
	keyPath := filepath.Join(dataDir, "saml-sp.key")
	certPath := filepath.Join(dataDir, "saml-sp.crt")
	if kb, err := os.ReadFile(keyPath); err == nil {
		cb, err := os.ReadFile(certPath)
		if err != nil {
			return nil, nil, err
		}
		kp, _ := pem.Decode(kb)
		cp, _ := pem.Decode(cb)
		if kp == nil || cp == nil {
			return nil, nil, errors.New("saml-sp.key or saml-sp.crt is not PEM")
		}
		k, err := x509.ParsePKCS8PrivateKey(kp.Bytes)
		if err != nil {
			return nil, nil, err
		}
		rk, ok := k.(*rsa.PrivateKey)
		if !ok {
			return nil, nil, errors.New("saml-sp.key must be RSA")
		}
		c, err := x509.ParseCertificate(cp.Bytes)
		if err != nil {
			return nil, nil, err
		}
		return rk, c, nil
	}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, err
	}
	serial, _ := rand.Int(rand.Reader, big.NewInt(1<<62))
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: "CloudTerm SAML service provider"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().AddDate(10, 0, 0),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return nil, nil, err
	}
	cert, _ := x509.ParseCertificate(der)
	pk, _ := x509.MarshalPKCS8PrivateKey(key)
	var kb, cb bytes.Buffer
	_ = pem.Encode(&kb, &pem.Block{Type: "PRIVATE KEY", Bytes: pk})
	_ = pem.Encode(&cb, &pem.Block{Type: "CERTIFICATE", Bytes: der})
	if err := os.WriteFile(keyPath, kb.Bytes(), 0600); err != nil {
		return nil, nil, err
	}
	if err := os.WriteFile(certPath, cb.Bytes(), 0644); err != nil {
		return nil, nil, err
	}
	return key, cert, nil
}
