package session

import (
	"bytes"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
)

// ansiRegex matches ANSI escape sequences: CSI, OSC, and charset sequences.
var ansiRegex = regexp.MustCompile(`\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Za-z0-9]`)

// stripANSI removes ANSI escape sequences from raw terminal output.
func stripANSI(data []byte) []byte {
	cleaned := ansiRegex.ReplaceAll(data, nil)
	// Normalize line endings: \r\n → \n, then strip remaining \r.
	cleaned = bytes.ReplaceAll(cleaned, []byte("\r\n"), []byte("\n"))
	cleaned = bytes.ReplaceAll(cleaned, []byte("\r"), []byte(""))
	return cleaned
}

const maxOutputBuf = 512 * 1024 // 512 KB output buffer per session (for reconnect replay)

// ssmKeepaliveInterval is how often we check whether an SSM session has been
// idle. If no user input has been received for this duration, a null byte is
// written to the PTY so that AWS SSM does not consider the session idle and
// terminate it (default SSM idle timeout is 20 min).
const ssmKeepaliveInterval = 5 * time.Minute

// SSMSession represents a single SSM terminal session backed by a PTY.
type SSMSession struct {
	InstanceID   string
	InstanceName string
	SessionID    string
	cmd          *exec.Cmd
	ptmx         *os.File
	done         chan struct{}
	onOutput     func([]byte)
	outputBuf    bytes.Buffer
	recorder     *Recorder
	lastInput    time.Time // last time user sent input
	mu           sync.Mutex
}

// Manager tracks all active SSM sessions.
type Manager struct {
	sessions     map[string]*SSMSession
	mu           sync.RWMutex
	logger       *log.Logger
	recordingDir string
	autoRecord   bool
}

// NewManager creates a Manager with the given logger.
func NewManager(logger *log.Logger, recordingDir string, autoRecord bool) *Manager {
	return &Manager{
		sessions:     make(map[string]*SSMSession),
		logger:       logger,
		recordingDir: recordingDir,
		autoRecord:   autoRecord,
	}
}

// AWSCreds holds explicit AWS credentials for manual accounts.
// When nil, the session uses --profile instead.
type AWSCreds struct {
	AccessKeyID     string
	SecretAccessKey string
	SessionToken    string
}

// StartSession launches an aws ssm start-session process inside a PTY and
// begins streaming its output through onOutput.
// If creds is non-nil, the credentials are passed via environment variables
// instead of --profile (used for manually-added AWS accounts).
func (m *Manager) StartSession(instanceID, instanceName, sessionID, awsProfile, awsRegion string, creds *AWSCreds, onOutput func([]byte)) error {
	// Atomic check-and-reserve under a full write lock to prevent a TOCTOU
	// race where two concurrent start_session messages both pass the check.
	m.mu.Lock()
	existing, exists := m.sessions[sessionID]
	if exists && existing != nil {
		m.mu.Unlock()
		// Session already running — rebind its output to the new connection
		// (the old WebSocket may have been closed and reconnected).
		existing.mu.Lock()
		existing.onOutput = onOutput
		existing.mu.Unlock()
		m.logger.Printf("session %s already active, rebound output to new connection", sessionID)
		// Replay the buffered output so the reconnected client can catch up.
		existing.mu.Lock()
		replay := make([]byte, existing.outputBuf.Len())
		copy(replay, existing.outputBuf.Bytes())
		existing.mu.Unlock()
		if len(replay) > 0 {
			onOutput(replay)
		}
		return nil
	}
	if exists && existing == nil {
		// Slot reserved by a concurrent StartSession in progress — treat as duplicate.
		m.mu.Unlock()
		m.logger.Printf("session %s start already in progress, ignoring duplicate", sessionID)
		return nil
	}
	// Reserve the slot immediately so no second goroutine can race past this point.
	m.sessions[sessionID] = nil
	m.mu.Unlock()

	var cmd *exec.Cmd
	if creds != nil {
		cmd = exec.Command("aws", "ssm", "start-session",
			"--target", instanceID,
			"--region", awsRegion,
		)
		cmd.Env = append(os.Environ(),
			"AWS_ACCESS_KEY_ID="+creds.AccessKeyID,
			"AWS_SECRET_ACCESS_KEY="+creds.SecretAccessKey,
			"AWS_DEFAULT_REGION="+awsRegion,
			"TERM=xterm-256color",
			"COLORTERM=truecolor",
		)
		if creds.SessionToken != "" {
			cmd.Env = append(cmd.Env, "AWS_SESSION_TOKEN="+creds.SessionToken)
		}
	} else {
		cmd = exec.Command("aws", "ssm", "start-session",
			"--target", instanceID,
			"--profile", awsProfile,
			"--region", awsRegion,
		)
	}

	if cmd.Env == nil {
		cmd.Env = os.Environ()
	}
	cmd.Env = append(cmd.Env, "TERM=xterm-256color", "COLORTERM=truecolor")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	ptmx, err := pty.Start(cmd)
	if err != nil {
		// Release the reserved slot so the session ID can be retried.
		m.mu.Lock()
		delete(m.sessions, sessionID)
		m.mu.Unlock()
		return fmt.Errorf("failed to start pty: %w", err)
	}

	s := &SSMSession{
		InstanceID:   instanceID,
		InstanceName: instanceName,
		SessionID:    sessionID,
		cmd:          cmd,
		ptmx:         ptmx,
		done:         make(chan struct{}),
		onOutput:     onOutput,
		lastInput:    time.Now(),
	}

	// Auto-start recording if enabled.
	if m.autoRecord && m.recordingDir != "" {
		rec, err := NewRecorder(m.recordingDir, instanceID, instanceName, 80, 24)
		if err != nil {
			m.logger.Printf("failed to start recording for %s: %v", sessionID, err)
		} else {
			s.recorder = rec
			m.logger.Printf("recording started for session %s", sessionID)
		}
	}

	m.mu.Lock()
	m.sessions[sessionID] = s
	m.mu.Unlock()

	go s.readLoop(m.logger)
	go s.ssmKeepalive(m.logger)

	m.logger.Printf("session %s started for instance %s", sessionID, instanceID)
	return nil
}

// WriteInput sends raw bytes (keystrokes) into the session's PTY.
func (m *Manager) WriteInput(sessionID string, data []byte) error {
	s, ok := m.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.ptmx == nil {
		return fmt.Errorf("session %s pty closed", sessionID)
	}

	s.lastInput = time.Now()
	_, err := s.ptmx.Write(data)
	return err
}

// SendInterrupt sends SIGINT to the process group of the session.
func (m *Manager) SendInterrupt(sessionID string) error {
	s, ok := m.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.cmd == nil || s.cmd.Process == nil {
		return fmt.Errorf("session %s process not running", sessionID)
	}

	// Negative PID signals the entire process group.
	return syscall.Kill(-s.cmd.Process.Pid, syscall.SIGINT)
}

// ResizeTerminal resizes the PTY window for the given session.
func (m *Manager) ResizeTerminal(sessionID string, rows, cols uint16) error {
	s, ok := m.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.ptmx == nil {
		return fmt.Errorf("session %s pty closed", sessionID)
	}

	if err := pty.Setsize(s.ptmx, &pty.Winsize{Rows: rows, Cols: cols}); err != nil {
		return err
	}
	if s.recorder != nil {
		s.recorder.WriteResize(int(cols), int(rows))
	}
	return nil
}

// CloseSession tears down a single session by ID.
func (m *Manager) CloseSession(sessionID string) error {
	m.mu.Lock()
	s, ok := m.sessions[sessionID]
	if !ok || s == nil {
		m.mu.Unlock()
		return fmt.Errorf("session %s not found", sessionID)
	}
	delete(m.sessions, sessionID)
	m.mu.Unlock()

	s.Close()
	m.logger.Printf("session %s closed", sessionID)
	return nil
}

// CloseAll shuts down every active session. Intended for graceful shutdown.
func (m *Manager) CloseAll() {
	m.mu.Lock()
	sessions := make(map[string]*SSMSession, len(m.sessions))
	for k, v := range m.sessions {
		sessions[k] = v
	}
	m.sessions = make(map[string]*SSMSession)
	m.mu.Unlock()

	for id, s := range sessions {
		if s == nil {
			continue
		}
		s.Close()
		m.logger.Printf("session %s closed (shutdown)", id)
	}
}

// GetSession returns the session for the given ID, if it exists and is fully initialised.
func (m *Manager) GetSession(sessionID string) (*SSMSession, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sessions[sessionID]
	return s, ok && s != nil
}

// ExportSession writes the output buffer of a session to a file and returns the filename.
func (m *Manager) ExportSession(sessionID, exportDir string) (string, error) {
	s, ok := m.GetSession(sessionID)
	if !ok {
		return "", fmt.Errorf("session %s not found", sessionID)
	}

	s.mu.Lock()
	raw := make([]byte, s.outputBuf.Len())
	copy(raw, s.outputBuf.Bytes())
	s.mu.Unlock()

	// Strip ANSI escape sequences so the export reads like plain terminal text.
	data := stripANSI(raw)

	filename := fmt.Sprintf("%s_%d.log", sessionID, time.Now().Unix())
	path := filepath.Join(exportDir, filename)
	if err := os.WriteFile(path, data, 0644); err != nil {
		return "", fmt.Errorf("failed to write export: %w", err)
	}

	m.logger.Printf("session %s exported to %s (%d bytes)", sessionID, filename, len(data))
	return filename, nil
}

// StartRecording begins recording a session (if not already recording).
func (m *Manager) StartRecording(sessionID string) error {
	s, ok := m.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.recorder != nil {
		return nil // already recording
	}
	rec, err := NewRecorder(m.recordingDir, s.InstanceID, s.InstanceName, 80, 24)
	if err != nil {
		return err
	}
	s.recorder = rec
	m.logger.Printf("recording started for session %s", sessionID)
	return nil
}

// StopRecording stops recording a session.
func (m *Manager) StopRecording(sessionID string) error {
	s, ok := m.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.recorder == nil {
		return nil // not recording
	}
	s.recorder.Close()
	s.recorder = nil
	m.logger.Printf("recording stopped for session %s", sessionID)
	return nil
}

// CloseSessionsForClient closes every session whose ID is in the provided slice.
func (m *Manager) CloseSessionsForClient(sessionIDs []string) {
	for _, id := range sessionIDs {
		if err := m.CloseSession(id); err != nil {
			m.logger.Printf("close session %s: %v", id, err)
		}
	}
}

// ssmKeepalive periodically sends a null byte to the PTY when the session has
// been idle, preventing AWS SSM from hitting its idle-session timeout.
func (s *SSMSession) ssmKeepalive(logger *log.Logger) {
	ticker := time.NewTicker(ssmKeepaliveInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.mu.Lock()
			idle := time.Since(s.lastInput) >= ssmKeepaliveInterval
			ptmx := s.ptmx
			s.mu.Unlock()

			if idle && ptmx != nil {
				if _, err := ptmx.Write([]byte{0}); err != nil {
					logger.Printf("session %s ssm keepalive write failed: %v", s.SessionID, err)
					return
				}
			}
		case <-s.done:
			return
		}
	}
}

// readLoop continuously reads output from the PTY and forwards it via onOutput.
func (s *SSMSession) readLoop(logger *log.Logger) {
	defer close(s.done)

	buf := make([]byte, 4096)
	for {
		n, err := s.ptmx.Read(buf)
		if n > 0 {
			// Copy so the callback owns the slice.
			out := make([]byte, n)
			copy(out, buf[:n])

			// Grab onOutput and recorder under the lock so concurrent rebinds
			// (from WS reconnection) are always seen.
			s.mu.Lock()
			cb := s.onOutput
			rec := s.recorder
			if s.outputBuf.Len()+n > maxOutputBuf {
				excess := s.outputBuf.Len() + n - maxOutputBuf
				s.outputBuf.Next(excess)
			}
			s.outputBuf.Write(out)
			s.mu.Unlock()

			cb(out)
			if rec != nil {
				rec.Write(out)
			}
		}
		if err != nil {
			// EOF or read-after-close — both are normal shutdown paths.
			logger.Printf("session %s read loop ended: %v", s.SessionID, err)
			return
		}
	}
}

// Close tears down the PTY and kills the process group.
func (s *SSMSession) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.recorder != nil {
		s.recorder.Close()
		s.recorder = nil
	}

	if s.ptmx != nil {
		s.ptmx.Close()
		s.ptmx = nil
	}

	if s.cmd != nil && s.cmd.Process != nil {
		// Kill the entire process group.
		_ = syscall.Kill(-s.cmd.Process.Pid, syscall.SIGKILL)
		_ = s.cmd.Wait()
		s.cmd = nil
	}
}

// IsRecording returns true if the session is being recorded.
func (s *SSMSession) IsRecording() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.recorder != nil
}
