package suggest

import (
	"encoding/json"
	"math"
	"sort"
	"strings"
	"sync"
	"time"
)

const defaultHalfLifeHours = 168.0 // 1 week

// Frecency scores commands by frequency weighted by recency.
type Frecency struct {
	mu         sync.RWMutex
	entries    map[string]*frecencyEntry
	maxEntries int
}

type frecencyEntry struct {
	Command   string    `json:"cmd"`
	Frequency int       `json:"freq"`
	LastUsed  time.Time `json:"last"`
}

// NewFrecency creates a frecency scorer with the given capacity.
func NewFrecency(maxEntries int) *Frecency {
	if maxEntries <= 0 {
		maxEntries = 10000
	}
	return &Frecency{
		entries:    make(map[string]*frecencyEntry),
		maxEntries: maxEntries,
	}
}

// Record increments frequency and updates last-used time for a command.
func (f *Frecency) Record(command string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	key := strings.ToLower(command)
	if e, ok := f.entries[key]; ok {
		e.Frequency++
		e.LastUsed = time.Now()
		e.Command = command
		return
	}
	if len(f.entries) >= f.maxEntries {
		f.evictLowest()
	}
	f.entries[key] = &frecencyEntry{
		Command:   command,
		Frequency: 1,
		LastUsed:  time.Now(),
	}
}

// Score returns the frecency score for a command.
func (f *Frecency) Score(command string) float64 {
	f.mu.RLock()
	defer f.mu.RUnlock()
	e, ok := f.entries[strings.ToLower(command)]
	if !ok {
		return 0
	}
	return f.score(e)
}

func (f *Frecency) score(e *frecencyEntry) float64 {
	hoursSince := time.Since(e.LastUsed).Hours()
	recencyWeight := 1.0 / (1.0 + hoursSince/defaultHalfLifeHours)
	return float64(e.Frequency) * recencyWeight
}

// TopN returns the top N entries matching the prefix, sorted by score.
func (f *Frecency) TopN(prefix string, n int) []Suggestion {
	f.mu.RLock()
	defer f.mu.RUnlock()
	lowerPrefix := strings.ToLower(prefix)
	var matches []Suggestion
	for key, e := range f.entries {
		if strings.HasPrefix(key, lowerPrefix) {
			matches = append(matches, Suggestion{
				Text:      e.Command,
				Score:     f.score(e),
				Source:    "frecency",
				MatchType: "prefix",
			})
		}
	}
	sort.Slice(matches, func(i, j int) bool { return matches[i].Score > matches[j].Score })
	if n > 0 && len(matches) > n {
		matches = matches[:n]
	}
	return matches
}

// Len returns the number of entries.
func (f *Frecency) Len() int {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return len(f.entries)
}

func (f *Frecency) evictLowest() {
	var lowestKey string
	lowestScore := math.MaxFloat64
	for key, e := range f.entries {
		s := f.score(e)
		if s < lowestScore {
			lowestScore = s
			lowestKey = key
		}
	}
	if lowestKey != "" {
		delete(f.entries, lowestKey)
	}
}

// MarshalJSON serializes the frecency data.
func (f *Frecency) MarshalJSON() ([]byte, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	entries := make([]*frecencyEntry, 0, len(f.entries))
	for _, e := range f.entries {
		entries = append(entries, e)
	}
	return json.Marshal(entries)
}

// UnmarshalJSON deserializes frecency data.
func (f *Frecency) UnmarshalJSON(data []byte) error {
	var entries []*frecencyEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.entries = make(map[string]*frecencyEntry, len(entries))
	for _, e := range entries {
		f.entries[strings.ToLower(e.Command)] = e
	}
	return nil
}
