package suggest

import "testing"

func TestStripANSIColors(t *testing.T) {
	input := []byte("\x1b[32mhello\x1b[0m world")
	got := string(StripANSI(input))
	if got != "hello world" {
		t.Errorf("expected 'hello world', got %q", got)
	}
}

func TestStripANSICursor(t *testing.T) {
	input := []byte("\x1b[2J\x1b[H$ ls -la")
	got := string(StripANSI(input))
	if got != "$ ls -la" {
		t.Errorf("expected '$ ls -la', got %q", got)
	}
}

func TestStripANSIOSC(t *testing.T) {
	input := []byte("\x1b]0;title\x07real text")
	got := string(StripANSI(input))
	if got != "real text" {
		t.Errorf("expected 'real text', got %q", got)
	}
}

func TestStripANSIPreservesUnicode(t *testing.T) {
	input := []byte("\x1b[1m日本語\x1b[0m")
	got := string(StripANSI(input))
	if got != "日本語" {
		t.Errorf("expected '日本語', got %q", got)
	}
}

func TestStripANSIPlainText(t *testing.T) {
	input := []byte("no escape sequences here")
	got := string(StripANSI(input))
	if got != "no escape sequences here" {
		t.Errorf("expected unchanged, got %q", got)
	}
}

func TestStripANSIPreservesNewlines(t *testing.T) {
	input := []byte("\x1b[32mline1\n\x1b[0mline2\r\nline3")
	got := string(StripANSI(input))
	if got != "line1\nline2\r\nline3" {
		t.Errorf("expected newlines preserved, got %q", got)
	}
}
