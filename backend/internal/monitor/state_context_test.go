package monitor

import (
	"testing"

	"winterm-bridge/internal/llm"
)

func TestAppendRecentTransitionKeepsNewestBoundedHistory(t *testing.T) {
	state := &sessionState{}

	for i := 0; i < maxRecentTransitions+3; i++ {
		appendRecentTransition(state, llm.StateTransition{
			From:   "running_command",
			To:     "running_command",
			Reason: "poll",
		})
	}

	if len(state.recentTransitions) != maxRecentTransitions {
		t.Fatalf("recentTransitions len = %d, want %d", len(state.recentTransitions), maxRecentTransitions)
	}
}

func TestBuildStateAnalysisRequestIncludesPreviousStateAndNewObservation(t *testing.T) {
	service := &Service{
		states: map[string]*sessionState{
			"sess-1": {
				lastSummary: &llm.Summary{
					Tag:         "进行",
					Description: "正在构建",
					Phase:       "running_command",
					Activity:    "运行 npm build",
					Confidence:  0.8,
				},
				recentTransitions: []llm.StateTransition{
					{From: "idle", To: "running_command", Reason: "用户执行命令"},
				},
			},
		},
	}

	req := service.buildStateAnalysisRequest(
		SessionInfo{ID: "sess-1"},
		"npm run build\nerror TS6133\n$ ",
		[]string{"npm", "run", "build", "error", "TS6133"},
	)

	if req.PreviousState == nil {
		t.Fatal("PreviousState should be included")
	}
	if req.PreviousState.Phase != "running_command" {
		t.Fatalf("PreviousState.Phase = %q, want running_command", req.PreviousState.Phase)
	}
	if len(req.RecentTransitions) != 1 {
		t.Fatalf("RecentTransitions len = %d, want 1", len(req.RecentTransitions))
	}
	if len(req.EventsSincePreviousAnalysis) == 0 {
		t.Fatal("EventsSincePreviousAnalysis should include current terminal change")
	}
	if req.CurrentTerminalTail == "" {
		t.Fatal("CurrentTerminalTail should be included")
	}
}
