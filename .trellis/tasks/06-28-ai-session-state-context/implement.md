# 实施计划

## Scope

实现后端 MVP：结构化状态分析请求、扩展状态响应、monitor 上下文构建、兼容旧广播和自动应答。

## Checklist

1. 读取实现前规范：
   - `.trellis/spec/backend/directory-structure.md`
   - `.trellis/spec/backend/database-guidelines.md`
   - `.trellis/spec/backend/error-handling.md`
   - `.trellis/spec/backend/logging-guidelines.md`
   - `.trellis/spec/backend/quality-guidelines.md`
   - `.trellis/spec/guides/cross-layer-thinking-guide.md`
   - `.trellis/spec/guides/code-reuse-thinking-guide.md`
2. 扩展 `backend/internal/llm`：
   - 新增状态请求、观察、转移结构。
   - 修改 `Provider.Summarize` 签名。
   - 更新 OpenAI-compatible provider 请求构造和 JSON 解析。
3. 扩展 `backend/internal/monitor`：
   - 给 `sessionState` 增加最近转移和观察缓存。
   - 在 `analyzeSession` 中构建结构化请求。
   - 分析成功后维护最近转移和兼容摘要。
4. 增加定向测试：
   - 状态上下文请求能包含上一状态和观察。
   - 扩展 summary 兼容旧 `tag/description`。
   - 最近转移数量被限制。
5. 运行验证：
   - `timeout 60s go test ./internal/...` from `backend/`
   - 如测试通过，再考虑 `go vet ./...`

## Risky Areas

- `Provider` 接口签名会影响所有实现者和调用点。
- `Summary` 扩展字段不能破坏旧 JSON 响应解析。
- monitor 锁使用必须避免在持锁时做 LLM 调用。
- 不要在日志或 workflow event 中写入完整 terminal tail。

## Validation Reporting

最终汇报必须分层说明：

- 静态检查。
- 单元测试。
- 构建。
- 前端验证。
- 浏览器/API 烟测。
- 真实环境联调。
