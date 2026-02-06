package monitor

import (
	"fmt"
	"regexp"
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

// DefaultActiveContextLines is the number of lines to scan for deny keywords
// Only the last N lines (active context) are scanned, ignoring historical output
const DefaultActiveContextLines = 20

// SafetyLevel defines the strictness of validation
type SafetyLevel string

const (
	// SafetyStrict - Maximum security, original behavior with all checks
	// - Full screen scanning for deny keywords
	// - Strict evidence matching
	// - Value must exist on screen (except special keys)
	SafetyStrict SafetyLevel = "strict"

	// SafetyStandard - Balanced security and usability (default)
	// - Only scan last 20 lines for deny keywords
	// - Relaxed input-type action validation
	// - Risk-based dynamic confidence thresholds
	SafetyStandard SafetyLevel = "standard"

	// SafetyLoose - Maximum usability, minimal checks
	// - Only check high-risk keywords (rm, format, drop)
	// - Skip screen scanning entirely
	// - Trust LLM's ActionKeywords for safety
	SafetyLoose SafetyLevel = "loose"
)

// highRiskOnlyKeywords are the only keywords checked in loose mode
var highRiskOnlyKeywords = []string{"rm", "rm -rf", "format", "mkfs", "dd", "drop", "truncate"}

// isHighRiskKeyword checks if a keyword is in the high-risk-only list
func isHighRiskKeyword(keyword string) bool {
	kwLower := strings.ToLower(strings.TrimSpace(keyword))
	for _, hrk := range highRiskOnlyKeywords {
		if kwLower == hrk {
			return true
		}
	}
	return false
}

// RiskLevel represents the risk level of an action
type RiskLevel int

const (
	RiskLow    RiskLevel = iota // Default actions, use base confidence
	RiskMedium                  // Potentially dangerous, require higher confidence
	RiskHigh                    // Dangerous operations, require very high confidence
)

// riskKeywords maps keywords to their risk levels
// High risk: destructive operations that are hard to reverse
// Medium risk: operations that modify data but are reversible
var riskKeywords = map[string]RiskLevel{
	// High risk - destructive/irreversible
	"rm":       RiskHigh,
	"rm -rf":   RiskHigh,
	"rmdir":    RiskHigh,
	"format":   RiskHigh,
	"mkfs":     RiskHigh,
	"dd":       RiskHigh,
	"sudo rm":  RiskHigh,
	"sudo dd":  RiskHigh,
	"drop":     RiskHigh, // SQL DROP
	"truncate": RiskHigh,
	// Medium risk - modifying but reversible
	"delete":    RiskMedium,
	"remove":    RiskMedium,
	"overwrite": RiskMedium,
	"replace":   RiskMedium,
	"sudo":      RiskMedium,
	"chmod":     RiskMedium,
	"chown":     RiskMedium,
	"mv":        RiskMedium,
	"update":    RiskMedium, // SQL UPDATE
}

// confidenceForRisk returns the minimum confidence required for a risk level
func confidenceForRisk(level RiskLevel, baseConfidence float64) float64 {
	switch level {
	case RiskHigh:
		// High risk requires 0.9 or base + 0.15, whichever is higher
		minHigh := baseConfidence + 0.15
		if minHigh < 0.9 {
			return 0.9
		}
		if minHigh > 1.0 {
			return 1.0
		}
		return minHigh
	case RiskMedium:
		// Medium risk requires base + 0.1
		minMedium := baseConfidence + 0.1
		if minMedium > 1.0 {
			return 1.0
		}
		return minMedium
	default:
		return baseConfidence
	}
}

// getActionRiskLevel determines the highest risk level from action keywords
func getActionRiskLevel(actionKeywords []string) RiskLevel {
	maxRisk := RiskLow
	for _, kw := range actionKeywords {
		kwLower := strings.ToLower(kw)
		if risk, ok := riskKeywords[kwLower]; ok {
			if risk > maxRisk {
				maxRisk = risk
			}
		}
	}
	return maxRisk
}

// getRiskLevelName returns a human-readable name for a risk level
func getRiskLevelName(level RiskLevel) string {
	switch level {
	case RiskHigh:
		return "high"
	case RiskMedium:
		return "medium"
	default:
		return "low"
	}
}

// getActiveContext extracts the last N lines from screen content
// This prevents historical commands from triggering false rejections
func getActiveContext(screen string, lines int) string {
	all := strings.Split(screen, "\n")
	if len(all) > lines {
		return strings.Join(all[len(all)-lines:], "\n")
	}
	return screen
}

// matchDenyKeyword checks if a keyword exists as a whole word in text
// Uses regex word boundary \b to avoid false positives like "rm" in "confirm"
func matchDenyKeyword(text, keyword string) bool {
	// Escape special regex characters in keyword
	escaped := regexp.QuoteMeta(keyword)
	// Build pattern with word boundaries (case insensitive)
	pattern := `(?i)\b` + escaped + `\b`
	matched, err := regexp.MatchString(pattern, text)
	if err != nil {
		return false
	}
	return matched
}

// ValidateDecision validates an auto-reply decision against safety rules
// Uses SafetyStandard level by default
func ValidateDecision(resp *llm.DecideActionResponse, screen string, confidenceMin float64, denyKeywords []string) error {
	return ValidateDecisionWithSafetyLevel(resp, screen, confidenceMin, denyKeywords, SafetyStandard)
}

// ValidateDecisionWithSafetyLevel validates an auto-reply decision with configurable safety level
func ValidateDecisionWithSafetyLevel(resp *llm.DecideActionResponse, screen string, confidenceMin float64, denyKeywords []string, safetyLevel SafetyLevel) error {
	if len(resp.Actions) == 0 {
		return nil
	}

	// Limit action count to prevent runaway sequences
	if len(resp.Actions) > MaxActionsPerDecision {
		return fmt.Errorf("too many actions: %d (max %d)", len(resp.Actions), MaxActionsPerDecision)
	}

	// Determine risk level from action keywords and adjust confidence threshold
	riskLevel := getActionRiskLevel(resp.ActionKeywords)
	requiredConfidence := confidenceForRisk(riskLevel, confidenceMin)

	// Confidence check with dynamic threshold based on risk
	if resp.Confidence < requiredConfidence {
		if riskLevel > RiskLow {
			return fmt.Errorf("confidence %.2f below threshold %.2f (risk level: %s)",
				resp.Confidence, requiredConfidence, getRiskLevelName(riskLevel))
		}
		return fmt.Errorf("confidence %.2f below threshold %.2f", resp.Confidence, requiredConfidence)
	}

	// Evidence check - required for strict and standard, skipped for loose
	if safetyLevel != SafetyLoose {
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
	}

	// Validate action values - behavior varies by safety level
	specialKeys := map[string]bool{"enter": true, "up": true, "down": true, "left": true, "right": true, "": true}
	inputTypes := map[llm.ActionType]bool{llm.ActionText: true, llm.ActionDigit: true, llm.ActionYN: true}

	for _, action := range resp.Actions {
		// Special keys always allowed
		if specialKeys[action.Value] {
			continue
		}

		// Loose mode: only check input values against high-risk keywords
		if safetyLevel == SafetyLoose {
			if inputTypes[action.Type] {
				for _, hrk := range highRiskOnlyKeywords {
					if matchDenyKeyword(action.Value, hrk) {
						return fmt.Errorf("input value contains high-risk keyword '%s'", hrk)
					}
				}
			}
			continue
		}

		// Standard/Strict mode: input types check against deny keywords
		if inputTypes[action.Type] {
			for _, denyKw := range denyKeywords {
				if matchDenyKeyword(action.Value, denyKw) {
					return fmt.Errorf("input value contains deny keyword '%s'", denyKw)
				}
			}
			continue
		}

		// Strict mode only: value must exist on screen for non-input types
		if safetyLevel == SafetyStrict {
			if !strings.Contains(screen, action.Value) {
				return fmt.Errorf("value not found on screen: %s", action.Value)
			}
		}
	}

	// Check action keywords against deny list (all modes)
	effectiveDenyKeywords := denyKeywords
	if safetyLevel == SafetyLoose {
		// Loose mode: only check high-risk keywords
		effectiveDenyKeywords = highRiskOnlyKeywords
	}
	for _, actionKw := range resp.ActionKeywords {
		actionKwLower := strings.ToLower(actionKw)
		for _, denyKw := range effectiveDenyKeywords {
			denyKwLower := strings.ToLower(denyKw)
			if actionKwLower == denyKwLower {
				return fmt.Errorf("action keyword '%s' matches deny keyword '%s'", actionKw, denyKw)
			}
		}
	}

	// Screen scanning - behavior varies by safety level
	switch safetyLevel {
	case SafetyStrict:
		// Strict: scan full screen
		for _, denyKw := range denyKeywords {
			denyKw = strings.TrimSpace(denyKw)
			if denyKw == "" {
				continue
			}
			if matchDenyKeyword(screen, denyKw) {
				return fmt.Errorf("screen contains deny keyword '%s'", denyKw)
			}
		}
	case SafetyStandard:
		// Standard: scan only active context (last N lines)
		activeContext := getActiveContext(screen, DefaultActiveContextLines)
		for _, denyKw := range denyKeywords {
			denyKw = strings.TrimSpace(denyKw)
			if denyKw == "" {
				continue
			}
			if matchDenyKeyword(activeContext, denyKw) {
				return fmt.Errorf("screen contains deny keyword '%s'", denyKw)
			}
		}
	case SafetyLoose:
		// Loose: skip screen scanning entirely, trust ActionKeywords check above
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
