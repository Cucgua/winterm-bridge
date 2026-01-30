# WinTerm Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go)](https://go.dev/)
[![Release](https://img.shields.io/github/v/release/Cucgua/winterm-bridge)](https://github.com/Cucgua/winterm-bridge/releases)

**WinTerm Bridge** is a lightweight web-based terminal that connects your browser to tmux sessions over WebSocket. Access your terminal from anywhere - desktop or mobile.

**WinTerm Bridge** 是一个轻量级的 Web 终端，通过 WebSocket 将浏览器连接到 tmux 会话。随时随地访问你的终端 - 支持桌面和移动端。

## Features

- **One-Line Install** - Get started in seconds with a single command
- **Web-Based Terminal** - Full terminal emulation powered by xterm.js
- **tmux Integration** - Seamlessly manage and connect to tmux sessions
- **Mobile Friendly** - Responsive UI with touch scrolling support
- **Secure Access** - PIN-based authentication with JWT tokens
- **Session Persistence** - Mark sessions to survive server restarts
- **Auto-Start Service** - Service starts automatically when you run `hiwb`
- **Cross-Platform** - Works on Linux, WSL, and macOS

## Quick Start

### One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/Cucgua/winterm-bridge/main/scripts/install.sh | bash
```

### Custom Command Name

```bash
# Install with custom command name (default: hiwb)
curl -fsSL https://raw.githubusercontent.com/Cucgua/winterm-bridge/main/scripts/install.sh | bash -s -- --cmd-name wb
```

### Install Options

```bash
--cmd-name NAME    # Custom command name (default: hiwb)
--install-dir DIR  # Install directory (default: /usr/local/bin)
--from-source      # Build from source instead of downloading binary
--version VERSION  # Specific version (default: latest)
--no-service       # Skip systemd service installation
```

## Usage

### CLI Commands

```bash
# Enter terminal (auto-starts service if not running)
hiwb

# Enter with custom session name
hiwb myproject

# List all sessions
hiwb -l

# Show service status
hiwb -i

# Manually start/stop service
hiwb -s    # start
hiwb -S    # stop

# Kill a session
hiwb -k myproject

# Show help
hiwb -h
```

### Web Access

1. Run `hiwb` to start the service and enter terminal
2. Open the URL shown in the terminal (e.g., `http://192.168.1.100:8080`)
3. Enter the PIN code
4. Select a session or create a new one

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Linux (x64) | ✅ | Full support |
| Linux (ARM64) | ✅ | Raspberry Pi, etc. |
| WSL2 | ✅ | Recommended for Windows users |
| macOS (Intel) | ✅ | Full support |
| macOS (Apple Silicon) | ✅ | Full support |

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

## Build from Source

### Prerequisites

- Go 1.22+
- Node.js 18+
- tmux

### Build

```bash
# Clone the repository
git clone https://github.com/Cucgua/winterm-bridge.git
cd winterm-bridge

# Use build script
./scripts/build.sh

# Or build manually
cd frontend && npm install && npm run build && cd ..
cd backend && go build -o winterm-bridge ./cmd/server
```

### Build All Platforms

```bash
./scripts/build.sh --all
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
│       ├── config/          # Configuration management
│       ├── pty/             # PTY management & WebSocket
│       ├── session/         # Session registry & persistence
│       └── tmux/            # tmux client wrapper
├── frontend/
│   └── src/
│       ├── routes/
│       │   ├── desktop/     # Desktop UI components
│       │   └── mobile/      # Mobile UI components
│       └── shared/          # Shared components & utilities
└── scripts/
    ├── install.sh           # One-line installer
    └── build.sh             # Build script
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
| `POST` | `/api/sessions/{id}/persist` | Mark session as persistent |
| `DELETE` | `/api/sessions/{id}/persist` | Remove persistence |
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
