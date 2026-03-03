package session

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Recorder writes terminal output in asciicast v2 format (NDJSON).
// Each line after the header is [elapsed_seconds, "o", "data"].
type Recorder struct {
	file      *os.File
	startTime time.Time
	mu        sync.Mutex
}

type asciicastHeader struct {
	Version   int   `json:"version"`
	Width     int   `json:"width"`
	Height    int   `json:"height"`
	Timestamp int64 `json:"timestamp"`
}

// unsafeChars matches characters not safe for filenames.
var unsafeChars = regexp.MustCompile(`[^a-zA-Z0-9._-]`)

// RecordingFilename builds a recording filename in the format:
// <instanceID>-<instanceName>-<DD-MMM-YYYY-HH-MM-SS>.<ext>
func RecordingFilename(instanceID, instanceName, ext string) string {
	safe := strings.TrimSpace(instanceName)
	safe = unsafeChars.ReplaceAllString(safe, "-")
	if safe == "" || safe == "-" {
		safe = "unknown"
	}
	ts := time.Now().Format("02-Jan-2006-15-04-05")
	return fmt.Sprintf("%s-%s-%s.%s", instanceID, safe, ts, ext)
}

// NewRecorder creates a .cast file and writes the asciicast v2 header.
func NewRecorder(dir, instanceID, instanceName string, cols, rows int) (*Recorder, error) {
	filename := RecordingFilename(instanceID, instanceName, "cast")
	path := filepath.Join(dir, filename)

	f, err := os.Create(path)
	if err != nil {
		return nil, fmt.Errorf("create recording file: %w", err)
	}

	now := time.Now()
	header := asciicastHeader{
		Version:   2,
		Width:     cols,
		Height:    rows,
		Timestamp: now.Unix(),
	}
	headerBytes, _ := json.Marshal(header)
	headerBytes = append(headerBytes, '\n')
	if _, err := f.Write(headerBytes); err != nil {
		f.Close()
		return nil, fmt.Errorf("write header: %w", err)
	}

	return &Recorder{
		file:      f,
		startTime: now,
	}, nil
}

// Write records a chunk of terminal output with its timestamp.
func (r *Recorder) Write(data []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.file == nil {
		return
	}

	elapsed := time.Since(r.startTime).Seconds()
	// Asciicast v2 event: [elapsed, "o", "escaped_data"]
	escaped, _ := json.Marshal(string(data))
	line := fmt.Sprintf("[%.6f, \"o\", %s]\n", elapsed, escaped)
	r.file.WriteString(line)
}

// WriteResize records a terminal resize event.
func (r *Recorder) WriteResize(cols, rows int) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.file == nil {
		return
	}

	elapsed := time.Since(r.startTime).Seconds()
	line := fmt.Sprintf("[%.6f, \"r\", \"%dx%d\"]\n", elapsed, cols, rows)
	r.file.WriteString(line)
}

// Close flushes and closes the recording file.
func (r *Recorder) Close() {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.file != nil {
		r.file.Close()
		r.file = nil
	}
}

// Filename returns the path of the recording file.
func (r *Recorder) Filename() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.file == nil {
		return ""
	}
	return r.file.Name()
}
