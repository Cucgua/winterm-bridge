# Remove ttyd Dependency

## Context

WinTerm-Bridge 当前使用 ttyd 作为终端 WebSocket 桥接层：
- 每个 session 启动独立 ttyd 进程
- 后端仅负责进程管理和 WebSocket 代理
- 前端实现 ttyd 协议（前缀消息格式）

**问题**：
1. 外部进程依赖增加部署复杂度
2. 双层 WebSocket 代理增加延迟
3. ttyd 进程管理逻辑冗余
4. 难以实现自定义功能（审计、限流、录屏）

## Requirements

### R1: 后端直接 PTY 管理
**场景**: 后端直接 fork tmux attach，无需 ttyd 中介
- MUST 使用 Go PTY 库（如 creack/pty）直接管理终端
- MUST 支持 SIGWINCH 信号处理（窗口 resize）
- MUST 实现引用计数和空闲清理机制

### R2: 新 WebSocket 协议
**场景**: 采用 Binary/Text 分帧协议替代 ttyd 前缀协议
- Binary Frame: 纯 PTY 数据流（stdin/stdout）
- Text Frame: JSON 控制信令（resize/ping/title）
- MUST 在握手时完成认证（URL 参数或 HTTP 头）

### R3: 前端协议适配
**场景**: 前端 socket.ts 适配新协议
- MUST 修改 sendInput 为纯 Binary 发送
- MUST 修改 sendResize 为 JSON Text Frame
- MUST 修改 onmessage 处理逻辑

### R4: API 兼容性
**场景**: 保持 REST API 结构兼容
- attachSession 返回 ws_url（原 ttyd_url）
- Session CRUD 接口无变化

## Success Criteria

1. **功能等价**: 终端输入输出、resize、中文输入正常工作
2. **零 ttyd 依赖**: 系统启动和运行不依赖 ttyd 二进制
3. **延迟改善**: 单层 WebSocket 连接，延迟降低
4. **测试通过**: 桌面端和移动端功能测试全部通过

## Dependencies

- Go 标准库 `os/exec`
- Go PTY 库 `github.com/creack/pty`
- gorilla/websocket（已有）

## Risks

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| PTY I/O 阻塞 | 终端无响应 | 使用非阻塞 I/O 或独立 goroutine |
| 信号处理错误 | resize 失效 | 正确传递 SIGWINCH |
| 资源泄露 | 内存/进程泄露 | 完善的 cleanup 机制 |
| 协议不兼容 | 前后端通信失败 | 严格定义协议规范，联调测试 |

## Affected Files

### 后端（删除/重写）
- `backend/internal/ttyd/` - 整个目录删除
- `backend/internal/ws/handler.go` - 重写为直接 PTY 处理
- `backend/internal/api/handler.go` - 移除 ttydManager 依赖
- `backend/cmd/server/main.go` - 移除 ttyd 相关初始化

### 后端（新增）
- `backend/internal/pty/manager.go` - PTY 进程管理
- `backend/internal/pty/handler.go` - WebSocket ↔ PTY 桥接

### 前端（修改）
- `frontend/src/shared/core/socket.ts` - 适配新协议
- `frontend/src/shared/core/api.ts` - 字段重命名
- `frontend/vite.config.ts` - 移除 ttyd 代理配置

## Out of Scope

- 会话录制/回放功能
- 多路复用协议
- 文件传输功能
