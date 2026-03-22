package suggest

import (
	"os"
	"testing"

	"cloudterm-go/internal/crypto"
)

func TestStoreCommandAndQuery(t *testing.T) {
	dir := t.TempDir()
	key, _ := crypto.GenerateKey()
	s, err := OpenStore(dir, key)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer s.Close()

	s.StoreCommand("dev", "git status", CommandMeta{Command: "git status", ExitCode: 0, CWD: "/app"})
	s.StoreCommand("dev", "git push", CommandMeta{Command: "git push", ExitCode: 0, CWD: "/app"})
	s.StoreCommand("dev", "kubectl get pods", CommandMeta{Command: "kubectl get pods", ExitCode: 0})
	s.StoreCommand("dev", "git status", CommandMeta{Command: "git status", ExitCode: 0})

	results, err := s.QueryByPrefix("dev", "git", 10)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 git results, got %d", len(results))
	}

	found := false
	for _, r := range results {
		if r.Command == "git status" && r.Count == 2 {
			found = true
		}
	}
	if !found {
		t.Error("expected 'git status' with count=2")
	}

	results, err = s.QueryByPrefix("dev", "kubectl", 10)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if len(results) != 1 {
		t.Errorf("expected 1 kubectl result, got %d", len(results))
	}

	results, err = s.QueryByPrefix("prod", "git", 10)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for prod env, got %d", len(results))
	}
}

func TestStorePersistence(t *testing.T) {
	dir := t.TempDir()
	key, _ := crypto.GenerateKey()

	s, _ := OpenStore(dir, key)
	s.StoreCommand("dev", "ls -la", CommandMeta{Command: "ls -la"})
	s.Close()

	s2, _ := OpenStore(dir, key)
	defer s2.Close()
	results, _ := s2.QueryByPrefix("dev", "ls", 10)
	if len(results) != 1 || results[0].Command != "ls -la" {
		t.Errorf("persistence failed: %v", results)
	}
}

func TestStoreEncryption(t *testing.T) {
	dir := t.TempDir()
	key, _ := crypto.GenerateKey()

	s, _ := OpenStore(dir, key)
	s.StoreCommand("dev", "mycmd", CommandMeta{Command: "mycmd", CWD: "/very/secret/path/unique123"})
	s.Close()

	raw, err := os.ReadFile(dir + "/suggest.db")
	if err != nil {
		t.Fatalf("read db: %v", err)
	}
	needle := "unique123"
	for i := range raw {
		if i+len(needle) <= len(raw) && string(raw[i:i+len(needle)]) == needle {
			t.Error("plaintext value data found in encrypted DB — values should be encrypted")
			break
		}
	}
}

func TestStoreFrecencyRoundTrip(t *testing.T) {
	dir := t.TempDir()
	key, _ := crypto.GenerateKey()
	s, _ := OpenStore(dir, key)
	defer s.Close()

	data := []byte(`[{"cmd":"git status","freq":5}]`)
	if err := s.StoreFrecency("dev", data); err != nil {
		t.Fatalf("store frecency: %v", err)
	}
	loaded, err := s.LoadFrecency("dev")
	if err != nil {
		t.Fatalf("load frecency: %v", err)
	}
	if string(loaded) != string(data) {
		t.Errorf("frecency roundtrip failed: got %s", string(loaded))
	}
}

func TestStoreNoEncryptionKey(t *testing.T) {
	dir := t.TempDir()
	s, _ := OpenStore(dir, nil)
	defer s.Close()

	s.StoreCommand("dev", "plain-cmd", CommandMeta{Command: "plain-cmd"})
	results, _ := s.QueryByPrefix("dev", "plain", 10)
	if len(results) != 1 {
		t.Errorf("expected 1 result without encryption, got %d", len(results))
	}
}

func TestStoreBlobRoundTrip(t *testing.T) {
	dir := t.TempDir()
	key, _ := crypto.GenerateKey()
	s, _ := OpenStore(dir, key)
	defer s.Close()

	data := []byte(`{"test": true}`)
	s.StoreBlob("mybucket", "mykey", data)
	loaded, _ := s.LoadBlob("mybucket", "mykey")
	if string(loaded) != string(data) {
		t.Errorf("blob roundtrip failed: got %s", string(loaded))
	}
}
