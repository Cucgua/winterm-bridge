package monitor

import (
	"sync"
	"time"

	"winterm-bridge/internal/llm"
)

// ActionKind represents the type of action in the queue
type ActionKind string

const (
	ActionKindAutoReply ActionKind = "auto_reply"
	ActionKindNotify    ActionKind = "notify"
)

// QueuedAction represents an action waiting to be executed
type QueuedAction struct {
	Kind      ActionKind
	SessionID string
	CreatedAt time.Time

	// For auto_reply
	Actions  []llm.ActionStep
	Decision *llm.DecideActionResponse

	// For notify
	Summary   *llm.Summary
	NotifyTag string
}

// ActionQueue manages pending actions per session
// Rules:
// - Same session + same kind = only one action (new replaces old)
// - Context change = clear all actions for that session
type ActionQueue struct {
	mu    sync.RWMutex
	items map[string]map[ActionKind]*QueuedAction // sessionID -> kind -> action
}

// NewActionQueue creates a new action queue
func NewActionQueue() *ActionQueue {
	return &ActionQueue{
		items: make(map[string]map[ActionKind]*QueuedAction),
	}
}

// Add adds or replaces an action in the queue
// Same session + same kind = replace existing
func (q *ActionQueue) Add(action *QueuedAction) {
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.items[action.SessionID] == nil {
		q.items[action.SessionID] = make(map[ActionKind]*QueuedAction)
	}
	q.items[action.SessionID][action.Kind] = action
}

// Get retrieves an action by session and kind
func (q *ActionQueue) Get(sessionID string, kind ActionKind) *QueuedAction {
	q.mu.RLock()
	defer q.mu.RUnlock()

	if m, ok := q.items[sessionID]; ok {
		return m[kind]
	}
	return nil
}

// Remove removes a specific action
func (q *ActionQueue) Remove(sessionID string, kind ActionKind) {
	q.mu.Lock()
	defer q.mu.Unlock()

	if m, ok := q.items[sessionID]; ok {
		delete(m, kind)
		if len(m) == 0 {
			delete(q.items, sessionID)
		}
	}
}

// ClearSession removes all actions for a session (called on context change)
func (q *ActionQueue) ClearSession(sessionID string) {
	q.mu.Lock()
	defer q.mu.Unlock()

	delete(q.items, sessionID)
}

// GetReadyActions returns actions ready to execute
// - auto_reply: always ready (execute immediately)
// - notify: ready if created_at + delay <= now
func (q *ActionQueue) GetReadyActions(sessionID string, notifyDelay time.Duration) []*QueuedAction {
	q.mu.RLock()
	defer q.mu.RUnlock()

	var ready []*QueuedAction
	m, ok := q.items[sessionID]
	if !ok {
		return ready
	}

	now := time.Now()

	// auto_reply is always ready
	if action, exists := m[ActionKindAutoReply]; exists {
		ready = append(ready, action)
	}

	// notify is ready if delay has passed
	if action, exists := m[ActionKindNotify]; exists {
		if now.Sub(action.CreatedAt) >= notifyDelay {
			ready = append(ready, action)
		}
	}

	return ready
}

// HasPending checks if session has any pending actions
func (q *ActionQueue) HasPending(sessionID string) bool {
	q.mu.RLock()
	defer q.mu.RUnlock()

	m, ok := q.items[sessionID]
	return ok && len(m) > 0
}

// GetAllSessions returns all session IDs with pending actions
func (q *ActionQueue) GetAllSessions() []string {
	q.mu.RLock()
	defer q.mu.RUnlock()

	sessions := make([]string, 0, len(q.items))
	for sid := range q.items {
		sessions = append(sessions, sid)
	}
	return sessions
}
