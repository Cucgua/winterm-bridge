package monitor

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"winterm-bridge/internal/llm"
)

// AutoGate provides rate limiting and deduplication for auto-reply actions
type AutoGate struct {
	lastActionAt  map[string]time.Time
	lastActionSig map[string]string
	mu            sync.Mutex
}

// NewAutoGate creates a new AutoGate
func NewAutoGate() *AutoGate {
	return &AutoGate{
		lastActionAt:  make(map[string]time.Time),
		lastActionSig: make(map[string]string),
	}
}

// Allow checks if an action is allowed based on cooldown and dedup
// Dedup only applies within cooldown window - same action can be repeated after cooldown
func (g *AutoGate) Allow(sessionID string, actionSig string, cooldown time.Duration) bool {
	g.mu.Lock()
	defer g.mu.Unlock()

	now := time.Now()
	lastAt := g.lastActionAt[sessionID]
	elapsed := now.Sub(lastAt)

	// Within cooldown window
	if elapsed < cooldown {
		// Dedup check only within cooldown - reject same action
		if g.lastActionSig[sessionID] == actionSig {
			return false
		}
		// Different action within cooldown - still reject (rate limit)
		return false
	}

	// Cooldown passed - allow action (even if same as last)
	g.lastActionAt[sessionID] = now
	g.lastActionSig[sessionID] = actionSig
	return true
}

// Reset clears the gate state for a session
func (g *AutoGate) Reset(sessionID string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.lastActionAt, sessionID)
	delete(g.lastActionSig, sessionID)
}

// MaxActionsPerDecision limits the number of actions in a single decision to prevent runaway
const MaxActionsPerDecision = 10

// ValidateDecision validates an auto-reply decision against safety rules
func ValidateDecision(resp *llm.DecideActionResponse, screen string, confidenceMin float64, denyKeywords []string) error {
	if len(resp.Actions) == 0 {
		return nil
	}

	// Limit action count to prevent runaway sequences
	if len(resp.Actions) > MaxActionsPerDecision {
		return fmt.Errorf("too many actions: %d (max %d)", len(resp.Actions), MaxActionsPerDecision)
	}

	// Confidence check
	if resp.Confidence < confidenceMin {
		return fmt.Errorf("confidence %.2f below threshold %.2f", resp.Confidence, confidenceMin)
	}

	// Require at least one evidence line that exists on screen
	if len(resp.Evidence) == 0 {
		return fmt.Errorf("no evidence provided")
	}
	evidenceFound := false
	for _, ev := range resp.Evidence {
		if ev != "" && strings.Contains(screen, strings.TrimSpace(ev)) {
			evidenceFound = true
			break
		}
	}
	if !evidenceFound {
		return fmt.Errorf("evidence not found on current screen")
	}

	// Validate each action value exists on screen (special keys excluded)
	specialKeys := map[string]bool{"enter": true, "up": true, "down": true, "left": true, "right": true, "": true}
	for _, action := range resp.Actions {
		if !specialKeys[action.Value] && !strings.Contains(screen, action.Value) {
			return fmt.Errorf("value not found on screen: %s", action.Value)
		}
	}

	// Check action keywords against deny list
	for _, actionKw := range resp.ActionKeywords {
		actionKwLower := strings.ToLower(actionKw)
		for _, denyKw := range denyKeywords {
			denyKwLower := strings.ToLower(denyKw)
			if actionKwLower == denyKwLower {
				return fmt.Errorf("action keyword '%s' matches deny keyword '%s'", actionKw, denyKw)
			}
		}
	}

	// CRITICAL: Scan screen text directly for deny keywords (defense in depth)
	// This catches dangerous commands even if LLM doesn't report them in ActionKeywords
	screenLower := strings.ToLower(screen)
	for _, denyKw := range denyKeywords {
		denyKwLower := strings.ToLower(strings.TrimSpace(denyKw))
		if denyKwLower == "" {
			continue
		}
		// Check for deny keyword as word boundary (e.g., "rm " or " rm" or "rm\n")
		// This avoids false positives like "confirm" matching "rm"
		patterns := []string{
			denyKwLower + " ",
			" " + denyKwLower,
			denyKwLower + "\n",
			"\n" + denyKwLower,
			denyKwLower + "\t",
			"\t" + denyKwLower,
		}
		for _, pattern := range patterns {
			if strings.Contains(screenLower, pattern) {
				return fmt.Errorf("screen contains deny keyword '%s'", denyKw)
			}
		}
		// Also check if screen starts with deny keyword
		if strings.HasPrefix(screenLower, denyKwLower+" ") || strings.HasPrefix(screenLower, denyKwLower+"\t") {
			return fmt.Errorf("screen contains deny keyword '%s'", denyKw)
		}
	}

	return nil
}

// FormatActionsSig creates a signature string from action sequence for dedup
func FormatActionsSig(actions []llm.ActionStep) string {
	parts := make([]string, len(actions))
	for i, a := range actions {
		parts[i] = fmt.Sprintf("%s:%s", a.Type, a.Value)
	}
	return strings.Join(parts, ",")
}
