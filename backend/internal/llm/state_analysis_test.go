package llm

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestFormatStateAnalysisContextSeparatesHistoryDeltaAndCurrentTail(t *testing.T) {
	req := StateAnalysisRequest{
		SessionID:           "sess-1",
		SessionGoal:         "修复前端构建失败",
		CurrentTerminalTail: "npm run build\nerror TS6133\n$ ",
		PreviousState: &SessionStateSummary{
			Tag:         "进行",
			Description: "正在构建项目",
			Phase:       "running_command",
			Activity:    "正在运行 npm run build",
			Confidence:  0.82,
		},
		RecentTransitions: []StateTransition{
			{From: "idle", To: "running_command", Reason: "用户执行构建命令"},
		},
		EventsSincePreviousAnalysis: []StateObservation{
			{Type: "terminal_changed", Summary: "构建输出新增错误", ImportantLines: []string{"error TS6133"}},
		},
		AllowedTransitions: []string{"running_command -> error", "running_command -> completed"},
	}

	content, err := FormatStateAnalysisContext(req)
	if err != nil {
		t.Fatalf("FormatStateAnalysisContext returned error: %v", err)
	}

	for _, want := range []string{
		"previous_state",
		"events_since_previous_analysis",
		"current_terminal_tail",
		"recent_transitions",
		"allowed_transitions",
		"修复前端构建失败",
		"error TS6133",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("formatted context missing %q:\n%s", want, content)
		}
	}
}

func TestSummaryUnmarshalAcceptsLegacyTagDescriptionOnly(t *testing.T) {
	var summary Summary
	if err := json.Unmarshal([]byte(`{"tag":"完毕","description":"命令完成"}`), &summary); err != nil {
		t.Fatalf("unmarshal legacy summary: %v", err)
	}

	NormalizeSummary(&summary)

	if summary.Tag != "完毕" {
		t.Fatalf("Tag = %q, want 完毕", summary.Tag)
	}
	if summary.Description != "命令完成" {
		t.Fatalf("Description = %q, want 命令完成", summary.Description)
	}
	if summary.Phase == "" {
		t.Fatal("Phase should be filled for legacy summaries")
	}
	if summary.Confidence <= 0 {
		t.Fatalf("Confidence = %v, want positive fallback", summary.Confidence)
	}
}
