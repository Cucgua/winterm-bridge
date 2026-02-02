package llm

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"winterm-bridge/internal/config"
)

// AIRequestLog represents a single AI request/response log entry
type AIRequestLog struct {
	ID        string    `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	Type      string    `json:"type"` // "summarize" or "decide_action"
	Model     string    `json:"model"`
	SessionID string    `json:"session_id,omitempty"`

	// Request
	SystemPrompt  string `json:"system_prompt"`
	UserContent   string `json:"user_content"`
	RequestParams string `json:"request_params,omitempty"` // Full request body (JSON string)
	ExtraParams   string `json:"extra_params,omitempty"`   // User-configured extra params

	// Response
	RawResponse string `json:"raw_response"`
	ParsedJSON  string `json:"parsed_json,omitempty"`
	Error       string `json:"error,omitempty"`

	// Timing
	DurationMs int64 `json:"duration_ms"`
}

// RequestLogger handles persistent logging of AI requests
type RequestLogger struct {
	mu      sync.Mutex
	logDir  string
	enabled bool
}

var (
	globalLogger *RequestLogger
	loggerOnce   sync.Once
)

// GetRequestLogger returns the singleton request logger
func GetRequestLogger() *RequestLogger {
	loggerOnce.Do(func() {
		globalLogger = &RequestLogger{
			logDir:  config.AILogDir(),
			enabled: config.GetAILogEnabled(),
		}
	})
	return globalLogger
}

// SetEnabled updates the logger enabled state
func (l *RequestLogger) SetEnabled(enabled bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.enabled = enabled
}

// IsEnabled returns whether logging is enabled
func (l *RequestLogger) IsEnabled() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.enabled
}

// Log writes a request log entry to file
func (l *RequestLogger) Log(entry AIRequestLog) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if !l.enabled {
		return
	}

	// Ensure log directory exists
	if err := os.MkdirAll(l.logDir, 0755); err != nil {
		return
	}

	// Generate log filename based on date
	filename := fmt.Sprintf("ai_requests_%s.jsonl", time.Now().Format("2006-01-02"))
	filepath := filepath.Join(l.logDir, filename)

	// Open file in append mode
	f, err := os.OpenFile(filepath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()

	// Generate ID if not set
	if entry.ID == "" {
		entry.ID = fmt.Sprintf("%d", time.Now().UnixNano())
	}
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}

	// Write as JSON line
	data, err := json.Marshal(entry)
	if err != nil {
		return
	}
	f.Write(data)
	f.WriteString("\n")
}

// GetLogs returns recent log entries
func (l *RequestLogger) GetLogs(limit int, dateFilter string) ([]AIRequestLog, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if limit <= 0 {
		limit = 100
	}

	// Determine which file to read
	date := dateFilter
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	filename := fmt.Sprintf("ai_requests_%s.jsonl", date)
	filepath := filepath.Join(l.logDir, filename)

	data, err := os.ReadFile(filepath)
	if err != nil {
		if os.IsNotExist(err) {
			return []AIRequestLog{}, nil
		}
		return nil, err
	}

	// Parse JSONL
	var logs []AIRequestLog
	lines := splitLines(string(data))
	for _, line := range lines {
		if line == "" {
			continue
		}
		var entry AIRequestLog
		if err := json.Unmarshal([]byte(line), &entry); err == nil {
			logs = append(logs, entry)
		}
	}

	// Return last N entries (most recent)
	if len(logs) > limit {
		logs = logs[len(logs)-limit:]
	}

	// Reverse to show newest first
	for i, j := 0, len(logs)-1; i < j; i, j = i+1, j-1 {
		logs[i], logs[j] = logs[j], logs[i]
	}

	return logs, nil
}

// ListLogDates returns available log dates
func (l *RequestLogger) ListLogDates() ([]string, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	entries, err := os.ReadDir(l.logDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}

	var dates []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		// Extract date from filename like "ai_requests_2024-01-15.jsonl"
		if len(name) > 24 && name[:12] == "ai_requests_" {
			date := name[12:22]
			dates = append(dates, date)
		}
	}

	// Sort descending (newest first)
	for i, j := 0, len(dates)-1; i < j; i, j = i+1, j-1 {
		dates[i], dates[j] = dates[j], dates[i]
	}

	return dates, nil
}

// ClearLogs removes all log files
func (l *RequestLogger) ClearLogs() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	entries, err := os.ReadDir(l.logDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		os.Remove(filepath.Join(l.logDir, entry.Name()))
	}

	return nil
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}
