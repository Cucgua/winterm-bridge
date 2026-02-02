package monitor

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"winterm-bridge/internal/llm"
)

// AutoActionLog records a single auto-reply action
type AutoActionLog struct {
	ID             string           `json:"id"`
	SessionID      string           `json:"session_id"`
	SessionName    string           `json:"session_name"`
	Tag            string           `json:"tag"`
	Description    string           `json:"description"`
	Actions        []llm.ActionStep `json:"actions"`
	Confidence     float64          `json:"confidence"`
	Evidence       []string         `json:"evidence"`
	Reasoning      string           `json:"reasoning,omitempty"`       // AI reasoning for the decision
	ActionKeywords []string         `json:"action_keywords,omitempty"` // Keywords describing the action effect
	Context        string           `json:"context,omitempty"`         // Terminal context (last N lines)
	Timestamp      int64            `json:"timestamp"`
	Success        bool             `json:"success"`
	Error          string           `json:"error,omitempty"`
}

// ActionLogger manages auto-reply action logs
type ActionLogger struct {
	logs     []AutoActionLog
	maxLogs  int
	filePath string
	mu       sync.RWMutex
}

// NewActionLogger creates a new ActionLogger
func NewActionLogger(configDir string) *ActionLogger {
	l := &ActionLogger{
		logs:     make([]AutoActionLog, 0),
		maxLogs:  500,
		filePath: filepath.Join(configDir, "auto_actions.json"),
	}
	l.load()
	return l
}

// Add adds a new action log entry
func (l *ActionLogger) Add(entry AutoActionLog) {
	l.mu.Lock()
	defer l.mu.Unlock()

	entry.Timestamp = time.Now().Unix()
	entry.ID = fmt.Sprintf("%d-%s", entry.Timestamp, entry.SessionID[:8])

	l.logs = append(l.logs, entry)

	// Trim if exceeds limit
	if len(l.logs) > l.maxLogs {
		l.logs = l.logs[len(l.logs)-l.maxLogs:]
	}

	// Async persist
	go l.save()
}

// GetAll returns all action logs
func (l *ActionLogger) GetAll() []AutoActionLog {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return append([]AutoActionLog{}, l.logs...)
}

// GetBySession returns action logs for a specific session
func (l *ActionLogger) GetBySession(sessionID string) []AutoActionLog {
	l.mu.RLock()
	defer l.mu.RUnlock()

	var result []AutoActionLog
	for _, entry := range l.logs {
		if entry.SessionID == sessionID {
			result = append(result, entry)
		}
	}
	return result
}

// Clear removes all action logs
func (l *ActionLogger) Clear() {
	l.mu.Lock()
	l.logs = make([]AutoActionLog, 0)
	data, _ := json.MarshalIndent(l.logs, "", "  ")
	l.mu.Unlock()
	os.WriteFile(l.filePath, data, 0600)
}

func (l *ActionLogger) save() {
	l.mu.RLock()
	data, _ := json.MarshalIndent(l.logs, "", "  ")
	l.mu.RUnlock()
	os.WriteFile(l.filePath, data, 0600)
}

func (l *ActionLogger) load() {
	data, err := os.ReadFile(l.filePath)
	if err != nil {
		return
	}
	l.mu.Lock()
	json.Unmarshal(data, &l.logs)
	l.mu.Unlock()
}
