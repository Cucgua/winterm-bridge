package session

import (
	"errors"
	"fmt"
	"log"
	"regexp"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"winterm-bridge/internal/auth"
	"winterm-bridge/internal/config"
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
// Also removes sessions whose tmux session no longer exists (unless persistent/ghost)
func (r *Registry) DiscoverExisting() {
	tmuxSessions, err := tmux.ListSessions()
	if err != nil {
		return
	}

	// Build a set of existing tmux session names for quick lookup
	tmuxSet := make(map[string]bool)
	for _, name := range tmuxSessions {
		tmuxSet[name] = true
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	// Phase 1: Add new tmux sessions to registry
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
		id := auth.DeriveSessionID(tmuxName)
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

	// Phase 2: Remove sessions whose tmux no longer exists (non-persistent, non-ghost only)
	var toDelete []string
	for id, s := range r.sessions {
		// Skip persistent sessions (they become ghosts, not deleted)
		if s.IsPersistent {
			// Check if should become ghost
			if !s.IsGhost && s.TmuxName != "" && !tmuxSet[s.TmuxName] {
				s.IsGhost = true
				s.State = SessionDetached
			}
			continue
		}
		// Skip already ghost sessions
		if s.IsGhost {
			continue
		}
		// Check if tmux session still exists
		if s.TmuxName != "" && !tmuxSet[s.TmuxName] {
			toDelete = append(toDelete, id)
		}
	}

	for _, id := range toDelete {
		delete(r.sessions, id)
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
				// Fallback to timestamp if too many conflicts
				tmuxName = fmt.Sprintf("%s%d", tmux.SessionPrefix, time.Now().UnixNano()%100000000)
				break
			}
		}
		r.mu.RUnlock()
	} else {
		// Default: use timestamp for uniqueness
		tmuxName = fmt.Sprintf("%s%d", tmux.SessionPrefix, time.Now().UnixNano()%100000000)
	}

	// Derive deterministic session ID from tmux name
	id := auth.DeriveSessionID(tmuxName)

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

func (r *Registry) Cleanup(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		// Only discover new tmux sessions, no auto-deletion
		r.DiscoverExisting()
		// Update working directories for persistent sessions
		r.updatePersistentSessionPaths()
	}
}

// updatePersistentSessionPaths updates the saved working directory for all persistent sessions
func (r *Registry) updatePersistentSessionPaths() {
	r.mu.RLock()
	var toUpdate []struct {
		id         string
		title      string
		tmuxName   string
		createdAt  time.Time
	}
	for _, s := range r.sessions {
		if s.IsPersistent && !s.IsGhost && s.TmuxName != "" {
			toUpdate = append(toUpdate, struct {
				id         string
				title      string
				tmuxName   string
				createdAt  time.Time
			}{s.ID, s.Title, s.TmuxName, s.CreatedAt})
		}
	}
	r.mu.RUnlock()

	for _, item := range toUpdate {
		newPath, err := tmux.GetCurrentPath(item.tmuxName)
		if err != nil || newPath == "" {
			continue
		}

		// Update session's saved working dir
		r.mu.RLock()
		s := r.sessions[item.id]
		r.mu.RUnlock()
		if s != nil {
			s.mu.Lock()
			if s.SavedWorkingDir != newPath {
				s.SavedWorkingDir = newPath
				// Update config file
				ps := config.PersistentSession{
					ID:         item.id,
					Title:      item.title,
					WorkingDir: newPath,
					CreatedAt:  item.createdAt,
				}
				_ = config.AddPersistentSession(ps)
			}
			s.mu.Unlock()
		}
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
	isPersistent := s.IsPersistent
	isGhost := s.IsGhost
	s.State = SessionTerminated
	s.mu.Unlock() // 释放 session 锁

	// 阶段3: 关闭所有客户端（在锁外执行，CloseAllClients 有自己的锁保护）
	s.CloseAllClients()

	// 阶段4: 杀死 tmux session（阻塞操作，在所有锁外执行）
	// Only kill tmux if not a ghost session
	if tmuxName != "" && !isGhost {
		_ = tmux.KillSession(tmuxName)
	}

	// 阶段5: 如果是持久化会话，从配置中移除
	if isPersistent {
		_ = config.RemovePersistentSession(sessionID)
	}

	return nil
}

// LoadPersistentSessions loads saved persistent sessions on startup
// Creates ghost sessions for sessions that don't have a running tmux
func (r *Registry) LoadPersistentSessions() {
	persistedSessions := config.GetAllPersistentSessions()
	if len(persistedSessions) == 0 {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	for _, ps := range persistedSessions {
		// Check if session already exists in registry
		if _, exists := r.sessions[ps.ID]; exists {
			// Already loaded (e.g., from DiscoverExisting), mark as persistent
			if s := r.sessions[ps.ID]; s != nil {
				s.IsPersistent = true
				s.SavedWorkingDir = ps.WorkingDir
			}
			continue
		}

		// Check if tmux session exists
		tmuxName := tmux.SessionPrefix + sanitizeTmuxName(ps.Title)
		tmuxExists := tmux.SessionExists(tmuxName)

		// Create session entry
		s := NewSession(ps.ID, tmuxName)
		s.SetTitle(ps.Title)
		s.CreatedAt = ps.CreatedAt
		s.IsPersistent = true
		s.SavedWorkingDir = ps.WorkingDir

		if tmuxExists {
			// tmux session exists, normal session
			s.State = SessionDetached
			s.IsGhost = false
			tmux.EnsureStatusOff(tmuxName)
			log.Printf("[Registry] Loaded persistent session %q with existing tmux", ps.Title)
		} else {
			// tmux session doesn't exist, create ghost session
			s.State = SessionDetached
			s.IsGhost = true
			log.Printf("[Registry] Loaded persistent session %q as ghost (tmux not found)", ps.Title)
		}

		r.sessions[ps.ID] = s
	}
}

// PersistSession marks a session for persistence
func (r *Registry) PersistSession(sessionID string) error {
	r.mu.RLock()
	s, ok := r.sessions[sessionID]
	r.mu.RUnlock()

	if !ok {
		return ErrSessionNotFound
	}

	s.mu.Lock()
	if s.IsPersistent {
		s.mu.Unlock()
		return nil // Already persistent
	}

	// Get current working directory
	workingDir := ""
	if !s.IsGhost && s.TmuxName != "" {
		workingDir, _ = tmux.GetCurrentPath(s.TmuxName)
	}

	s.IsPersistent = true
	s.SavedWorkingDir = workingDir
	title := s.Title
	createdAt := s.CreatedAt
	s.mu.Unlock()

	// Save to config
	ps := config.PersistentSession{
		ID:         sessionID,
		Title:      title,
		WorkingDir: workingDir,
		CreatedAt:  createdAt,
	}
	if err := config.AddPersistentSession(ps); err != nil {
		// Rollback
		s.mu.Lock()
		s.IsPersistent = false
		s.mu.Unlock()
		return err
	}

	log.Printf("[Registry] Session %q marked as persistent, workingDir=%s", title, workingDir)
	return nil
}

// UnpersistSession removes persistence marking from a session
func (r *Registry) UnpersistSession(sessionID string) error {
	r.mu.RLock()
	s, ok := r.sessions[sessionID]
	r.mu.RUnlock()

	if !ok {
		return ErrSessionNotFound
	}

	s.mu.Lock()
	if !s.IsPersistent {
		s.mu.Unlock()
		return nil // Already not persistent
	}

	s.IsPersistent = false
	title := s.Title
	s.mu.Unlock()

	// Remove from config
	if err := config.RemovePersistentSession(sessionID); err != nil {
		// Rollback
		s.mu.Lock()
		s.IsPersistent = true
		s.mu.Unlock()
		return err
	}

	log.Printf("[Registry] Session %q unmarked from persistent", title)
	return nil
}

// ReviveGhostSession creates a real tmux session for a ghost session
func (r *Registry) ReviveGhostSession(sessionID string) error {
	r.mu.RLock()
	s, ok := r.sessions[sessionID]
	r.mu.RUnlock()

	if !ok {
		return ErrSessionNotFound
	}

	s.mu.Lock()
	if !s.IsGhost {
		s.mu.Unlock()
		return nil // Not a ghost, nothing to do
	}

	title := s.Title
	savedDir := s.SavedWorkingDir
	tmuxName := s.TmuxName
	s.mu.Unlock()

	// Create tmux session
	if err := tmux.CreateSession(tmuxName, "main", savedDir); err != nil {
		return fmt.Errorf("failed to create tmux session: %w", err)
	}

	// Update session state
	s.mu.Lock()
	s.IsGhost = false
	s.State = SessionDetached
	s.mu.Unlock()

	log.Printf("[Registry] Revived ghost session %q with tmux %s, workingDir=%s", title, tmuxName, savedDir)
	return nil
}
