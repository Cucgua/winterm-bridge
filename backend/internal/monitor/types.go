package monitor

// WorkflowEventType represents the type of workflow event
// Simplified to match flowchart steps
type WorkflowEventType string

const (
	// Flow steps from flowchart
	EventContextChanged  WorkflowEventType = "context_changed"  // 上下文变化
	EventStateAnalyzed   WorkflowEventType = "state_analyzed"   // 状态分析完成
	EventActionQueued    WorkflowEventType = "action_queued"    // 动作入队
	EventActionExecuted  WorkflowEventType = "action_executed"  // 动作执行(入口)
	EventActionStart     WorkflowEventType = "action_start"     // 动作步骤开始
	EventActionEnd       WorkflowEventType = "action_end"       // 动作步骤结束
	EventActionSuccess   WorkflowEventType = "action_success"   // 动作成功
	EventActionFailed    WorkflowEventType = "action_failed"    // 动作失败
	EventActionRemoved   WorkflowEventType = "action_removed"   // 动作移除(上下文变化导致)
	EventActionSkipped   WorkflowEventType = "action_skipped"   // AI决策后跳过(无动作/验证失败/冷却期)

	// Legacy aliases for compatibility
	EventStateCheckStart = EventContextChanged
	EventStateCheckEnd   = EventStateAnalyzed
	EventStateReturned   = EventStateAnalyzed
	EventActionTriggered = EventActionQueued
)

// WorkflowEvent represents a single workflow event
type WorkflowEvent struct {
	ID         string            `json:"id"`
	SessionID  string            `json:"session_id"`
	EventType  WorkflowEventType `json:"event_type"`
	Timestamp  int64             `json:"timestamp_ms"` // Unix milliseconds for proper event ordering
	Seq        int64             `json:"seq"`          // Sequence number for ordering events with same timestamp
	DurationMs int64             `json:"duration_ms,omitempty"`
	Tag        string            `json:"tag,omitempty"`
	Desc       string            `json:"description,omitempty"`
	ActionSig  string            `json:"action_sig,omitempty"`
	ActionKind string            `json:"action_kind,omitempty"` // auto_reply / notify
	Success    bool              `json:"success,omitempty"`
	Error      string            `json:"error,omitempty"`
	Reason     string            `json:"reason,omitempty"` // skip reason: tag_not_allowed/validation_failed/no_actions/cooldown
}
