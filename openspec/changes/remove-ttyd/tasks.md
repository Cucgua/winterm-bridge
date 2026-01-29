# Tasks: Remove ttyd Dependency

## Phase 1: 协议规范定义

### Task 1.1: 定义 WebSocket 协议规范
- **文件**: `openspec/changes/remove-ttyd/specs/protocol.md`
- **内容**:
  - Binary Frame 格式（PTY 数据）
  - Text Frame 格式（JSON 控制信令）
  - 握手流程
  - 错误处理
- **验证**: 协议文档完整，前后端理解一致

---

## Phase 2: 后端 PTY 模块实现

### Task 2.1: 创建 PTY Manager
- **文件**: `backend/internal/pty/manager.go`
- **实现**:
  - `Manager` 结构体（管理所有 PTY 实例）
  - `Instance` 结构体（单个 PTY 会话）
  - `EnsureInstance(sessionID, tmuxName)` - 获取或创建 PTY
  - `Release(sessionID)` - 释放引用
  - 空闲清理机制（30s 无连接后关闭）
- **依赖**: `github.com/creack/pty`
- **验证**: 单元测试覆盖生命周期管理

### Task 2.2: 实现 PTY I/O 处理
- **文件**: `backend/internal/pty/io.go`
- **实现**:
  - `StartPty(tmuxSocket, tmuxName)` - 启动 tmux attach
  - PTY 读取 goroutine（非阻塞）
  - PTY 写入方法
  - SIGWINCH 信号处理（resize）
- **验证**: tmux attach 成功，输入输出正常

### Task 2.3: 实现 WebSocket Handler
- **文件**: `backend/internal/pty/handler.go`
- **实现**:
  - `ServeWS(w, r)` - WebSocket 升级
  - Binary Frame → PTY stdin
  - PTY stdout → Binary Frame
  - Text Frame JSON 解析（resize/ping）
- **验证**: WebSocket 连接成功，双向通信正常

---

## Phase 3: 后端集成

### Task 3.1: 修改 API Handler
- **文件**: `backend/internal/api/handler.go`
- **修改**:
  - 移除 `ttydManager` 字段
  - 添加 `ptyManager` 字段
  - `HandleAttachSession`: 返回 `ws_url` 替代 `ttyd_url`
  - 确保 PTY 实例在 attach 时启动
- **验证**: API 返回正确的 WebSocket URL

### Task 3.2: 修改 main.go
- **文件**: `backend/cmd/server/main.go`
- **修改**:
  - 移除 `ttyd` 包导入
  - 移除 `ttydManager` 和 `ttydProxy` 创建
  - 添加 `ptyManager` 创建
  - 更新路由：`/ws/{sessionID}` → PTY Handler
- **验证**: 服务启动正常，无 ttyd 依赖

### Task 3.3: 删除 ttyd 包
- **删除**: `backend/internal/ttyd/` 目录
- **清理**:
  - `backend/internal/ws/handler.go` 中的 ttyd 引用
  - 所有 ttyd 相关日志和注释
- **验证**: 编译通过，无 ttyd 残留

---

## Phase 4: 前端适配

### Task 4.1: 重构 socket.ts
- **文件**: `frontend/src/shared/core/socket.ts`
- **修改**:
  - `connectWithToken(wsUrl, sessionId)`: 移除 'tty' 子协议
  - `sendInput(data)`: 直接发送 Binary（无 '0' 前缀）
  - `sendResize(cols, rows)`: 发送 JSON Text Frame
  - `onmessage`: Binary→onData, Text→解析JSON控制消息
  - 移除 ttyd 协议注释
- **验证**: 终端输入输出正常

### Task 4.2: 更新 api.ts
- **文件**: `frontend/src/shared/core/api.ts`
- **修改**:
  - `AttachResponse.ttyd_url` → `ws_url`
  - 相关调用处适配
- **验证**: TypeScript 编译通过

### Task 4.3: 更新 vite.config.ts
- **文件**: `frontend/vite.config.ts`
- **修改**:
  - 移除 `/ttyd` 代理配置
  - 添加 `/ws` 代理配置（如需要）
- **验证**: 开发服务器代理正常

### Task 4.4: 更新组件调用
- **文件**:
  - `frontend/src/routes/mobile/MobileShell.tsx`
  - `frontend/src/routes/desktop/DesktopApp.tsx`
  - `frontend/src/routes/mobile/hooks/useConnectionStatus.ts`
- **修改**: `ttyd_url` → `ws_url`
- **验证**: 组件连接正常

---

## Phase 5: 测试与验证

### Task 5.1: 后端单元测试
- **文件**: `backend/internal/pty/*_test.go`
- **覆盖**:
  - PTY 创建/销毁
  - 引用计数
  - Resize 信号
- **验证**: `go test ./...` 通过

### Task 5.2: 端到端测试
- **场景**:
  - 桌面端：连接、输入、resize、断线重连
  - 移动端：触摸输入、虚拟键盘、滚动
  - 边界：中文输入、大量输出（ls -la /）、vim
- **验证**: 所有场景功能正常

### Task 5.3: 性能对比
- **指标**:
  - 首次连接延迟
  - 输入响应延迟
  - 大量输出吞吐量
- **验证**: 性能不低于 ttyd 方案

---

## Phase 6: 清理与文档

### Task 6.1: 清理遗留文件
- **删除**:
  - `frontend/src/shared/components/TtydIframe.tsx`（如有）
  - `index2.html`（ttyd 原生页面）
  - `backend/internal/ws/handler.go`（如已废弃）
- **验证**: 无未使用的 ttyd 相关代码

### Task 6.2: 更新文档
- **文件**: `README.md` 或 `docs/`
- **内容**:
  - 移除 ttyd 安装说明
  - 更新架构图
  - 记录新 WebSocket 协议
- **验证**: 文档与实现一致
