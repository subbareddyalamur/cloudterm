package vault

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"cloudterm-go/internal/crypto"
	bolt "go.etcd.io/bbolt"
)

var bucketName = []byte("vault")

// MatchRule defines how a credential maps to instances.
type MatchRule struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Value    string `json:"value"`
	Label    string `json:"label"`
	Priority int    `json:"priority"`
}

// RDPCredential holds RDP connection credentials.
type RDPCredential struct {
	Username string `json:"username"`
	Password string `json:"password,omitempty"`
	Domain   string `json:"domain,omitempty"`
	Security string `json:"security"`
}

// VaultEntry is a stored credential with metadata.
type VaultEntry struct {
	Rule       MatchRule     `json:"rule"`
	Credential RDPCredential `json:"credential"`
	CreatedAt  time.Time     `json:"created_at"`
	UpdatedAt  time.Time     `json:"updated_at"`
}

// Store provides encrypted credential storage.
type Store struct {
	db  *bolt.DB
	key []byte
}

// Open opens or creates the vault database.
func Open(dataDir string, encryptionKey []byte) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, fmt.Errorf("create vault dir: %w", err)
	}
	dbPath := filepath.Join(dataDir, "vault.db")
	db, err := bolt.Open(dbPath, 0600, &bolt.Options{Timeout: 2 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("open vault db: %w", err)
	}
	return &Store{db: db, key: encryptionKey}, nil
}

// Close closes the vault database.
func (s *Store) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

func (s *Store) encrypt(data []byte) ([]byte, error) {
	if len(s.key) == 0 {
		return data, nil
	}
	return crypto.Encrypt(s.key, data)
}

func (s *Store) decrypt(data []byte) ([]byte, error) {
	if len(s.key) == 0 {
		return data, nil
	}
	return crypto.Decrypt(s.key, data)
}

// Save stores a credential entry.
func (s *Store) Save(entry VaultEntry) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b, err := tx.CreateBucketIfNotExists(bucketName)
		if err != nil {
			return err
		}
		if entry.CreatedAt.IsZero() {
			entry.CreatedAt = time.Now()
		}
		entry.UpdatedAt = time.Now()
		data, err := json.Marshal(entry)
		if err != nil {
			return err
		}
		enc, err := s.encrypt(data)
		if err != nil {
			return err
		}
		return b.Put([]byte(entry.Rule.ID), enc)
	})
}

// Get retrieves a credential entry by rule ID.
func (s *Store) Get(id string) (*VaultEntry, error) {
	var entry VaultEntry
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketName)
		if b == nil {
			return fmt.Errorf("not found")
		}
		v := b.Get([]byte(id))
		if v == nil {
			return fmt.Errorf("not found")
		}
		dec, err := s.decrypt(v)
		if err != nil {
			return err
		}
		return json.Unmarshal(dec, &entry)
	})
	if err != nil {
		return nil, err
	}
	return &entry, nil
}

// Delete removes a credential entry.
func (s *Store) Delete(id string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketName)
		if b == nil {
			return nil
		}
		return b.Delete([]byte(id))
	})
}

// List returns all entries with passwords redacted.
func (s *Store) List() []VaultEntry {
	var entries []VaultEntry
	s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketName)
		if b == nil {
			return nil
		}
		return b.ForEach(func(k, v []byte) error {
			dec, err := s.decrypt(v)
			if err != nil {
				return nil
			}
			var e VaultEntry
			if json.Unmarshal(dec, &e) == nil {
				e.Credential.Password = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
				entries = append(entries, e)
			}
			return nil
		})
	})
	return entries
}

// FindMatch checks the match hierarchy for a matching credential.
func (s *Store) FindMatch(instanceID, instanceName, env, accountID string) (*VaultEntry, error) {
	all := s.listUnredacted()
	sort.Slice(all, func(i, j int) bool { return all[i].Rule.Priority < all[j].Rule.Priority })

	for _, entry := range all {
		switch entry.Rule.Type {
		case "instance":
			if entry.Rule.Value == instanceID {
				return &entry, nil
			}
		case "substring":
			if strings.Contains(strings.ToLower(instanceName), strings.ToLower(entry.Rule.Value)) {
				return &entry, nil
			}
		case "pattern":
			matched, _ := filepath.Match(entry.Rule.Value, instanceName)
			if matched {
				return &entry, nil
			}
		case "environment":
			if strings.EqualFold(entry.Rule.Value, env) {
				return &entry, nil
			}
		case "account":
			if entry.Rule.Value == accountID {
				return &entry, nil
			}
		case "global":
			return &entry, nil
		}
	}
	return nil, fmt.Errorf("no match")
}

func (s *Store) listUnredacted() []VaultEntry {
	var entries []VaultEntry
	s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketName)
		if b == nil {
			return nil
		}
		return b.ForEach(func(k, v []byte) error {
			dec, err := s.decrypt(v)
			if err != nil {
				return nil
			}
			var e VaultEntry
			if json.Unmarshal(dec, &e) == nil {
				entries = append(entries, e)
			}
			return nil
		})
	})
	return entries
}
