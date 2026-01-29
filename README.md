# WinTerm Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go)](https://go.dev/)
[![Node Version](https://img.shields.io/badge/Node-18+-339933?logo=node.js)](https://nodejs.org/)

**WinTerm Bridge** is a lightweight web-based terminal that connects your browser to tmux sessions over WebSocket. Access your terminal from anywhere - desktop or mobile.

**WinTerm Bridge** 是一个轻量级的 Web 终端，通过 WebSocket 将浏览器连接到 tmux 会话。随时随地访问你的终端 - 支持桌面和移动端。

## Features

- **Web-Based Terminal** - Full terminal emulation powered by xterm.js
- **tmux Integration** - Seamlessly manage and connect to tmux sessions
- **Mobile Friendly** - Responsive UI with touch scrolling support
- **Secure Access** - PIN-based authentication with JWT tokens
- **Session Management** - Create, switch, and delete sessions on the fly
- **Auto-Discovery** - Automatically detects existing tmux sessions
- **Single Binary** - Frontend assets embedded in Go binary for easy deployment

## Quick Start

### Prerequisites

- Go 1.22+
- Node.js 18+
- tmux

### Build

```bash
# Clone the repository
git clone https://github.com/Cucgua/winterm-bridge.git
cd winterm-bridge

# Build frontend
cd frontend
npm install
npm run build
cd ..

# Build backend (frontend assets are embedded)
cd backend
go build -o winterm-bridge ./cmd/server
```

### Run

```bash
./backend/winterm-bridge
```

The server starts on `http://localhost:8080`. Check the console output for your PIN code.

```
2024/01/01 12:00:00 tmux detected: tmux 3.4
2024/01/01 12:00:00 WinTerm-Bridge starting, PIN: 123456
2024/01/01 12:00:00 Listening on :8080
```

### Usage

1. Open `http://localhost:8080` in your browser
2. Enter the PIN code shown in the console
3. Select an existing tmux session or create a new one
4. Start using your terminal

## Architecture

```
┌─────────────────┐      WebSocket       ┌─────────────────┐
│                 │  ◄─────────────────► │                 │
│  Browser        │                      │  WinTerm Bridge │
│  (xterm.js)     │      REST API        │  (Go Server)    │
│                 │  ◄─────────────────► │                 │
└─────────────────┘                      └────────┬────────┘
                                                  │ PTY
                                                  ▼
                                         ┌─────────────────┐
                                         │      tmux       │
                                         │    sessions     │
                                         └─────────────────┘
```

## Project Structure

```
winterm-bridge/
├── backend/
│   ├── cmd/server/
│   │   ├── main.go          # Entry point
│   │   └── static/          # Embedded frontend assets
│   └── internal/
│       ├── api/             # REST API handlers
│       ├── auth/            # PIN & JWT authentication
│       ├── pty/             # PTY management & WebSocket
│       ├── session/         # Session registry
│       └── tmux/            # tmux client wrapper
└── frontend/
    └── src/
        ├── routes/
        │   ├── desktop/     # Desktop UI components
        │   └── mobile/      # Mobile UI components
        └── shared/          # Shared components & utilities
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth` | Authenticate with PIN |
| `GET` | `/api/auth/validate` | Validate JWT token |
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create new session |
| `DELETE` | `/api/sessions/{id}` | Delete session |
| `POST` | `/api/sessions/{id}/attach` | Get WebSocket attachment token |
| `WS` | `/ws?token={token}` | Terminal WebSocket connection |

## Tech Stack

**Frontend**
- React 18 + TypeScript
- Vite
- xterm.js + WebGL addon
- Tailwind CSS
- Zustand

**Backend**
- Go 1.22
- gorilla/websocket
- creack/pty

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [xterm.js](https://xtermjs.org/) - Terminal emulator for the web
- [tmux](https://github.com/tmux/tmux) - Terminal multiplexer
