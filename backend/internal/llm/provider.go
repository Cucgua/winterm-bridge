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
}

// Config holds the configuration for LLM provider
type Config struct {
	Endpoint string `json:"endpoint"`
	APIKey   string `json:"api_key"`
	Model    string `json:"model"`
}

// DefaultPrompt is the system prompt for terminal status analysis
const DefaultPrompt = `你是一个终端会话状态分析器。分析以下终端输出的最后几行，返回 JSON 格式：

{
  "tag": "状态标签",
  "description": "简短描述"
}

重要：忽略以下内容，不要将它们纳入状态判断：
- 输入框/命令提示符行（如 ❯、$、#、>>> 开头的行）
- 用户正在输入但尚未提交的文本
- 底部状态栏（如运行状态指示器 ⏵⏵、快捷键提示、进度条等）
- 光标所在的当前编辑行

状态标签规则（2-4个汉字）：
- 完毕：命令执行完成，显示提示符或成功信息
- 进行：正在执行命令，有持续输出
- 需输入：等待用户输入（密码、确认、问答）
- 需选择：显示选项菜单，等待选择
- 错误：出现错误信息或异常
- 等待：长时间无输出，等待响应

简短描述规则：
- 不超过30字
- 描述当前正在发生什么
- 如果是对话类工具（如Claude），描述对话状态
- 只根据已完成的命令输出和工具反馈来判断状态

只返回 JSON，不要其他内容。`
