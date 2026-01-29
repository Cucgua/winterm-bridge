# WinTerm Bridge

A web-based terminal application that bridges your browser to tmux sessions via WebSocket.

一个基于 Web 的终端应用，通过 WebSocket 将浏览器连接到 tmux 会话。

---

## Features / 功能特性

- **Multi-platform Support** - Responsive design for desktop and mobile browsers
- **tmux Integration** - Manage and connect to tmux sessions
- **PIN Authentication** - Secure access with auto-generated PIN
- **Session Management** - Create, delete, and switch between sessions
- **Touch Scroll** - Native touch scrolling support for mobile (tmux mouse mode)
- **Real-time Terminal** - Full terminal emulation via xterm.js

---

- **多平台支持** - 响应式设计，支持桌面和移动端浏览器
- **tmux 集成** - 管理并连接到 tmux 会话
- **PIN 认证** - 使用自动生成的 PIN 安全访问
- **会话管理** - 创建、删除、切换会话
- **触摸滚动** - 移动端原生触摸滚动支持（tmux 鼠标模式）
- **实时终端** - 通过 xterm.js 实现完整终端仿真

---

## Tech Stack / 技术栈

### Frontend / 前端
- React 18 + TypeScript
- Vite
- xterm.js
- Tailwind CSS
- Zustand (state management)

### Backend / 后端
- Go 1.22
- gorilla/websocket
- creack/pty
- Embedded static files

---

## Requirements / 环境要求

- Go 1.22+
- Node.js 18+
- tmux

---

## Quick Start / 快速开始

### 1. Clone / 克隆

```bash
git clone https://github.com/Cucgua/winterm-bridge.git
cd winterm-bridge
```

### 2. Build Frontend / 构建前端

```bash
cd frontend
npm install
npm run build
cd ..
```

### 3. Build Backend / 构建后端

```bash
cd backend
go build -o winterm-bridge ./cmd/server
cd ..
```

### 4. Run / 运行

```bash
./backend/winterm-bridge
```

Server starts at `http://localhost:8080`. Check console for the PIN.

服务器启动于 `http://localhost:8080`，在控制台查看 PIN 码。

---

## Usage / 使用方法

1. Open browser and navigate to `http://localhost:8080`
2. Enter the PIN shown in the server console
3. Select an existing session or create a new one
4. Use the terminal

---

1. 打开浏览器访问 `http://localhost:8080`
2. 输入服务器控制台显示的 PIN 码
3. 选择已有会话或创建新会话
4. 使用终端

---

## Project Structure / 项目结构

```
winterm-bridge/
├── backend/
│   ├── cmd/server/         # Entry point & static files
│   │   ├── main.go
│   │   └── static/         # Built frontend assets
│   └── internal/
│       ├── api/            # REST API handlers
│       ├── auth/           # PIN authentication
│       ├── pty/            # PTY & WebSocket handling
│       ├── session/        # Session registry
│       └── tmux/           # tmux client
├── frontend/
│   └── src/
│       ├── routes/
│       │   ├── desktop/    # Desktop UI
│       │   └── mobile/     # Mobile UI
│       └── shared/         # Shared components & core
└── README.md
```

---

## API Endpoints / API 接口

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth` | Authenticate with PIN |
| GET | `/api/auth/validate` | Validate token |
| GET | `/api/sessions` | List sessions |
| POST | `/api/sessions` | Create session |
| DELETE | `/api/sessions/{id}` | Delete session |
| POST | `/api/sessions/{id}/attach` | Get WebSocket URL |
| WS | `/ws?token={token}` | Terminal WebSocket |

---

## WebSocket Protocol / WebSocket 协议

- **Binary Frame**: PTY data (stdin/stdout)
- **Text Frame**: JSON control messages

Control Messages:
```json
// Client -> Server
{"type": "resize", "cols": 80, "rows": 24}
{"type": "ping"}

// Server -> Client
{"type": "pong"}
{"type": "title", "text": "..."}
{"type": "error", "message": "..."}
```

---

## License / 许可证

MIT
