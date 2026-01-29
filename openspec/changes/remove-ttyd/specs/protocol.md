# WebSocket Terminal Protocol v1.0

## Overview

Binary/Text 分帧协议，用于 WinTerm-Bridge 的 WebSocket 终端通信。

- **Binary Frame**: PTY 数据流（stdin/stdout）
- **Text Frame**: JSON 控制信令

## Connection

### Endpoint
```
GET /ws?token={attachment_token}&session={session_id}
Upgrade: websocket
Connection: Upgrade
```

### Parameters
| Parameter | Required | Description |
|-----------|----------|-------------|
| token | Yes | 一次性 attachment_token，由 `/api/sessions/{id}/attach` 获取 |
| session | Yes | Session ID，必须与 token 绑定的 session 匹配 |

### Response
- Success: WebSocket 101 Switching Protocols
- Auth Failed: Close(4001, "invalid token")
- Session Not Found: Close(4004, "session not found")

## Message Types

### Binary Frame (PTY Data)

**Client → Server (stdin)**
```
Raw bytes sent directly to PTY stdin
```

**Server → Client (stdout)**
```
Raw bytes from PTY stdout
```

### Text Frame (JSON Control)

#### Client → Server

**resize** - 终端尺寸变化
```json
{"type":"resize","cols":80,"rows":24}
```
- `cols`: 列数 (positive integer)
- `rows`: 行数 (positive integer)
- 连接成功后应立即发送一次同步初始尺寸

**ping** - 心跳请求
```json
{"type":"ping"}
```
- 建议每 30 秒发送一次

**pause** - 暂停输出（流控制）
```json
{"type":"pause"}
```

**resume** - 恢复输出（流控制）
```json
{"type":"resume"}
```

#### Server → Client

**pong** - 心跳响应
```json
{"type":"pong"}
```

**title** - 窗口标题（可选）
```json
{"type":"title","text":"user@host:~"}
```

**error** - 错误通知
```json
{"type":"error","message":"pty process exited"}
```
- 发送后服务器将关闭连接

## Close Codes

| Code | Reason | Description |
|------|--------|-------------|
| 4001 | invalid token | 认证失败、token 已使用或不匹配 |
| 4004 | session not found | tmux session 不存在 |
| 4100 | pty exited | PTY 进程退出 |

## Flow Control

客户端可使用 `pause`/`resume` 控制输出流：

1. 当接收缓冲区达到高水位时，发送 `{"type":"pause"}`
2. 服务器暂停向该客户端发送 PTY 输出
3. 当缓冲区降至低水位时，发送 `{"type":"resume"}`
4. 服务器恢复发送

注意：流控制是每客户端独立的，不影响其他客户端。

## Multi-Client Behavior

同一 session 允许多个客户端连接：

- **输入**: 所有客户端输入串行化写入 PTY
- **输出**: PTY 输出广播到所有活跃客户端
- **Resize**: 最后一个有效 resize 生效，所有客户端看到相同尺寸

## Example Session

```
1. Client connects: GET /ws?token=abc123&session=sess456
2. Server accepts: 101 Switching Protocols
3. Client sends resize: {"type":"resize","cols":120,"rows":40}
4. Client sends input: [Binary] "ls -la\r"
5. Server sends output: [Binary] "total 123\n..."
6. Client sends ping: {"type":"ping"}
7. Server sends pong: {"type":"pong"}
8. PTY exits
9. Server sends error: {"type":"error","message":"pty process exited"}
10. Server closes: Close(4100, "pty exited")
```
