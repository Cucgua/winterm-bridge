package monitor

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"winterm-bridge/internal/config"
	"winterm-bridge/internal/email"
	"winterm-bridge/internal/llm"
	"winterm-bridge/internal/tmux"
)

// SessionInfo contains the minimal info needed for monitoring
type SessionInfo struct {
	ID       string
	Title    string
	TmuxName string
	IsGhost  bool
}

// SessionProvider is the interface for accessing session data
type SessionProvider interface {
	// GetAllSessions returns all sessions for monitoring
	GetAllSessions() []SessionInfo
	// BroadcastToSession sends a text message to all WebSocket subscribers of a session
	BroadcastToSession(sessionID string, data []byte)
}

// SummaryMessage is the JSON message sent to frontend
type SummaryMessage struct {
	Type        string `json:"type"`
	SessionID   string `json:"session_id"`
	Tag         string `json:"tag"`
	Description string `json:"description"`
	Timestamp   int64  `json:"timestamp"`
}

// sessionState tracks per-session monitoring state
type sessionState struct {
	lastHash     string
	lastSummary  *llm.Summary
	summaryTime  time.Time
	// Notification tracking
	notifiedTags  map[string]bool      // Tags that have been notified (only notify once per tag)
	pendingNotify map[string]time.Time // Tags pending notification (tag -> first detected time)
}

// Service is the AI monitoring service
type Service struct {
	provider     llm.Provider
	sessions     SessionProvider
	emailSender  *email.Sender
	config       Config
	states       map[string]*sessionState
	mu           sync.RWMutex
	cancel       context.CancelFunc
	running      bool
}

// Config holds the monitor configuration
type Config struct {
	Enabled  bool   `json:"enabled"`
	Endpoint string `json:"endpoint"`
	APIKey   string `json:"api_key"`
	Model    string `json:"model"`
	Lines    int    `json:"lines"`
	Interval int    `json:"interval"` // seconds
}

// DefaultConfig returns the default configuration
func DefaultConfig() Config {
	return Config{
		Enabled:  false,
		Endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		APIKey:   "",
		Model:    "qwen-turbo",
		Lines:    50,
		Interval: 30,
	}
}

// NewService creates a new monitor service
func NewService(sessions SessionProvider) *Service {
	s := &Service{
		sessions:    sessions,
		emailSender: email.NewSender(),
		config:      DefaultConfig(),
		states:      make(map[string]*sessionState),
	}
	// Load email config if available
	if emailCfg := config.GetEmailConfig(); emailCfg != nil {
		s.emailSender.UpdateConfig(emailCfg)
	}
	return s
}

// UpdateConfig updates the monitor configuration and restarts if needed
func (s *Service) UpdateConfig(cfg Config) {
	s.mu.Lock()
	wasRunning := s.running
	s.config = cfg
	s.mu.Unlock()

	// Restart if config changed and was running
	if wasRunning {
		s.Stop()
	}

	if cfg.Enabled && cfg.APIKey != "" {
		s.Start()
	}
}

// GetConfig returns the current configuration
func (s *Service) GetConfig() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config
}

// GetEmailConfig returns the email configuration
func (s *Service) GetEmailConfig() *config.EmailConfig {
	return s.emailSender.GetConfig()
}

// UpdateEmailConfig updates the email configuration
func (s *Service) UpdateEmailConfig(cfg *config.EmailConfig) {
	s.emailSender.UpdateConfig(cfg)
}

// TestEmail sends a test email
func (s *Service) TestEmail() error {
	return s.emailSender.Test()
}

// GetSummary returns the cached summary for a session
func (s *Service) GetSummary(sessionID string) *SummaryMessage {
	s.mu.RLock()
	defer s.mu.RUnlock()

	state, ok := s.states[sessionID]
	if !ok || state.lastSummary == nil {
		return nil
	}

	return &SummaryMessage{
		Type:        "ai_summary",
		SessionID:   sessionID,
		Tag:         state.lastSummary.Tag,
		Description: state.lastSummary.Description,
		Timestamp:   state.summaryTime.Unix(),
	}
}

// Start begins the monitoring loop
func (s *Service) Start() {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}

	cfg := s.config
	if !cfg.Enabled || cfg.APIKey == "" {
		s.mu.Unlock()
		return
	}

	// Create LLM provider
	s.provider = llm.NewOpenAICompatProvider(llm.Config{
		Endpoint: cfg.Endpoint,
		APIKey:   cfg.APIKey,
		Model:    cfg.Model,
	})

	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	s.running = true
	s.mu.Unlock()

	log.Printf("[Monitor] AI monitor started (interval: %ds, lines: %d)", cfg.Interval, cfg.Lines)

	go s.loop(ctx)
}

// Stop stops the monitoring loop
func (s *Service) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}

	if s.cancel != nil {
		s.cancel()
	}
	s.running = false
	log.Printf("[Monitor] AI monitor stopped")
}

// IsRunning returns whether the monitor is active
func (s *Service) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.running
}

// loop is the main monitoring loop
func (s *Service) loop(ctx context.Context) {
	s.mu.RLock()
	interval := time.Duration(s.config.Interval) * time.Second
	s.mu.RUnlock()

	if interval < 5*time.Second {
		interval = 5 * time.Second
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.analyzeAllSessions(ctx)
		}
	}
}

// analyzeAllSessions checks and analyzes all sessions
func (s *Service) analyzeAllSessions(ctx context.Context) {
	sessions := s.sessions.GetAllSessions()

	for _, sess := range sessions {
		select {
		case <-ctx.Done():
			return
		default:
			// Skip ghost sessions (no tmux to capture)
			if sess.IsGhost {
				continue
			}
			s.analyzeSession(ctx, sess)
		}
	}
}

// analyzeSession checks a single session for changes and triggers analysis
func (s *Service) analyzeSession(ctx context.Context, sess SessionInfo) {
	s.mu.RLock()
	lines := s.config.Lines
	s.mu.RUnlock()

	// Capture terminal content directly from tmux
	content, err := tmux.CaptureSessionPane(sess.TmuxName, lines)
	if err != nil {
		// Session might not exist or is detached, skip silently
		return
	}

	if content == "" {
		return
	}

	// Normalize content for hash comparison (filter empty lines)
	normalizedContent := normalizeContent(content)
	if normalizedContent == "" {
		return
	}

	// Calculate content hash for change detection
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(normalizedContent)))

	s.mu.RLock()
	state, exists := s.states[sess.ID]
	s.mu.RUnlock()

	// Skip if content hasn't changed
	if exists && state.lastHash == hash {
		return
	}

	// Call LLM
	summary, err := s.provider.Summarize(ctx, content)
	if err != nil {
		log.Printf("[Monitor] Failed to analyze session %s: %v", sess.ID[:8], err)
		return
	}

	// Update state
	s.mu.Lock()
	if !exists {
		state = &sessionState{
			notifiedTags:  make(map[string]bool),
			pendingNotify: make(map[string]time.Time),
		}
		s.states[sess.ID] = state
	}

	state.lastHash = hash
	state.lastSummary = summary
	state.summaryTime = time.Now()
	s.mu.Unlock()

	// Check if we should send notification
	s.checkAndSendNotification(sess, summary, state)

	// Broadcast to subscribers (if any are connected)
	msg := SummaryMessage{
		Type:        "ai_summary",
		SessionID:   sess.ID,
		Tag:         summary.Tag,
		Description: summary.Description,
		Timestamp:   time.Now().Unix(),
	}

	msgData, err := json.Marshal(msg)
	if err != nil {
		return
	}

	s.sessions.BroadcastToSession(sess.ID, msgData)
}

// CleanupSession removes monitoring state for a session
func (s *Service) CleanupSession(sessionID string) {
	s.mu.Lock()
	delete(s.states, sessionID)
	s.mu.Unlock()
}

// Tags that should trigger notifications
var notifiableTags = map[string]bool{
	"需输入": true,
	"需选择": true,
	"完毕":  true,
	"错误":  true,
}

// checkAndSendNotification checks if we should send a notification for this session
func (s *Service) checkAndSendNotification(sess SessionInfo, summary *llm.Summary, state *sessionState) {
	// Check if this tag should trigger notification
	isNotifiable := notifiableTags[summary.Tag]

	s.mu.Lock()
	// Initialize maps if nil
	if state.pendingNotify == nil {
		state.pendingNotify = make(map[string]time.Time)
	}
	if state.notifiedTags == nil {
		state.notifiedTags = make(map[string]bool)
	}

	// Clear pending notifications for tags that are no longer active
	for tag := range state.pendingNotify {
		if tag != summary.Tag {
			delete(state.pendingNotify, tag)
		}
	}
	s.mu.Unlock()

	// If not a notifiable tag, nothing more to do
	if !isNotifiable {
		return
	}

	// Check if notification is enabled for this session
	if !config.GetSessionNotifyEnabled(sess.ID) {
		return
	}

	// Check if email is configured
	if !s.emailSender.IsEnabled() {
		return
	}

	// Check if this tag has already been notified (only notify once per tag)
	s.mu.RLock()
	alreadyNotified := state.notifiedTags[summary.Tag]
	pendingTime, isPending := state.pendingNotify[summary.Tag]
	s.mu.RUnlock()

	if alreadyNotified {
		return
	}

	// Get notify delay from email config
	emailCfg := s.emailSender.GetConfig()
	notifyDelay := 60 // default 60 seconds
	if emailCfg != nil && emailCfg.NotifyDelay > 0 {
		notifyDelay = emailCfg.NotifyDelay
	}

	now := time.Now()

	// If not pending, start the pending timer
	if !isPending {
		s.mu.Lock()
		state.pendingNotify[summary.Tag] = now
		s.mu.Unlock()
		return
	}

	// Check if delay has passed
	if now.Sub(pendingTime) < time.Duration(notifyDelay)*time.Second {
		// Delay not yet passed, wait for next check
		return
	}

	// Delay has passed, send notification
	sessionTitle := sess.Title
	if sessionTitle == "" {
		sessionTitle = sess.TmuxName
	}
	if sessionTitle == "" {
		sessionTitle = sess.ID[:8]
	}

	if err := s.emailSender.SendNotification(sessionTitle, sess.ID, summary.Tag, summary.Description); err != nil {
		log.Printf("[Monitor] Failed to send notification for session %s: %v", sess.ID[:8], err)
		return
	}

	// Mark this tag as notified and clear pending
	s.mu.Lock()
	state.notifiedTags[summary.Tag] = true
	delete(state.pendingNotify, summary.Tag)
	s.mu.Unlock()
}

// TestConnection tests the LLM API connection
func (s *Service) TestConnection(ctx context.Context, cfg Config) error {
	provider := llm.NewOpenAICompatProvider(llm.Config{
		Endpoint: cfg.Endpoint,
		APIKey:   cfg.APIKey,
		Model:    cfg.Model,
	})
	return provider.TestConnection(ctx)
}

// FormatSummaryJSON formats a summary message as JSON bytes
func FormatSummaryJSON(sessionID, tag, description string) ([]byte, error) {
	msg := SummaryMessage{
		Type:        "ai_summary",
		SessionID:   sessionID,
		Tag:         tag,
		Description: description,
		Timestamp:   time.Now().Unix(),
	}
	return json.Marshal(msg)
}

// String implements fmt.Stringer
func (s *Service) String() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return fmt.Sprintf("Monitor(running=%v, sessions=%d)", s.running, len(s.states))
}

// normalizeContent filters empty lines and trims whitespace for consistent hashing
func normalizeContent(content string) string {
	lines := strings.Split(content, "\n")
	var normalized []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			normalized = append(normalized, trimmed)
		}
	}
	return strings.Join(normalized, "\n")
}
