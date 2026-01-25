package session

import (
	"errors"
	"log"
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

// DiscoverExisting scans for existing tmux sessions and adds them to the registry
func (r *Registry) DiscoverExisting() {
	log.Printf("[Registry] DiscoverExisting: starting")
	tmuxSessions, err := tmux.ListSessions()
	if err != nil {
		log.Printf("[Registry] Failed to list tmux sessions: %v", err)
		return
	}
	log.Printf("[Registry] DiscoverExisting: found %d tmux sessions, acquiring lock", len(tmuxSessions))

	r.mu.Lock()
	defer r.mu.Unlock()
	log.Printf("[Registry] DiscoverExisting: lock acquired")

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
		r.sessions[id] = s
		log.Printf("[Registry] Discovered existing tmux session: %s -> %s", tmuxName, id)
	}
	log.Printf("[Registry] DiscoverExisting: done")
}

func (r *Registry) Create(token string) (*Session, error) {
	log.Printf("[Registry] Creating new tmux session...")

	id := auth.GenerateToken()
	tmuxName := tmux.SessionPrefix + id[:8]

	// Create tmux session
	if err := tmux.CreateSession(tmuxName, "main"); err != nil {
		log.Printf("[Registry] Failed to create tmux session: %v", err)
		return nil, err
	}

	log.Printf("[Registry] tmux session created: %s", tmuxName)

	s := NewSession(id, tmuxName)

	r.mu.Lock()
	r.sessions[id] = s
	r.mu.Unlock()
	return s, nil
}

// ListAll returns all non-terminated sessions (shared across all clients)
func (r *Registry) ListAll() []*Session {
	log.Printf("[Registry] ListAll: attempting to acquire RLock")
	r.mu.RLock()
	log.Printf("[Registry] ListAll: RLock acquired")
	defer r.mu.RUnlock()
	out := make([]*Session, 0)
	for _, s := range r.sessions {
		if s.State != SessionTerminated {
			out = append(out, s)
		}
	}
	log.Printf("[Registry] ListAll: returning %d sessions", len(out))
	return out
}

// ListByToken is kept for backward compatibility but now returns all sessions
func (r *Registry) ListByToken(token string) []*Session {
	log.Printf("[Registry] ListByToken called")
	if !auth.ValidateToken(token) {
		log.Printf("[Registry] ListByToken: invalid token format")
		return nil
	}
	log.Printf("[Registry] ListByToken: token valid, calling ListAll")
	result := r.ListAll()
	log.Printf("[Registry] ListByToken: ListAll returned %d sessions", len(result))
	return result
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

	log.Printf("[Registry] Client preparing to attach to tmux session %s", sessionID[:8])
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
	log.Printf("[Registry] Client registered to session %s (total clients: %d)", sessionID[:8], s.ClientCount())
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

	log.Printf("[Registry] Client detached from session %s (remaining clients: %d)", sessionID[:8], s.ClientCount())
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
			log.Printf("[Registry] Cleaned up inactive session: %s", item.id[:8])
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

	log.Printf("[Registry] Deleted session: %s (tmux: %s)", sessionID, tmuxName)
	return nil
}
