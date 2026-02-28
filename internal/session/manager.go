package session

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"sync"
	"syscall"

	"github.com/creack/pty"
)

// SSMSession represents a single SSM terminal session backed by a PTY.
type SSMSession struct {
	InstanceID string
	SessionID  string
	cmd        *exec.Cmd
	ptmx       *os.File
	done       chan struct{}
	onOutput   func([]byte)
	mu         sync.Mutex
}

// Manager tracks all active SSM sessions.
type Manager struct {
	sessions map[string]*SSMSession
	mu       sync.RWMutex
	logger   *log.Logger
}

// NewManager creates a Manager with the given logger.
func NewManager(logger *log.Logger) *Manager {
	return &Manager{
		sessions: make(map[string]*SSMSession),
		logger:   logger,
	}
}

// StartSession launches an aws ssm start-session process inside a PTY and
// begins streaming its output through onOutput.
func (m *Manager) StartSession(instanceID, sessionID, awsProfile, awsRegion string, onOutput func([]byte)) error {
	cmd := exec.Command("aws", "ssm", "start-session",
		"--target", instanceID,
		"--profile", awsProfile,
		"--region", awsRegion,
	)
	// Create a new session so we can signal the whole group later.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return fmt.Errorf("failed to start pty: %w", err)
	}

	s := &SSMSession{
		InstanceID: instanceID,
		SessionID:  sessionID,
		cmd:        cmd,
		ptmx:       ptmx,
		done:       make(chan struct{}),
		onOutput:   onOutput,
	}

	m.mu.Lock()
	m.sessions[sessionID] = s
	m.mu.Unlock()

	go s.readLoop(m.logger)

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

	return pty.Setsize(s.ptmx, &pty.Winsize{Rows: rows, Cols: cols})
}

// CloseSession tears down a single session by ID.
func (m *Manager) CloseSession(sessionID string) error {
	m.mu.Lock()
	s, ok := m.sessions[sessionID]
	if !ok {
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
		s.Close()
		m.logger.Printf("session %s closed (shutdown)", id)
	}
}

// GetSession returns the session for the given ID, if it exists.
func (m *Manager) GetSession(sessionID string) (*SSMSession, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sessions[sessionID]
	return s, ok
}

// CloseSessionsForClient closes every session whose ID is in the provided slice.
func (m *Manager) CloseSessionsForClient(sessionIDs []string) {
	for _, id := range sessionIDs {
		if err := m.CloseSession(id); err != nil {
			m.logger.Printf("close session %s: %v", id, err)
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
			s.onOutput(out)
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
