# AI Memory + 状态监测增强实施计划

## 1. 目标与结论

本计划用于在现有 WinTerm Bridge 的 AI 监测能力上，补齐“可用于 AI coding 的记忆系统”。
核心结论：

1. 现有系统可支持“状态监测”和“自动动作”，但记忆仍停留在日志层。
2. 需要将监测信号升级为结构化记忆，并形成“写入-检索-回注”闭环。
3. 技术路线建议采用“事件驱动 + 低频轮询兜底”的混合架构。

## 2. 当前基础（已有能力）

已有模块与能力：

1. 状态监测主循环：`backend/internal/monitor/service.go`
2. 终端内容采集：`backend/internal/tmux/client.go` 的 `CaptureSessionPane`
3. 输入监听与冷却：`backend/internal/pty/handler.go` + `monitor.OnUserInput`
4. 自动动作日志：`backend/internal/monitor/log.go`
5. 工作流事件日志：`backend/internal/monitor/workflow_log.go`
6. AI 请求日志：`backend/internal/llm/logger.go`
7. 读取接口：`/api/auto/logs`、`/api/workflow-events`、`/api/ai/logs`

## 3. 问题与差距

当前不足：

1. 输入信号是“有输入”级别，缺乏“命令/意图”级语义。
2. 状态结果是 `tag + description`，无法支撑 coding 记忆检索。
3. 监测以轮询快照为主，可能丢失短时关键状态。
4. 记忆素材分散在日志中，没有统一 Memory Item 模型。
5. 缺少记忆检索 API 与 prompt 回注链路。

## 4. 总体方案

分三层建设：

1. 采集层：增强状态事件与输入事件，统一事件格式。
2. 记忆层：将事件抽取成结构化 Memory Item 并持久化。
3. 使用层：按场景检索 TopK 记忆，注入 AI coding prompt。

总体原则：

1. 不破坏现有监测主链路。
2. 先本地可用，再逐步增加复杂策略。
3. 先“会话记忆”，后“跨会话记忆”。

## 5. 分阶段计划

### Phase 0：监测增强（1 周）

目标：让信号更稳定、更可解释。

任务：

1. 新增监测事件结构字段：`state`、`confidence`、`evidence`、`transition_reason`。
2. 增加状态去抖策略（避免 tag 高频抖动）。
3. 保留轮询兜底，同时在关键触发点即时分析：
   - 用户输入提交
   - 检测到交互提示符
   - 终端输出关键模式变化
4. 记录输入活动窗口（不记录逐键），为后续命令级抽取打基础。

交付：

1. 增强版 workflow event 输出。
2. 监测稳定性对比数据（抖动率、漏报率）。

### Phase 1：Memory Item 建模与写入（1~2 周）

目标：把日志转成可检索记忆。

任务：

1. 设计 `memory_items` 数据模型（建议 SQLite）：
   - `id`
   - `session_id`
   - `scope`（session/user/global）
   - `type`（goal/issue/action/result/preference/context）
   - `summary`
   - `details`
   - `evidence`
   - `cwd`
   - `project_hint`
   - `tags`
   - `importance`
   - `created_at`
   - `updated_at`
2. 新增“记忆抽取器”：从以下来源抽取并归一化写入。
   - workflow events
   - auto action logs
   - ai request logs
3. 增加去重与合并规则（同义合并、短时间重复折叠）。

交付：

1. Memory Repository（CRUD + Upsert + 去重）。
2. 每个会话可沉淀“问题-动作-结果”链条记忆。

### Phase 2：记忆检索与回注（1 周）

目标：让 AI coding 真正用上记忆。

任务：

1. 新增记忆检索 API：
   - `GET /api/memory/search?session_id=...&q=...&limit=...`
2. 新增记忆写入 API：
   - `POST /api/memory/items`
3. 新增记忆管理 API：
   - `DELETE /api/memory/items/{id}`
   - `POST /api/memory/compact`
4. 在 AI 调用前加入回注步骤：
   - 按 `session_id + cwd + query` 召回 TopK
   - 拼装 Memory Context block
   - 统一注入 Summarize/DecideAction 或后续 coding prompt

交付：

1. 端到端闭环：写入 -> 检索 -> 回注 -> 新记忆写回。
2. 提示词中可见“最近关键记忆”。

### Phase 3：记忆治理与产品化（1~2 周）

目标：可长期运行，避免记忆污染。

任务：

1. 增加记忆 TTL 与归档策略。
2. 增加会话删除联动清理策略。
3. 增加人工纠偏能力：
   - 固定记忆（pin）
   - 拉黑记忆（ignore）
   - 手动编辑摘要
4. 增加质量监控指标与面板：
   - 召回命中率
   - 回注后成功率变化
   - 记忆重复率

交付：

1. 可控、可审计、可维护的记忆系统。
2. 上线运行手册与回滚方案。

## 6. 代码落点建议

后端建议新增：

1. `backend/internal/memory/types.go`
2. `backend/internal/memory/repository.go`
3. `backend/internal/memory/extractor.go`
4. `backend/internal/memory/service.go`
5. `backend/internal/memory/search.go`

后端改造点：

1. `backend/internal/monitor/service.go`
   - 增强事件字段
   - 接入记忆写入触发
2. `backend/internal/api/handler.go`
   - 增加 memory APIs
3. `backend/cmd/server/main.go`
   - memory service 初始化与注入
4. `backend/internal/session/registry.go`
   - 会话删除联动 memory 清理

前端建议新增：

1. `frontend/src/shared/core/api.ts`
   - memory 相关接口类型与请求
2. `frontend/src/shared/stores/aiStore.ts`
   - memory 查询结果缓存
3. `frontend/src/routes/desktop/*`
   - memory 调试视图或侧边栏摘要（可选）

## 7. 验收标准（必须满足）

功能验收：

1. 能查询任一会话最近 N 条高质量记忆。
2. 在 AI coding 前可稳定回注 TopK 记忆。
3. 记忆去重可抑制重复写入。
4. 会话删除后记忆可按策略清理。

质量验收：

1. 监测误触发率显著下降（相对当前基线）。
2. 同等任务下，AI 重复提问次数下降。
3. 关键失败场景可从记忆中追溯原因链路。

性能验收：

1. 监测主循环无明显阻塞。
2. 记忆检索接口 P95 延迟可控。
3. 日志与记忆存储增长可控（有压缩与清理）。

## 8. 风险与应对

风险：

1. 记忆噪声过多，回注污染模型判断。
2. 事件抽取不稳定，导致误记忆。
3. 存储增长过快。
4. 会话上下文切换导致跨项目误召回。

应对：

1. 引入 importance + 去重 + TTL 三道过滤。
2. 抽取器先规则后模型，逐步放量。
3. 增加按会话与按时间分区清理。
4. 检索阶段增加 `session_id/cwd/project_hint` 强约束。

## 9. 实施顺序（建议）

1. 先做 Phase 0，稳定信号。
2. 再做 Phase 1，建立结构化记忆。
3. 再做 Phase 2，形成业务闭环。
4. 最后做 Phase 3，治理和运营化。

## 10. 里程碑产物清单

1. 设计文档：Memory 数据模型 + API 合约。
2. 可运行代码：memory service + API + monitor 接入。
3. 回归用例：监测、写入、检索、回注、清理。
4. 运维文档：配置项、限流、清理策略、回滚策略。

---

该计划按“最小可用闭环”优先，不依赖重型图数据库。后续若需跨会话语义关系增强，可在稳定后评估引入图记忆或向量检索。
