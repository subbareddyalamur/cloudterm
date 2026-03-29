package suggest

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"cloudterm-go/internal/crypto"
	bolt "go.etcd.io/bbolt"
)

// Store provides encrypted persistence via bbolt.
type Store struct {
	db  *bolt.DB
	key []byte
}

// CommandMeta holds metadata for a stored command.
type CommandMeta struct {
	Command   string    `json:"cmd"`
	ExitCode  int       `json:"exit"`
	CWD       string    `json:"cwd"`
	Timestamp time.Time `json:"ts"`
	Count     int       `json:"n"`
}

// OpenStore opens or creates the bbolt database at dataDir/suggest.db.
func OpenStore(dataDir string, encryptionKey []byte) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	dbPath := filepath.Join(dataDir, "suggest.db")
	db, err := bolt.Open(dbPath, 0600, &bolt.Options{Timeout: 2 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("open bbolt: %w", err)
	}
	return &Store{db: db, key: encryptionKey}, nil
}

// Close closes the database.
func (s *Store) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

func (s *Store) bucketName(env, category string) []byte {
	return []byte(category + ":" + env)
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

// StoreCommand saves a command with metadata.
func (s *Store) StoreCommand(env, cmd string, meta CommandMeta) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b, err := tx.CreateBucketIfNotExists(s.bucketName(env, "commands"))
		if err != nil {
			return err
		}
		existing := b.Get([]byte(cmd))
		if existing != nil {
			decrypted, err := s.decrypt(existing)
			if err == nil {
				var m CommandMeta
				if json.Unmarshal(decrypted, &m) == nil {
					meta.Count = m.Count + 1
				}
			}
		}
		if meta.Count == 0 {
			meta.Count = 1
		}
		data, err := json.Marshal(meta)
		if err != nil {
			return err
		}
		enc, err := s.encrypt(data)
		if err != nil {
			return err
		}
		return b.Put([]byte(cmd), enc)
	})
}

// QueryByPrefix returns commands matching the prefix in the given environment.
func (s *Store) QueryByPrefix(env, prefix string, limit int) ([]CommandMeta, error) {
	var results []CommandMeta
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(s.bucketName(env, "commands"))
		if b == nil {
			return nil
		}
		c := b.Cursor()
		pfx := []byte(prefix)
		for k, v := c.Seek(pfx); k != nil; k, v = c.Next() {
			if len(k) < len(pfx) || string(k[:len(pfx)]) != prefix {
				break
			}
			decrypted, err := s.decrypt(v)
			if err != nil {
				continue
			}
			var m CommandMeta
			if json.Unmarshal(decrypted, &m) == nil {
				results = append(results, m)
			}
			if limit > 0 && len(results) >= limit {
				break
			}
		}
		return nil
	})
	return results, err
}

// StoreFrecency persists frecency data for an environment.
func (s *Store) StoreFrecency(env string, data []byte) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b, err := tx.CreateBucketIfNotExists(s.bucketName(env, "frecency"))
		if err != nil {
			return err
		}
		enc, err := s.encrypt(data)
		if err != nil {
			return err
		}
		return b.Put([]byte("data"), enc)
	})
}

// LoadFrecency loads frecency data for an environment.
func (s *Store) LoadFrecency(env string) ([]byte, error) {
	var result []byte
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(s.bucketName(env, "frecency"))
		if b == nil {
			return nil
		}
		v := b.Get([]byte("data"))
		if v == nil {
			return nil
		}
		dec, err := s.decrypt(v)
		if err != nil {
			return err
		}
		result = make([]byte, len(dec))
		copy(result, dec)
		return nil
	})
	return result, err
}

// BrowseEntry holds a key-value pair from browsing the DB.
type BrowseEntry struct {
	Key       string `json:"key"`
	Value     string `json:"value"`
	Encrypted bool   `json:"encrypted"`
}

// BrowseBucket holds bucket metadata and entries.
type BrowseBucket struct {
	Name    string        `json:"name"`
	Count   int           `json:"count"`
	Entries []BrowseEntry `json:"entries,omitempty"`
}

// Browse returns all buckets and their decrypted contents.
func (s *Store) Browse() []BrowseBucket {
	if s == nil || s.db == nil {
		return nil
	}
	var buckets []BrowseBucket
	s.db.View(func(tx *bolt.Tx) error {
		return tx.ForEach(func(name []byte, b *bolt.Bucket) error {
			bi := BrowseBucket{Name: string(name)}
			b.ForEach(func(k, v []byte) error {
				bi.Count++
				e := BrowseEntry{Key: string(k), Encrypted: true}
				dec, err := s.decrypt(v)
				if err == nil {
					e.Value = string(dec)
					e.Encrypted = false
				} else {
					e.Value = fmt.Sprintf("[encrypted, %d bytes]", len(v))
				}
				bi.Entries = append(bi.Entries, e)
				return nil
			})
			buckets = append(buckets, bi)
			return nil
		})
	})
	return buckets
}

// StoreBlob saves arbitrary encrypted data under a bucket/key.
func (s *Store) StoreBlob(bucket, key string, data []byte) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b, err := tx.CreateBucketIfNotExists([]byte(bucket))
		if err != nil {
			return err
		}
		enc, err := s.encrypt(data)
		if err != nil {
			return err
		}
		return b.Put([]byte(key), enc)
	})
}

// LoadBlob loads encrypted data from a bucket/key.
func (s *Store) LoadBlob(bucket, key string) ([]byte, error) {
	var result []byte
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucket))
		if b == nil {
			return nil
		}
		v := b.Get([]byte(key))
		if v == nil {
			return nil
		}
		dec, err := s.decrypt(v)
		if err != nil {
			return err
		}
		result = make([]byte, len(dec))
		copy(result, dec)
		return nil
	})
	return result, err
}
