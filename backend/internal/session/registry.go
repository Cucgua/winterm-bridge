package session

import (
	"errors"
	"regexp"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"winterm-bridge/internal/auth"
	"winterm-bridge/internal/tmux"
)

var (
	ErrSessionNotFound = errors.New("session not found")
	ErrInvalidToken    = errors.New("invalid token")
)

type Registry struct {
	sessions map[string]*Session
	mu       sync.RWMutex
}

func NewRegistry() *Registry {
	return &Registry{sessions: make(map[string]*Session)}
}

// EnsureDefaultSession creates a default session if no sessions exist
func (r *Registry) EnsureDefaultSession(title, workingDir string) error {
	r.mu.RLock()
	count := len(r.sessions)
	r.mu.RUnlock()

	if count > 0 {
		// Sessions already exist, no need to create default
		return nil
	}

	// Create default session with a placeholder token (will be accessible to all authenticated users)
	_, err := r.CreateWithTitle("default", title, workingDir)
	return err
}

// Get returns a session by ID or nil if not found
func (r *Registry) Get(sessionID string) *Session {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.sessions[sessionID]
}

// DiscoverExisting scans for existing tmux sessions and adds them to the registry
func (r *Registry) DiscoverExisting() {
	tmuxSessions, err := tmux.ListSessions()
	if err != nil {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	for _, tmuxName := range tmuxSessions {
		// Check if already registered
		found := false
		for _, s := range r.sessions {
			if s.TmuxName == tmuxName {
				found = true
				break
			}
		}
		if found {
			continue
		}

		// Register this existing tmux session
		id := auth.GenerateToken()
		s := NewSession(id, tmuxName)
		s.State = SessionDetached

		// Extract title from tmux name (remove "winterm-" prefix)
		if len(tmuxName) > len(tmux.SessionPrefix) {
			title := tmuxName[len(tmux.SessionPrefix):]
			s.SetTitle(title)
		}

		// Ensure status bar is hidden for existing sessions
		tmux.EnsureStatusOff(tmuxName)

		r.sessions[id] = s
	}
}

// sanitizeTmuxName removes invalid characters from tmux session name
// tmux doesn't allow '.' and ':' in session names
var invalidTmuxChars = regexp.MustCompile(`[.:]+`)

func sanitizeTmuxName(name string) string {
	return invalidTmuxChars.ReplaceAllString(name, "-")
}

// tmuxNameExists checks if a tmux session with the given name already exists
func (r *Registry) tmuxNameExists(name string) bool {
	for _, s := range r.sessions {
		if s.TmuxName == name {
			return true
		}
	}
	return false
}

func (r *Registry) Create(token string) (*Session, error) {
	return r.CreateWithTitle(token, "", "")
}

func (r *Registry) CreateWithTitle(token string, title string, workingDir string) (*Session, error) {
	id := auth.GenerateToken()
	var tmuxName string

	if title != "" {
		// Use sanitized title as tmux name
		baseName := tmux.SessionPrefix + sanitizeTmuxName(title)
		tmuxName = baseName

		// Check for conflicts and add suffix if needed
		r.mu.RLock()
		suffix := 1
		for r.tmuxNameExists(tmuxName) {
			tmuxName = baseName + "-" + string(rune('0'+suffix))
			suffix++
			if suffix > 9 {
				// Fallback to UUID if too many conflicts
				tmuxName = tmux.SessionPrefix + id[:8]
				break
			}
		}
		r.mu.RUnlock()
	} else {
		// Default: use UUID prefix
		tmuxName = tmux.SessionPrefix + id[:8]
	}

	// Create tmux session
	if err := tmux.CreateSession(tmuxName, "main", workingDir); err != nil {
		return nil, err
	}

	s := NewSession(id, tmuxName)
	if title != "" {
		s.SetTitle(title)
	}

	r.mu.Lock()
	r.sessions[id] = s
	r.mu.Unlock()
	return s, nil
}

// ListAll returns all non-terminated sessions (shared across all clients)
func (r *Registry) ListAll() []*Session {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*Session, 0)
	for _, s := range r.sessions {
		if s.State != SessionTerminated {
			out = append(out, s)
		}
	}
	return out
}

// ListByToken is kept for backward compatibility but now returns all sessions
func (r *Registry) ListByToken(token string) []*Session {
	if !auth.ValidateToken(token) {
		return nil
	}
	return r.ListAll()
}

func (r *Registry) Attach(sessionID, token string, ws *websocket.Conn) (*Session, error) {
	if !auth.ValidateToken(token) {
		return nil, ErrInvalidToken
	}

	// 只用读锁查找 session，避免阻塞其他读操作
	r.mu.RLock()
	s, ok := r.sessions[sessionID]
	r.mu.RUnlock() // 立即释放 registry 锁

	if !ok {
		return nil, ErrSessionNotFound
	}

	// session 级别操作单独加锁（不持有 registry 锁，避免死锁）
	s.mu.Lock()
	s.State = SessionActive
	s.LastActive = time.Now()
	s.mu.Unlock()

	return s, nil
}

// RegisterClient adds a client to an already attached session
func (r *Registry) RegisterClient(sessionID string, ws *websocket.Conn, sendCh chan []byte) error {
	r.mu.RLock()
	s, ok := r.sessions[sessionID]
	r.mu.RUnlock()
	if !ok {
		return ErrSessionNotFound
	}

	s.AddClient(ws, sendCh)
	return nil
}

func (r *Registry) Detach(sessionID string, ws *websocket.Conn) error {
	// 只用读锁查找 session，避免阻塞其他读操作
	r.mu.RLock()
	s, ok := r.sessions[sessionID]
	r.mu.RUnlock() // 立即释放 registry 锁

	if !ok {
		return ErrSessionNotFound
	}

	// RemoveClient 内部已处理状态更新、客户端清理和 tmux client 关闭
	// 该方法有自己的锁保护，不需要外部再加锁
	s.RemoveClient(ws)

	return nil
}

func (r *Registry) Cleanup(timeout time.Duration) {
	ticker := time.NewTicker(timeout / 2)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()

		// Collect sessions to clean up while holding lock
		type toCleanup struct {
			id       string
			tmuxName string
		}
		var cleanupList []toCleanup

		r.mu.Lock()
		for id, s := range r.sessions {
			if s.State == SessionDetached && now.Sub(s.LastActive) > timeout {
				cleanupList = append(cleanupList, toCleanup{id: id, tmuxName: s.TmuxName})
				s.State = SessionTerminated
				delete(r.sessions, id)
			}
		}
		r.mu.Unlock()

		// Kill tmux sessions AFTER releasing the lock to avoid blocking
		for _, item := range cleanupList {
			if item.tmuxName != "" {
				_ = tmux.KillSession(item.tmuxName)
			}
		}

		// Also discover any new tmux sessions
		r.DiscoverExisting()
	}
}

// Delete terminates and removes a session
func (r *Registry) Delete(sessionID string) error {
	// 阶段1: 从 registry 移除（防止新请求访问）
	r.mu.Lock()
	s, ok := r.sessions[sessionID]
	if !ok {
		r.mu.Unlock()
		return ErrSessionNotFound
	}
	// 先从 map 删除，防止新请求访问已删除的 session
	delete(r.sessions, sessionID)
	r.mu.Unlock() // 立即释放 registry 锁

	// 阶段2: 更新 session 状态并获取 tmux 名称
	s.mu.Lock()
	tmuxName := s.TmuxName
	s.State = SessionTerminated
	s.mu.Unlock() // 释放 session 锁

	// 阶段3: 关闭所有客户端（在锁外执行，CloseAllClients 有自己的锁保护）
	s.CloseAllClients()

	// 阶段4: 杀死 tmux session（阻塞操作，在所有锁外执行）
	if tmuxName != "" {
		_ = tmux.KillSession(tmuxName)
	}

	return nil
}
