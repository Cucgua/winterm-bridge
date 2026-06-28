# 升级 AI 会话状态上下文

## Goal

把当前“只看终端快照做 tag/description 分类”的 AI 状态判断，升级为带连续上下文的会话状态分析。每次状态分析必须理解上一轮判断、上次分析以来的新事件、当前会话目标和最新终端 tail，避免把旧日志、旧错误、历史提示符或状态栏误判为当前状态。

## Background And Evidence

- 当前 `llm.Summary` 只有 `tag` 和 `description`，无法表达阶段、活动、置信度、证据、状态转移或是否需要用户输入：`backend/internal/llm/provider.go:7-10`。
- 当前 `Provider.Summarize` 只接收 `content string`，状态 prompt 明确分析终端 stdout/stderr 快照，缺少上一状态和新增事件上下文：`backend/internal/llm/provider.go:13-17`、`backend/internal/llm/provider.go:29-91`。
- 当前 per-session 状态只保存 `lastTokens`、`lastSummary`、`summaryTime`、`lastStateHash` 等短期缓存，不保存结构化状态转移：`backend/internal/monitor/service.go:43-57`。
- 当前主流程在终端内容变化时直接重新调用 LLM，总结后广播兼容的 `ai_summary`：`backend/internal/monitor/service.go:319-484`。
- 当前自动应答依赖 summary tag 是否命中 allow list，再用更长终端内容做动作决策：`backend/internal/monitor/service.go:486-708`。
- 当前内容变化判断通过 token fingerprint 对 terminal capture 做相似度比较，适合作为新增事件触发源，但不能表达“发生了什么”：`backend/internal/monitor/service.go:934-1037`。

## Requirements

1. 状态分析请求必须从裸 `content string` 升级为结构化上下文，至少包含：
   - 当前 terminal tail。
   - 上一次结构化状态。
   - 最近若干次状态转移。
   - 上次分析以来的事件或观察。
   - 当前会话目标。
   - 允许的状态转移。
2. 状态分析结果必须扩展为结构化状态，至少包含：
   - 兼容旧前端和自动应答的 `tag`、`description`。
   - `phase`、`activity`、`confidence`、`evidence`。
   - `transition.from`、`transition.to`、`transition.reason`。
   - `needs_user_input`、`is_stale`。
3. 后端必须保留现有 `ai_summary` 广播字段，避免破坏当前前端摘要显示和自动应答 allow-tag 逻辑。
4. 后端必须记录最近状态转移和上次分析以来的结构化观察，使第二次及之后的分析能看到第一次分析结果和中间上下文。
5. LLM prompt 必须明确区分历史、上一次状态、新增事件和当前终端 tail，并要求不要把历史错误或历史提示符当作当前状态。
6. 自动应答仍然只在允许 tag 命中时进入动作决策；本任务不改变实际执行动作协议。
7. 实现必须避免引入新数据库或外部服务。MVP 先使用现有内存状态和 workflow event 日志能力，持久化重放可留作后续。
8. 实现必须保护敏感信息，不在普通日志中输出 API key、完整终端上下文或私密配置。
9. AI 日志面板必须避免直接暴露后端枚举和英文调试字段，中文界面下应使用一致的中文标题、字段名和状态说明。
10. AI 日志面板样式必须贴合现有 Termius-like 客户端风格，使用语义主题 token，保持紧凑、弱边框、可扫描。

## Acceptance Criteria

- [x] `Provider.Summarize` 的调用链使用结构化状态分析请求，不再只传裸终端字符串。
- [x] 第一次分析可在没有上一状态时正常工作，并产生兼容旧逻辑的 `tag`、`description`。
- [x] 第二次及之后的分析会携带上一状态和至少一个新增观察，prompt 中清楚标注历史与当前。
- [x] 后端维护最近状态转移列表，并限制数量，避免 token 无界增长。
- [x] `ai_summary` WebSocket 消息仍包含原有 `type`、`session_id`、`tag`、`description`、`timestamp` 字段。
- [x] 自动应答 tag allow-list 判断仍可使用扩展后的 summary。
- [x] 后端相关 Go 测试通过，或在没有现成覆盖时新增针对状态上下文构建/兼容解析的定向测试。
- [x] 验证结果按静态检查、单元测试、构建等层级汇报，未执行项明确说明。
- [x] AI 日志面板的事件标题、详情字段和常见后端枚举值已本地化，中文界面不再混杂英文内部字段。
- [x] AI 日志面板视觉层级与主界面一致，使用语义主题 token，日志项更紧凑且展开详情更像产品信息而非调试 dump。

## Out Of Scope

- 不引入 LangGraph、Temporal、CrewAI 或 Python sidecar。
- 不做长期向量记忆、跨进程 checkpoint 或完整 event replay。
- 不改变自动应答动作类型和执行安全 gate。
- 不修改现有用户未提交的 client 侧文件改动。
