# Constraints: Remove ttyd Dependency

## Hard Constraints (技术限制，不可违反)

### HC-1: tmux 依赖保留
- 系统仍依赖 tmux 进行会话持久化
- PTY 管理必须通过 `tmux -S {socket} attach -t {name}` 连接
- tmux socket 路径：`/tmp/tmux-{uid}/default` 或 `WINTERM_TMUX_SOCKET` 环境变量

### HC-2: WebSocket 是唯一通信通道
- 前端通过 WebSocket 与终端交互
- 不得引入 HTTP 轮询或 SSE 替代方案
- gorilla/websocket 库已在使用，MUST 继续使用

### HC-3: 认证流程不变
- PIN → Token → Session → Attach 流程保持不变
- AttachmentTokenStore 机制保留（一次性 token）
- 前端 localStorage 存储 token 方式不变

### HC-4: Go 标准工具链
- 后端使用 Go，MUST NOT 引入 CGO 依赖（保持交叉编译能力）
- `creack/pty` 是纯 Go PTY 库，满足此约束

### HC-5: 前端框架保持
- React + TypeScript + xterm.js 栈不变
- SocketService 的公共 API 尽量保持向后兼容

## Soft Constraints (约定/偏好)

### SC-1: 代码组织风格
- Go 包按功能划分：`internal/pty/` 替代 `internal/ttyd/`
- 文件命名：`manager.go`, `handler.go` 保持一致

### SC-2: 日志格式
- 使用 `[pty]` 前缀替代 `[ttyd]`
- 保持现有日志级别和格式

### SC-3: 错误处理
- 使用 `fmt.Errorf("failed to xxx: %w", err)` 格式
- 不使用 panic，全部返回 error

### SC-4: 前端代码风格
- 保持 TypeScript strict mode
- 保持现有的回调注册模式（onData/onOpen/onClose）

---

## 用户确认的决策 (2026-01-28)

| 决策点 | 选择 |
|--------|------|
| 协议格式 | Binary/Text 分帧 |
| 端点路径 | `/ws` |
| 认证方式 | URL 查询参数 |
| 多客户端连接 | **允许**（共享 PTY，输入串行化，输出广播） |
| 流控制 | **保留**（JSON {type: 'pause'/'resume'}） |
| KeepAlive | **JSON Ping**（{type: 'ping'} / {type: 'pong'}） |
| API 字段 | **直接替换** ttyd_url → ws_url |

---

## Protocol Specification (完整版)

### 连接建立
```
Client → Server: WebSocket Upgrade
  URL: /ws?token={attachment_token}&session={session_id}
  No subprotocol required (移除 'tty' 子协议)

  - token: 必填，一次性 attachment_token
  - session: 必填，session_id
  - 两者必须匹配，否则 Close(4001)
```

### 连接后立即操作
```
# 客户端连接成功后，立即发送 resize 同步初始尺寸
Client → Server: {"type":"resize","cols":80,"rows":24}
```

### 数据传输
```
# PTY 数据（双向）- Binary Frame
Client → Server: Binary Frame (raw bytes = stdin)
Server → Client: Binary Frame (raw bytes = stdout)

# 控制信令（双向）- Text Frame (JSON)
# Client → Server
{"type":"resize","cols":80,"rows":24}  # 终端尺寸变化
{"type":"ping"}                         # 心跳请求（每30秒）
{"type":"pause"}                        # 流控制：暂停输出
{"type":"resume"}                       # 流控制：恢复输出

# Server → Client
{"type":"pong"}                         # 心跳响应
{"type":"title","text":"user@host:~"}   # 窗口标题（可选）
{"type":"error","message":"..."}        # 错误通知（连接关闭前发送）
```

### WebSocket Close Codes
```
4001 - invalid token (认证失败/token已用/不匹配)
4004 - session not found (tmux session 不存在)
4100 - pty exited (PTY 进程退出)
```

---

## Backend Implementation Details (零歧义)

### PTY Instance 结构体字段
```go
type Instance struct {
    SessionID   string
    TmuxName    string
    Cmd         *exec.Cmd       // tmux attach 进程
    Pty         *os.File        // creack/pty 返回的主端
    RefCount    int
    LastActive  time.Time
    StopTimer   *time.Timer
    Closed      bool            // 或用 atomic

    // 连接管理
    Subscribers map[*websocket.Conn]*Subscriber
    SubMu       sync.RWMutex

    // 写入队列（串行化 PTY 写入）
    WriteCh     chan []byte

    mu          sync.Mutex      // 保护实例状态
}
```

### EnsureInstance 并发安全
- 使用 singleflight 或双检锁 + "creating" 占位状态
- 保证同一 sessionID 只创建一个 PTY 进程
- 创建前执行 `tmux -S {socket} has-session -t {name}`，失败返回错误

### 空闲清理机制
- RefCount 归零时启动 idleTTL 计时器（默认 30s）
- idleTTL 内有新连接则取消计时器并复用
- 到期后关闭 PTY 和 tmux attach 进程，从 Manager 移除实例
- 不删除 tmux session 本身（由用户或 registry 管理）

### Goroutine 模型
```
每个 Instance:
├── PTY Read Loop (1个)
│   └── 读取 PTY stdout → 广播 Binary Frame 到所有 Subscribers
├── PTY Write Loop (1个)
│   └── 从 WriteCh 读取 → 写入 PTY stdin（串行化）
└── 每个 WS 连接:
    └── WS Read Loop
        ├── Binary → 写入 WriteCh
        └── Text → JSON 解析 → resize/ping/pause/resume
```

### 多客户端行为
- 允许多个客户端连接同一 session
- 输入：所有客户端的输入串行化写入 PTY
- 输出：PTY 输出广播到所有客户端
- Resize：最后一个有效 resize 生效并广播（所有客户端看到相同尺寸）
- 流控：单一客户端的 pause 暂停该客户端的输出，不影响其他客户端

### 连接关闭清理顺序
1. 停止该连接的 WS Read Loop
2. 关闭该连接的发送通道
3. 从实例 Subscribers 移除
4. Release(sessionID) → RefCount--
5. 若 RefCount=0 启动 idleTTL 计时器
6. 若实例已标记 Closed，立即清理 PTY/进程并删除实例

---

## Frontend Implementation Details (零歧义)

### socket.ts 改造

**connectWithToken(wsUrl, sessionId)**
```typescript
// 旧：new WebSocket(url, ['tty'])
// 新：new WebSocket(url)  // 无子协议
// URL 已包含 token 和 session 参数，由后端 API 返回
```

**sendInput(data: string)**
```typescript
// 旧：'0' + data 前缀
// 新：直接发送 Binary Frame
const payload = this.textEncoder.encode(data);
this.ws.send(payload);  // 自动作为 Binary Frame
```

**sendResize(cols, rows)**
```typescript
// 旧：'1' + JSON 前缀
// 新：发送纯 JSON Text Frame
this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
```

**onmessage 处理**
```typescript
this.ws.onmessage = (event) => {
  if (event.data instanceof ArrayBuffer) {
    // Binary Frame = PTY 数据
    this.onDataCallbacks.forEach(cb => cb(event.data));
  } else if (typeof event.data === 'string') {
    // Text Frame = JSON 控制消息
    const msg = JSON.parse(event.data);
    switch (msg.type) {
      case 'pong': /* 心跳响应 */ break;
      case 'title': /* 窗口标题 */ break;
      case 'error': /* 错误通知 */ break;
    }
  }
};
```

**KeepAlive**
```typescript
// 旧：发送 '0' 前缀空包
// 新：发送 JSON ping
setInterval(() => {
  this.ws?.send(JSON.stringify({ type: 'ping' }));
}, 30000);
```

**流控制**
```typescript
// 保留 pause/resume，改用 JSON
sendPause() { this.ws?.send(JSON.stringify({ type: 'pause' })); }
sendResume() { this.ws?.send(JSON.stringify({ type: 'resume' })); }
```

### API 层
```typescript
// api.ts
interface AttachResponse {
  attachment_token: string;
  expires_in: number;
  ws_url: string;  // 替换 ttyd_url
}
```

### 组件层
- **TerminalView.tsx**: 无需改动（已支持 ArrayBuffer）
- **MobileShell.tsx**: 将 `ttyd_url` 改为 `ws_url`

---

## PBT Properties (Property-Based Testing)

### 后端不变量

| Invariant | Falsification Strategy |
|-----------|------------------------|
| 同一 sessionID 最多存在一个活跃 PTY 实例 | 并发 1000 次 EnsureInstance，统计实例数=1 |
| RefCount 永不为负 | 随机交错 Ensure/Release，检查 RefCount ≥ 0 |
| RefCount=0 后 idleTTL 内无新连接则实例被移除 | 模拟 Release 后等待 idleTTL，检查实例已删除 |
| PTY 输出广播到所有活跃客户端 | 多客户端连接，验证全部收到相同数据 |
| Binary Frame 只作为 PTY 数据，不被 JSON 解析 | 发送非 JSON 的 Text Frame 应被忽略或报错 |
| tmux session 不存在时不创建 PTY 实例 | mock has-session 失败，验证 EnsureInstance 返回错误 |
| PTY 进程退出导致所有连接收到 error 并关闭 (4100) | kill attach 进程，检查所有客户端关闭码 |
| Attachment token 一次性使用 | 同 token 连续两次握手，第二次被拒绝 (4001) |

### 前端不变量

| Property | Boundary Condition |
|----------|-------------------|
| Binary 透明性：sendInput(B) 后端收到 exactly B | 测试各种字节序列，包括 0x00, 0xFF |
| 控制分离：Text Frame 不会被写入 PTY | 发送 {type: 'resize'} 验证不出现在终端输出 |
| Resize 幂等：相同尺寸多次发送结果相同 | 发送 10 次相同 resize，最终尺寸正确 |
| 连接恢复：断线重连后恢复 PTY 流 | 断开后重连同一 session，继续接收输出 |

---

## Cross-Module Dependencies

### D-1: 后端 API ↔ PTY Manager
- `api.Handler` 持有 `pty.Manager` 引用
- `HandleAttachSession` 调用 `ptyManager.EnsureInstance()`
- 返回 `ws_url: "/ws?token={token}&session={session_id}"`

### D-2: 后端 Main ↔ PTY Handler
- main.go 注册 `/ws` 路由到 PTY WebSocket Handler
- 移除 `/ttyd/` 路由

### D-3: 前端 Socket ↔ API
- `api.attachSession()` 返回 `{ ws_url, attachment_token, expires_in }`
- `socket.connectWithToken(ws_url, sessionId)`

### D-4: 协议一致性
- 后端 WebSocket Handler 和前端 socket.ts 必须严格遵守上述协议
- Binary Frame = PTY 数据，Text Frame = JSON 控制消息
