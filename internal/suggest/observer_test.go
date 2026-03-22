package suggest

import (
	"sync"
	"testing"
	"time"
)

func TestObserverFeedInputTracksLine(t *testing.T) {
	obs := NewObserver(nil, nil)
	defer obs.Close()

	obs.FeedInput([]byte("git sta"))
	if got := obs.CurrentLine(); got != "git sta" {
		t.Errorf("expected 'git sta', got %q", got)
	}

	obs.FeedInput([]byte{0x7f})
	if got := obs.CurrentLine(); got != "git st" {
		t.Errorf("expected 'git st' after backspace, got %q", got)
	}

	obs.FeedInput([]byte{0x0d})
	if got := obs.CurrentLine(); got != "" {
		t.Errorf("expected empty after Enter, got %q", got)
	}
}

func TestObserverNonBlocking(t *testing.T) {
	obs := NewObserver(nil, nil)
	defer obs.Close()

	bigData := make([]byte, 10000)
	for i := range bigData {
		bigData[i] = 'x'
	}
	for i := 0; i < 500; i++ {
		obs.FeedOutput(bigData)
	}
}

func TestObserverErrorCallback(t *testing.T) {
	var mu sync.Mutex
	var errorOutput string

	obs := NewObserver(nil, func(output string) {
		mu.Lock()
		errorOutput = output
		mu.Unlock()
	})
	defer obs.Close()

	obs.FeedInput([]byte("bad-cmd\r"))
	obs.FeedOutput([]byte("bash: bad-cmd: command not found\n"))

	time.Sleep(700 * time.Millisecond)

	mu.Lock()
	got := errorOutput
	mu.Unlock()

	if got == "" {
		t.Error("expected error callback to fire")
	}
}

func TestObserverCommandCallback(t *testing.T) {
	var mu sync.Mutex
	var cmdOutput string

	obs := NewObserver(func(cmd, output string) {
		mu.Lock()
		cmdOutput = output
		mu.Unlock()
	}, nil)
	defer obs.Close()

	obs.FeedInput([]byte("ls\r"))
	obs.FeedOutput([]byte("file1.txt\nfile2.txt\n"))

	time.Sleep(700 * time.Millisecond)

	mu.Lock()
	got := cmdOutput
	mu.Unlock()

	if got == "" {
		t.Error("expected command callback to fire with output")
	}
}

func TestObserverPasteDetection(t *testing.T) {
	obs := NewObserver(nil, nil)
	defer obs.Close()

	paste := make([]byte, 300)
	for i := range paste {
		paste[i] = 'a'
	}
	obs.FeedInput(paste)
	line := obs.CurrentLine()
	if len(line) != 300 {
		t.Errorf("expected 300 char line, got %d", len(line))
	}
}
