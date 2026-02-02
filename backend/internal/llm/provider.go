package llm

import (
	"context"
)

// Summary represents the AI-generated status summary
type Summary struct {
	Tag         string `json:"tag"`         // 2-4 character status tag (完毕、进行、需输入、需选择、错误、等待)
	Description string `json:"description"` // Brief description of current state
}

// Provider defines the interface for LLM providers
type Provider interface {
	// Summarize analyzes terminal content and returns a status summary
	Summarize(ctx context.Context, content string) (*Summary, error)
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
const DefaultPrompt = `你是终端状态分析器。分析终端输出，返回 JSON。

# 输出格式
{"tag":"标签","description":"描述"}

# 标签（二选一）
- 完毕：显示提示符或命令结束
- 进行：有持续输出
- 需确认：等待 y/n 或回车
- 需输入：等待密码或文件名
- 需选择：菜单选择
- 错误：出现错误
- 等待：长时间无输出

# 忽略
- 提示符行（❯$#>>> 开头）
- 状态栏（⏵⏵、快捷键）

# 规则
1. 只输出 JSON，禁止其他内容
2. 禁止 markdown 代码块
3. 禁止分析过程

示例：{"tag":"完毕","description":"命令执行完成"}`

// DecideActionPromptTemplate is the system prompt for auto-reply decision
// Use strings.ReplaceAll to replace {{deny_keywords}} and {{goal}} placeholders
const DecideActionPromptTemplate = `你是终端自动应答助手。根据屏幕内容提取选项并推荐操作。

【必须忽略的内容】
以下内容不属于程序提示，必须完全忽略，不要将其视为需要响应的选项：
- 命令提示符行（以 ❯、$、#、>>>、>、% 开头的行）
- 用户正在输入但尚未按回车提交的文本（光标所在行）
- 底部状态栏（运行指示器 ⏵⏵、快捷键提示、进度条）
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
{{goal}}

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
  "action_keywords": ["install", "confirm"]
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
