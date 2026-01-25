# 实施计划：WinTerm Bridge 会话管理增强

## 任务类型
- [x] 前端 (→ Gemini)
- [x] 后端 (→ Codex)
- [x] 全栈 (→ 并行)

## 技术方案

基于 Codex 和 Gemini 的协作分析，采用 **"会话管理器"模式**：

```
用户 → PIN认证 → 会话列表 → [选择已有会话] 或 [创建新会话] → 终端
                    ↓
         ┌─────────────────────┐
         │ Session #1 (活跃中)  │ [加入]
         │ Session #2 (2分钟前) │ [加入]
         │ [+ 新建终端]        │
         └─────────────────────┘
```

---

## 实施步骤

### Phase 1：后端改造

#### Step 1.1 - 会话元数据增强
- 文件：`backend/internal/session/session.go`
- 操作：添加 `CreatedAt`、`Title` 字段

```go
type Session struct {
    ID         string
    PTY        *conpty.PTY
    State      SessionState
    CreatedAt  time.Time      // 新增
    LastActive time.Time
    Title      string         // 新增：可选的会话名称
    AttachedWS *websocket.Conn
    Token      string
    mu         sync.Mutex
}
```

#### Step 1.2 - 新增消息类型
- 文件：`backend/internal/ws/protocol.go`
- 操作：添加 `list_sessions`、`sessions_list`、`select_session`、`create_session` 类型

```go
const (
    TypeListSessions   = "list_sessions"
    TypeSessionsList   = "sessions_list"
    TypeSelectSession  = "select_session"
    TypeCreateSession  = "create_session"
)

type SessionInfo struct {
    ID         string    `json:"id"`
    State      string    `json:"state"`
    CreatedAt  time.Time `json:"created_at"`
    LastActive time.Time `json:"last_active"`
    Title      string    `json:"title,omitempty"`
}
```

#### Step 1.3 - Registry 新增 ListByToken 方法
- 文件：`backend/internal/session/registry.go`
- 操作：添加按 token 列出会话的方法

```go
func (r *Registry) ListByToken(token string) []*Session {
    r.mu.RLock()
    defer r.mu.RUnlock()
    var result []*Session
    for _, s := range r.sessions {
        if s.Token == token && s.State != SessionTerminated {
            result = append(result, s)
        }
    }
    return result
}
```

#### Step 1.4 - 修改认证流程
- 文件：`backend/internal/ws/handler.go`
- 操作：PIN 验证后发送会话列表，不自动创建

```go
// authenticate() 修改：
// PIN 验证成功后：
// 1. 生成 token
// 2. 发送 auth_ok
// 3. 发送 sessions_list（现有会话列表）
// 4. 等待 select_session 或 create_session
```

#### Step 1.5 - handleControl 扩展
- 文件：`backend/internal/ws/handler.go`
- 操作：处理 `list_sessions`、`select_session`、`create_session`

---

### Phase 2：前端改造

#### Step 2.1 - 扩展 Socket 消息类型
- 文件：`frontend/src/core/socket.ts`
- 操作：更新 ControlMessage 类型，添加重连状态回调

```typescript
export interface SessionInfo {
  id: string;
  state: 'active' | 'detached';
  created_at: string;
  last_active: string;
  title?: string;
}

export interface ControlMessage {
  type: 'resize' | 'ping' | 'pong' | 'auth' | 'auth_ok' | 'error' |
        'list_sessions' | 'sessions_list' | 'select_session' | 'create_session';
  payload: unknown;
}

// 新增重连状态回调
onReconnecting(callback: (countdown: number) => void): () => void;
```

#### Step 2.2 - 扩展状态机
- 文件：`frontend/src/App.tsx`
- 操作：新增 `selecting_session`、`reconnecting` 状态

```typescript
type ConnectionStatus = 'disconnected' | 'connecting' | 'reconnecting' | 'connected';
type AuthState = 'awaiting_pin' | 'selecting_session' | 'authenticated';

const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
const [reconnectCountdown, setReconnectCountdown] = useState(0);
const [sessions, setSessions] = useState<SessionInfo[]>([]);
```

#### Step 2.3 - 创建 SessionPicker 组件
- 文件：`frontend/src/components/SessionPicker.tsx`（新建）
- 操作：会话列表 UI

```tsx
interface SessionPickerProps {
  sessions: SessionInfo[];
  onSelect: (sessionId: string) => void;
  onCreate: () => void;
}

export const SessionPicker: React.FC<SessionPickerProps> = ({...}) => {
  return (
    <div className="session-picker">
      <h2>选择会话</h2>
      {sessions.map(s => (
        <div key={s.id} className="session-card">
          <span>{s.title || `会话 ${s.id.slice(0,8)}`}</span>
          <span>{formatTime(s.last_active)}</span>
          <button onClick={() => onSelect(s.id)}>加入</button>
        </div>
      ))}
      <button onClick={onCreate}>+ 新建终端</button>
    </div>
  );
};
```

#### Step 2.4 - 改进连接状态显示
- 文件：`frontend/src/App.tsx`
- 操作：显示重连倒计时和重试按钮

```tsx
{connectionStatus === 'reconnecting' && (
  <div className="connection-status">
    <p>连接断开，{reconnectCountdown}秒后重试...</p>
    <button onClick={() => socket.connect(url)}>立即重试</button>
  </div>
)}
```

#### Step 2.5 - 更新渲染逻辑
- 文件：`frontend/src/App.tsx`
- 操作：根据状态渲染不同 UI

```tsx
// 渲染逻辑：
// 1. connectionStatus !== 'connected' → 显示连接状态
// 2. authState === 'awaiting_pin' → 显示 PIN 输入
// 3. authState === 'selecting_session' → 显示 SessionPicker
// 4. authState === 'authenticated' → 显示 TerminalView
```

---

## 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/internal/session/session.go` | 修改 | 添加 CreatedAt、Title 字段 |
| `backend/internal/ws/protocol.go` | 修改 | 添加新消息类型定义 |
| `backend/internal/session/registry.go` | 修改 | 添加 ListByToken 方法 |
| `backend/internal/ws/handler.go` | 修改 | 修改认证流程，添加消息处理 |
| `frontend/src/core/socket.ts` | 修改 | 扩展消息类型，添加重连回调 |
| `frontend/src/App.tsx` | 修改 | 扩展状态机，更新渲染逻辑 |
| `frontend/src/components/SessionPicker.tsx` | 新建 | 会话选择器组件 |

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 后端运行环境错误（WSL 而非 Windows） | 添加启动检查，明确提示需在 Windows 运行 |
| 会话 token 安全性 | 使用 crypto/rand 生成，设置过期时间 |
| 前后端消息不同步 | 定义严格的 protocol 版本号 |
| 旧客户端兼容性 | sessions_list 为空时自动创建新会话 |

---

## SESSION_ID（供 /ccg:execute 使用）
- CODEX_SESSION: `019bef13-ac92-7192-a931-18eb43d7f1b7`
- GEMINI_SESSION: `48090eff-7dee-443c-9d4b-62b914b890ae`
