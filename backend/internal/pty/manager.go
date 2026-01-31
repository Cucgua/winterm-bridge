package pty

import (
	"fmt"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

type Config struct {
	SocketPath  string
	IdleTimeout time.Duration
}

type Manager struct {
	mu         sync.Mutex
	instances  map[string]*Instance
	socketPath string
	idleTTL    time.Duration
}

type Subscriber struct {
	Conn    *websocket.Conn
	SendCh  chan []byte
	Paused  bool
	pauseMu sync.Mutex
}

type Instance struct {
	SessionID  string
	TmuxName   string
	Cmd        *exec.Cmd
	Pty        *os.File
	RefCount   int
	LastActive time.Time
	stopTimer  *time.Timer
	closed     bool

	subscribers map[*websocket.Conn]*Subscriber
	subMu       sync.RWMutex

	writeCh  chan []byte
	doneCh   chan struct{}
	closeOnce sync.Once

	mu sync.Mutex
}

func NewManager(cfg Config) *Manager {
	socketPath := cfg.SocketPath
	if socketPath == "" {
		if env := os.Getenv("WINTERM_TMUX_SOCKET"); env != "" {
			socketPath = env
		} else {
			socketPath = fmt.Sprintf("/tmp/tmux-%d/default", os.Getuid())
		}
	}
	idle := cfg.IdleTimeout
	if idle == 0 {
		idle = 30 * time.Second
	}
	return &Manager{
		instances:  make(map[string]*Instance),
		socketPath: socketPath,
		idleTTL:    idle,
	}
}

func (m *Manager) SocketPath() string {
	return m.socketPath
}

func (m *Manager) EnsureInstance(sessionID, tmuxName string) (*Instance, error) {
	m.mu.Lock()
	if inst, ok := m.instances[sessionID]; ok {
		inst.mu.Lock()
		if !inst.closed {
			inst.RefCount++
			inst.LastActive = time.Now()
			if inst.stopTimer != nil {
				inst.stopTimer.Stop()
				inst.stopTimer = nil
			}
			inst.mu.Unlock()
			m.mu.Unlock()
			return inst, nil
		}
		inst.mu.Unlock()
	}
	m.mu.Unlock()

	// Verify tmux session exists
	checkCmd := exec.Command("tmux", "-S", m.socketPath, "has-session", "-t", tmuxName)
	if err := checkCmd.Run(); err != nil {
		return nil, fmt.Errorf("tmux session '%s' does not exist", tmuxName)
	}

	// Start tmux attach with PTY
	cmd := exec.Command("tmux", "-S", m.socketPath, "attach", "-t", tmuxName)
	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, fmt.Errorf("failed to start pty: %w", err)
	}

	inst := &Instance{
		SessionID:   sessionID,
		TmuxName:    tmuxName,
		Cmd:         cmd,
		Pty:         ptmx,
		RefCount:    1,
		LastActive:  time.Now(),
		subscribers: make(map[*websocket.Conn]*Subscriber),
		writeCh:     make(chan []byte, 256),
		doneCh:      make(chan struct{}),
	}

	m.mu.Lock()
	// Double check: another goroutine might have created instance
	if existing, ok := m.instances[sessionID]; ok {
		existing.mu.Lock()
		if !existing.closed {
			existing.RefCount++
			existing.LastActive = time.Now()
			if existing.stopTimer != nil {
				existing.stopTimer.Stop()
				existing.stopTimer = nil
			}
			existing.mu.Unlock()
			m.mu.Unlock()
			// Clean up the one we just created
			ptmx.Close()
			cmd.Process.Kill()
			return existing, nil
		}
		existing.mu.Unlock()
	}
	m.instances[sessionID] = inst
	m.mu.Unlock()

	go inst.readLoop(m)
	go inst.writeLoop()

	return inst, nil
}

func (m *Manager) Release(sessionID string) {
	m.mu.Lock()
	inst, ok := m.instances[sessionID]
	if !ok {
		m.mu.Unlock()
		return
	}
	m.mu.Unlock()

	inst.mu.Lock()
	inst.RefCount--
	inst.LastActive = time.Now()
	shouldScheduleStop := inst.RefCount <= 0 && inst.stopTimer == nil && !inst.closed
	if shouldScheduleStop {
		inst.stopTimer = time.AfterFunc(m.idleTTL, func() {
			m.stopIfIdle(sessionID)
		})
	}
	inst.mu.Unlock()
}

func (m *Manager) stopIfIdle(sessionID string) {
	m.mu.Lock()
	inst, ok := m.instances[sessionID]
	if !ok {
		m.mu.Unlock()
		return
	}

	inst.mu.Lock()
	if inst.RefCount > 0 || inst.closed {
		inst.mu.Unlock()
		m.mu.Unlock()
		return
	}
	inst.closed = true
	if inst.stopTimer != nil {
		inst.stopTimer.Stop()
		inst.stopTimer = nil
	}
	inst.mu.Unlock()

	delete(m.instances, sessionID)
	m.mu.Unlock()

	inst.close()
}

func (m *Manager) GetInstance(sessionID string) *Instance {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.instances[sessionID]
}

func (m *Manager) removeInstance(sessionID string) {
	m.mu.Lock()
	delete(m.instances, sessionID)
	m.mu.Unlock()
}

// Instance methods

func (inst *Instance) close() {
	inst.closeOnce.Do(func() {
		close(inst.doneCh)
		if inst.Pty != nil {
			inst.Pty.Close()
		}
		if inst.Cmd != nil && inst.Cmd.Process != nil {
			_ = inst.Cmd.Process.Signal(syscall.SIGTERM)
			time.AfterFunc(5*time.Second, func() {
				_ = inst.Cmd.Process.Kill()
			})
		}
	})
}

func (inst *Instance) readLoop(m *Manager) {
	buf := make([]byte, 32*1024)
	for {
		n, err := inst.Pty.Read(buf)
		if err != nil {
			inst.broadcastError("pty process exited")
			inst.markClosed()
			m.removeInstance(inst.SessionID)
			inst.close()
			return
		}
		if n > 0 {
			data := make([]byte, n)
			copy(data, buf[:n])
			inst.broadcast(data)
		}
	}
}

func (inst *Instance) writeLoop() {
	for {
		select {
		case data := <-inst.writeCh:
			if _, err := inst.Pty.Write(data); err != nil {
				return
			}
		case <-inst.doneCh:
			return
		}
	}
}

func (inst *Instance) Write(data []byte) {
	select {
	case inst.writeCh <- data:
	case <-inst.doneCh:
	default:
		// Drop if buffer full
	}
}

func (inst *Instance) Resize(cols, rows uint16) error {
	if cols == 0 || rows == 0 {
		return nil
	}
	return pty.Setsize(inst.Pty, &pty.Winsize{Cols: cols, Rows: rows})
}

func (inst *Instance) AddSubscriber(conn *websocket.Conn) *Subscriber {
	sub := &Subscriber{
		Conn:   conn,
		SendCh: make(chan []byte, 256),
	}
	inst.subMu.Lock()
	inst.subscribers[conn] = sub
	inst.subMu.Unlock()
	return sub
}

func (inst *Instance) RemoveSubscriber(conn *websocket.Conn) {
	inst.subMu.Lock()
	if sub, ok := inst.subscribers[conn]; ok {
		close(sub.SendCh)
		delete(inst.subscribers, conn)
	}
	inst.subMu.Unlock()
}

func (inst *Instance) broadcast(data []byte) {
	inst.subMu.RLock()
	defer inst.subMu.RUnlock()
	for _, sub := range inst.subscribers {
		sub.pauseMu.Lock()
		paused := sub.Paused
		sub.pauseMu.Unlock()
		if paused {
			continue
		}
		select {
		case sub.SendCh <- data:
		default:
			// Drop if buffer full
		}
	}
}

func (inst *Instance) broadcastError(msg string) {
	inst.subMu.RLock()
	defer inst.subMu.RUnlock()
	errMsg := []byte(fmt.Sprintf(`{"type":"error","message":"%s"}`, msg))
	for _, sub := range inst.subscribers {
		select {
		case sub.SendCh <- errMsg:
		default:
		}
	}
}

func (inst *Instance) markClosed() {
	inst.mu.Lock()
	inst.closed = true
	inst.mu.Unlock()
}

func (inst *Instance) IsClosed() bool {
	inst.mu.Lock()
	defer inst.mu.Unlock()
	return inst.closed
}

func (sub *Subscriber) SetPaused(paused bool) {
	sub.pauseMu.Lock()
	sub.Paused = paused
	sub.pauseMu.Unlock()
}

// SessionProvider interface implementation for monitor.Service

// BroadcastToSession sends a text message to all subscribers of a session
func (m *Manager) BroadcastToSession(sessionID string, data []byte) {
	m.mu.Lock()
	inst, ok := m.instances[sessionID]
	m.mu.Unlock()
	if !ok {
		return
	}
	inst.subMu.RLock()
	defer inst.subMu.RUnlock()
	for _, sub := range inst.subscribers {
		select {
		case sub.SendCh <- data:
		default:
		}
	}
}
