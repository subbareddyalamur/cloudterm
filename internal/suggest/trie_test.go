package suggest

import (
	"encoding/json"
	"sync"
	"testing"
)

func TestTrieInsertAndSearch(t *testing.T) {
	tr := NewTrie()
	tr.Insert("git status", 10)
	tr.Insert("git push", 8)
	tr.Insert("git pull", 7)
	tr.Insert("git stash", 5)
	tr.Insert("kubectl get pods", 6)

	results := tr.Search("git ", 10)
	if len(results) != 4 {
		t.Fatalf("expected 4 results, got %d", len(results))
	}
	if results[0].Text != "git status" {
		t.Errorf("expected first result 'git status', got %q", results[0].Text)
	}
	if results[0].Source != "trie" || results[0].MatchType != "prefix" {
		t.Errorf("expected source=trie matchType=prefix, got %s/%s", results[0].Source, results[0].MatchType)
	}

	results = tr.Search("git p", 1)
	if len(results) != 1 {
		t.Fatalf("expected 1 result with limit=1, got %d", len(results))
	}
	if results[0].Text != "git push" {
		t.Errorf("expected 'git push', got %q", results[0].Text)
	}

	results = tr.Search("kubectl", 10)
	if len(results) != 1 || results[0].Text != "kubectl get pods" {
		t.Errorf("kubectl search failed: %v", results)
	}

	results = tr.Search("nonexistent", 10)
	if len(results) != 0 {
		t.Errorf("expected 0 results for nonexistent, got %d", len(results))
	}
}

func TestTrieUpdate(t *testing.T) {
	tr := NewTrie()
	tr.Insert("git status", 5)
	tr.Insert("git status", 15)

	if tr.Size() != 1 {
		t.Fatalf("expected size 1 after update, got %d", tr.Size())
	}
	results := tr.Search("git s", 1)
	if len(results) != 1 || results[0].Score != 15 {
		t.Errorf("expected updated score 15, got %v", results)
	}
}

func TestTrieRemove(t *testing.T) {
	tr := NewTrie()
	tr.Insert("git status", 10)
	tr.Insert("git push", 8)
	tr.Remove("git status")

	if tr.Size() != 1 {
		t.Fatalf("expected size 1 after remove, got %d", tr.Size())
	}
	results := tr.Search("git s", 10)
	if len(results) != 0 {
		t.Errorf("expected 0 results after remove, got %d", len(results))
	}
	results = tr.Search("git p", 10)
	if len(results) != 1 {
		t.Errorf("expected 1 result, got %d", len(results))
	}
}

func TestTrieSerialize(t *testing.T) {
	tr := NewTrie()
	tr.Insert("git status", 10)
	tr.Insert("git push", 8)
	tr.Insert("ls -la", 5)

	data, err := json.Marshal(tr)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	tr2 := NewTrie()
	if err := json.Unmarshal(data, tr2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if tr2.Size() != 3 {
		t.Fatalf("expected size 3 after unmarshal, got %d", tr2.Size())
	}
	results := tr2.Search("git", 10)
	if len(results) != 2 {
		t.Errorf("expected 2 git results after unmarshal, got %d", len(results))
	}
}

func TestTrieConcurrency(t *testing.T) {
	tr := NewTrie()
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(2)
		go func(n int) {
			defer wg.Done()
			tr.Insert("cmd"+string(rune('a'+n%26)), float64(n))
		}(i)
		go func() {
			defer wg.Done()
			tr.Search("cmd", 5)
		}()
	}
	wg.Wait()
	if tr.Size() == 0 {
		t.Error("expected non-zero size after concurrent inserts")
	}
}

func TestTrieEmpty(t *testing.T) {
	tr := NewTrie()
	results := tr.Search("anything", 10)
	if results != nil && len(results) != 0 {
		t.Errorf("expected nil or empty on empty trie, got %v", results)
	}
}

func TestTrieCaseInsensitive(t *testing.T) {
	tr := NewTrie()
	tr.Insert("Git Status", 10)
	results := tr.Search("git s", 10)
	if len(results) != 1 {
		t.Fatalf("expected case-insensitive match, got %d results", len(results))
	}
	if results[0].Text != "Git Status" {
		t.Errorf("expected original case preserved, got %q", results[0].Text)
	}
}
