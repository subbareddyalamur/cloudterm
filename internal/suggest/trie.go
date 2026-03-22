package suggest

import (
	"encoding/json"
	"sort"
	"strings"
	"sync"
)

// Trie is a thread-safe compressed radix trie for command prefix lookup.
type Trie struct {
	mu   sync.RWMutex
	root *trieNode
	size int
}

type trieNode struct {
	children map[byte]*trieNode
	key      string
	score    float64
	terminal bool
}

// NewTrie creates an empty trie.
func NewTrie() *Trie {
	return &Trie{root: &trieNode{children: make(map[byte]*trieNode)}}
}

// Insert adds or updates a command with the given score.
func (t *Trie) Insert(command string, score float64) {
	t.mu.Lock()
	defer t.mu.Unlock()
	node := t.root
	for _, ch := range []byte(strings.ToLower(command)) {
		if node.children[ch] == nil {
			node.children[ch] = &trieNode{children: make(map[byte]*trieNode)}
		}
		node = node.children[ch]
	}
	if !node.terminal {
		t.size++
	}
	node.terminal = true
	node.key = command
	node.score = score
}

// Search returns up to limit suggestions matching the prefix, sorted by score descending.
func (t *Trie) Search(prefix string, limit int) []Suggestion {
	t.mu.RLock()
	defer t.mu.RUnlock()

	node := t.root
	for _, ch := range []byte(strings.ToLower(prefix)) {
		node = node.children[ch]
		if node == nil {
			return nil
		}
	}

	var results []Suggestion
	t.collect(node, &results)
	sort.Slice(results, func(i, j int) bool { return results[i].Score > results[j].Score })
	if limit > 0 && len(results) > limit {
		results = results[:limit]
	}
	return results
}

func (t *Trie) collect(node *trieNode, results *[]Suggestion) {
	if node == nil {
		return
	}
	if node.terminal {
		*results = append(*results, Suggestion{
			Text:      node.key,
			Score:     node.score,
			Source:    "trie",
			MatchType: "prefix",
		})
	}
	for _, child := range node.children {
		t.collect(child, results)
	}
}

// Remove deletes a command from the trie.
func (t *Trie) Remove(command string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	node := t.root
	for _, ch := range []byte(strings.ToLower(command)) {
		node = node.children[ch]
		if node == nil {
			return
		}
	}
	if node.terminal {
		node.terminal = false
		node.key = ""
		node.score = 0
		t.size--
	}
}

// Size returns the number of entries.
func (t *Trie) Size() int {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.size
}

type trieEntry struct {
	Key   string  `json:"k"`
	Score float64 `json:"s"`
}

// MarshalJSON serializes the trie to JSON.
func (t *Trie) MarshalJSON() ([]byte, error) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	var entries []trieEntry
	t.marshalCollect(t.root, &entries)
	return json.Marshal(entries)
}

func (t *Trie) marshalCollect(node *trieNode, entries *[]trieEntry) {
	if node == nil {
		return
	}
	if node.terminal {
		*entries = append(*entries, trieEntry{Key: node.key, Score: node.score})
	}
	for _, child := range node.children {
		t.marshalCollect(child, entries)
	}
}

// UnmarshalJSON deserializes the trie from JSON.
func (t *Trie) UnmarshalJSON(data []byte) error {
	var entries []trieEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return err
	}
	t.mu.Lock()
	t.root = &trieNode{children: make(map[byte]*trieNode)}
	t.size = 0
	t.mu.Unlock()
	for _, e := range entries {
		t.Insert(e.Key, e.Score)
	}
	return nil
}
