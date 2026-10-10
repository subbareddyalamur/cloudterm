package license

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"os"
	"sync"
	"time"
)

type Entitlement struct {
	Plan          string    `json:"plan"`
	Status        string    `json:"status"`
	DaysRemaining int       `json:"days_remaining"`
	Features      []string  `json:"features"`
	GraceUntil    time.Time `json:"grace_until"`
	DeploymentID  string    `json:"deployment_id"`
	ExpiresAt     time.Time `json:"expires_at"`
}

type Coupon struct {
	Code       string `json:"code"`
	Percent    int    `json:"percent,omitempty"`
	ExtraDays  int    `json:"extra_days,omitempty"`
	ExtraSeats int    `json:"extra_seats,omitempty"`
	Internal   bool   `json:"internal"`
	Uses       int    `json:"uses"`
}

type Record struct {
	Key          string    `json:"key"`
	DeploymentID string    `json:"deployment_id"`
	Plan         string    `json:"plan"`
	Seats        int       `json:"seats"`
	ExpiresAt    time.Time `json:"expires_at"`
	Coupon       string    `json:"coupon,omitempty"`
}

type Controller struct {
	mu            sync.Mutex
	path          string
	priv          ed25519.PrivateKey
	pub           ed25519.PublicKey
	records       []Record
	coupons       []Coupon
	redeemed      map[string]string
	allowInternal bool
}

func NewController(path string, seed []byte) (*Controller, error) {
	pub, priv, err := ed25519.GenerateKey(bytesReader(seed))
	if err != nil {
		return nil, err
	}
	c := &Controller{
		path: path, priv: priv, pub: pub,
		coupons: []Coupon{
			{Code: "LAB-30", ExtraDays: 30, Internal: true},
			{Code: "TEAM-20", Percent: 20},
		},
		redeemed: map[string]string{},
	}
	if b, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(b, &c.records)
	}
	return c, nil
}

func bytesReader(seed []byte) *seedReader {
	if len(seed) < ed25519.SeedSize {
		padded := make([]byte, ed25519.SeedSize)
		copy(padded, seed)
		if len(seed) == 0 {
			for i := range padded {
				padded[i] = byte(i + 1)
			}
		}
		seed = padded
	}
	return &seedReader{b: seed[:ed25519.SeedSize]}
}

type seedReader struct {
	b    []byte
	done bool
}

func (s *seedReader) Read(p []byte) (int, error) {
	if s.done {
		return 0, io.EOF
	}
	n := copy(p, s.b)
	s.b = s.b[n:]
	if len(s.b) == 0 {
		s.done = true
	}
	return n, nil
}

func (c *Controller) PublicKey() ed25519.PublicKey { return c.pub }

// SetAllowInternal enables lab coupons that must not ship turned on.
func (c *Controller) SetAllowInternal(on bool) { c.allowInternal = on }

func (c *Controller) PublicKeyB64() string {
	return base64.StdEncoding.EncodeToString(c.pub)
}

func (c *Controller) Issue(deploymentID, plan string, days, seats int) (Record, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	rec := Record{
		Key: "ct_" + deploymentID, DeploymentID: deploymentID, Plan: plan,
		Seats: seats, ExpiresAt: time.Now().Add(time.Duration(days) * 24 * time.Hour),
	}
	c.records = append(c.records, rec)
	return rec, c.persist()
}

func (c *Controller) Redeem(key, code string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.redeemed[key] != "" {
		return errors.New("coupon already redeemed for this license")
	}
	var coupon *Coupon
	for i := range c.coupons {
		if c.coupons[i].Code == code {
			coupon = &c.coupons[i]
			break
		}
	}
	if coupon == nil {
		return errors.New("unknown coupon")
	}
	if coupon.Internal && !c.allowInternal {
		return errors.New("internal coupons are disabled")
	}
	for i := range c.records {
		if c.records[i].Key == key {
			if coupon.ExtraDays > 0 {
				c.records[i].ExpiresAt = c.records[i].ExpiresAt.Add(time.Duration(coupon.ExtraDays) * 24 * time.Hour)
			}
			if coupon.ExtraSeats > 0 {
				c.records[i].Seats += coupon.ExtraSeats
			}
			c.records[i].Coupon = code
			c.redeemed[key] = code
			coupon.Uses++
			return c.persist()
		}
	}
	return errors.New("unknown license")
}

func (c *Controller) Heartbeat(key, deploymentID string, seats int) (Entitlement, string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, rec := range c.records {
		if rec.Key == key && rec.DeploymentID == deploymentID {
			if seats > rec.Seats && rec.Seats > 0 {
				return Entitlement{}, "", errors.New("seat limit exceeded")
			}
			ent := entitlementFrom(rec)
			sig, err := c.sign(ent)
			return ent, sig, err
		}
	}
	return Entitlement{}, "", errors.New("unknown license")
}

func entitlementFrom(rec Record) Entitlement {
	days := int(time.Until(rec.ExpiresAt).Hours() / 24)
	status := "active"
	if days < 0 {
		status = "expired"
	}
	return Entitlement{
		Plan: rec.Plan, Status: status, DaysRemaining: days,
		Features:     []string{"ssh", "rdp", "transfer", "ai"},
		GraceUntil:   rec.ExpiresAt.Add(7 * 24 * time.Hour),
		DeploymentID: rec.DeploymentID, ExpiresAt: rec.ExpiresAt,
	}
}

func (c *Controller) sign(ent Entitlement) (string, error) {
	b, err := json.Marshal(ent)
	if err != nil {
		return "", err
	}
	sig := ed25519.Sign(c.priv, b)
	return base64.StdEncoding.EncodeToString(b) + "." + base64.StdEncoding.EncodeToString(sig), nil
}

func Verify(pub ed25519.PublicKey, packed string) (Entitlement, error) {
	var ent Entitlement
	parts := splitDot(packed)
	if len(parts) != 2 {
		return ent, errors.New("malformed entitlement")
	}
	body, err := base64.StdEncoding.DecodeString(parts[0])
	if err != nil {
		return ent, err
	}
	sig, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return ent, err
	}
	if !ed25519.Verify(pub, body, sig) {
		return ent, errors.New("bad entitlement signature")
	}
	if err := json.Unmarshal(body, &ent); err != nil {
		return ent, err
	}
	return ent, nil
}

func splitDot(s string) []string {
	for i := 0; i < len(s); i++ {
		if s[i] == '.' {
			return []string{s[:i], s[i+1:]}
		}
	}
	return []string{s}
}

func (c *Controller) persist() error {
	b, err := json.MarshalIndent(c.records, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(c.path, b, 0600)
}

// Client is the self-hosted deployment's view of the last signed entitlement.
type Client struct {
	mu   sync.RWMutex
	ent  Entitlement
	ok   bool
	path string
	pub  ed25519.PublicKey
}

func ParsePublicKey(b64 string) (ed25519.PublicKey, error) {
	if b64 == "" {
		return nil, errors.New("empty public key")
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, err
	}
	if len(raw) != ed25519.PublicKeySize {
		return nil, errors.New("public key length")
	}
	return ed25519.PublicKey(raw), nil
}

func (c *Client) SetPublicKey(pub ed25519.PublicKey) {
	c.mu.Lock()
	c.pub = pub
	c.mu.Unlock()
}

func (c *Client) HasPublicKey() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.pub) == ed25519.PublicKeySize
}

func (c *Client) Store(ent Entitlement) {
	c.mu.Lock()
	c.ent = ent
	c.ok = true
	path := c.path
	c.mu.Unlock()
	if path != "" {
		_ = c.Save(path)
	}
}

// StoreSigned checks the controller signature, then caches the entitlement.
func (c *Client) StoreSigned(packed string) error {
	c.mu.RLock()
	pub := c.pub
	c.mu.RUnlock()
	if len(pub) != ed25519.PublicKeySize {
		return errors.New("license public key is not configured")
	}
	ent, err := Verify(pub, packed)
	if err != nil {
		return err
	}
	c.Store(ent)
	return nil
}

func (c *Client) Load(path string) error {
	c.mu.Lock()
	c.path = path
	c.mu.Unlock()
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var ent Entitlement
	if err := json.Unmarshal(b, &ent); err != nil {
		return err
	}
	c.mu.Lock()
	c.ent = ent
	c.ok = true
	c.mu.Unlock()
	return nil
}

func (c *Client) Save(path string) error {
	c.mu.Lock()
	c.path = path
	ent := c.ent
	c.mu.Unlock()
	b, err := json.MarshalIndent(ent, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0600)
}

func (c *Client) Current() (Entitlement, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.ent, c.ok
}

// Allow reports whether a capability may start. A missing entitlement allows
// use so a deployment that has not configured a license keeps working.
// An expired entitlement past grace blocks session capabilities.
func (c *Client) Allow(feature string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if !c.ok {
		return true
	}
	if c.ent.Status == "active" || time.Now().Before(c.ent.GraceUntil) && c.ent.Status != "expired" {
		return true
	}
	if c.ent.Status == "expired" && time.Now().Before(c.ent.GraceUntil) {
		return true
	}
	switch feature {
	case "ssh", "rdp", "transfer", "ai", "clone", "tunnel":
		return false
	default:
		return true
	}
}
