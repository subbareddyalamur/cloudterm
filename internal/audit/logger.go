package audit

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

type AuditEvent struct {
	Timestamp    string `json:"timestamp"`
	Action       string `json:"action"`
	InstanceID   string `json:"instance_id,omitempty"`
	InstanceName string `json:"instance_name,omitempty"`
	Profile      string `json:"profile,omitempty"`
	Region       string `json:"region,omitempty"`
	Details      string `json:"details,omitempty"`
}

type Logger struct {
	path string
	mu   sync.Mutex
}

func NewLogger(path string) *Logger {
	return &Logger{path: path}
}

func (l *Logger) Log(event AuditEvent) {
	if event.Timestamp == "" {
		event.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	line, err := json.Marshal(event)
	if err != nil {
		return
	}
	line = append(line, '\n')

	l.mu.Lock()
	defer l.mu.Unlock()

	f, err := os.OpenFile(l.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	f.Write(line)
}

func (l *Logger) Recent(limit, offset int) []AuditEvent {
	l.mu.Lock()
	defer l.mu.Unlock()

	data, err := os.ReadFile(l.path)
	if err != nil {
		return nil
	}

	lines := splitNonEmpty(data)
	// Reverse so newest is first
	for i, j := 0, len(lines)-1; i < j; i, j = i+1, j-1 {
		lines[i], lines[j] = lines[j], lines[i]
	}

	if offset >= len(lines) {
		return nil
	}
	end := offset + limit
	if end > len(lines) {
		end = len(lines)
	}
	slice := lines[offset:end]

	var events []AuditEvent
	for _, line := range slice {
		var ev AuditEvent
		if err := json.Unmarshal(line, &ev); err == nil {
			events = append(events, ev)
		}
	}
	return events
}

func splitNonEmpty(data []byte) [][]byte {
	var result [][]byte
	start := 0
	for i := 0; i < len(data); i++ {
		if data[i] == '\n' {
			if i > start {
				result = append(result, data[start:i])
			}
			start = i + 1
		}
	}
	if start < len(data) {
		result = append(result, data[start:])
	}
	return result
}
