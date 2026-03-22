// Package suggest provides an embedded, self-learning intelligence engine
// for terminal command autocomplete, autosuggestions, and log analysis.
package suggest

import (
	"encoding/json"
	"log"
	"sort"
	"strings"
	"sync"
	"time"
)

// Suggestion represents a single autocomplete suggestion.
type Suggestion struct {
	Text      string  `json:"text"`
	Score     float64 `json:"score"`
	Source    string  `json:"source"`
	MatchType string  `json:"match_type"`
}

// LogInsight represents an error analysis result.
type LogInsight struct {
	ErrorSummary string  `json:"error_summary"`
	SuggestedFix string  `json:"suggested_fix"`
	Confidence   float64 `json:"confidence"`
	Pattern      string  `json:"pattern"`
}

// Config holds suggest engine configuration.
type Config struct {
	Enabled       bool
	DataDir       string
	EncryptionKey []byte
}

// Engine orchestrates all suggestion components.
type Engine struct {
	mu       sync.RWMutex
	config   Config
	store    *Store
	trie     *Trie
	frecency *Frecency
	mlp      *MLP
	errorKB  *ErrorKB
	enabled  map[string]bool
	cmdCount int
	logger   *log.Logger
}

// New creates a new suggestion engine.
func New(cfg Config) (*Engine, error) {
	e := &Engine{
		config:  cfg,
		enabled: make(map[string]bool),
		logger:  log.New(log.Writer(), "[suggest] ", log.LstdFlags),
	}
	if !cfg.Enabled {
		return e, nil
	}

	store, err := OpenStore(cfg.DataDir, cfg.EncryptionKey)
	if err != nil {
		return e, err
	}
	e.store = store
	e.trie = NewTrie()
	e.frecency = NewFrecency(10000)
	e.mlp = NewMLP()
	e.errorKB = NewErrorKB()

	e.loadPersistedState()
	e.loadBootstrap()
	return e, nil
}

func (e *Engine) loadPersistedState() {
	if e.store == nil {
		return
	}

	if data, err := e.store.LoadBlob("engine", "trie"); err == nil && data != nil {
		json.Unmarshal(data, e.trie)
	}
	if data, err := e.store.LoadBlob("engine", "frecency"); err == nil && data != nil {
		json.Unmarshal(data, e.frecency)
	}
	if data, err := e.store.LoadBlob("engine", "mlp"); err == nil && data != nil {
		json.Unmarshal(data, e.mlp)
	}
}

func (e *Engine) persistState() {
	if e.store == nil {
		return
	}
	if data, err := json.Marshal(e.trie); err == nil {
		e.store.StoreBlob("engine", "trie", data)
	}
	if data, err := json.Marshal(e.frecency); err == nil {
		e.store.StoreBlob("engine", "frecency", data)
	}
	if data, err := json.Marshal(e.mlp); err == nil {
		e.store.StoreBlob("engine", "mlp", data)
	}
}

// Close shuts down the engine and persists state.
func (e *Engine) Close() error {
	e.persistState()
	if e.store != nil {
		return e.store.Close()
	}
	return nil
}

// Suggest returns ranked suggestions for the given input.
func (e *Engine) Suggest(sessionID, env, currentLine, lastCmd string, limit int) []Suggestion {
	defer func() {
		if r := recover(); r != nil {
			e.logger.Printf("panic in Suggest: %v", r)
		}
	}()
	if !e.isEnabled(sessionID) || currentLine == "" || len(currentLine) > 200 {
		return nil
	}
	if limit <= 0 {
		limit = 5
	}

	trieResults := e.trie.Search(currentLine, limit*2)
	frecResults := e.frecency.TopN(currentLine, limit*2)

	merged := make(map[string]*Suggestion)
	for _, s := range trieResults {
		s2 := s
		merged[strings.ToLower(s.Text)] = &s2
	}
	for _, s := range frecResults {
		key := strings.ToLower(s.Text)
		if existing, ok := merged[key]; ok {
			existing.Score = existing.Score*0.4 + s.Score*0.6
			existing.Source = "combined"
		} else {
			s2 := s
			merged[key] = &s2
		}
	}

	results := make([]Suggestion, 0, len(merged))
	for _, s := range merged {
		results = append(results, *s)
	}
	sort.Slice(results, func(i, j int) bool { return results[i].Score > results[j].Score })
	if len(results) > limit {
		results = results[:limit]
	}
	return results
}

// LearnCommand records a command execution for self-learning.
func (e *Engine) LearnCommand(env, cmd string, exitCode int, cwd string) {
	defer func() {
		if r := recover(); r != nil {
			e.logger.Printf("panic in LearnCommand: %v", r)
		}
	}()
	if !e.config.Enabled || cmd == "" {
		return
	}

	e.trie.Insert(cmd, float64(e.frecency.Score(cmd)+1))
	e.frecency.Record(cmd)

	if e.store != nil {
		e.store.StoreCommand(env, cmd, CommandMeta{
			Command:   cmd,
			ExitCode:  exitCode,
			CWD:       cwd,
			Timestamp: time.Now(),
		})
	}

	e.mu.Lock()
	e.cmdCount++
	shouldPersist := e.cmdCount%100 == 0
	e.mu.Unlock()

	if shouldPersist {
		go e.persistState()
	}
}

// AnalyzeOutput checks terminal output for error patterns.
func (e *Engine) AnalyzeOutput(env, output string) []LogInsight {
	defer func() {
		if r := recover(); r != nil {
			e.logger.Printf("panic in AnalyzeOutput: %v", r)
		}
	}()
	if !e.config.Enabled || e.errorKB == nil {
		return nil
	}

	insights := e.errorKB.DetectErrors(output)
	if fix := e.errorKB.SuggestFix(output); fix != nil {
		insights = append(insights, *fix)
	}
	return insights
}

// LearnResolution records that an error was resolved by a command.
func (e *Engine) LearnResolution(errorOutput, resolutionCmd string) {
	defer func() {
		if r := recover(); r != nil {
			e.logger.Printf("panic in LearnResolution: %v", r)
		}
	}()
	if !e.config.Enabled || e.errorKB == nil {
		return
	}
	e.errorKB.RecordResolution(errorOutput, resolutionCmd)
	e.logger.Printf("learned resolution: %q -> %q", truncate(errorOutput, 80), resolutionCmd)
}

// SetEnabled toggles suggestions for a specific session.
func (e *Engine) SetEnabled(sessionID string, enabled bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.enabled[sessionID] = enabled
}

func (e *Engine) isEnabled(sessionID string) bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	if !e.config.Enabled {
		return false
	}
	if v, ok := e.enabled[sessionID]; ok {
		return v
	}
	return true
}

// Stats returns engine statistics.
func (e *Engine) Stats() map[string]interface{} {
	return map[string]interface{}{
		"enabled":          e.config.Enabled,
		"trie_size":        e.trie.Size(),
		"frecency_size":    e.frecency.Len(),
		"error_kb_learned": e.errorKB.LearnedCount(),
		"commands_learned": e.cmdCount,
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
