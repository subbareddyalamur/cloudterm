package aws

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"
)

// ManualAccount represents an AWS account added via the UI with explicit credentials.
type ManualAccount struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	AccessKeyID     string `json:"access_key_id"`
	SecretAccessKey string `json:"secret_access_key"`
	SessionToken    string `json:"session_token,omitempty"`
	AddedAt         string `json:"added_at"`
}

// AccountStore manages manually-added AWS accounts, persisted to a JSON file.
type AccountStore struct {
	path     string
	accounts []ManualAccount
	mu       sync.RWMutex
}

// NewAccountStore creates an AccountStore backed by the given file path.
func NewAccountStore(path string) *AccountStore {
	s := &AccountStore{path: path}
	s.load()
	return s
}

// ListRaw returns all stored accounts with full credentials (for internal use).
func (s *AccountStore) ListRaw() []ManualAccount {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]ManualAccount, len(s.accounts))
	copy(out, s.accounts)
	return out
}

// List returns all stored accounts with secret keys masked.
func (s *AccountStore) List() []ManualAccount {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]ManualAccount, len(s.accounts))
	for i, a := range s.accounts {
		out[i] = a
		if len(a.SecretAccessKey) > 4 {
			out[i].SecretAccessKey = "****" + a.SecretAccessKey[len(a.SecretAccessKey)-4:]
		} else {
			out[i].SecretAccessKey = "****"
		}
		if a.SessionToken != "" {
			out[i].SessionToken = "****"
		}
	}
	return out
}

// Get returns a single account by ID (unmasked).
func (s *AccountStore) Get(id string) (ManualAccount, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, a := range s.accounts {
		if a.ID == id {
			return a, true
		}
	}
	return ManualAccount{}, false
}

// Add stores a new manual account and persists to disk.
func (s *AccountStore) Add(name, accessKey, secretKey, sessionToken string) (ManualAccount, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id, err := randomID()
	if err != nil {
		return ManualAccount{}, err
	}

	acct := ManualAccount{
		ID:              id,
		Name:            name,
		AccessKeyID:     accessKey,
		SecretAccessKey: secretKey,
		SessionToken:    sessionToken,
		AddedAt:         time.Now().UTC().Format(time.RFC3339),
	}
	s.accounts = append(s.accounts, acct)
	return acct, s.save()
}

// Remove deletes an account by ID and persists to disk.
func (s *AccountStore) Remove(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, a := range s.accounts {
		if a.ID == id {
			s.accounts = append(s.accounts[:i], s.accounts[i+1:]...)
			return s.save()
		}
	}
	return fmt.Errorf("account %s not found", id)
}

func (s *AccountStore) load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	var accounts []ManualAccount
	if json.Unmarshal(data, &accounts) == nil {
		s.accounts = accounts
	}
}

func (s *AccountStore) save() error {
	data, err := json.MarshalIndent(s.accounts, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0600)
}

func randomID() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
