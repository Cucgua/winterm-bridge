package ttyd

import (
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

type Config struct {
	SocketPath  string
	BindHost    string
	IdleTimeout time.Duration
}

type Manager struct {
	mu         sync.Mutex
	instances  map[string]*Instance
	socketPath string
	bindHost   string
	idleTTL    time.Duration
}

type Instance struct {
	SessionID  string
	TmuxName   string
	Port       int
	Cmd        *exec.Cmd
	RefCount   int
	LastActive time.Time
	stopTimer  *time.Timer
	bindHost   string
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
	bindHost := cfg.BindHost
	if bindHost == "" {
		bindHost = "127.0.0.1"
	}
	idle := cfg.IdleTimeout
	if idle == 0 {
		idle = 30 * time.Second
	}
	return &Manager{
		instances:  make(map[string]*Instance),
		socketPath: socketPath,
		bindHost:   bindHost,
		idleTTL:    idle,
	}
}

func (m *Manager) EnsureInstance(sessionID, tmuxName string) (*Instance, error) {
	m.mu.Lock()
	if inst, ok := m.instances[sessionID]; ok {
		inst.RefCount++
		inst.LastActive = time.Now()
		if inst.stopTimer != nil {
			inst.stopTimer.Stop()
			inst.stopTimer = nil
		}
		m.mu.Unlock()
		return inst, nil
	}
	m.mu.Unlock()

	// Verify tmux session exists before starting ttyd
	checkCmd := exec.Command("tmux", "-S", m.socketPath, "has-session", "-t", tmuxName)
	if err := checkCmd.Run(); err != nil {
		return nil, fmt.Errorf("tmux session '%s' does not exist", tmuxName)
	}

	port, err := m.allocatePort()
	if err != nil {
		return nil, fmt.Errorf("failed to allocate port: %w", err)
	}

	cmd := exec.Command(
		"ttyd",
		"--port", fmt.Sprintf("%d", port),
		"--interface", m.bindHost,
		"--writable",
		"tmux", "-S", m.socketPath, "attach", "-t", tmuxName,
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start ttyd: %w", err)
	}

	inst := &Instance{
		SessionID:  sessionID,
		TmuxName:   tmuxName,
		Port:       port,
		Cmd:        cmd,
		RefCount:   1,
		LastActive: time.Now(),
		bindHost:   m.bindHost,
	}

	m.mu.Lock()
	m.instances[sessionID] = inst
	m.mu.Unlock()

	go m.watch(inst)

	// Wait for ttyd to start - fail if not ready
	if err := m.waitForReady(inst, 3*time.Second); err != nil {
		// Cleanup: stop the process and remove from instances
		m.mu.Lock()
		delete(m.instances, sessionID)
		m.mu.Unlock()
		_ = cmd.Process.Kill()
		return nil, fmt.Errorf("ttyd failed to start: %w", err)
	}

	log.Printf("[ttyd] Started instance: session=%s port=%d", sessionID, port)
	return inst, nil
}

func (m *Manager) waitForReady(inst *Instance, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", inst.bindHost, inst.Port), 100*time.Millisecond)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(50 * time.Millisecond)
	}
	return fmt.Errorf("timeout waiting for ttyd on port %d", inst.Port)
}

func (m *Manager) Release(sessionID string) {
	m.mu.Lock()
	inst, ok := m.instances[sessionID]
	if !ok {
		m.mu.Unlock()
		return
	}
	inst.RefCount--
	inst.LastActive = time.Now()
	shouldScheduleStop := inst.RefCount <= 0 && inst.stopTimer == nil
	if shouldScheduleStop {
		inst.stopTimer = time.AfterFunc(m.idleTTL, func() {
			m.stopIfIdle(sessionID)
		})
	}
	m.mu.Unlock()
	log.Printf("[ttyd] Released: session=%s refcount=%d", sessionID, inst.RefCount)
}

func (m *Manager) stopIfIdle(sessionID string) {
	m.mu.Lock()
	inst, ok := m.instances[sessionID]
	if !ok || inst.RefCount > 0 {
		m.mu.Unlock()
		return
	}
	cmd := inst.Cmd
	delete(m.instances, sessionID)
	if inst.stopTimer != nil {
		inst.stopTimer.Stop()
		inst.stopTimer = nil
	}
	m.mu.Unlock()

	if cmd != nil && cmd.Process != nil {
		log.Printf("[ttyd] Stopping idle instance: session=%s", sessionID)
		_ = cmd.Process.Signal(syscall.SIGTERM)
		time.AfterFunc(5*time.Second, func() {
			_ = cmd.Process.Kill()
		})
	}
}

func (m *Manager) watch(inst *Instance) {
	err := inst.Cmd.Wait()
	if err != nil {
		log.Printf("[ttyd] Process exit: session=%s port=%d err=%v", inst.SessionID, inst.Port, err)
	} else {
		log.Printf("[ttyd] Process exit: session=%s port=%d", inst.SessionID, inst.Port)
	}

	m.mu.Lock()
	if current, ok := m.instances[inst.SessionID]; ok && current == inst {
		delete(m.instances, inst.SessionID)
	}
	if inst.stopTimer != nil {
		inst.stopTimer.Stop()
	}
	m.mu.Unlock()
}

func (m *Manager) allocatePort() (int, error) {
	l, err := net.Listen("tcp", fmt.Sprintf("%s:0", m.bindHost))
	if err != nil {
		return 0, err
	}
	defer l.Close()
	addr, ok := l.Addr().(*net.TCPAddr)
	if !ok {
		return 0, fmt.Errorf("unexpected address type: %T", l.Addr())
	}
	return addr.Port, nil
}

func (i *Instance) WSURL() string {
	return fmt.Sprintf("ws://%s:%d/ws", i.bindHost, i.Port)
}

// GetInstance returns the instance for a session (nil if not found)
func (m *Manager) GetInstance(sessionID string) *Instance {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.instances[sessionID]
}

// Touch updates the last active time for an instance
func (i *Instance) Touch() {
	i.LastActive = time.Now()
}
