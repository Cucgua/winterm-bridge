package llm

import (
	"context"
	"encoding/json"
)

// Summary represents the AI-generated status summary
type Summary struct {
	Tag            string           `json:"tag"`                  // 2-4 character status tag (完毕、进行、需输入、需选择、错误、等待)
	Description    string           `json:"description"`          // Brief description of current state
	Phase          string           `json:"phase,omitempty"`      // Structured phase such as running_command / waiting_for_user
	Activity       string           `json:"activity,omitempty"`   // What the session is currently doing
	Confidence     float64          `json:"confidence,omitempty"` // Confidence from 0 to 1
	Evidence       []string         `json:"evidence,omitempty"`   // Short evidence snippets, never full terminal content
	Transition     *StateTransition `json:"transition,omitempty"` // State transition from previous analysis
	NeedsUserInput bool             `json:"needs_user_input"`     // Whether the current state needs user input
	IsStale        bool             `json:"is_stale"`             // Whether the analysis is stale or uncertain
}

// SessionStateSummary is the compact previous state sent to the analyzer.
type SessionStateSummary struct {
	Tag            string   `json:"tag"`
	Description    string   `json:"description"`
	Phase          string   `json:"phase,omitempty"`
	Activity       string   `json:"activity,omitempty"`
	Confidence     float64  `json:"confidence,omitempty"`
	Evidence       []string `json:"evidence,omitempty"`
	NeedsUserInput bool     `json:"needs_user_input"`
	IsStale        bool     `json:"is_stale"`
}

// StateTransition records a compact state transition for short-term memory.
type StateTransition struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Reason string `json:"reason"`
}

// StateObservation describes what changed since the previous analysis.
type StateObservation struct {
	Type           string   `json:"type"`
	Summary        string   `json:"summary"`
	ImportantLines []string `json:"important_lines,omitempty"`
}

// StateAnalysisRequest is the structured context sent to the state analyzer.
type StateAnalysisRequest struct {
	SessionID                   string               `json:"session_id,omitempty"`
	SessionGoal                 string               `json:"session_goal,omitempty"`
	PreviousState               *SessionStateSummary `json:"previous_state,omitempty"`
	RecentTransitions           []StateTransition    `json:"recent_transitions,omitempty"`
	EventsSincePreviousAnalysis []StateObservation   `json:"events_since_previous_analysis,omitempty"`
	CurrentTerminalTail         string               `json:"current_terminal_tail"`
	AllowedTransitions          []string             `json:"allowed_transitions,omitempty"`
}

// Provider defines the interface for LLM providers
type Provider interface {
	// Summarize analyzes terminal content and returns a status summary
	Summarize(ctx context.Context, req StateAnalysisRequest) (*Summary, error)
	// DecideAction analyzes terminal content and returns recommended auto-reply actions
	DecideAction(ctx context.Context, req DecideActionRequest) (*DecideActionResponse, error)
}

// Config holds the configuration for LLM provider
type Config struct {
	Endpoint    string `json:"endpoint"`
	APIKey      string `json:"api_key"`
	Model       string `json:"model"`
	ExtraParams string `json:"extra_params"` // JSON string for custom API parameters
}

// DefaultPrompt is the system prompt for terminal status analysis
const DefaultPrompt = `你是终端会话状态分析器。像状态机一样工作，只判断不对话。

# 任务
根据结构化上下文判断当前会话状态。你会收到：
- previous_state：上一轮状态，是历史，只用于理解上下文
- recent_transitions：最近状态转移，是历史，只用于理解趋势
- events_since_previous_analysis：上一轮分析后新增事实
- current_terminal_tail：最新终端 tail，是判断当前状态的主要依据
- session_goal：当前会话目标
- allowed_transitions：允许的状态转移

# 输出格式
{
  "tag": "完毕|进行|需输入|需选择|需确认|错误|等待",
  "description": "15字内中文描述",
  "phase": "idle|running_command|waiting_for_user|waiting_for_process|error|completed|blocked|unknown",
  "activity": "当前正在做什么",
  "confidence": 0.0,
  "evidence": ["短证据1", "短证据2"],
  "transition": {"from":"上一phase","to":"当前phase","reason":"20字内原因"},
  "needs_user_input": false,
  "is_stale": false
}

# 分析流程

## Step 1：区分历史和当前（强制）
previous_state 和 recent_transitions 是历史，不能把其中的错误、提示符、确认提示当作当前状态。
events_since_previous_analysis 是新增事实，current_terminal_tail 是当前主要依据。

## Step 2：底部优先（强制）
必须优先分析 current_terminal_tail 最后 5-8 行，底部权重永远高于中间日志。

## Step 3：状态判定（按优先级，命中即停）

### Priority 1 — 需确认/需输入/需选择
底部出现交互提示：
- y/n、Confirm、Select、Choose、Password、Press Enter、Accept?
- 光标停在输入框或选项菜单
细分：自由文本→需输入，枚举选择→需选择，仅确认→需确认
注意：底部状态栏（如 ⏵⏵ accept edits on、shift+tab to cycle）不是交互提示，必须忽略

### Priority 2 — 进行
底部有动态特征（不区分大小写）：
- 关键词：running、compiling、downloading、generating、processing
- 结构：进度条 [===>]、spinner ⠋⠙、时间 (1m 20s)
注意：即使屏幕中部有 ❯ 或 $，只要底部有动态特征，仍判定为进行

### Priority 3 — 错误
同时满足：
- 出现 Fatal/Panic/Exception/Error/Failed
- 底部无等待输入
- 无动态执行迹象

### Priority 4 — 完毕
全部满足：
- 底部是真实 Shell 提示符（$ ❯ # >>> user@host）
- 光标在最后一行
- 无运行中提示、无进度条、无等待输入

### Priority 5 — 等待
无上述任何特征，界面静止但不是提示符

## Step 4：描述提取
确定 Tag 后，用一句话描述发生了什么（15字内），不含技术细节。

## Step 5：状态转移
根据 previous_state.phase 和当前 phase 填写 transition。没有 previous_state 时 from 为空字符串。

# 必须忽略
- 用户输入框（光标所在的未提交行，用户正在输入的内容，TUI推荐的内容）
- 中部伪提示符（❯ $ 下方还有内容时不是结束信号）
- 历史命令中的旧提示符
- 状态栏和模式指示器（⏵⏵ accept edits on、⏸ plan mode on、shift+tab to cycle、Esc to interrupt）
- 装饰性分割线（────）
- ANSI 颜色控制码

# 输出规则
1. 只输出 JSON
2. 禁止 markdown 代码块
3. 禁止解释、建议、对话

示例：
{"tag":"进行","description":"正在编译项目","phase":"running_command","activity":"正在编译项目","confidence":0.86,"evidence":["building"],"transition":{"from":"idle","to":"running_command","reason":"出现编译输出"},"needs_user_input":false,"is_stale":false}
{"tag":"需确认","description":"等待确认代码变更","phase":"waiting_for_user","activity":"等待确认代码变更","confidence":0.9,"evidence":["Apply changes?"],"transition":{"from":"running_command","to":"waiting_for_user","reason":"出现确认提示"},"needs_user_input":true,"is_stale":false}
{"tag":"完毕","description":"命令执行完成","phase":"completed","activity":"命令执行完成","confidence":0.8,"evidence":["$"],"transition":{"from":"running_command","to":"completed","reason":"回到提示符"},"needs_user_input":false,"is_stale":false}`

// FormatStateAnalysisContext formats the structured request as the user message.
func FormatStateAnalysisContext(req StateAnalysisRequest) (string, error) {
	if req.AllowedTransitions == nil {
		req.AllowedTransitions = []string{}
	}
	if req.RecentTransitions == nil {
		req.RecentTransitions = []StateTransition{}
	}
	if req.EventsSincePreviousAnalysis == nil {
		req.EventsSincePreviousAnalysis = []StateObservation{}
	}
	data, err := json.MarshalIndent(req, "", "  ")
	if err != nil {
		return "", err
	}
	return "请只根据以下结构化上下文判断当前状态。历史字段只用于理解上下文，当前状态以 current_terminal_tail 和新增事件为准。\n\n" + string(data), nil
}

// NormalizeSummary fills conservative defaults so legacy tag/description-only
// model responses remain compatible with the richer state contract.
func NormalizeSummary(summary *Summary) {
	if summary == nil {
		return
	}
	if summary.Tag == "" {
		summary.Tag = "未知"
	}
	if len(summary.Tag) > 12 {
		summary.Tag = string([]rune(summary.Tag)[:4])
	}
	if len(summary.Description) > 90 {
		summary.Description = string([]rune(summary.Description)[:30]) + "..."
	}
	if summary.Phase == "" {
		summary.Phase = phaseFromTag(summary.Tag)
	}
	if summary.Activity == "" {
		summary.Activity = summary.Description
	}
	if summary.Confidence <= 0 {
		summary.Confidence = 0.5
	}
	if summary.Evidence == nil {
		summary.Evidence = []string{}
	}
}

func phaseFromTag(tag string) string {
	switch tag {
	case "进行":
		return "running_command"
	case "需输入", "需选择", "需确认":
		return "waiting_for_user"
	case "错误":
		return "error"
	case "完毕":
		return "completed"
	case "等待":
		return "waiting_for_process"
	default:
		return "unknown"
	}
}

// DecideActionPromptTemplate is the system prompt for auto-reply decision
// Use strings.ReplaceAll to replace {{deny_keywords}} and {{goal}} placeholders
const DecideActionPromptTemplate = `你是终端自动应答助手。根据屏幕内容提取选项并推荐操作。

【必须忽略的内容】
以下内容不属于程序提示，必须完全忽略，不要将其视为需要响应的选项：
- 命令提示符行（以 ❯、$、#、>>>、>、% 开头的行）
- 用户正在输入但尚未按回车提交的文本（光标所在行）
- 底部状态栏和模式指示器（⏵⏵ accept edits on、⏸ plan mode on、shift+tab to cycle、Esc to interrupt）
- 历史命令或已完成的输出

【硬性规则】
1. 只能选择屏幕上**程序主动显示**的选项/提示
2. 用户输入栏中的内容不是选项，必须忽略
3. 如果选项不清晰或有歧义，必须返回 actions: []
4. 涉及以下关键词时必须跳过：{{deny_keywords}}
5. 输出 confidence 0-1，低于 0.5 时 actions 必须为空数组
6. 箭头菜单选择时，返回完整的动作序列（如选第3项：down,down,enter）
7. 当前高亮项如果已是目标，只需 enter
8. y/n/数字输入后必须追加 enter 步骤（除非屏幕明确提示按键即生效）

【用户预设方向】
全局策略：{{goal}}
当前会话目标：{{session_goal}}

【目标对齐判断】
如果设置了"当前会话目标"（非"未设置会话目标"），你必须判断推荐的操作是否与会话目标一致：
- 一致：goal_aligned = true
- 不一致：goal_aligned = false，goal_mismatch 说明原因（20字以内）
- 未设置会话目标：不输出 goal_aligned 字段

【输出格式】
{
  "tag": "需确认|需输入|需选择",
  "description": "简短描述",
  "actions": [
    {"type": "arrow", "value": "down"},
    {"type": "arrow", "value": "down"},
    {"type": "enter", "value": ""}
  ],
  "confidence": 0.85,
  "evidence": ["屏幕上的原文行1", "屏幕上的原文行2"],
  "reasoning": "简要说明为什么选择这个操作（30字以内）",
  "action_keywords": ["install", "confirm"],
  "goal_aligned": true,
  "goal_mismatch": ""
}

【action_keywords 说明】
分析你推荐的操作会产生什么效果，返回1-3个关键词。例如：
- 确认删除文件 → ["delete", "remove"]
- 确认安装包 → ["install"]
- 选择执行命令 → ["exec", "run"]
- 确认覆盖文件 → ["overwrite", "replace"]
- 确认退出 → ["exit", "quit"]
- 取消/拒绝操作 → ["cancel", "reject", "abort"]
- 简单确认继续 → ["continue", "confirm"]

【actions 动作类型】
- {"type": "yn", "value": "y"} 或 {"type": "yn", "value": "n"}
- {"type": "digit", "value": "3"}
- {"type": "arrow", "value": "up|down|left|right"}
- {"type": "enter", "value": ""}
- {"type": "text", "value": "继续"} 中文/英文确认词（继续/是/yes/ok/continue 等）
- 空数组 [] 表示不执行任何操作

【text 类型使用场景】
当程序需要输入确认词而非简单 y/n 时使用：
- 中文确认：继续、是、确认、确定、同意
- 英文确认：yes、ok、continue、proceed、confirm
- 注意：text 后通常需要追加 enter 步骤

只返回 JSON，不要其他内容。`
