package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/xml"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/beevik/etree"
	"github.com/crewjam/saml"
	"github.com/crewjam/saml/logger"
	dsig "github.com/russellhaering/goxmldsig"
)

// testIdP is a real SAML IdP (the library's own) that signs and encrypts assertions.
func testIdP(t *testing.T) *saml.IdentityProvider {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "test-idp"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(24 * time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	cert, _ := x509.ParseCertificate(der)
	meta, _ := url.Parse("https://idp.example/metadata")
	sso, _ := url.Parse("https://idp.example/sso")
	return &saml.IdentityProvider{Key: key, Signer: key, Certificate: cert, Logger: logger.DefaultLogger, MetadataURL: *meta, SSOURL: *sso}
}

func idpMetadataXML(t *testing.T, idp *saml.IdentityProvider) string {
	t.Helper()
	b, err := xml.Marshal(idp.Metadata())
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func newTestSAML(t *testing.T, idp *saml.IdentityProvider) *SAMLProvider {
	t.Helper()
	p, err := newSAMLProvider(ProviderConfig{
		ID: "entra", Type: "saml", Label: "Entra ID",
		MetadataXML:    idpMetadataXML(t, idp),
		AllowedDomains: []string{"sycamore.example"},
		AdminGroups:    []string{"cloudterm-admins"},
		OperatorGroups: []string{"cloudterm-operators"},
	}, "https://desk.example", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return p
}

type assertionOpts struct {
	email      string
	groups     []string
	clearInRTo bool
	now        time.Time
	signer     *saml.IdentityProvider
}

// signIn runs SP Start, then the IdP builds a signed, encrypted response to it.
func signIn(t *testing.T, p *SAMLProvider, idp *saml.IdentityProvider, o assertionOpts) *http.Request {
	t.Helper()
	start, _, err := p.Start(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if start.URL == "" {
		t.Fatal("expected HTTP-Redirect binding")
	}
	signer := idp
	if o.signer != nil {
		signer = o.signer
	}
	ar, err := saml.NewIdpAuthnRequest(signer, httptest.NewRequest(http.MethodGet, start.URL, nil))
	if err != nil {
		t.Fatal(err)
	}
	if err := xml.Unmarshal(ar.RequestBuffer, &ar.Request); err != nil {
		t.Fatal(err)
	}
	ar.ServiceProviderMetadata = p.sp.Metadata()
	ar.SPSSODescriptor = &ar.ServiceProviderMetadata.SPSSODescriptors[0]
	ar.ACSEndpoint = &ar.SPSSODescriptor.AssertionConsumerServices[0]
	if !o.now.IsZero() {
		ar.Now = o.now
	}
	if o.clearInRTo {
		ar.Request.ID = ""
	}
	groups := make([]saml.AttributeValue, 0, len(o.groups))
	for _, g := range o.groups {
		groups = append(groups, saml.AttributeValue{Type: "xs:string", Value: g})
	}
	session := &saml.Session{
		ID: "s1", NameID: o.email, UserEmail: o.email, UserCommonName: "Priya",
		CustomAttributes: []saml.Attribute{{
			Name:   "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
			Values: groups,
		}},
	}
	if err := (saml.DefaultAssertionMaker{}).MakeAssertion(ar, session); err != nil {
		t.Fatal(err)
	}
	if err := ar.MakeResponse(); err != nil {
		t.Fatal(err)
	}
	doc := etree.NewDocument()
	doc.SetRoot(ar.ResponseEl)
	raw, err := doc.WriteToBytes()
	if err != nil {
		t.Fatal(err)
	}
	form := url.Values{"SAMLResponse": {base64.StdEncoding.EncodeToString(raw)}}
	req := httptest.NewRequest(http.MethodPost, p.sp.AcsURL.String(), strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return req
}

func cloneRequest(t *testing.T, r *http.Request) *http.Request {
	t.Helper()
	_ = r.ParseForm()
	body := r.PostForm.Encode()
	c := httptest.NewRequest(http.MethodPost, r.URL.String(), strings.NewReader(body))
	c.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return c
}

func TestSAMLSignInMapsGroupsAndRejectsReplay(t *testing.T) {
	idp := testIdP(t)
	p := newTestSAML(t, idp)
	req := signIn(t, p, idp, assertionOpts{email: "Priya@Sycamore.example", groups: []string{"everyone", "cloudterm-operators"}})
	replay := cloneRequest(t, req)

	id, reqID, err := p.ACS(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if id.Role != RoleOperator || id.Email != "priya@sycamore.example" || id.Issuer != "https://idp.example/metadata" || reqID == "" {
		t.Fatalf("identity %+v", id)
	}
	if _, _, err := p.ACS(context.Background(), replay); err == nil || !strings.Contains(err.Error(), "already used") {
		t.Fatalf("replayed response must be refused, got %v", err)
	}
}

func TestSAMLRefusals(t *testing.T) {
	idp := testIdP(t)
	p := newTestSAML(t, idp)
	forger := testIdP(t)
	forger.MetadataURL = idp.MetadataURL

	cases := []struct {
		name string
		opts assertionOpts
		want string
	}{
		{"unsolicited (IdP-initiated)", assertionOpts{email: "priya@sycamore.example", groups: []string{"cloudterm-admins"}, clearInRTo: true}, "unsolicited"},
		{"signed by another key", assertionOpts{email: "priya@sycamore.example", groups: []string{"cloudterm-admins"}, signer: forger}, "rejected"},
		{"expired assertion", assertionOpts{email: "priya@sycamore.example", groups: []string{"cloudterm-admins"}, now: time.Now().Add(-2 * time.Hour)}, "rejected"},
		{"foreign domain", assertionOpts{email: "eve@gmail.com", groups: []string{"cloudterm-admins"}}, "not allowed"},
		{"no CloudTerm group", assertionOpts{email: "priya@sycamore.example", groups: []string{"everyone"}}, "not a member"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := p.ACS(context.Background(), signIn(t, p, idp, tc.opts))
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("want refusal containing %q, got %v", tc.want, err)
			}
		})
	}
}

// federationXML lists two IdPs the way an InCommon-style metadata file does.
func federationXML() string {
	return `<EntitiesDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <EntityDescriptor entityID="https://idp-one.example">
    <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"/>
  </EntityDescriptor>
  <EntityDescriptor entityID="https://idp-two.example">
    <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"/>
  </EntityDescriptor>
</EntitiesDescriptor>`
}

func TestFederationMetadataNeedsEntityID(t *testing.T) {
	ed, err := parseIDPMetadata([]byte(federationXML()), "")
	if err == nil || !strings.Contains(err.Error(), "entity_id") {
		t.Fatalf("a federation without entity_id must be refused, got %v", err)
	}
	if ed != nil {
		t.Fatal("no descriptor may be returned on refusal")
	}

	ed, err = parseIDPMetadata([]byte(federationXML()), "https://idp-two.example")
	if err != nil || ed.EntityID != "https://idp-two.example" {
		t.Fatalf("entity_id must pick the named IdP: %+v %v", ed, err)
	}

	if _, err := parseIDPMetadata([]byte(federationXML()), "https://idp-three.example"); err == nil || !strings.Contains(err.Error(), "not one of") {
		t.Fatalf("an entity_id absent from the metadata must be refused, got %v", err)
	}

	single := `<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://solo.example">
	  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"/>
	</EntityDescriptor>`
	ed, err = parseIDPMetadata([]byte(single), "")
	if err != nil || ed.EntityID != "https://solo.example" {
		t.Fatalf("single-IdP metadata needs no entity_id: %+v %v", ed, err)
	}
}

// idpSignLogoutResponse builds a LogoutResponse the way a real IdP does:
// signed with the IdP's key, so the signature path is exercised for real.
func idpSignLogoutResponse(t *testing.T, idp *saml.IdentityProvider, sp *saml.ServiceProvider, inResponseTo string) []byte {
	t.Helper()
	resp, err := sp.MakeLogoutResponse(sp.SloURL.String(), inResponseTo)
	if err != nil {
		t.Fatal(err)
	}
	resp.Issuer = &saml.Issuer{Value: idp.Metadata().EntityID}
	doc := etree.NewDocument()
	doc.SetRoot(resp.Element())
	keyPair := tls.Certificate{Certificate: [][]byte{idp.Certificate.Raw}, PrivateKey: idp.Key, Leaf: idp.Certificate}
	ctx := dsig.NewDefaultSigningContext(dsig.TLSCertKeyStore(keyPair))
	ctx.Canonicalizer = dsig.MakeC14N10ExclusiveCanonicalizerWithPrefixList("")
	if err := ctx.SetSignatureMethod(dsig.RSASHA256SignatureMethod); err != nil {
		t.Fatal(err)
	}
	el, err := ctx.SignEnveloped(doc.Root())
	if err != nil {
		t.Fatal(err)
	}
	doc.SetRoot(el)
	return mustBytes(t, doc)
}

func TestSAMLSPInitiatedLogout(t *testing.T) {
	idp := testIdP(t)
	slo, _ := url.Parse("https://idp.example/slo")
	idp.LogoutURL = *slo
	p := newTestSAML(t, idp)
	ctx := context.Background()

	// The logout request must go to the IdP's SLO endpoint.
	start, reqID, err := p.StartLogout(ctx, "priya@sycamore.example", "")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(start.URL, "https://idp.example/slo?SAMLRequest=") || reqID == "" {
		t.Fatalf("logout request %q (id %q) must target the IdP SLO endpoint", start.URL, reqID)
	}

	// The IdP answers: a LogoutResponse naming our request, to our SLO URL.
	mkResponse := func(inResponseTo string) *http.Request {
		raw := idpSignLogoutResponse(t, idp, p.sp, inResponseTo)
		form := url.Values{"SAMLResponse": {base64.StdEncoding.EncodeToString(raw)}}
		req := httptest.NewRequest(http.MethodPost, p.sp.SloURL.String(), strings.NewReader(form.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		return req
	}

	if err := p.LogoutResponse(ctx, mkResponse(reqID)); err != nil {
		t.Fatalf("a genuine logout response must validate: %v", err)
	}
	if err := p.LogoutResponse(ctx, cloneRequest(t, mkResponse(reqID))); err == nil || !strings.Contains(err.Error(), "already used") {
		t.Fatalf("a replayed logout response must be refused, got %v", err)
	}
	if err := p.LogoutResponse(ctx, mkResponse("never-issued")); err == nil || !strings.Contains(err.Error(), "does not answer a pending logout") {
		t.Fatalf("an unsolicited logout response must be refused, got %v", err)
	}

	// CloudTerm does not accept IdP-initiated logout requests at its SLO URL.
	form := url.Values{"SAMLRequest": {base64.StdEncoding.EncodeToString([]byte("<x/>"))}}
	req := httptest.NewRequest(http.MethodPost, p.sp.SloURL.String(), strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if err := p.LogoutResponse(ctx, req); err == nil || !strings.Contains(err.Error(), "does not accept IdP-initiated") {
		t.Fatalf("a logout request must be refused, got %v", err)
	}
}

func mustBytes(t *testing.T, doc *etree.Document) []byte {
	t.Helper()
	b, err := doc.WriteToBytes()
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// TestSAMLLogoutNeedsIDPSupport: an IdP without SLO endpoints gets local-only
// sign-out rather than a broken redirect.
func TestSAMLLogoutNeedsIDPSupport(t *testing.T) {
	idp := testIdP(t) // no LogoutURL: no SLO in metadata
	p := newTestSAML(t, idp)
	if _, _, err := p.StartLogout(context.Background(), "priya@sycamore.example", ""); err == nil || !strings.Contains(err.Error(), "does not offer single logout") {
		t.Fatalf("an IdP without SLO must refuse the logout request, got %v", err)
	}
}

// TestSAMLRefreshesMetadataWhileValidating is a regression test for the data
// race between the daily metadata refresh and assertion validation: each
// response below is validated while other goroutines rewrite the cached IdP
// metadata. Run with -race to see the unsynchronized read it guards against.
func TestSAMLRefreshesMetadataWhileValidating(t *testing.T) {
	idp := testIdP(t)
	p := newTestSAML(t, idp)

	// Build the responses in the test goroutine (the helpers call t.Fatal);
	// the workers validate them while the metadata is refreshed on every pass.
	const workers, rounds = 6, 5
	reqs := make(chan *http.Request)
	var wg sync.WaitGroup
	errs := make(chan error, workers*rounds)
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for req := range reqs {
				// Age the cache so this validation races other workers'
				// refresh writes against the assertion validation reads.
				p.mu.Lock()
				p.loadedAt = time.Time{}
				p.mu.Unlock()
				if _, _, err := p.ACS(context.Background(), req); err != nil {
					errs <- err
				}
			}
		}()
	}
	for i := 0; i < workers*rounds; i++ {
		reqs <- cloneRequest(t, signIn(t, p, idp, assertionOpts{email: "priya@sycamore.example", groups: []string{"cloudterm-operators"}}))
	}
	close(reqs)
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Errorf("concurrent validation: %v", err)
	}
}

func TestRegistryValidatesProviders(t *testing.T) {
	ok := []ProviderConfig{
		{ID: "okta", Type: "saml", Label: "Okta", MetadataXML: "<x/>", OperatorGroups: []string{"ops"}},
		{ID: "google", Type: "oidc", Label: "Google", Issuer: "https://accounts.google.com", ClientID: "c", DefaultRole: RoleViewer, AllowedDomains: []string{"sycamore.example"}},
	}
	r, err := NewRegistry(ok, RegistryOptions{PublicURL: "https://desk.example", DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	if got := r.Providers(); len(got) != 2 || got[0].ID != "okta" || got[1].Type != "oidc" {
		t.Fatalf("providers %+v", got)
	}
	if p, _ := r.OIDC("google"); p.cfg.RedirectURL != "https://desk.example/api/auth/sso/google/callback" {
		t.Fatalf("redirect URL %q", p.cfg.RedirectURL)
	}

	bad := map[string][]ProviderConfig{
		"duplicate id":        {ok[0], ok[0]},
		"no role mapping":     {{ID: "x", Type: "saml", MetadataXML: "<x/>"}},
		"bad id":              {{ID: "Okta Prod", Type: "saml", MetadataXML: "<x/>", DefaultRole: RoleViewer}},
		"saml needs metadata": {{ID: "x", Type: "saml", DefaultRole: RoleViewer}},
		"unknown type":        {{ID: "x", Type: "ldap", DefaultRole: RoleViewer}},
	}
	for name, cfgs := range bad {
		if _, err := NewRegistry(cfgs, RegistryOptions{PublicURL: "https://desk.example", DataDir: t.TempDir()}); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
	if _, err := NewRegistry(ok[:1], RegistryOptions{DataDir: t.TempDir()}); err == nil {
		t.Error("SAML without PUBLIC_URL must be refused")
	}
}
