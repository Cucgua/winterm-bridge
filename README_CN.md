# WinTerm Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go)](https://go.dev/)
[![Release](https://img.shields.io/github/v/release/Cucgua/winterm-bridge)](https://github.com/Cucgua/winterm-bridge/releases)

中文 | **[English](README.md)**

**WinTerm Bridge** 是一个轻量级的 Web 终端，通过 WebSocket 将浏览器连接到 tmux 会话。随时随地访问你的终端 - 支持桌面和移动端。

## 功能特性

- **一键安装** - 单条命令即可完成安装
- **交互式配置** - 安装时可配置端口、PIN 码和唤醒命令
- **Web 终端** - 基于 xterm.js 的完整终端模拟
- **tmux 集成** - 无缝管理和连接 tmux 会话
- **移动端友好** - 响应式 UI，支持触摸滚动
- **安全访问** - 基于 PIN 码认证和 JWT 令牌
- **会话持久化** - 标记会话以在服务器重启后保留
- **自动启动服务** - 运行 `hiwb` 时自动启动服务
- **跨平台** - 支持 Linux、WSL 和 macOS

## 快速开始

### 一键安装

```bash
# 下载后交互式运行（推荐）
curl -fsSL https://raw.githubusercontent.com/Cucgua/winterm-bridge/main/scripts/install.sh -o install.sh && bash install.sh

# 或使用默认配置（非交互式）
curl -fsSL https://raw.githubusercontent.com/Cucgua/winterm-bridge/main/scripts/install.sh | bash
```

### 安装选项

```bash
--cmd-name NAME    # 自定义命令名称（默认：hiwb）
--port PORT        # 服务端口（默认：8345）
--pin PIN          # 访问 PIN 码（默认：123456）
--install-dir DIR  # 安装目录（默认：/usr/local/bin）
--from-source      # 从源码构建
--version VERSION  # 指定版本（默认：latest）
--no-service       # 跳过 systemd 服务安装
```

### 示例

```bash
curl -fsSL https://raw.githubusercontent.com/Cucgua/winterm-bridge/main/scripts/install.sh | bash -s -- \
  --cmd-name wb \
  --port 9000 \
  --pin 888888
```

## 使用方法

### CLI 命令

```bash
# 进入终端（如果服务未运行会自动启动）
hiwb

# 使用自定义会话名进入
hiwb myproject

# 列出所有会话
hiwb -l

# 显示服务状态
hiwb -i

# 手动启动/停止服务
hiwb -s    # 启动
hiwb -S    # 停止

# 终止会话
hiwb -k myproject

# 显示帮助
hiwb -h
```

### Web 访问

1. 运行 `hiwb` 启动服务并进入终端
2. 打开终端中显示的 URL（如 `http://192.168.1.100:8345`）
3. 输入 PIN 码
4. 选择一个会话或创建新会话

## 平台支持

| 平台 | 状态 | 说明 |
|------|------|------|
| Linux (x64) | ✅ | 完全支持 |
| Linux (ARM64) | ✅ | 树莓派等 |
| WSL2 | ✅ | Windows 用户推荐 |
| macOS (Intel) | ✅ | 完全支持 |
| macOS (Apple Silicon) | ✅ | 完全支持 |

## 架构

```
┌─────────────────┐      WebSocket       ┌─────────────────┐
│                 │  ◄─────────────────► │                 │
│  浏览器          │                      │  WinTerm Bridge │
│  (xterm.js)     │      REST API        │  (Go 服务器)     │
│                 │  ◄─────────────────► │                 │
└─────────────────┘                      └────────┬────────┘
                                                  │ PTY
                                                  ▼
                                         ┌─────────────────┐
                                         │      tmux       │
                                         │     会话        │
                                         └─────────────────┘
```

## 配置

### tmux 配置

安装程序会自动在 `~/.config/winterm-bridge/tmux.conf` 生成优化过的 tmux 配置文件：

```bash
# 鼠标支持
set -g mouse on

# 大滚动缓冲区
set -g history-limit 50000

# 减少命令延迟
set -s escape-time 0

# 256 色支持
set -g default-terminal "screen-256color"

# Vi 模式复制
setw -g mode-keys vi
```

安装后可以自定义此文件。如果配置文件已存在，安装程序会询问是否覆盖。

**tmux 版本要求：**
- 最低版本：tmux 2.1+（推荐，以获得完整功能支持）
- 安装程序会自动检查并在版本过旧时发出警告

## 从源码构建

### 前置要求

- Go 1.22+
- Node.js 18+
- tmux

### 构建

```bash
# 克隆仓库
git clone https://github.com/Cucgua/winterm-bridge.git
cd winterm-bridge

# 使用构建脚本
./scripts/build.sh

# 或手动构建
cd frontend && npm install && npm run build && cd ..
cd backend && go build -o winterm-bridge ./cmd/server
```

### 构建所有平台

```bash
./scripts/build.sh --all
```

## 项目结构

```
winterm-bridge/
├── backend/
│   ├── cmd/server/
│   │   ├── main.go          # 入口
│   │   └── static/          # 嵌入的前端资源
│   └── internal/
│       ├── api/             # REST API 处理器
│       ├── auth/            # PIN 和 JWT 认证
│       ├── config/          # 配置管理
│       ├── pty/             # PTY 管理和 WebSocket
│       ├── session/         # 会话注册和持久化
│       └── tmux/            # tmux 客户端封装
├── frontend/
│   └── src/
│       ├── routes/
│       │   ├── desktop/     # 桌面端 UI 组件
│       │   └── mobile/      # 移动端 UI 组件
│       └── shared/          # 共享组件和工具
└── scripts/
    ├── install.sh           # 一键安装脚本
    └── build.sh             # 构建脚本
```

## API 参考

| 方法 | 端点 | 描述 |
|------|------|------|
| `POST` | `/api/auth` | 使用 PIN 认证 |
| `GET` | `/api/auth/validate` | 验证 JWT 令牌 |
| `GET` | `/api/sessions` | 列出所有会话 |
| `POST` | `/api/sessions` | 创建新会话 |
| `DELETE` | `/api/sessions/{id}` | 删除会话 |
| `POST` | `/api/sessions/{id}/attach` | 获取 WebSocket 连接令牌 |
| `POST` | `/api/sessions/{id}/persist` | 标记会话为持久化 |
| `DELETE` | `/api/sessions/{id}/persist` | 移除持久化标记 |
| `WS` | `/ws?token={token}` | 终端 WebSocket 连接 |

## 技术栈

**前端**
- React 18 + TypeScript
- Vite
- xterm.js + WebGL addon
- Tailwind CSS
- Zustand

**后端**
- Go 1.22
- gorilla/websocket
- creack/pty

## 贡献

欢迎贡献代码！请随时提交 Pull Request。

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 许可证

本项目基于 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 致谢

- [xterm.js](https://xtermjs.org/) - Web 终端模拟器
- [tmux](https://github.com/tmux/tmux) - 终端复用器
