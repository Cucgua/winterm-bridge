# 实施计划：修复 Registry RWMutex 死锁问题

## 任务类型
- [x] 后端 (Go)
- [ ] 前端
- [ ] 全栈

## 问题诊断

### 根因分析

在 `registry.go` 中存在**锁嵌套**导致的死锁：

1. **Attach 方法** (L116-135): 同时持有 `r.mu.Lock()` 和 `s.mu.Lock()`
2. **Detach 方法** (L151-172): 同时持有 `r.mu.Lock()` 和 `s.mu.Lock()`
3. **Delete 方法** (L210-240): 同时持有两个锁，且在持锁时调用 `CloseAllClients()`

### 死锁场景

```
时间线:
T1: 连接A 调用 Attach() -> 获取 r.mu.Lock()
T2: 连接A 在 Attach() 中 -> 尝试获取 s.mu.Lock() (可能等待)
T3: 连接B 调用 ListAll() -> 尝试获取 r.mu.RLock() (被阻塞，因为写锁被持有)
T4: 连接C 调用 ListAll() -> 同样被阻塞
T5: 所有后续 API 请求都被阻塞
```

### 问题代码

```go
// 问题1: Attach - 同时持有两个锁
func (r *Registry) Attach(...) (*Session, error) {
    r.mu.Lock()           // 获取写锁
    defer r.mu.Unlock()   // defer 释放
    ...
    s.mu.Lock()           // 获取 session 锁
    defer s.mu.Unlock()   // 如果这里阻塞，写锁不会释放
    ...
}

// 问题2: Detach - 同样的模式
func (r *Registry) Detach(...) error {
    r.mu.Lock()
    defer r.mu.Unlock()
    ...
    s.mu.Lock()           // 危险：可能与 session 内部操作冲突
    defer s.mu.Unlock()
    ...
}
```

---

## 修复方案

### 核心原则

1. **最小化锁持有时间**: 只在访问 map 时持锁
2. **避免锁嵌套**: 不同时持有 `r.mu` 和 `s.mu`
3. **读优先**: 能用 RLock 的地方不用 Lock
4. **先释放后操作**: 阻塞操作（tmux 调用）在锁外执行

---

## 实施步骤

### Step 1: 修复 Attach 方法

**文件**: `backend/internal/session/registry.go`

**修改前**:
```go
func (r *Registry) Attach(sessionID, token string, ws *websocket.Conn) (*Session, error) {
    if !auth.ValidateToken(token) {
        return nil, ErrInvalidToken
    }

    r.mu.Lock()
    defer r.mu.Unlock()
    s, ok := r.sessions[sessionID]
    if !ok {
        return nil, ErrSessionNotFound
    }

    s.mu.Lock()
    defer s.mu.Unlock()

    s.State = SessionActive
    s.LastActive = time.Now()
    log.Printf("[Registry] Client preparing to attach to tmux session %s", sessionID[:8])
    return s, nil
}
```

**修改后**:
```go
func (r *Registry) Attach(sessionID, token string, ws *websocket.Conn) (*Session, error) {
    if !auth.ValidateToken(token) {
        return nil, ErrInvalidToken
    }

    // 只用读锁查找 session
    r.mu.RLock()
    s, ok := r.sessions[sessionID]
    r.mu.RUnlock()  // 立即释放 registry 锁

    if !ok {
        return nil, ErrSessionNotFound
    }

    // session 级别操作单独加锁（不持有 registry 锁）
    s.mu.Lock()
    s.State = SessionActive
    s.LastActive = time.Now()
    s.mu.Unlock()

    log.Printf("[Registry] Client preparing to attach to tmux session %s", sessionID[:8])
    return s, nil
}
```

**改动说明**:
- 将 `r.mu.Lock()` 改为 `r.mu.RLock()` (只需要读 map)
- 立即释放 registry 锁，再获取 session 锁
- 避免同时持有两个锁

---

### Step 2: 修复 Detach 方法

**修改前**:
```go
func (r *Registry) Detach(sessionID string, ws *websocket.Conn) error {
    r.mu.Lock()
    defer r.mu.Unlock()
    s, ok := r.sessions[sessionID]
    if !ok {
        return ErrSessionNotFound
    }
    s.mu.Lock()
    defer s.mu.Unlock()

    // Remove specific client
    s.RemoveClient(ws)

    if s.State != SessionTerminated {
        if len(s.Clients) == 0 {
            s.State = SessionDetached
        }
        s.LastActive = time.Now()
    }
    log.Printf("[Registry] Client detached from session %s (remaining clients: %d)", sessionID[:8], len(s.Clients))
    return nil
}
```

**修改后**:
```go
func (r *Registry) Detach(sessionID string, ws *websocket.Conn) error {
    // 只用读锁查找 session
    r.mu.RLock()
    s, ok := r.sessions[sessionID]
    r.mu.RUnlock()  // 立即释放

    if !ok {
        return ErrSessionNotFound
    }

    // session 操作（RemoveClient 内部已有自己的锁保护）
    s.RemoveClient(ws)

    // 更新 session 状态
    s.mu.Lock()
    if s.State != SessionTerminated {
        if len(s.Clients) == 0 {
            s.State = SessionDetached
        }
        s.LastActive = time.Now()
    }
    clientCount := len(s.Clients)
    s.mu.Unlock()

    log.Printf("[Registry] Client detached from session %s (remaining clients: %d)", sessionID[:8], clientCount)
    return nil
}
```

**改动说明**:
- 同样改为读锁 + 立即释放
- `RemoveClient` 已经有内部锁保护，不需要外部再加锁
- 状态更新使用单独的锁区间

---

### Step 3: 优化 Delete 方法

**修改前**:
```go
func (r *Registry) Delete(sessionID string) error {
    r.mu.Lock()
    s, ok := r.sessions[sessionID]
    if !ok {
        r.mu.Unlock()
        return ErrSessionNotFound
    }

    s.mu.Lock()

    // Close all tmux clients
    s.CloseAllClients()  // 危险：在持有两个锁时调用

    // Get tmux name before deleting
    tmuxName := s.TmuxName

    s.State = SessionTerminated
    s.mu.Unlock()

    delete(r.sessions, sessionID)
    r.mu.Unlock()

    // Kill the tmux session AFTER releasing locks
    if tmuxName != "" {
        _ = tmux.KillSession(tmuxName)
    }

    log.Printf("[Registry] Deleted session: %s (tmux: %s)", sessionID, tmuxName)
    return nil
}
```

**修改后**:
```go
func (r *Registry) Delete(sessionID string) error {
    // 阶段1: 从 registry 移除并获取必要信息
    r.mu.Lock()
    s, ok := r.sessions[sessionID]
    if !ok {
        r.mu.Unlock()
        return ErrSessionNotFound
    }

    // 先从 map 删除，防止新请求访问
    delete(r.sessions, sessionID)
    r.mu.Unlock()  // 立即释放 registry 锁

    // 阶段2: 更新 session 状态并获取 tmux 名称
    s.mu.Lock()
    tmuxName := s.TmuxName
    s.State = SessionTerminated
    s.mu.Unlock()  // 释放 session 锁

    // 阶段3: 关闭客户端（在锁外执行，CloseAllClients 有自己的锁）
    s.CloseAllClients()

    // 阶段4: 杀死 tmux session（阻塞操作，在所有锁外执行）
    if tmuxName != "" {
        _ = tmux.KillSession(tmuxName)
    }

    log.Printf("[Registry] Deleted session: %s (tmux: %s)", sessionID, tmuxName)
    return nil
}
```

**改动说明**:
- 分阶段执行，每个阶段独立加锁
- 从 map 删除放在最前面，防止新请求访问
- `CloseAllClients` 移到锁外执行

---

### Step 4: 检查 session.go 中的 RemoveClient

**当前实现** (session.go:86-106):
```go
func (s *Session) RemoveClient(ws *websocket.Conn) {
    var tmuxClientToClose *tmux.Client

    s.mu.Lock()
    if client, ok := s.Clients[ws]; ok {
        tmuxClientToClose = client.TmuxClient
        delete(s.Clients, ws)
    }

    if len(s.Clients) == 0 {
        s.State = SessionDetached
        s.LastActive = time.Now()
    }
    s.mu.Unlock()

    // Close tmux client AFTER releasing lock
    if tmuxClientToClose != nil {
        _ = tmuxClientToClose.Close()
    }
}
```

**状态**: 此方法已经正确实现了"先释放锁，再执行阻塞操作"的模式，无需修改。

但需要注意：`Detach` 方法中不应该再次修改 `s.State` 和 `s.LastActive`，因为 `RemoveClient` 已经处理了。

**修复 Detach 方法（最终版）**:
```go
func (r *Registry) Detach(sessionID string, ws *websocket.Conn) error {
    // 只用读锁查找 session
    r.mu.RLock()
    s, ok := r.sessions[sessionID]
    r.mu.RUnlock()

    if !ok {
        return ErrSessionNotFound
    }

    // RemoveClient 内部已处理状态更新和客户端清理
    s.RemoveClient(ws)

    log.Printf("[Registry] Client detached from session %s (remaining clients: %d)", sessionID[:8], s.ClientCount())
    return nil
}
```

---

## 变更文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/internal/session/registry.go` | 修改 | 修复 Attach、Detach、Delete 三个方法的锁策略 |

---

## 测试验证

### 1. 手动测试场景

1. **并发连接测试**:
   - 打开多个浏览器标签页
   - 同时刷新页面触发重新登录
   - 验证所有页面都能正常响应

2. **快速切换会话测试**:
   - 连接一个会话
   - 快速切换到另一个会话
   - 验证不会卡死

3. **压力测试**:
   ```bash
   # 并发 10 个请求获取会话列表
   for i in {1..10}; do
     curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/sessions &
   done
   wait
   ```

### 2. 日志验证

修复后，日志应该显示：
- `[Registry] ListAll: RLock acquired` 立即出现，不再等待
- 不再出现长时间卡在 `attempting to acquire RLock` 的情况

### 3. 死锁检测

在开发环境启用 Go 的死锁检测：
```bash
GODEBUG=invalidptr=1 ./winterm-bridge
```

---

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 并发修改导致数据不一致 | 低 | 中 | Session 有自己的锁保护内部状态 |
| Delete 时 session 仍被访问 | 低 | 低 | 先从 map 删除，防止新请求访问 |
| 遗留的竞态条件 | 中 | 低 | 使用 go race detector 验证 |

---

## 回滚方案

如果修复引入新问题，可以快速回滚：
```bash
git checkout HEAD~1 -- backend/internal/session/registry.go
```
