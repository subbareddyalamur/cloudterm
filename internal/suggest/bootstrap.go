package suggest

import (
	_ "embed"
	"encoding/json"
)

//go:embed data/bootstrap_commands.json
var bootstrapData []byte

type bootstrapEntry struct {
	Cmd      string  `json:"cmd"`
	Category string  `json:"cat"`
	Score    float64 `json:"s"`
}

func (e *Engine) loadBootstrap() {
	if e.trie.Size() > 0 {
		return
	}
	var entries []bootstrapEntry
	if err := json.Unmarshal(bootstrapData, &entries); err != nil {
		e.logger.Printf("failed to load bootstrap: %v", err)
		return
	}
	for _, entry := range entries {
		e.trie.Insert(entry.Cmd, entry.Score)
	}
	e.logger.Printf("loaded %d bootstrap commands", len(entries))
}
