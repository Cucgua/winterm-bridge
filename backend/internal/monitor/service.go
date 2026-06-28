package monitor

import (
	"context"
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
	lastTokens                []string // Token sequence for semantic comparison (resize-immune)
	lastSummary               *llm.Summary
	summaryTime               time.Time
	lastAnalysisAt            time.Time
	recentTransitions         []llm.StateTransition
	observationsSinceAnalysis []llm.StateObservation
	// Notification tracking
	notifiedTags map[string]bool // Tags that have been notified (only notify once per tag)
	// State deduplication for workflow events
	lastStateHash string // Hash of Tag + Description + token fingerprint
	// Failure tracking for backoff
	failureCount int       // Consecutive LLM failures
	lastFailure  time.Time // Last failure time
	// Auto-reply skip tracking (avoid repeated skip events)
	lastSkippedHash string // Hash of state when auto-reply was skipped
}

const maxRecentTransitions = 8

// Service is the AI monitoring service
type Service struct {
	provider           llm.Provider
	sessions           SessionProvider
	emailSender        *email.Sender
	config             Config
	states             map[string]*sessionState
	mu                 sync.RWMutex
	cancel             context.CancelFunc
	running            bool
	wg                 sync.WaitGroup // Wait for goroutine to finish
	autoGate           *AutoGate
	actionLogger       *ActionLogger
	workflowLogger     *WorkflowEventLogger
	actionQueue        *ActionQueue         // Pending actions queue
	eventSeq           int64                // Global sequence counter for event ordering
	userInputCooldowns map[string]time.Time // sessionID -> 最近用户输入时间
}

// Config holds the monitor configuration
type Config struct {
	Enabled     bool   `json:"enabled"`
	Endpoint    string `json:"endpoint"`
	APIKey      string `json:"api_key"`
	Model       string `json:"model"`
	Lines       int    `json:"lines"`
	Interval    int    `json:"interval"`     // seconds
	ExtraParams string `json:"extra_params"` // JSON string for custom API parameters
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
	configDir := config.DefaultConfigDir()
	s := &Service{
		sessions:           sessions,
		emailSender:        email.NewSender(),
		config:             DefaultConfig(),
		states:             make(map[string]*sessionState),
		autoGate:           NewAutoGate(),
		actionLogger:       NewActionLogger(configDir),
		workflowLogger:     NewWorkflowEventLogger(configDir),
		actionQueue:        NewActionQueue(),
		userInputCooldowns: make(map[string]time.Time),
	}
	// Load email config if available
	if emailCfg := config.GetEmailConfig(); emailCfg != nil {
		s.emailSender.UpdateConfig(emailCfg)
	}
	return s
}

const userInputCooldownDuration = 5 * time.Second

// OnUserInput is called by PTY handler when user types in the terminal.
// It immediately clears pending actions and sets a cooldown period.
func (s *Service) OnUserInput(sessionID string) {
	hadPending := s.actionQueue.HasPending(sessionID)
	s.actionQueue.ClearSession(sessionID)

	s.mu.Lock()
	s.userInputCooldowns[sessionID] = time.Now()
	s.mu.Unlock()

	if hadPending {
		sess := SessionInfo{ID: sessionID}
		s.emitWorkflowEvent(sess, EventActionRemoved, withReason("user_input"))
		log.Printf("[Monitor] User input cleared pending actions for session %s", sessionID[:8])
	}
}

// isInUserInputCooldown checks if the cooldown period is active for a session.
func (s *Service) isInUserInputCooldown(sessionID string) bool {
	s.mu.RLock()
	lastInput, ok := s.userInputCooldowns[sessionID]
	s.mu.RUnlock()
	if !ok {
		return false
	}
	return time.Since(lastInput) < userInputCooldownDuration
}

// UpdateConfig updates the monitor configuration and restarts if needed
func (s *Service) UpdateConfig(cfg Config) {
	// Stop first (outside lock to allow wg.Wait)
	s.Stop()

	// Now update config and restart if needed
	s.mu.Lock()
	s.config = cfg
	s.mu.Unlock()

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
		Endpoint:    cfg.Endpoint,
		APIKey:      cfg.APIKey,
		Model:       cfg.Model,
		ExtraParams: cfg.ExtraParams,
	})

	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	s.running = true
	s.wg.Add(1)
	s.mu.Unlock()

	log.Printf("[Monitor] AI monitor started (interval: %ds, lines: %d)", cfg.Interval, cfg.Lines)

	go s.loop(ctx)
}

// Stop stops the monitoring loop and waits for it to finish
func (s *Service) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}

	if s.cancel != nil {
		s.cancel()
	}
	s.running = false
	s.mu.Unlock()

	// Wait for goroutine to finish (outside lock to avoid deadlock)
	s.wg.Wait()
	log.Printf("[Monitor] AI monitor stopped")
}

// IsRunning returns whether the monitor is active
func (s *Service) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.running
}

// loop is the main monitoring loop
// New workflow:
// 1. Sleep interval
// 2. Check context change for each session
//   - Changed: clear action queue, AI analyze, maybe add actions to queue
//   - Unchanged: skip to step 3
//
// 3. Check action queue for ready actions
//   - auto_reply: execute immediately if exists
//   - notify: execute if delay passed
//
// 4. Go back to step 1
func (s *Service) loop(ctx context.Context) {
	defer s.wg.Done()

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
			s.processAllSessions(ctx)
		}
	}
}

// processAllSessions processes all sessions with the new workflow
func (s *Service) processAllSessions(ctx context.Context) {
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
			s.processSession(ctx, sess)
		}
	}
}

// processSession implements the per-session workflow:
// 1. Check context change
// 2. If changed: clear queue → AI analyze → maybe add actions
// 3. Check and execute ready actions from queue
func (s *Service) processSession(ctx context.Context, sess SessionInfo) {
	// Step 1: Check for context change
	changed, tokens := s.checkContextChange(sess)

	if changed {
		// Step 2a: Context changed - clear pending actions (they're now stale)
		if s.actionQueue.HasPending(sess.ID) {
			s.emitWorkflowEvent(sess, EventActionRemoved)
		}
		s.actionQueue.ClearSession(sess.ID)

		// Step 2b: Run AI analysis
		s.analyzeSession(ctx, sess, tokens)
	} else {
		// Context unchanged - check for pending notifications and auto-reply
		s.mu.RLock()
		state := s.states[sess.ID]
		s.mu.RUnlock()

		if state != nil && state.lastSummary != nil {
			s.checkAndSendNotification(sess, state.lastSummary, state)
			// Also check auto-reply for cached state
			// This handles the case when auto-reply is enabled mid-session
			// while the terminal is already waiting for input
			s.maybeQueueAutoReply(ctx, sess, state.lastSummary)
		}
	}

	// Step 3: Check and execute ready actions
	actionsExecuted := s.executeReadyActionsWithCount(ctx, sess)

	// Step 4: Emit idle event if no context change and no actions executed
	if !changed && actionsExecuted == 0 {
		s.emitWorkflowEvent(sess, EventIdle)
	}
}

// checkContextChange checks if session context has changed
// Returns (changed bool, tokens []string)
func (s *Service) checkContextChange(sess SessionInfo) (bool, []string) {
	s.mu.RLock()
	lines := s.config.Lines
	s.mu.RUnlock()

	// Capture terminal content
	content, err := tmux.CaptureSessionPane(sess.TmuxName, lines)
	if err != nil || content == "" {
		return false, nil
	}

	tokens := extractTextTokens(content)
	if len(tokens) == 0 {
		return false, nil
	}

	s.mu.RLock()
	state, exists := s.states[sess.ID]
	s.mu.RUnlock()

	// Check if content effectively unchanged
	if exists && contentUnchanged(state.lastTokens, tokens) {
		return false, tokens
	}

	return true, tokens
}

// analyzeSession runs AI analysis on changed content and queues actions
func (s *Service) analyzeSession(ctx context.Context, sess SessionInfo, tokens []string) {
	// Check if we should skip due to backoff
	if s.shouldSkipAnalysis(sess.ID) {
		return
	}

	startTime := time.Now()
	s.emitWorkflowEvent(sess, EventStateCheckStart)

	defer func() {
		duration := time.Since(startTime).Milliseconds()
		s.emitWorkflowEvent(sess, EventStateCheckEnd, withDuration(duration))
	}()

	s.mu.RLock()
	lines := s.config.Lines
	s.mu.RUnlock()

	// Re-capture content for LLM (tokens were just for change detection)
	content, err := tmux.CaptureSessionPane(sess.TmuxName, lines)
	if err != nil || content == "" {
		// Update tokens to prevent repeated triggering
		s.updateSessionTokens(sess.ID, tokens)
		return
	}

	// Emit state analysis start event before LLM call
	s.emitWorkflowEvent(sess, EventStateAnalysisStart)

	analysisReq := s.buildStateAnalysisRequest(sess, content, tokens)

	// Call LLM
	summary, err := s.provider.Summarize(ctx, analysisReq)
	if err != nil {
		if ctx.Err() != nil {
			return
		}
		log.Printf("[Monitor] Failed to analyze session %s: %v", sess.ID[:8], err)
		// Emit analysis_failed event
		s.emitWorkflowEvent(sess, EventAnalysisFailed, withError(err.Error()))
		// Update tokens and increment failure count for backoff
		s.updateSessionTokens(sess.ID, tokens)
		s.incrementFailureCount(sess.ID)
		return
	}
	llm.NormalizeSummary(summary)

	// Compute state hash for deduplication
	stateHash := computeStateHash(summary.Tag, summary.Description, tokens)

	// Check if state actually changed
	s.mu.RLock()
	state := s.states[sess.ID]
	prevHash := ""
	if state != nil {
		prevHash = state.lastStateHash
	}
	s.mu.RUnlock()

	// Only emit state_returned if state hash changed
	if stateHash != prevHash {
		s.emitWorkflowEvent(sess, EventStateReturned, withTag(summary.Tag), withDesc(summary.Description))
	}

	// Update state
	s.mu.Lock()
	if state == nil {
		state = &sessionState{
			notifiedTags: make(map[string]bool),
		}
		s.states[sess.ID] = state
	}
	state.lastTokens = tokens
	state.lastSummary = summary
	state.summaryTime = time.Now()
	state.lastAnalysisAt = time.Now()
	state.lastStateHash = stateHash
	if transition := normalizedTransition(analysisReq.PreviousState, summary); transition != nil {
		appendRecentTransition(state, *transition)
	}
	state.observationsSinceAnalysis = []llm.StateObservation{}
	// Reset failure count on success
	state.failureCount = 0
	s.mu.Unlock()

	// Broadcast summary to subscribers
	msg := SummaryMessage{
		Type:        "ai_summary",
		SessionID:   sess.ID,
		Tag:         summary.Tag,
		Description: summary.Description,
		Timestamp:   time.Now().Unix(),
	}
	msgData, _ := json.Marshal(msg)
	s.sessions.BroadcastToSession(sess.ID, msgData)

	// Check notification and maybe queue
	s.checkAndSendNotification(sess, summary, state)

	// Check auto-reply and maybe queue action
	s.maybeQueueAutoReply(ctx, sess, summary)
}

func (s *Service) buildStateAnalysisRequest(sess SessionInfo, content string, tokens []string) llm.StateAnalysisRequest {
	observation := llm.StateObservation{
		Type:    "terminal_changed",
		Summary: fmt.Sprintf("终端内容变化，当前 token 数 %d，tail 行数 %d", len(tokens), countLines(content)),
	}

	s.mu.RLock()
	state := s.states[sess.ID]
	var previous *llm.SessionStateSummary
	var transitions []llm.StateTransition
	var observations []llm.StateObservation
	if state != nil {
		previous = summaryToStateSummary(state.lastSummary)
		transitions = append(transitions, state.recentTransitions...)
		observations = append(observations, state.observationsSinceAnalysis...)
	}
	s.mu.RUnlock()

	observations = append(observations, observation)

	return llm.StateAnalysisRequest{
		SessionID:                   sess.ID,
		SessionGoal:                 config.GetSessionAutoGoal(sess.ID),
		PreviousState:               previous,
		RecentTransitions:           transitions,
		EventsSincePreviousAnalysis: observations,
		CurrentTerminalTail:         content,
		AllowedTransitions:          allowedStateTransitions(previous),
	}
}

func summaryToStateSummary(summary *llm.Summary) *llm.SessionStateSummary {
	if summary == nil {
		return nil
	}
	copySummary := *summary
	copySummary.Evidence = append([]string(nil), summary.Evidence...)
	llm.NormalizeSummary(&copySummary)
	return &llm.SessionStateSummary{
		Tag:            copySummary.Tag,
		Description:    copySummary.Description,
		Phase:          copySummary.Phase,
		Activity:       copySummary.Activity,
		Confidence:     copySummary.Confidence,
		Evidence:       copySummary.Evidence,
		NeedsUserInput: copySummary.NeedsUserInput,
		IsStale:        copySummary.IsStale,
	}
}

func allowedStateTransitions(previous *llm.SessionStateSummary) []string {
	if previous == nil || previous.Phase == "" {
		return []string{
			"unknown -> running_command",
			"unknown -> waiting_for_user",
			"unknown -> error",
			"unknown -> completed",
			"unknown -> waiting_for_process",
		}
	}
	from := previous.Phase
	return []string{
		from + " -> running_command",
		from + " -> waiting_for_user",
		from + " -> waiting_for_process",
		from + " -> error",
		from + " -> completed",
		from + " -> blocked",
		from + " -> " + from,
	}
}

func normalizedTransition(previous *llm.SessionStateSummary, summary *llm.Summary) *llm.StateTransition {
	if summary == nil {
		return nil
	}
	if summary.Transition != nil {
		return summary.Transition
	}
	from := ""
	if previous != nil {
		from = previous.Phase
	}
	to := summary.Phase
	if to == "" {
		to = "unknown"
	}
	return &llm.StateTransition{
		From:   from,
		To:     to,
		Reason: summary.Description,
	}
}

func appendRecentTransition(state *sessionState, transition llm.StateTransition) {
	if state == nil {
		return
	}
	state.recentTransitions = append(state.recentTransitions, transition)
	if len(state.recentTransitions) > maxRecentTransitions {
		state.recentTransitions = state.recentTransitions[len(state.recentTransitions)-maxRecentTransitions:]
	}
}

func countLines(content string) int {
	if content == "" {
		return 0
	}
	return strings.Count(content, "\n") + 1
}

// maybeQueueAutoReply checks if auto-reply should be triggered and queues action
func (s *Service) maybeQueueAutoReply(ctx context.Context, sess SessionInfo, summary *llm.Summary) {
	// 冷却期内不入队（用户正在操作）
	if s.isInUserInputCooldown(sess.ID) {
		return
	}

	// Check if auto-reply is enabled for this session
	if !config.GetSessionAutoEnabled(sess.ID) {
		return
	}

	// Compute state hash for skip deduplication
	s.mu.RLock()
	state := s.states[sess.ID]
	currentHash := ""
	if state != nil {
		currentHash = state.lastStateHash
	}
	s.mu.RUnlock()

	// Helper to check if we should skip silently (already skipped for this state)
	shouldSkipSilently := func() bool {
		if state == nil || currentHash == "" {
			return false
		}
		return state.lastSkippedHash == currentHash
	}

	// Helper to mark state as skipped
	markSkipped := func() {
		s.mu.Lock()
		if state != nil {
			state.lastSkippedHash = currentHash
		}
		s.mu.Unlock()
	}

	autoCfg := config.GetAutoConfig()

	// Check if this tag is allowed for auto-reply
	tagAllowed := false
	for _, t := range autoCfg.AllowTags {
		if t == summary.Tag {
			tagAllowed = true
			break
		}
	}
	if !tagAllowed {
		if !shouldSkipSilently() {
			s.emitWorkflowEvent(sess, EventActionSkipped,
				withReason("tag_not_allowed"),
				withTag(summary.Tag))
			markSkipped()
		}
		return
	}

	// Skip LLM call if already analyzed this state (avoid duplicate API calls)
	// This prevents repeated analysis when context is unchanged across polling cycles
	// Note: lastSkippedHash is cleared when state hash changes in analyzeSession
	if shouldSkipSilently() {
		return
	}

	// Capture more context for decision
	fullContent, err := tmux.CaptureSessionPane(sess.TmuxName, autoCfg.ContextLines)
	if err != nil || fullContent == "" {
		return
	}

	// Strip user input line
	fullContent = stripUserInputLine(fullContent)

	// Build deny keywords string
	denyStr := strings.Join(autoCfg.DenyKeywords, ", ")

	// Get decision provider
	s.mu.RLock()
	decisionProvider := s.provider
	cfg := s.config
	s.mu.RUnlock()

	autoExtraParams := autoCfg.ExtraParams
	if autoExtraParams == "" {
		autoExtraParams = cfg.ExtraParams
	}

	if autoCfg.Model != "" || autoCfg.ExtraParams != "" {
		model := autoCfg.Model
		if model == "" {
			model = cfg.Model
		}
		decisionProvider = llm.NewOpenAICompatProvider(llm.Config{
			Endpoint:    cfg.Endpoint,
			APIKey:      cfg.APIKey,
			Model:       model,
			ExtraParams: autoExtraParams,
		})
	}

	// Emit action analysis start event before LLM decision call
	s.emitWorkflowEvent(sess, EventActionAnalysisStart)
	analysisStartTime := time.Now()

	// Call LLM for decision
	sessionGoal := config.GetSessionAutoGoal(sess.ID)
	decision, err := decisionProvider.DecideAction(ctx, llm.DecideActionRequest{
		SessionID:    sess.ID,
		Context:      fullContent,
		Goal:         autoCfg.Goal,
		SessionGoal:  sessionGoal,
		DenyKeywords: denyStr,
	})

	// Always emit action analysis end event
	analysisDuration := time.Since(analysisStartTime).Milliseconds()

	if err != nil {
		s.emitWorkflowEvent(sess, EventActionAnalysisEnd, withDuration(analysisDuration), withError(err.Error()))
		if ctx.Err() != nil {
			return
		}
		log.Printf("[AutoReply] Decision failed for session %s: %v", sess.ID[:8], err)
		return
	}

	// Emit action analysis end with reasoning
	s.emitWorkflowEvent(sess, EventActionAnalysisEnd, withDuration(analysisDuration), withReasoning(decision.Reasoning))

	// Validate decision
	if err := ValidateDecision(decision, fullContent, autoCfg.ConfidenceMin, autoCfg.DenyKeywords); err != nil {
		log.Printf("[AutoReply] Rejected for session %s: %v", sess.ID[:8], err)
		s.logAutoAction(sess, decision, fullContent, false, err.Error())
		if !shouldSkipSilently() {
			s.emitWorkflowEvent(sess, EventActionSkipped,
				withReason("validation_failed"),
				withError(err.Error()))
			markSkipped()
		}
		return
	}

	// Goal alignment check: skip action if it doesn't match session goal
	if decision.GoalAligned != nil && !*decision.GoalAligned {
		mismatchReason := decision.GoalMismatch
		if mismatchReason == "" {
			mismatchReason = "操作与会话目标不一致"
		}
		log.Printf("[AutoReply] Goal misaligned for session %s: %s", sess.ID[:8], mismatchReason)
		s.logAutoAction(sess, decision, fullContent, false, "goal_misaligned: "+mismatchReason)
		s.emitWorkflowEvent(sess, EventActionSkipped,
			withReason("goal_misaligned"),
			withError(mismatchReason))

		// Broadcast ai_goal_misaligned message via WebSocket
		s.broadcastGoalMisaligned(sess, decision, mismatchReason)

		// Send email notification if enabled
		emailCfg := s.emailSender.GetConfig()
		if emailCfg != nil && emailCfg.Enabled && config.GetSessionNotifyEnabled(sess.ID) {
			sessionTitle := sess.Title
			if sessionTitle == "" {
				sessionTitle = sess.ID[:8]
			}
			desc := fmt.Sprintf("目标偏离: %s (建议操作: %s)", mismatchReason, decision.Description)
			_ = s.emailSender.SendNotification(sessionTitle, sess.ID, "目标偏离", desc, fullContent)
		}
		return
	}

	if len(decision.Actions) == 0 {
		if !shouldSkipSilently() {
			s.emitWorkflowEvent(sess, EventActionSkipped,
				withReason("no_actions"))
			markSkipped()
		}
		return
	}

	// Gate check (cooldown + dedup)
	cooldown := time.Duration(autoCfg.CooldownMs) * time.Millisecond
	actionSig := FormatActionsSig(decision.Actions)
	if !s.autoGate.Allow(sess.ID, actionSig, cooldown) {
		if !shouldSkipSilently() {
			s.emitWorkflowEvent(sess, EventActionSkipped,
				withReason("cooldown"),
				withActionSig(actionSig))
			markSkipped()
		}
		return
	}

	// Clear skip hash since we're taking action
	s.mu.Lock()
	if state != nil {
		state.lastSkippedHash = ""
	}
	s.mu.Unlock()

	// 二次检查：用户可能在 LLM 调用期间键入了
	if s.isInUserInputCooldown(sess.ID) {
		log.Printf("[AutoReply] Discarded action for session %s: user typed during analysis", sess.ID[:8])
		return
	}

	// Queue the action (will be executed immediately in executeReadyActions)
	s.actionQueue.Add(&QueuedAction{
		Kind:      ActionKindAutoReply,
		SessionID: sess.ID,
		CreatedAt: time.Now(),
		Actions:   decision.Actions,
		Decision:  decision,
	})

	// Emit action_queued event with reasoning
	s.emitWorkflowEvent(sess, EventActionQueued,
		withActionKind(string(ActionKindAutoReply)),
		withActionSig(actionSig),
		withReasoning(decision.Reasoning))

	log.Printf("[AutoReply] Queued action for session %s: %s", sess.ID[:8], actionSig)
}

// executeReadyActions executes any ready actions from the queue
func (s *Service) executeReadyActions(ctx context.Context, sess SessionInfo) {
	s.executeReadyActionsWithCount(ctx, sess)
}

// executeReadyActionsWithCount executes any ready actions and returns count executed
func (s *Service) executeReadyActionsWithCount(ctx context.Context, sess SessionInfo) int {
	// Get notify delay
	emailCfg := s.emailSender.GetConfig()
	notifyDelay := 60 * time.Second
	if emailCfg != nil && emailCfg.NotifyDelay > 0 {
		notifyDelay = time.Duration(emailCfg.NotifyDelay) * time.Second
	}

	readyActions := s.actionQueue.GetReadyActions(sess.ID, notifyDelay)
	executed := 0

	for _, action := range readyActions {
		select {
		case <-ctx.Done():
			return executed
		default:
		}

		switch action.Kind {
		case ActionKindAutoReply:
			if s.isInUserInputCooldown(sess.ID) {
				s.actionQueue.Remove(sess.ID, action.Kind)
				continue
			}
			s.executeAutoReplyAction(sess, action)
		case ActionKindNotify:
			s.executeNotifyAction(sess, action)
		}

		// Remove from queue after execution
		s.actionQueue.Remove(sess.ID, action.Kind)
		executed++
	}
	return executed
}

// executeAutoReplyAction executes an auto-reply action from the queue
func (s *Service) executeAutoReplyAction(sess SessionInfo, action *QueuedAction) {
	actionSig := FormatActionsSig(action.Actions)
	reasoning := ""
	if action.Decision != nil {
		reasoning = action.Decision.Reasoning
	}

	// Emit action_executed event with reasoning
	s.emitWorkflowEvent(sess, EventActionExecuted,
		withActionKind(string(ActionKindAutoReply)),
		withActionSig(actionSig),
		withReasoning(reasoning))

	// Execute actions
	s.executeActionsWithReasoning(sess, action.Actions, reasoning)

	// Log and broadcast
	if action.Decision != nil {
		s.logAutoAction(sess, action.Decision, "", true, "")
		s.broadcastAutoAction(sess, action.Decision)
	}
}

// executeNotifyAction executes a notification action from the queue
func (s *Service) executeNotifyAction(sess SessionInfo, action *QueuedAction) {
	if action.Summary == nil {
		return
	}

	// Emit action_executed event
	s.emitWorkflowEvent(sess, EventActionExecuted,
		withActionKind(string(ActionKindNotify)),
		withTag(action.Summary.Tag))

	// Send the email
	sessionTitle := sess.Title
	if sessionTitle == "" {
		sessionTitle = sess.ID[:8]
	}

	// Capture terminal content to include in email
	terminalContent, err := tmux.CaptureSessionPane(sess.TmuxName, 50)
	if err != nil {
		log.Printf("[Monitor] Failed to capture terminal content for email: %v", err)
		terminalContent = "(无法获取终端内容)"
	}

	if err := s.emailSender.SendNotification(sessionTitle, sess.ID, action.Summary.Tag, action.Summary.Description, terminalContent); err != nil {
		log.Printf("[Monitor] Failed to send notification for session %s: %v", sess.ID[:8], err)
		return
	}

	// Mark as notified
	s.mu.Lock()
	if state, exists := s.states[sess.ID]; exists {
		if state.notifiedTags == nil {
			state.notifiedTags = make(map[string]bool)
		}
		state.notifiedTags[action.Summary.Tag] = true
	}
	s.mu.Unlock()

	log.Printf("[Monitor] Notification sent for session %s: %s", sess.ID[:8], action.Summary.Tag)
}

// CleanupSession removes monitoring state for a session
func (s *Service) CleanupSession(sessionID string) {
	s.mu.Lock()
	delete(s.states, sessionID)
	delete(s.userInputCooldowns, sessionID)
	s.mu.Unlock()
}

// DefaultNotifyTags returns the default tags that should trigger notifications
func DefaultNotifyTags() []string {
	return []string{"需确认", "需输入", "需选择", "完毕", "错误"}
}

// checkAndSendNotification checks if we should queue a notification for this session
func (s *Service) checkAndSendNotification(sess SessionInfo, summary *llm.Summary, state *sessionState) {
	// Get notify tags from config (or use default)
	emailCfg := s.emailSender.GetConfig()
	notifyTags := DefaultNotifyTags()
	if emailCfg != nil && len(emailCfg.NotifyTags) > 0 {
		notifyTags = emailCfg.NotifyTags
	}

	// Check if this tag should trigger notification
	isNotifiable := false
	for _, tag := range notifyTags {
		if tag == summary.Tag {
			isNotifiable = true
			break
		}
	}

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
	if state.notifiedTags == nil {
		s.mu.RUnlock()
		s.mu.Lock()
		state.notifiedTags = make(map[string]bool)
		s.mu.Unlock()
		s.mu.RLock()
	}
	alreadyNotified := state.notifiedTags[summary.Tag]
	s.mu.RUnlock()

	if alreadyNotified {
		return
	}

	// Check if already queued
	if s.actionQueue.Has(sess.ID, ActionKindNotify) {
		return
	}

	// Queue notification action (will be executed after delay in executeReadyActions)
	s.actionQueue.Add(&QueuedAction{
		Kind:      ActionKindNotify,
		SessionID: sess.ID,
		CreatedAt: time.Now(),
		Summary:   summary,
		NotifyTag: summary.Tag,
	})

	// Emit action_queued event
	s.emitWorkflowEvent(sess, EventActionQueued,
		withActionKind(string(ActionKindNotify)),
		withTag(summary.Tag))

	log.Printf("[Monitor] Queued notification for session %s: %s", sess.ID[:8], summary.Tag)
}

// TestConnection tests the LLM API connection
func (s *Service) TestConnection(ctx context.Context, cfg Config) error {
	provider := llm.NewOpenAICompatProvider(llm.Config{
		Endpoint:    cfg.Endpoint,
		APIKey:      cfg.APIKey,
		Model:       cfg.Model,
		ExtraParams: cfg.ExtraParams,
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

// extractTextTokens extracts pure text token sequence, removing all format-related characters.
// Returns words split by whitespace, ignoring newlines, spaces, and box-drawing characters.
// This makes the comparison immune to terminal resize line wrapping.
func extractTextTokens(content string) []string {
	// Remove box-drawing characters (0x2500-0x257F) and replace with spaces
	var cleaned strings.Builder
	for _, r := range content {
		if r >= 0x2500 && r <= 0x257F {
			cleaned.WriteRune(' ')
			continue
		}
		cleaned.WriteRune(r)
	}

	// Split by whitespace into tokens
	return strings.Fields(cleaned.String())
}

// computeTokenFingerprint computes fingerprint set using sliding window n-gram hashes.
func computeTokenFingerprint(tokens []string, windowSize int) map[uint64]struct{} {
	if len(tokens) == 0 {
		return nil
	}

	fingerprints := make(map[uint64]struct{})

	// If token count is less than window size, use all tokens to compute single hash
	if len(tokens) < windowSize {
		h := fnvHash(strings.Join(tokens, " "))
		fingerprints[h] = struct{}{}
		return fingerprints
	}

	// Sliding window to generate n-gram fingerprints
	for i := 0; i <= len(tokens)-windowSize; i++ {
		window := strings.Join(tokens[i:i+windowSize], " ")
		h := fnvHash(window)
		fingerprints[h] = struct{}{}
	}

	return fingerprints
}

// fnvHash implements FNV-1a hash for strings.
func fnvHash(s string) uint64 {
	h := uint64(14695981039346656037)
	for i := 0; i < len(s); i++ {
		h ^= uint64(s[i])
		h *= 1099511628211
	}
	return h
}

// contentUnchanged checks if content is effectively unchanged using token-based comparison.
// Uses Jaccard similarity on token fingerprint sets to compare content.
// Returns true if similarity > 85%, treating the content as unchanged.
func contentUnchanged(oldTokens, newTokens []string) bool {
	if len(oldTokens) == 0 || len(newTokens) == 0 {
		return false
	}

	// Fast path: tokens are exactly the same
	if len(oldTokens) == len(newTokens) {
		same := true
		for i := range oldTokens {
			if oldTokens[i] != newTokens[i] {
				same = false
				break
			}
		}
		if same {
			return true
		}
	}

	// If token count differs by more than 30%, content changed
	lenDiff := float64(absInt(len(newTokens)-len(oldTokens))) / float64(maxInt(len(oldTokens), len(newTokens)))
	if lenDiff > 0.3 {
		return false
	}

	// Compute fingerprint sets
	const windowSize = 5
	oldFP := computeTokenFingerprint(oldTokens, windowSize)
	newFP := computeTokenFingerprint(newTokens, windowSize)

	if oldFP == nil || newFP == nil {
		return false
	}

	// Calculate Jaccard similarity
	intersection := 0
	for h := range oldFP {
		if _, ok := newFP[h]; ok {
			intersection++
		}
	}
	union := len(oldFP) + len(newFP) - intersection

	if union == 0 {
		return true
	}

	similarity := float64(intersection) / float64(union)
	return similarity > 0.85 // Similarity > 85% means unchanged
}

func absInt(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// tryAutoReply attempts to auto-reply to a terminal prompt
func (s *Service) tryAutoReply(ctx context.Context, sess SessionInfo, summary *llm.Summary) {
	// Check if auto-reply is enabled for this session
	if !config.GetSessionAutoEnabled(sess.ID) {
		return
	}

	autoCfg := config.GetAutoConfig()

	// Check if this tag is allowed for auto-reply
	tagAllowed := false
	for _, t := range autoCfg.AllowTags {
		if t == summary.Tag {
			tagAllowed = true
			break
		}
	}
	if !tagAllowed {
		return
	}

	// Capture more context for decision
	fullContent, err := tmux.CaptureSessionPane(sess.TmuxName, autoCfg.ContextLines)
	if err != nil {
		log.Printf("[AutoReply] Failed to capture context for session %s: %v", sess.ID[:8], err)
		return
	}
	if fullContent == "" {
		log.Printf("[AutoReply] Empty context for session %s, skipping", sess.ID[:8])
		return
	}

	// Strip user input line (last line with prompt) to avoid misinterpretation
	fullContent = stripUserInputLine(fullContent)

	// Build deny keywords string
	denyStr := strings.Join(autoCfg.DenyKeywords, ", ")

	// Get or create decision provider
	s.mu.RLock()
	decisionProvider := s.provider
	cfg := s.config
	s.mu.RUnlock()

	// Use auto-specific extra_params if configured, otherwise fall back to monitor config
	autoExtraParams := autoCfg.ExtraParams
	if autoExtraParams == "" {
		autoExtraParams = cfg.ExtraParams
	}

	if autoCfg.Model != "" || autoCfg.ExtraParams != "" {
		model := autoCfg.Model
		if model == "" {
			model = cfg.Model
		}
		decisionProvider = llm.NewOpenAICompatProvider(llm.Config{
			Endpoint:    cfg.Endpoint,
			APIKey:      cfg.APIKey,
			Model:       model,
			ExtraParams: autoExtraParams,
		})
	}

	// Call LLM for decision
	decision, err := decisionProvider.DecideAction(ctx, llm.DecideActionRequest{
		SessionID:    sess.ID,
		Context:      fullContent,
		Goal:         autoCfg.Goal,
		SessionGoal:  config.GetSessionAutoGoal(sess.ID),
		DenyKeywords: denyStr,
	})
	if err != nil {
		// Don't log context cancellation as error (expected during shutdown)
		if ctx.Err() != nil {
			return
		}
		log.Printf("[AutoReply] Decision failed for session %s: %v", sess.ID[:8], err)
		return
	}

	// Validate decision
	if err := ValidateDecision(decision, fullContent, autoCfg.ConfidenceMin, autoCfg.DenyKeywords); err != nil {
		log.Printf("[AutoReply] Rejected for session %s: %v", sess.ID[:8], err)
		s.logAutoAction(sess, decision, fullContent, false, err.Error())
		return
	}

	// Goal alignment check
	if decision.GoalAligned != nil && !*decision.GoalAligned {
		mismatchReason := decision.GoalMismatch
		if mismatchReason == "" {
			mismatchReason = "操作与会话目标不一致"
		}
		log.Printf("[AutoReply] Goal misaligned for session %s: %s", sess.ID[:8], mismatchReason)
		s.logAutoAction(sess, decision, fullContent, false, "goal_misaligned: "+mismatchReason)
		s.broadcastGoalMisaligned(sess, decision, mismatchReason)
		return
	}

	if len(decision.Actions) == 0 {
		return
	}

	// Gate check (cooldown + dedup)
	cooldown := time.Duration(autoCfg.CooldownMs) * time.Millisecond
	actionSig := FormatActionsSig(decision.Actions)
	if !s.autoGate.Allow(sess.ID, actionSig, cooldown) {
		return
	}

	// Emit action_triggered event
	s.emitWorkflowEvent(sess, EventActionTriggered, withTag(summary.Tag), withActionSig(actionSig))

	// Execute actions
	s.executeActions(sess, decision.Actions)

	// Log and broadcast
	s.logAutoAction(sess, decision, fullContent, true, "")
	s.broadcastAutoAction(sess, decision)
}

// executeActions sends action sequence to terminal
func (s *Service) executeActions(sess SessionInfo, actions []llm.ActionStep) {
	s.executeActionsWithReasoning(sess, actions, "")
}

// executeActionsWithReasoning sends action sequence to terminal with reasoning for logs
func (s *Service) executeActionsWithReasoning(sess SessionInfo, actions []llm.ActionStep, reasoning string) {
	startTime := time.Now()
	actionSig := FormatActionsSig(actions)
	s.emitWorkflowEvent(sess, EventActionStart, withActionSig(actionSig), withReasoning(reasoning))

	var lastErr error
	successCount := 0

	for i, action := range actions {
		var err error
		switch action.Type {
		case llm.ActionEnter:
			err = tmux.SendSpecialKeyToSession(sess.TmuxName, "Enter")
		case llm.ActionYN, llm.ActionDigit, llm.ActionText:
			// text handles: 继续/是/yes/ok/continue etc.
			err = tmux.SendKeysToSession(sess.TmuxName, action.Value)
		case llm.ActionArrow:
			// Convert to tmux key name: up->Up, down->Down, etc.
			key := strings.ToUpper(action.Value[:1]) + action.Value[1:]
			err = tmux.SendSpecialKeyToSession(sess.TmuxName, key)
		}

		if err != nil {
			log.Printf("[AutoReply] Step %d/%d failed: %v", i+1, len(actions), err)
			lastErr = err
			s.emitWorkflowEvent(sess, EventActionFailed, withActionSig(actionSig), withError(err.Error()))
			break
		}

		successCount++
		log.Printf("[AutoReply] Step %d/%d: %s=%s for session %s",
			i+1, len(actions), action.Type, action.Value, sess.ID[:8])

		// Delay between steps
		if i < len(actions)-1 {
			time.Sleep(100 * time.Millisecond)
		}
	}

	duration := time.Since(startTime).Milliseconds()

	if lastErr == nil && successCount == len(actions) {
		s.emitWorkflowEvent(sess, EventActionSuccess, withActionSig(actionSig), withDuration(duration), withReasoning(reasoning))
		log.Printf("[AutoReply] Completed %d actions for session %s", len(actions), sess.ID[:8])
	}

	s.emitWorkflowEvent(sess, EventActionEnd, withActionSig(actionSig), withDuration(duration), withReasoning(reasoning))
}

// logAutoAction records an auto-reply action to the logger
func (s *Service) logAutoAction(sess SessionInfo, decision *llm.DecideActionResponse, context string, success bool, errMsg string) {
	// Truncate context to last 30 lines for storage efficiency
	contextLines := strings.Split(context, "\n")
	if len(contextLines) > 30 {
		contextLines = contextLines[len(contextLines)-30:]
	}
	truncatedContext := strings.Join(contextLines, "\n")

	s.actionLogger.Add(AutoActionLog{
		SessionID:      sess.ID,
		SessionName:    sess.Title,
		Tag:            decision.Tag,
		Description:    decision.Description,
		Actions:        nonNilSteps(decision.Actions),
		Confidence:     decision.Confidence,
		Evidence:       nonNilStrings(decision.Evidence),
		Reasoning:      decision.Reasoning,
		ActionKeywords: nonNilStrings(decision.ActionKeywords),
		Context:        truncatedContext,
		Success:        success,
		Error:          errMsg,
	})
}

// nonNilStrings ensures a string slice serializes as JSON [] (not null) when
// the LLM omits the field. A nil slice marshals to "null", which crashes the
// frontend's .length/.join access and renders the panel as a black screen.
func nonNilStrings(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

// nonNilSteps does the same for action-step slices.
func nonNilSteps(s []llm.ActionStep) []llm.ActionStep {
	if s == nil {
		return []llm.ActionStep{}
	}
	return s
}

// broadcastAutoAction sends auto-action message to frontend
func (s *Service) broadcastAutoAction(sess SessionInfo, decision *llm.DecideActionResponse) {
	msg := struct {
		Type        string           `json:"type"`
		SessionID   string           `json:"session_id"`
		SessionName string           `json:"session_name"`
		Tag         string           `json:"tag"`
		Description string           `json:"description"`
		Actions     []llm.ActionStep `json:"actions"`
		Confidence  float64          `json:"confidence"`
		Timestamp   int64            `json:"timestamp"`
		Success     bool             `json:"success"`
	}{
		Type:        "ai_auto_action",
		SessionID:   sess.ID,
		SessionName: sess.Title,
		Tag:         decision.Tag,
		Description: decision.Description,
		Actions:     decision.Actions,
		Confidence:  decision.Confidence,
		Timestamp:   time.Now().Unix(),
		Success:     true,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	s.sessions.BroadcastToSession(sess.ID, data)
}

// broadcastGoalMisaligned sends goal misalignment notification to frontend
func (s *Service) broadcastGoalMisaligned(sess SessionInfo, decision *llm.DecideActionResponse, mismatchReason string) {
	msg := struct {
		Type        string `json:"type"`
		SessionID   string `json:"session_id"`
		SessionName string `json:"session_name"`
		Description string `json:"description"`
		Mismatch    string `json:"mismatch"`
		Timestamp   int64  `json:"timestamp"`
	}{
		Type:        "ai_goal_misaligned",
		SessionID:   sess.ID,
		SessionName: sess.Title,
		Description: decision.Description,
		Mismatch:    mismatchReason,
		Timestamp:   time.Now().Unix(),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	s.sessions.BroadcastToSession(sess.ID, data)
}

// GetActionLogger returns the action logger
func (s *Service) GetActionLogger() *ActionLogger {
	return s.actionLogger
}

// promptPrefixes are common shell prompt prefixes that indicate user input
var promptPrefixes = []string{
	"❯ ", "❯", // common modern shells (starship, etc.)
	"$ ",   // bash/sh
	"# ",   // root
	"% ",   // zsh/csh
	">>> ", // python REPL
	"... ", // python continuation
	"> ",   // node REPL, continuation
}

// stripUserInputLine removes the last line if it looks like a user input prompt.
// This prevents the AI from misinterpreting text the user is currently typing.
func stripUserInputLine(content string) string {
	content = strings.TrimRight(content, "\n")
	if content == "" {
		return content
	}

	lines := strings.Split(content, "\n")
	if len(lines) == 0 {
		return content
	}

	lastLine := strings.TrimSpace(lines[len(lines)-1])

	// Check if last line starts with a known prompt prefix
	for _, prefix := range promptPrefixes {
		if strings.HasPrefix(lastLine, prefix) {
			// Remove the last line entirely (it's a prompt + user input)
			return strings.Join(lines[:len(lines)-1], "\n")
		}
	}

	return content
}

// computeStateHash generates a hash for state deduplication
func computeStateHash(tag, desc string, tokens []string) string {
	combined := tag + "|" + desc + "|" + strings.Join(tokens, " ")
	return fmt.Sprintf("%x", fnvHash(combined))
}

// emitWorkflowEvent emits a workflow event to logger and WebSocket
func (s *Service) emitWorkflowEvent(sess SessionInfo, eventType WorkflowEventType, opts ...func(*WorkflowEvent)) {
	// Increment sequence atomically
	s.mu.Lock()
	s.eventSeq++
	seq := s.eventSeq
	s.mu.Unlock()

	event := WorkflowEvent{
		ID:        fmt.Sprintf("%d-%s", time.Now().UnixNano(), sess.ID[:8]),
		SessionID: sess.ID,
		EventType: eventType,
		Timestamp: time.Now().UnixMilli(), // Use milliseconds for proper event ordering
		Seq:       seq,                    // Sequence number for stable ordering
	}

	for _, opt := range opts {
		opt(&event)
	}

	// Log to file
	s.workflowLogger.Append(event)

	// Broadcast via WebSocket
	msg := struct {
		Type  string        `json:"type"`
		Event WorkflowEvent `json:"event"`
	}{
		Type:  "ai_workflow_event",
		Event: event,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	s.sessions.BroadcastToSession(sess.ID, data)
}

// Workflow event option helpers
func withTag(tag string) func(*WorkflowEvent) {
	return func(e *WorkflowEvent) { e.Tag = tag }
}

func withDesc(desc string) func(*WorkflowEvent) {
	return func(e *WorkflowEvent) { e.Desc = desc }
}

func withDuration(ms int64) func(*WorkflowEvent) {
	return func(e *WorkflowEvent) { e.DurationMs = ms }
}

func withActionSig(sig string) func(*WorkflowEvent) {
	return func(e *WorkflowEvent) { e.ActionSig = sig }
}

func withActionKind(kind string) func(*WorkflowEvent) {
	return func(e *WorkflowEvent) { e.ActionKind = kind }
}

func withSuccess(success bool) func(*WorkflowEvent) {
	return func(e *WorkflowEvent) { e.Success = success }
}

func withError(err string) func(*WorkflowEvent) {
	return func(e *WorkflowEvent) { e.Error = err }
}

func withReason(reason string) func(*WorkflowEvent) {
	return func(e *WorkflowEvent) { e.Reason = reason }
}

func withReasoning(reasoning string) func(*WorkflowEvent) {
	return func(e *WorkflowEvent) { e.Reasoning = reasoning }
}

// GetWorkflowLogger returns the workflow event logger
func (s *Service) GetWorkflowLogger() *WorkflowEventLogger {
	return s.workflowLogger
}

// shouldSkipAnalysis checks if we should skip analysis due to backoff from previous failures
func (s *Service) shouldSkipAnalysis(sessID string) bool {
	s.mu.RLock()
	state := s.states[sessID]
	s.mu.RUnlock()

	if state == nil || state.failureCount == 0 {
		return false
	}

	// Exponential backoff: 2^n seconds, max 5 minutes
	backoffSeconds := 1 << state.failureCount
	if backoffSeconds > 300 {
		backoffSeconds = 300
	}
	backoff := time.Duration(backoffSeconds) * time.Second

	return time.Since(state.lastFailure) < backoff
}

// updateSessionTokens updates the token cache for a session
func (s *Service) updateSessionTokens(sessID string, tokens []string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	state := s.states[sessID]
	if state == nil {
		state = &sessionState{
			notifiedTags: make(map[string]bool),
		}
		s.states[sessID] = state
	}
	state.lastTokens = tokens
}

// incrementFailureCount increments the failure count for backoff
func (s *Service) incrementFailureCount(sessID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	state := s.states[sessID]
	if state == nil {
		state = &sessionState{
			notifiedTags: make(map[string]bool),
		}
		s.states[sessID] = state
	}
	state.failureCount++
	state.lastFailure = time.Now()
}
