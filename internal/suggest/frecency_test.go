package suggest

import (
	"encoding/json"
	"sync"
	"testing"
	"time"
)

func TestFrecencyRecord(t *testing.T) {
	f := NewFrecency(100)
	f.Record("git status")
	f.Record("git status")
	f.Record("git push")

	if f.Len() != 2 {
		t.Fatalf("expected 2 entries, got %d", f.Len())
	}
	if s := f.Score("git status"); s <= f.Score("git push") {
		t.Errorf("expected 'git status' (freq=2) > 'git push' (freq=1), got %f vs %f", s, f.Score("git push"))
	}
}

func TestFrecencyScore(t *testing.T) {
	f := NewFrecency(100)
	f.Record("old cmd")

	f.mu.Lock()
	f.entries["old cmd"].LastUsed = time.Now().Add(-7 * 24 * time.Hour)
	f.mu.Unlock()

	f.Record("new cmd")

	oldScore := f.Score("old cmd")
	newScore := f.Score("new cmd")
	if newScore <= oldScore {
		t.Errorf("recent command should score higher: new=%f old=%f", newScore, oldScore)
	}
}

func TestFrecencyTopN(t *testing.T) {
	f := NewFrecency(100)
	for i := 0; i < 20; i++ {
		cmd := "git " + string(rune('a'+i%26))
		for j := 0; j <= i; j++ {
			f.Record(cmd)
		}
	}
	f.Record("kubectl get pods")

	results := f.TopN("git ", 5)
	if len(results) != 5 {
		t.Fatalf("expected 5 results, got %d", len(results))
	}
	if results[0].Source != "frecency" {
		t.Errorf("expected source=frecency, got %s", results[0].Source)
	}
	for i := 1; i < len(results); i++ {
		if results[i].Score > results[i-1].Score {
			t.Errorf("results not sorted: [%d]=%f > [%d]=%f", i, results[i].Score, i-1, results[i-1].Score)
		}
	}

	results = f.TopN("kubectl", 10)
	if len(results) != 1 {
		t.Errorf("expected 1 kubectl result, got %d", len(results))
	}
}

func TestFrecencyEviction(t *testing.T) {
	f := NewFrecency(5)
	for i := 0; i < 10; i++ {
		f.Record("cmd" + string(rune('a'+i)))
	}
	if f.Len() != 5 {
		t.Fatalf("expected 5 entries after eviction, got %d", f.Len())
	}
}

func TestFrecencySerialize(t *testing.T) {
	f := NewFrecency(100)
	f.Record("git status")
	f.Record("git status")
	f.Record("ls -la")

	data, err := json.Marshal(f)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	f2 := NewFrecency(100)
	if err := json.Unmarshal(data, f2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if f2.Len() != 2 {
		t.Fatalf("expected 2 entries after unmarshal, got %d", f2.Len())
	}
	if f2.Score("git status") == 0 {
		t.Error("expected non-zero score for 'git status' after unmarshal")
	}
}

func TestFrecencyConcurrency(t *testing.T) {
	f := NewFrecency(1000)
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(2)
		go func(n int) {
			defer wg.Done()
			f.Record("cmd" + string(rune('a'+n%26)))
		}(i)
		go func() {
			defer wg.Done()
			f.TopN("cmd", 5)
		}()
	}
	wg.Wait()
	if f.Len() == 0 {
		t.Error("expected non-zero entries after concurrent ops")
	}
}
