package llm

// ActionType defines the type of action to perform
type ActionType string

const (
	ActionNone  ActionType = "none"
	ActionEnter ActionType = "enter"
	ActionYN    ActionType = "yn"    // y/n
	ActionDigit ActionType = "digit" // 0-9
	ActionArrow ActionType = "arrow" // up/down/left/right
	ActionText  ActionType = "text"  // arbitrary text: 继续/是/yes/ok/etc.
)

// ActionStep represents a single action step in a sequence
type ActionStep struct {
	Type  ActionType `json:"type"`  // "enter"/"yn"/"digit"/"arrow"/"text"
	Value string     `json:"value"` // "y"/"n"/"3"/"up"/"down"/"继续"/"是"/""
}

// DecideActionRequest is the request for auto-reply decision
type DecideActionRequest struct {
	SessionID    string
	Context      string // 150-200 lines of terminal content
	Goal         string // User-defined strategy direction
	SessionGoal  string // Session-level goal (what the user is currently doing)
	DenyKeywords string // Comma-separated list of keywords to avoid
}

// DecideActionResponse is the response from auto-reply decision
type DecideActionResponse struct {
	Tag            string       `json:"tag"`                        // "需确认"/"需输入"/"需选择"
	Description    string       `json:"description"`                // Brief description
	Actions        []ActionStep `json:"actions"`                    // Action sequence, e.g., [down, down, enter]
	Confidence     float64      `json:"confidence"`                 // 0-1
	Evidence       []string     `json:"evidence"`                   // Screen text evidence
	Reasoning      string       `json:"reasoning"`                  // AI reasoning process for the decision
	ActionKeywords []string     `json:"action_keywords"`            // Keywords describing the action effect, e.g., ["delete", "remove", "exec"]
	GoalAligned    *bool        `json:"goal_aligned,omitempty"`     // Whether the action aligns with session goal
	GoalMismatch   string       `json:"goal_mismatch,omitempty"`    // Reason for goal mismatch (20 chars max)
}
