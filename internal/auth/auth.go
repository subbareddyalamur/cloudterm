// Package auth signs people in to CloudTerm: local accounts (including the
// break-glass admin) and OIDC single sign-on. Sessions are HMAC-signed tokens
// carried in an HttpOnly cookie, with an absolute lifetime, an idle timeout,
// and server-side revocation.
package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type Role string

const (
	RoleAdmin    Role = "admin"
	RoleOperator Role = "operator"
	RoleViewer   Role = "viewer"
)

// Sign-in methods recorded on the session and in the audit log.
const (
	MethodPassword   = "password"
	MethodBreakGlass = "break_glass"
	MethodSSO        = "sso"
)

type User struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	Name         string `json:"name"`
	Role         Role   `json:"role"`
	TenantID     string `json:"tenant_id"`
	Provider     string `json:"provider,omitempty"` // "local" or "sso:<provider id>"
	Subject      string `json:"subject,omitempty"`  // OIDC sub
	Disabled     bool   `json:"disabled,omitempty"`
	PasswordHash string `json:"password_hash,omitempty"`
	// Password is read only to migrate files written before hashing; it is never written.
	Password string `json:"password,omitempty"`
}

// Public is the user as the browser may see it.
func (u User) Public() User {
	u.PasswordHash = ""
	u.Password = ""
	return u
}

type Claims struct {
	UserID    string `json:"uid"`
	Email     string `json:"email"`
	Name      string `json:"name,omitempty"`
	Role      Role   `json:"role"`
	TenantID  string `json:"tid"`
	Method    string `json:"amr"`
	Provider  string `json:"pvd,omitempty"` // "local" or "sso:<provider id>"
	SessionID string `json:"sid"`
	IssuedAt  int64  `json:"iat"`
	Exp       int64  `json:"exp"`
}

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrLocked             = errors.New("too many failed attempts; try again later")
	ErrDisabled           = errors.New("account disabled")
	ErrSessionEnded       = errors.New("session ended")
)

const (
	maxFailures  = 5
	lockoutAfter = 15 * time.Minute
)

type failure struct {
	count int
	first time.Time
	until time.Time
}

type Service struct {
	secret []byte
	path   string
	db     *sql.DB
	mu     sync.Mutex
	users  []User

	maxAge time.Duration
	idle   time.Duration

	failures map[string]*failure
	revoked  map[string]time.Time // sid -> token expiry
	lastSeen map[string]time.Time // sid -> last request
	// idTokens holds the OIDC ID token of a session so sign-out can offer the
	// IdP an id_token_hint. Like the other session maps it lives in-process.
	idTokens map[string]string

	// InitialAdminPassword is set when the break-glass admin was created with a
	// generated password. The caller prints it once.
	InitialAdminPassword string
}

// Options tunes session lifetime. Zero values fall back to 8h absolute and 60m idle.
type Options struct {
	MaxAge time.Duration
	Idle   time.Duration
}

func newService(secret []byte, opt Options) *Service {
	if opt.MaxAge <= 0 {
		opt.MaxAge = 8 * time.Hour
	}
	if opt.Idle <= 0 {
		opt.Idle = 60 * time.Minute
	}
	return &Service{
		secret:   secret,
		maxAge:   opt.MaxAge,
		idle:     opt.Idle,
		failures: map[string]*failure{},
		revoked:  map[string]time.Time{},
		lastSeen: map[string]time.Time{},
		idTokens: map[string]string{},
	}
}

// LoadSecret returns AUTH_SECRET when set, otherwise a random key persisted at
// keyPath (0600) so sessions survive a restart. There is no built-in default.
func LoadSecret(envSecret, keyPath string) ([]byte, error) {
	if envSecret != "" {
		if len(envSecret) < 32 {
			return nil, errors.New("AUTH_SECRET must be at least 32 characters")
		}
		return []byte(envSecret), nil
	}
	if b, err := os.ReadFile(keyPath); err == nil {
		key, err := hex.DecodeString(strings.TrimSpace(string(b)))
		if err == nil && len(key) >= 32 {
			return key, nil
		}
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	if err := os.WriteFile(keyPath, []byte(hex.EncodeToString(key)), 0600); err != nil {
		return nil, err
	}
	return key, nil
}

// Open loads users from a JSON file, migrating any plaintext passwords to bcrypt.
func Open(path string, secret []byte, opt Options) (*Service, error) {
	if len(secret) < 32 {
		return nil, errors.New("auth secret must be at least 32 bytes")
	}
	s := newService(secret, opt)
	s.path = path
	if b, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(b, &s.users); err != nil {
			return nil, err
		}
	}
	changed, err := s.prepareUsers()
	if err != nil {
		return nil, err
	}
	if changed {
		if err := s.save(); err != nil {
			return nil, err
		}
	}
	return s, nil
}

// prepareUsers hashes legacy plaintext passwords and seeds the break-glass admin.
func (s *Service) prepareUsers() (bool, error) {
	changed := false
	for i := range s.users {
		if s.users[i].Password != "" && s.users[i].PasswordHash == "" {
			h, err := hashPassword(s.users[i].Password)
			if err != nil {
				return false, err
			}
			s.users[i].PasswordHash = h
			changed = true
		}
		if s.users[i].Password != "" {
			s.users[i].Password = ""
			changed = true
		}
		if s.users[i].Provider == "" {
			s.users[i].Provider = "local"
			changed = true
		}
	}
	if len(s.users) == 0 {
		pw := os.Getenv("CLOUDTERM_ADMIN_PASSWORD")
		if pw == "" {
			pw = randomPassword()
			s.InitialAdminPassword = pw
		}
		h, err := hashPassword(pw)
		if err != nil {
			return false, err
		}
		s.users = []User{{
			ID: "admin", Email: "admin@local", Name: "Break-glass admin",
			Role: RoleAdmin, TenantID: "local", Provider: "local", PasswordHash: h,
		}}
		changed = true
	}
	return changed, nil
}

func randomPassword() string {
	b := make([]byte, 15)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashPassword(pw string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(pw), 12)
	return string(h), err
}

// dummyHash keeps a missing-user login as slow as a wrong password.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("cloudterm-timing-guard"), 12)

func (s *Service) save() error {
	if s.db != nil {
		return s.saveDB()
	}
	stored := make([]User, len(s.users))
	for i, u := range s.users {
		u.Password = ""
		stored[i] = u
	}
	b, err := json.MarshalIndent(stored, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, b, 0600)
}

// Login checks a local password. key identifies the caller for lockout (email + IP).
func (s *Service) Login(email, password, key string) (User, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	lockKey := email + "|" + key
	s.mu.Lock()
	if f := s.failures[lockKey]; f != nil && time.Now().Before(f.until) {
		s.mu.Unlock()
		return User{}, ErrLocked
	}
	var found *User
	for i := range s.users {
		if strings.EqualFold(s.users[i].Email, email) && s.users[i].Provider == "local" {
			u := s.users[i]
			found = &u
			break
		}
	}
	s.mu.Unlock()

	hash := dummyHash
	if found != nil && found.PasswordHash != "" {
		hash = []byte(found.PasswordHash)
	}
	ok := bcrypt.CompareHashAndPassword(hash, []byte(password)) == nil && found != nil

	s.mu.Lock()
	defer s.mu.Unlock()
	if !ok {
		f := s.failures[lockKey]
		if f == nil || time.Since(f.first) > lockoutAfter {
			f = &failure{first: time.Now()}
			s.failures[lockKey] = f
		}
		f.count++
		if f.count >= maxFailures {
			f.until = time.Now().Add(lockoutAfter)
			return User{}, ErrLocked
		}
		return User{}, ErrInvalidCredentials
	}
	delete(s.failures, lockKey)
	if found.Disabled {
		return User{}, ErrDisabled
	}
	return found.Public(), nil
}

// UpsertSSOUser creates or updates the CloudTerm user for one IdP subject.
// The same email from two providers stays two users, so a weaker IdP can never
// take over an account. The role always comes from the IdP's groups at sign-in.
func (s *Service) UpsertSSOUser(providerID, issuer, subject, email, name string, role Role, tenantID string) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if tenantID == "" {
		tenantID = "local"
	}
	id := "sso:" + providerID + ":" + shortHash(issuer+"|"+subject)
	provider := "sso:" + providerID
	for i := range s.users {
		if s.users[i].ID == id {
			if s.users[i].Disabled {
				return User{}, ErrDisabled
			}
			s.users[i].Email, s.users[i].Name, s.users[i].Role, s.users[i].TenantID = email, name, role, tenantID
			if err := s.save(); err != nil {
				return User{}, err
			}
			return s.users[i].Public(), nil
		}
	}
	u := User{ID: id, Email: email, Name: name, Role: role, TenantID: tenantID, Provider: provider, Subject: subject}
	s.users = append(s.users, u)
	if err := s.save(); err != nil {
		return User{}, err
	}
	return u, nil
}

func shortHash(v string) string {
	sum := sha256.Sum256([]byte(v))
	return hex.EncodeToString(sum[:8])
}

func (s *Service) AddUser(u User, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if u.ID == "" {
		u.ID = u.Email
	}
	if u.TenantID == "" {
		u.TenantID = "local"
	}
	if u.Role == "" {
		u.Role = RoleOperator
	}
	if u.Provider == "" {
		u.Provider = "local"
	}
	if password != "" {
		h, err := hashPassword(password)
		if err != nil {
			return err
		}
		u.PasswordHash = h
	}
	u.Password = ""
	s.users = append(s.users, u)
	return s.save()
}

// Issue signs a session for a user. The lifetime is capped by the service's max age.
func (s *Service) Issue(u User, method string) (string, Claims, error) {
	now := time.Now()
	sid := make([]byte, 16)
	if _, err := rand.Read(sid); err != nil {
		return "", Claims{}, err
	}
	c := Claims{
		UserID: u.ID, Email: u.Email, Name: u.Name, Role: u.Role, TenantID: u.TenantID,
		Method: method, Provider: u.Provider, SessionID: hex.EncodeToString(sid),
		IssuedAt: now.Unix(), Exp: now.Add(s.maxAge).Unix(),
	}
	tok, err := s.sign(c)
	if err != nil {
		return "", Claims{}, err
	}
	s.mu.Lock()
	s.lastSeen[c.SessionID] = now
	s.mu.Unlock()
	return tok, c, nil
}

// MaxAge is the absolute session lifetime.
func (s *Service) MaxAge() time.Duration { return s.maxAge }

func (s *Service) sign(c Claims) (string, error) {
	payload, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	body := base64.RawURLEncoding.EncodeToString(payload)
	return body + "." + s.mac(body), nil
}

func (s *Service) mac(body string) string {
	m := hmac.New(sha256.New, s.secret)
	_, _ = m.Write([]byte(body))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// signedValueTTL is how long a SignValue cookie stays valid on the server,
// independent of the cookie's MaxAge: even a copied value stops working after
// this window. It sits above the 600s MaxAge the handlers set on the SSO
// cookies so that, in normal operation, the cookie expires first.
const signedValueTTL = 15 * time.Minute

// signedValue wraps a small cookie payload with its expiry, the way a
// short-lived token does. Only the HMAC key can mint one.
type signedValue struct {
	Value string `json:"v"`
	Exp   int64  `json:"e"`
}

// SignValue and VerifyValue protect small cookies such as the OIDC login state.
func (s *Service) SignValue(v string) string {
	return s.signValue(v, time.Now().Add(signedValueTTL))
}

func (s *Service) signValue(v string, expires time.Time) string {
	payload, err := json.Marshal(signedValue{Value: v, Exp: expires.Unix()})
	if err != nil {
		return "" // unreachable: a struct of a string and an int64
	}
	body := base64.RawURLEncoding.EncodeToString(payload)
	return body + "." + s.mac(body)
}

func (s *Service) VerifyValue(signed string) (string, bool) {
	body, sig, ok := strings.Cut(signed, ".")
	if !ok || !hmac.Equal([]byte(sig), []byte(s.mac(body))) {
		return "", false
	}
	raw, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return "", false
	}
	var sv signedValue
	if err := json.Unmarshal(raw, &sv); err != nil || time.Now().Unix() > sv.Exp {
		return "", false
	}
	return sv.Value, true
}

// Parse validates a session token and records activity for the idle timeout.
func (s *Service) Parse(token string) (Claims, error) {
	body, sig, ok := strings.Cut(token, ".")
	if !ok || strings.Contains(sig, ".") {
		return Claims{}, errors.New("malformed token")
	}
	if !hmac.Equal([]byte(sig), []byte(s.mac(body))) {
		return Claims{}, errors.New("bad signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return Claims{}, err
	}
	var c Claims
	if err := json.Unmarshal(raw, &c); err != nil {
		return Claims{}, err
	}
	now := time.Now()
	if now.Unix() > c.Exp {
		return Claims{}, ErrSessionEnded
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, gone := s.revoked[c.SessionID]; gone {
		return Claims{}, ErrSessionEnded
	}
	if seen, ok := s.lastSeen[c.SessionID]; ok && now.Sub(seen) > s.idle {
		s.revoked[c.SessionID] = time.Unix(c.Exp, 0)
		s.dropSessionLocked(c.SessionID)
		return Claims{}, ErrSessionEnded
	}
	u, ok := s.userLocked(c.UserID)
	if !ok || u.Disabled {
		return Claims{}, ErrDisabled
	}
	// The role follows the user record, not the token, so a demotion made at
	// the IdP (at her next sign-in) or by an admin applies to a live session
	// on its very next request instead of at session expiry.
	c.Role = u.Role
	s.lastSeen[c.SessionID] = now
	s.pruneLocked(now)
	return c, nil
}

// StashIDToken keeps the OIDC ID token of a session for the id_token_hint on
// sign-out. It is dropped with the session and never persisted.
func (s *Service) StashIDToken(sid, rawIDToken string) {
	s.mu.Lock()
	s.idTokens[sid] = rawIDToken
	s.mu.Unlock()
}

// GetIDToken returns the stashed ID token for a session, if any.
func (s *Service) GetIDToken(sid string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	tok, ok := s.idTokens[sid]
	return tok, ok
}

// dropSessionLocked forgets everything this process tracks about a session.
func (s *Service) dropSessionLocked(sid string) {
	delete(s.lastSeen, sid)
	delete(s.idTokens, sid)
}

// userLocked finds a user by id. The caller must hold s.mu.
func (s *Service) userLocked(uid string) (User, bool) {
	for i := range s.users {
		if s.users[i].ID == uid {
			return s.users[i], true
		}
	}
	return User{}, false
}

func (s *Service) pruneLocked(now time.Time) {
	for sid, exp := range s.revoked {
		if now.After(exp) {
			delete(s.revoked, sid)
		}
	}
}

// Revoke ends a session immediately (sign-out).
func (s *Service) Revoke(c Claims) {
	s.mu.Lock()
	s.revoked[c.SessionID] = time.Unix(c.Exp, 0)
	s.dropSessionLocked(c.SessionID)
	s.mu.Unlock()
}

// User returns the stored record for a user id, if it still exists.
func (s *Service) User(uid string) (User, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.userLocked(uid)
}
