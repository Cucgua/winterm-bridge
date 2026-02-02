package monitor

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"
)

const (
	maxLogFileSize   = 5 * 1024 * 1024 // 5MB
	maxEventsInRing  = 100
	flushInterval    = time.Second
	logsSubdir       = "logs"
)

// sanitizeSessionID removes unsafe characters from session ID for file naming
var safeIDRegex = regexp.MustCompile(`[^a-zA-Z0-9\-]`)

func sanitizeSessionID(id string) string {
	safe := safeIDRegex.ReplaceAllString(id, "")
	if len(safe) > 36 {
		safe = safe[:36] // Limit length (UUID is 36 chars)
	}
	return safe
}

// WorkflowEventLogger manages per-session workflow event logs
type WorkflowEventLogger struct {
	configDir string
	writers   map[string]*sessionWriter
	mu        sync.RWMutex
	stopCh    chan struct{}
	wg        sync.WaitGroup
}

type sessionWriter struct {
	sessionID string
	file      *os.File
	writer    *bufio.Writer
	filePath  string
	fileSize  int64
	ring      []WorkflowEvent
	ringIdx   int
	mu        sync.Mutex
}

// NewWorkflowEventLogger creates a new workflow event logger
func NewWorkflowEventLogger(configDir string) *WorkflowEventLogger {
	l := &WorkflowEventLogger{
		configDir: configDir,
		writers:   make(map[string]*sessionWriter),
		stopCh:    make(chan struct{}),
	}

	// Ensure logs directory exists
	logsDir := filepath.Join(configDir, logsSubdir)
	os.MkdirAll(logsDir, 0755)

	// Start background flusher
	l.wg.Add(1)
	go l.flushLoop()

	return l
}

// Append adds a new event for a session
func (l *WorkflowEventLogger) Append(event WorkflowEvent) {
	l.mu.Lock()
	sw, exists := l.writers[event.SessionID]
	if !exists {
		sw = l.createWriter(event.SessionID)
		l.writers[event.SessionID] = sw
	}
	l.mu.Unlock()

	sw.append(event)
}

// GetRecent returns recent events for a session
func (l *WorkflowEventLogger) GetRecent(sessionID string, limit int) []WorkflowEvent {
	l.mu.RLock()
	sw, exists := l.writers[sessionID]
	l.mu.RUnlock()

	if !exists {
		return nil
	}

	return sw.getRecent(limit)
}

// Close stops the logger and flushes all writers
func (l *WorkflowEventLogger) Close() {
	close(l.stopCh)
	l.wg.Wait()

	l.mu.Lock()
	defer l.mu.Unlock()

	for _, sw := range l.writers {
		sw.close()
	}
	l.writers = make(map[string]*sessionWriter)
}

// CloseSession closes the writer for a specific session
func (l *WorkflowEventLogger) CloseSession(sessionID string) {
	l.mu.Lock()
	sw, exists := l.writers[sessionID]
	if exists {
		delete(l.writers, sessionID)
	}
	l.mu.Unlock()

	if sw != nil {
		sw.close()
	}
}

func (l *WorkflowEventLogger) createWriter(sessionID string) *sessionWriter {
	// Sanitize sessionID: only allow alphanumeric and hyphens to prevent path traversal
	safeID := sanitizeSessionID(sessionID)
	if safeID == "" {
		safeID = "unknown"
	}

	filePath := filepath.Join(l.configDir, logsSubdir, fmt.Sprintf("session-%s.jsonl", safeID))

	sw := &sessionWriter{
		sessionID: sessionID,
		filePath:  filePath,
		ring:      make([]WorkflowEvent, 0, maxEventsInRing),
	}

	// Open file for append
	f, err := os.OpenFile(filePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err == nil {
		sw.file = f
		sw.writer = bufio.NewWriter(f)
		// Get current file size
		if info, err := f.Stat(); err == nil {
			sw.fileSize = info.Size()
		}
	}

	return sw
}

func (l *WorkflowEventLogger) flushLoop() {
	defer l.wg.Done()

	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-l.stopCh:
			l.flushAll()
			return
		case <-ticker.C:
			l.flushAll()
		}
	}
}

func (l *WorkflowEventLogger) flushAll() {
	l.mu.RLock()
	writers := make([]*sessionWriter, 0, len(l.writers))
	for _, sw := range l.writers {
		writers = append(writers, sw)
	}
	l.mu.RUnlock()

	for _, sw := range writers {
		sw.flush()
	}
}

func (sw *sessionWriter) append(event WorkflowEvent) {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	// Add to ring buffer
	if len(sw.ring) < maxEventsInRing {
		sw.ring = append(sw.ring, event)
	} else {
		sw.ring[sw.ringIdx] = event
		sw.ringIdx = (sw.ringIdx + 1) % maxEventsInRing
	}

	// Write to file if available
	if sw.writer == nil {
		return
	}

	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	n, err := sw.writer.Write(append(data, '\n'))
	if err != nil {
		return
	}
	sw.fileSize += int64(n)

	// Check for rotation
	if sw.fileSize >= maxLogFileSize {
		sw.rotate()
	}
}

func (sw *sessionWriter) getRecent(limit int) []WorkflowEvent {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	count := len(sw.ring)
	if limit > 0 && limit < count {
		count = limit
	}

	result := make([]WorkflowEvent, count)

	if len(sw.ring) < maxEventsInRing {
		// Ring not full, simple copy from end
		start := len(sw.ring) - count
		copy(result, sw.ring[start:])
	} else {
		// Ring is full, need to handle wrap-around
		idx := sw.ringIdx
		for i := count - 1; i >= 0; i-- {
			idx--
			if idx < 0 {
				idx = maxEventsInRing - 1
			}
			result[i] = sw.ring[idx]
		}
	}

	return result
}

func (sw *sessionWriter) flush() {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	if sw.writer != nil {
		sw.writer.Flush()
	}
}

func (sw *sessionWriter) close() {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	if sw.writer != nil {
		sw.writer.Flush()
	}
	if sw.file != nil {
		sw.file.Close()
		sw.file = nil
		sw.writer = nil
	}
}

func (sw *sessionWriter) rotate() {
	if sw.file != nil {
		sw.writer.Flush()
		sw.file.Close()
	}

	// Rename current to .1
	backupPath := sw.filePath + ".1"
	os.Remove(backupPath)
	os.Rename(sw.filePath, backupPath)

	// Create new file
	f, err := os.OpenFile(sw.filePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err == nil {
		sw.file = f
		sw.writer = bufio.NewWriter(f)
		sw.fileSize = 0
	} else {
		sw.file = nil
		sw.writer = nil
	}
}
