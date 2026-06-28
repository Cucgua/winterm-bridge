# AI 会话状态上下文设计

## Architecture

本任务在现有 Go 后端内增加轻量 `Session Intelligence` 能力，不引入外部 agent 框架。

核心边界：

- `backend/internal/llm` 负责 LLM 请求/响应契约和 prompt。
- `backend/internal/monitor` 负责构建状态上下文、维护 session 内存状态、广播兼容摘要、触发自动应答。
- 前端继续消费现有 `ai_summary` 和 workflow event，本任务不要求前端读取扩展字段。

## Data Contracts

新增或扩展 LLM 层结构：

- `StateAnalysisRequest`
  - `CurrentTerminalTail string`
  - `SessionGoal string`
  - `PreviousState *SessionStateSummary`
  - `RecentTransitions []StateTransition`
  - `EventsSincePreviousAnalysis []StateObservation`
  - `AllowedTransitions []string`
- `Summary`
  - 保留 `Tag string`、`Description string`
  - 增加 `Phase string`、`Activity string`、`Confidence float64`
  - 增加 `Evidence []string`
  - 增加 `Transition *StateTransition`
  - 增加 `NeedsUserInput bool`、`IsStale bool`

兼容性要求：JSON 解析必须容忍旧模型只返回 `tag/description`。缺失扩展字段时使用保守默认值。

## State Model

`monitor.sessionState` 增加：

- `lastAnalysisAt time.Time`
- `recentTransitions []llm.StateTransition`
- `observationsSinceAnalysis []llm.StateObservation`

每次 terminal 内容变化时，monitor 生成观察，例如：

- terminal 内容发生变化。
- 当前 tail 行数。
- token 数变化。
- 上一状态存在时，记录上一状态摘要。

分析成功后：

- 更新 `lastSummary`。
- 如果 LLM 返回有效 transition，则加入 `recentTransitions`。
- 清空或滚动 `observationsSinceAnalysis`，避免重复把同一批新增事件传给下一轮。
- 广播旧兼容 `ai_summary`。

## LLM Prompt

状态 prompt 从“分析 stdout/stderr 快照”改为“根据结构化上下文判断当前状态转移”。

prompt 必须强调：

- `previous_state` 和 `recent_transitions` 是历史，只能用于理解上下文。
- `events_since_previous_analysis` 是上轮以后发生的新事实。
- `current_terminal_tail` 是判断当前状态的主要依据。
- 不得把历史错误、历史 shell prompt、历史确认提示当作当前状态。
- 输出必须为 JSON，且包含兼容 `tag/description`。

## Data Flow

1. `processSession` 检测 terminal token 变化。
2. `checkContextChange` 返回变化标记和新 tokens。
3. `analyzeSession` 重新 capture terminal tail。
4. `buildStateAnalysisRequest` 汇总上一状态、最近转移、新观察、当前 tail、session goal。
5. `provider.Summarize(ctx, req)` 调用 LLM。
6. `normalizeSummary` 填充缺省字段，保证旧逻辑可用。
7. monitor 更新 session state，广播 `ai_summary`，再进入现有通知和自动应答流程。

## Trade-Offs

- 不做持久化重放：实现更小，重启后丢失近期上下文；可接受，因为当前问题主要发生在同一运行会话内。
- 不改前端：避免与已有 client 未提交改动冲突；缺点是扩展状态暂时只在后端使用。
- 不强制每轮携带完整历史：使用上一状态、最近转移和新增观察控制 token，避免旧日志污染。

## Rollback

所有改动集中在 `backend/internal/llm` 和 `backend/internal/monitor`。如出现回归，可以恢复 `Provider.Summarize(ctx, content string)` 旧接口和 `analyzeSession` 中的旧调用路径。
