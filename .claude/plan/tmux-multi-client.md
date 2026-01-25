# tmux Multi-Client 集成方案

## 目标

实现 PC 端和移动端**共享终端状态**（命令历史、进程）的前提下，**各自独立渲染**（独立尺寸、互不影响显示）。

---

## 核心架构

### 当前架构问题

```
WebSocket Client 1 (PC: 80x24) ─┐
                                 ├→ Session.PTY → cmd/shell → 广播输出
WebSocket Client 2 (Mobile: 40x20)─┘
                    ↑
                问题：resize 互相覆盖，显示互相干扰
```

### 目标架构

```
WebSocket Client 1 (PC: 80x24) ──→ tmux client 1 ─┐
                                                    ├→ tmux session (共享状态)
WebSocket Client 2 (Mobile: 40x20)→ tmux client 2 ─┘
                                      ↑
                            各自独立的窗口尺寸和渲染
```

---

## 技术方案：tmux Control Mode

### 什么是 tmux Control Mode？

tmux 提供 `-C` 选项启用 control mode，允许程序通过标准输入/输出控制 tmux：

```bash
# 启动 control mode client
tmux -C attach-session -t my-session -x 80 -y 24

# 通过 stdin 发送命令
send-keys -l "ls"
refresh-client -C 80,24

# 从 stdout 读取输出
%output %0 base64encoded_data
%layout-change %0 ...
```

**核心优势**：
- 同一 tmux session 支持多个不同尺寸的 client
- 每个 client 独立的窗口尺寸和滚动位置
- 状态完全共享（命令历史、进程、环境变量）

---

## 实施计划

### 阶段 1：实现 tmux Control Mode 客户端封装

**新建文件**：`backend/internal/tmux/client.go`

```go
package tmux

import (
	"bufio"
	"encoding/base64"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
)

// Client 代表一个独立的 tmux 客户端连接
type Client struct {
	SessionName string
	ClientID    string
	Cols        int
	Rows        int

	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser

	mu     sync.Mutex
	closed bool
}

// NewClient 创建新的 tmux 客户端，attach 到指定 session
func NewClient(sessionName, clientID string, cols, rows int) (*Client, error) {
	// tmux -C attach-session -t <session> -x <cols> -y <rows>
	cmd := exec.Command("tmux", "-C", "attach-session",
		"-t", sessionName,
		"-x", fmt.Sprintf("%d", cols),
		"-y", fmt.Sprintf("%d", rows))

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start tmux client: %w", err)
	}

	client := &Client{
		SessionName: sessionName,
		ClientID:    clientID,
		Cols:        cols,
		Rows:        rows,
		cmd:         cmd,
		stdin:       stdin,
		stdout:      stdout,
	}

	return client, nil
}

// SendKeys 发送用户输入到 tmux
func (c *Client) SendKeys(data string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return fmt.Errorf("client is closed")
	}

	// tmux control mode: send-keys -l "data"
	// -l 参数表示字面量输入，不解释特殊字符
	cmd := fmt.Sprintf("send-keys -l %q\n", data)
	_, err := c.stdin.Write([]byte(cmd))
	return err
}

// Resize 改变此客户端的窗口尺寸
func (c *Client) Resize(cols, rows int) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return fmt.Errorf("client is closed")
	}

	c.Cols = cols
	c.Rows = rows

	// tmux control mode: refresh-client -C <cols>,<rows>
	cmd := fmt.Sprintf("refresh-client -C %d,%d\n", cols, rows)
	_, err := c.stdin.Write([]byte(cmd))
	return err
}

// ReadOutput 读取 tmux 输出（在 goroutine 中调用）
// onData: 回调函数，接收解码后的终端数据
func (c *Client) ReadOutput(onData func([]byte)) error {
	scanner := bufio.NewScanner(c.stdout)
	for scanner.Scan() {
		line := scanner.Text()

		// 解析 tmux control mode 输出格式
		// %output <pane_id> <base64_data>
		if strings.HasPrefix(line, "%output ") {
			parts := strings.SplitN(line, " ", 3)
			if len(parts) < 3 {
				continue
			}

			// 解码 base64 数据
			data, err := base64.StdEncoding.DecodeString(parts[2])
			if err != nil {
				continue
			}

			onData(data)
		}
		// 其他消息类型 (%layout-change, %session-changed 等) 可以忽略
	}

	return scanner.Err()
}

// Close 关闭客户端连接
func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return nil
	}

	c.closed = true

	// 发送 detach 命令
	c.stdin.Write([]byte("detach-client\n"))
	c.stdin.Close()

	return c.cmd.Wait()
}
```

---

### 阶段 2：改造 Session 支持多 tmux client 管理

**文件**：`backend/internal/session/session.go`

**修改内容**：

```go
package session

import (
	"fmt"
	"os/exec"
	"sync"
	"time"

	"winterm-bridge/internal/tmux"
)

type SessionState string

const (
	StateActive   SessionState = "active"
	StateDetached SessionState = "detached"
)

type Session struct {
	ID          string
	TmuxSession string                  // tmux session 名称
	Clients     map[string]*tmux.Client // WebSocket ID -> tmux client

	State      SessionState
	CreatedAt  time.Time
	LastActive time.Time
	Title      string
	Token      string

	mu sync.RWMutex
}

// AttachClient 为 WebSocket 连接创建独立的 tmux client
func (s *Session) AttachClient(wsID string, cols, rows int) (*tmux.Client, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 检查是否已有 client
	if _, exists := s.Clients[wsID]; exists {
		return nil, fmt.Errorf("client %s already attached", wsID)
	}

	client, err := tmux.NewClient(s.TmuxSession, wsID, cols, rows)
	if err != nil {
		return nil, fmt.Errorf("failed to create tmux client: %w", err)
	}

	s.Clients[wsID] = client
	s.LastActive = time.Now()
	s.State = StateActive

	return client, nil
}

// DetachClient 断开 WebSocket 时移除对应的 tmux client
func (s *Session) DetachClient(wsID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	client, ok := s.Clients[wsID]
	if !ok {
		return nil // 已经断开
	}

	if err := client.Close(); err != nil {
		return fmt.Errorf("failed to close tmux client: %w", err)
	}

	delete(s.Clients, wsID)
	s.LastActive = time.Now()

	// 如果没有客户端连接了，标记为 detached
	if len(s.Clients) == 0 {
		s.State = StateDetached
	}

	return nil
}

// GetClient 获取指定 WebSocket 的 tmux client
func (s *Session) GetClient(wsID string) *tmux.Client {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Clients[wsID]
}

// ClientCount 返回当前连接的客户端数量
func (s *Session) ClientCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.Clients)
}

// CreateTmuxSession 创建底层的 tmux session
func CreateTmuxSession(name, title string) error {
	// tmux new-session -d -s <name> -n <title>
	// -d: detached (后台运行)
	// -s: session name
	// -n: window name
	cmd := exec.Command("tmux", "new-session", "-d", "-s", name, "-n", title)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to create tmux session: %w", err)
	}
	return nil
}

// KillTmuxSession 销毁 tmux session
func KillTmuxSession(name string) error {
	cmd := exec.Command("tmux", "kill-session", "-t", name)
	return cmd.Run()
}
```

---

### 阶段 3：修改 WebSocket Handler 集成 tmux client

**文件**：`backend/internal/ws/handler.go`

**关键修改**：

```go
package ws

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/gorilla/websocket"
	"winterm-bridge/internal/auth"
	"winterm-bridge/internal/session"
	"winterm-bridge/internal/tmux"
)

type Handler struct {
	conn          *websocket.Conn
	registry      *session.Registry
	authManager   *auth.Manager

	session       *session.Session
	clientID      string        // 唯一标识此 WebSocket 连接
	tmuxClient    *tmux.Client  // 此连接对应的 tmux client
	authenticated bool
	token         string
}

func NewHandler(conn *websocket.Conn, registry *session.Registry, authMgr *auth.Manager) *Handler {
	return &Handler{
		conn:        conn,
		registry:    registry,
		authManager: authMgr,
		clientID:    generateClientID(),
	}
}

// Handle 主循环
func (h *Handler) Handle() {
	defer h.Close()

	for {
		messageType, data, err := h.conn.ReadMessage()
		if err != nil {
			log.Printf("[WS] Read error: %v", err)
			return
		}

		if messageType == websocket.TextMessage {
			// 处理控制消息
			var msg ControlMessage
			if err := json.Unmarshal(data, &msg); err == nil && msg.Type != "" {
				h.handleControl(&msg)
				continue
			}
		}

		// 处理用户输入（二进制或文本）
		if h.tmuxClient != nil {
			h.tmuxClient.SendKeys(string(data))
		}
	}
}

// handleSelectSession 选择会话后，创建独立的 tmux client
func (h *Handler) handleSelectSession(payload map[string]interface{}) error {
	sessionID, ok := payload["session_id"].(string)
	if !ok {
		return fmt.Errorf("invalid session_id")
	}

	sess := h.registry.Get(sessionID)
	if sess == nil {
		return fmt.Errorf("session not found")
	}

	// 验证 token 权限
	if sess.Token != h.token {
		return fmt.Errorf("unauthorized")
	}

	h.session = sess

	// 为此 WebSocket 创建独立的 tmux client（默认尺寸）
	client, err := sess.AttachClient(h.clientID, 80, 24)
	if err != nil {
		return fmt.Errorf("failed to attach client: %w", err)
	}

	h.tmuxClient = client

	// 启动 goroutine 读取此 client 的输出并发送给前端
	go h.readTmuxOutput()

	// 通知前端 session 已就绪
	h.sendControl(&ControlMessage{
		Type: "session_ready",
		Payload: map[string]interface{}{
			"session_id": sessionID,
			"client_id":  h.clientID,
		},
	})

	return nil
}

// readTmuxOutput 读取 tmux client 输出并发送给前端
func (h *Handler) readTmuxOutput() {
	err := h.tmuxClient.ReadOutput(func(data []byte) {
		if err := h.conn.WriteMessage(websocket.BinaryMessage, data); err != nil {
			log.Printf("[WS] Write error: %v", err)
		}
	})

	if err != nil {
		log.Printf("[WS] ReadOutput error: %v", err)
	}
}

// handleResize 处理终端尺寸变化
func (h *Handler) handleResize(payload map[string]interface{}) error {
	if h.tmuxClient == nil {
		return fmt.Errorf("no tmux client attached")
	}

	cols, ok1 := payload["cols"].(float64)
	rows, ok2 := payload["rows"].(float64)
	if !ok1 || !ok2 {
		return fmt.Errorf("invalid cols/rows")
	}

	return h.tmuxClient.Resize(int(cols), int(rows))
}

// Close 断开连接时清理
func (h *Handler) Close() {
	if h.session != nil && h.clientID != "" {
		h.session.DetachClient(h.clientID)
		log.Printf("[WS] Client %s detached from session %s", h.clientID, h.session.ID)
	}
	h.conn.Close()
}

// 生成唯一的客户端 ID
func generateClientID() string {
	// 使用 UUID 或时间戳
	return fmt.Sprintf("client-%d", time.Now().UnixNano())
}
```

---

### 阶段 4：更新 Registry 创建 tmux session

**文件**：`backend/internal/session/registry.go`

**修改 Create 方法**：

```go
func (r *Registry) Create(token, title string) (*Session, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	id := generateID()
	tmuxSessionName := fmt.Sprintf("winterm-%s", id)

	// 创建底层的 tmux session
	if err := CreateTmuxSession(tmuxSessionName, title); err != nil {
		return nil, fmt.Errorf("failed to create tmux session: %w", err)
	}

	sess := &Session{
		ID:          id,
		TmuxSession: tmuxSessionName,
		Clients:     make(map[string]*tmux.Client),
		State:       StateActive,
		CreatedAt:   time.Now(),
		LastActive:  time.Now(),
		Title:       title,
		Token:       token,
	}

	r.sessions[id] = sess
	log.Printf("[Registry] Created session %s (tmux: %s)", id, tmuxSessionName)
	return sess, nil
}

// Delete 删除会话时销毁 tmux session
func (r *Registry) Delete(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	sess, ok := r.sessions[id]
	if !ok {
		return fmt.Errorf("session not found")
	}

	// 先断开所有客户端
	for wsID := range sess.Clients {
		sess.DetachClient(wsID)
	}

	// 销毁 tmux session
	if err := KillTmuxSession(sess.TmuxSession); err != nil {
		log.Printf("[Registry] Warning: failed to kill tmux session %s: %v", sess.TmuxSession, err)
	}

	delete(r.sessions, id)
	log.Printf("[Registry] Deleted session %s", id)
	return nil
}
```

---

### 阶段 5：前端协议适配

**文件**：`frontend/src/shared/core/socket.ts`

**微调**（可选，主要是处理新的控制消息）：

```typescript
export interface ControlMessage {
  type: string;
  payload?: any;
}

// 新增消息类型
export const MessageTypes = {
  SESSION_READY: 'session_ready',  // 后端通知 session 已就绪
  // ... 其他已有类型
};
```

**文件**：`backend/internal/ws/protocol.go`

```go
const (
	TypeAuth           = "auth"
	TypeAuthOK         = "auth_ok"
	TypeAuthError      = "auth_error"
	TypeListSessions   = "list_sessions"
	TypeSessionsList   = "sessions_list"
	TypeSelectSession  = "select_session"
	TypeCreateSession  = "create_session"
	TypeDeleteSession  = "delete_session"
	TypeResize         = "resize"
	TypeSessionReady   = "session_ready"  // 新增
)
```

---

### 阶段 6：移除 ConPTY 相关代码

**删除文件**：
- `backend/internal/conpty/pty.go`
- `backend/internal/conpty/pty_windows.go`
- `backend/internal/conpty/pty_wsl.go`
- `backend/internal/conpty/pty_linux.go`
- `backend/internal/conpty/interface_linux.go`

**修改文件**：
- `backend/cmd/server/main.go` - 移除 ConPTY 相关导入

---

### 阶段 7：完整测试和异常处理

#### 7.1 启动时检查 tmux 可用性

**文件**：`backend/cmd/server/main.go`

```go
func checkTmuxAvailable() error {
	cmd := exec.Command("tmux", "-V")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tmux not found. Please install tmux (apt install tmux / brew install tmux)")
	}
	log.Printf("[Init] tmux version: %s", strings.TrimSpace(string(output)))
	return nil
}

func main() {
	if err := checkTmuxAvailable(); err != nil {
		log.Fatal(err)
	}

	// ... 其余启动逻辑
}
```

#### 7.2 异常处理清单

| 场景 | 处理策略 |
|------|----------|
| tmux 未安装 | 启动时检查并退出，提示用户安装 |
| tmux session 已存在 | 创建时检查，若存在则先 kill |
| client attach 失败 | 返回错误给前端，提示重试或重新创建 session |
| 网络断开重连 | 前端重连后，重新 attach 到原 session |
| session 空闲清理 | 定时检查，超过 24h 无活动则自动销毁 |

#### 7.3 测试场景

1. **PC + 移动端同时连接**
   - 验证各自独立尺寸（resize 互不影响）
   - 验证状态共享（PC 输入命令，移动端看到输出）

2. **断线重连**
   - PC 端刷新页面后重新 attach
   - 移动端网络切换后重连

3. **会话管理**
   - 创建多个 session
   - 切换 session
   - 删除 session

4. **边界测试**
   - 极小尺寸（10x10）
   - 极大尺寸（300x100）
   - 快速连续 resize

---

## 变更文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/internal/tmux/client.go` | **新建** | tmux control mode 客户端封装 |
| `backend/internal/session/session.go` | **重写** | Session 改为管理多个 TmuxClient |
| `backend/internal/session/registry.go` | **修改** | Create/Delete 改为创建/销毁 tmux session |
| `backend/internal/ws/handler.go` | **重写** | 每个 WS 连接对应独立 tmux client |
| `backend/internal/ws/protocol.go` | **修改** | 添加 session_ready 消息类型 |
| `backend/cmd/server/main.go` | **修改** | 启动时检查 tmux 可用性，移除 ConPTY 导入 |
| `backend/internal/conpty/*` | **删除** | 完全移除 ConPTY 实现 |
| `frontend/src/shared/core/socket.ts` | **微调** | 处理 session_ready 消息（可选） |

---

## 实施时间线（完整版）

| 阶段 | 任务 | 工作量 |
|------|------|--------|
| **第 1 周** | 实现 `tmux/client.go` + 单元测试 | 2 天 |
| | 修改 `session.go` 支持多客户端 | 1 天 |
| | 修改 `registry.go` 创建/销毁 tmux session | 1 天 |
| | 修改 `handler.go` 集成 tmux client | 1 天 |
| **第 2 周** | 更新协议，前端适配 | 1 天 |
| | 移除 ConPTY 代码 | 0.5 天 |
| | 异常处理、启动检查 | 1 天 |
| | 完整功能测试（PC/移动端） | 2 天 |
| | 断线重连、边界测试 | 0.5 天 |

**总计**：约 **2 周**（1 人全职）

---

## 技术细节

### tmux Control Mode 协议示例

**客户端发送（通过 stdin）**：
```
send-keys -l "ls -la"
send-keys Enter
refresh-client -C 100,30
```

**tmux 返回（通过 stdout）**：
```
%output %0 dG90YWwgNDgK...   (base64 编码的输出)
%layout-change %0 1234,100x30,0,0
```

**关键命令**：
- `send-keys -l "text"` - 发送字面量文本（不解释转义）
- `send-keys Enter` - 发送特殊按键
- `refresh-client -C cols,rows` - 改变客户端窗口尺寸
- `detach-client` - 断开客户端

**参考文档**：`man tmux` → 搜索 `CONTROL MODE`

---

## 预期成果

✅ **PC 端和移动端**：
- 共享同一终端状态（命令历史、进程、环境变量）
- 各自独立的窗口尺寸（PC: 80x24, Mobile: 40x20）
- resize 操作互不影响
- 滚动位置独立

✅ **会话管理**：
- 支持创建多个 tmux session
- 单个 session 支持多个客户端同时连接
- 断线重连后恢复到原 session

✅ **系统架构**：
- 完全移除 ConPTY 依赖
- 统一使用 tmux 作为终端后端
- 跨平台支持（Linux/macOS/WSL）

---

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| tmux control mode 协议解析错误 | 中 | 高 | 充分测试，参考 tmux 源码 |
| 多客户端并发问题 | 低 | 中 | 使用 mutex 保护共享状态 |
| 内存泄漏（goroutine 未清理） | 低 | 高 | defer Close()，使用 context 控制生命周期 |
| tmux session 僵尸进程 | 中 | 中 | 定时清理，程序退出时 kill 所有 session |

---

## 后续优化方向

1. **性能优化**
   - 输出 buffer 合并（减少 WebSocket 写入次数）
   - tmux session 池化（复用闲置 session）

2. **功能增强**
   - 支持 tmux 窗口/面板切换
   - 复制/粘贴模式
   - 会话录制（记录终端输出）

3. **监控告警**
   - session 数量监控
   - 客户端连接数监控
   - 异常断开告警

---

## 快速验证

在完整实施前，可手动验证 tmux multi-client 特性：

```bash
# 1. 创建 tmux session
tmux new-session -d -s test

# 2. 启动两个不同尺寸的 control mode client
# 终端 1 (80x24)
tmux -C attach -t test -x 80 -y 24

# 终端 2 (40x20)
tmux -C attach -t test -x 40 -y 20

# 3. 在任一终端输入
send-keys -l "echo hello"
send-keys Enter

# 4. 观察输出格式
%output %0 aGVsbG8K...

# 5. 测试 resize
refresh-client -C 100,30
```

**预期结果**：两个终端看到相同的命令输出，但窗口尺寸独立。
