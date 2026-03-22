package suggest

import (
	"regexp"
	"strings"
	"sync"
	"time"
)

var defaultPromptRE = regexp.MustCompile(`[$#%>]\s*$`)

// Observer watches terminal I/O and extracts commands and output.
type Observer struct {
	mu            sync.Mutex
	outputCh      chan []byte
	currentInput  strings.Builder
	lastCommand   string
	lastOutput    strings.Builder
	prevCmdOutput string
	prevCmdOK     bool
	promptRE      *regexp.Regexp
	onCommand     func(cmd string, output string)
	onError       func(output string)
	commandActive bool
	idleTimer     *time.Timer
	done          chan struct{}
}

// NewObserver creates a terminal observer with the given callbacks.
func NewObserver(onCommand func(cmd, output string), onError func(output string)) *Observer {
	o := &Observer{
		outputCh:  make(chan []byte, 256),
		promptRE:  defaultPromptRE,
		onCommand: onCommand,
		onError:   onError,
		done:      make(chan struct{}),
	}
	go o.processLoop()
	return o
}

// FeedOutput sends PTY output to the observer. Non-blocking — drops if channel full.
func (o *Observer) FeedOutput(data []byte) {
	cp := make([]byte, len(data))
	copy(cp, data)
	select {
	case o.outputCh <- cp:
	default:
	}
}

// FeedInput notifies the observer of user input. Detects Enter key to mark command boundaries.
func (o *Observer) FeedInput(data []byte) {
	o.mu.Lock()
	defer o.mu.Unlock()
	for _, b := range data {
		if b == 0x0d || b == 0x0a {
			cmd := strings.TrimSpace(o.currentInput.String())
			if cmd != "" {
				o.lastCommand = cmd
				o.commandActive = true
				o.lastOutput.Reset()
			}
			o.currentInput.Reset()
		} else if b == 0x7f || b == 0x08 {
			s := o.currentInput.String()
			if len(s) > 0 {
				o.currentInput.Reset()
				o.currentInput.WriteString(s[:len(s)-1])
			}
		} else if b >= 0x20 {
			o.currentInput.WriteByte(b)
		}
	}
}

// CurrentLine returns what the user has typed so far (since last Enter).
func (o *Observer) CurrentLine() string {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.currentInput.String()
}

// Close stops the observer.
func (o *Observer) Close() {
	close(o.done)
}

// LastErrorOutput returns the previous command's output if it contained an error.
func (o *Observer) LastErrorOutput() string {
	o.mu.Lock()
	defer o.mu.Unlock()
	if containsErrorSignal(o.prevCmdOutput) {
		return o.prevCmdOutput
	}
	return ""
}

// WasErrorResolved returns true if the previous error was followed by a successful command.
func (o *Observer) WasErrorResolved() (errorOutput string, resolutionCmd string, resolved bool) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.prevCmdOK && o.prevCmdOutput != "" {
		resolved = true
		errorOutput = o.prevCmdOutput
		resolutionCmd = o.lastCommand
		o.prevCmdOK = false
	}
	return
}

func (o *Observer) processLoop() {
	for {
		select {
		case <-o.done:
			return
		case data := <-o.outputCh:
			o.processOutput(data)
		}
	}
}

func (o *Observer) processOutput(raw []byte) {
	cleaned := string(StripANSI(raw))
	o.mu.Lock()

	if o.commandActive {
		o.lastOutput.WriteString(cleaned)

		if o.idleTimer != nil {
			o.idleTimer.Stop()
		}
		o.idleTimer = time.AfterFunc(500*time.Millisecond, func() {
			o.mu.Lock()
			cmd := o.lastCommand
			output := o.lastOutput.String()
			hadError := containsErrorSignal(output)
			o.commandActive = false
			o.lastOutput.Reset()

			if o.prevCmdOutput != "" && !hadError && cmd != "" {
				o.prevCmdOK = true
			}

			o.prevCmdOutput = output
			o.mu.Unlock()

			if o.onCommand != nil && cmd != "" {
				o.onCommand(cmd, output)
			}
			if o.onError != nil && hadError {
				o.onError(output)
			}
		})
	}
	o.mu.Unlock()
}

// ContainsErrorSignal checks if output contains common error indicators.
func ContainsErrorSignal(output string) bool {
	return containsErrorSignal(output)
}

func containsErrorSignal(output string) bool {
	lower := strings.ToLower(output)
	signals := []string{
		"error", "fatal", "panic", "traceback",
		"permission denied", "command not found",
		"no such file", "connection refused",
		"failed", "segmentation fault",
	}
	for _, s := range signals {
		if strings.Contains(lower, s) {
			return true
		}
	}
	return false
}
