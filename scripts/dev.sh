#!/bin/bash
# WinTerm Bridge 开发脚本 - 一键构建并后台启动
# 用法: ./dev.sh [命令]
#
# 命令:
#   start   构建并启动 (默认)
#   stop    停止服务
#   restart 重启服务
#   status  查看状态
#   logs    查看日志
#   build   仅构建不启动

set -e

# ============== 配置 ==============
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
CONFIG_DIR="$HOME/.config/winterm-bridge"
LOG_FILE="$CONFIG_DIR/server.log"
PID_FILE="$CONFIG_DIR/server.pid"
BINARY="$BACKEND_DIR/winterm-bridge"

# ============== 颜色输出 ==============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ============== 辅助函数 ==============

# 获取配置文件中的端口
get_port() {
    grep -o '"port"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_DIR/runtime.json" 2>/dev/null | cut -d'"' -f4 || echo "8080"
}

# 从 PID 文件获取 PID
get_pid() {
    if [ -f "$PID_FILE" ]; then
        cat "$PID_FILE"
    else
        echo ""
    fi
}

# 通过端口查找进程 PID
find_pid_by_port() {
    local port=$(get_port)
    # 尝试 lsof
    if command -v lsof &>/dev/null; then
        lsof -ti ":$port" 2>/dev/null | head -1
        return
    fi
    # 尝试 ss + ps
    if command -v ss &>/dev/null; then
        local pids=$(ss -tlnp "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
        echo "$pids"
        return
    fi
    # 尝试 netstat
    if command -v netstat &>/dev/null; then
        netstat -tlnp 2>/dev/null | grep ":$port " | grep -oP '\d+(?=/)' | head -1
        return
    fi
    echo ""
}

# 查找正在运行的 winterm-bridge 进程
find_running_pid() {
    # 1. 先检查 PID 文件
    local pid=$(get_pid)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        echo "$pid"
        return
    fi

    # 2. 通过端口查找
    pid=$(find_pid_by_port)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        echo "$pid"
        return
    fi

    # 3. 通过进程名查找（精确匹配，避免误杀其他进程）
    pgrep -x "winterm-bridge" 2>/dev/null | head -1
}

is_running() {
    local pid=$(find_running_pid)
    [ -n "$pid" ]
}

# ============== 构建前端 ==============
build_frontend() {
    info "构建前端..."
    cd "$FRONTEND_DIR"

    # 检查 node_modules
    if [ ! -d "node_modules" ]; then
        info "安装前端依赖..."
        npm install --silent
    fi

    # 构建
    npm run build --silent
    success "前端构建完成"
}

# ============== 构建后端 ==============
build_backend() {
    info "构建后端..."
    cd "$BACKEND_DIR"

    # 获取版本信息
    local version="dev-$(date +%Y%m%d-%H%M%S)"
    if command -v git &>/dev/null && [ -d "$PROJECT_ROOT/.git" ]; then
        version="$(git describe --tags --always --dirty 2>/dev/null || echo "$version")"
    fi

    # 构建
    go build -ldflags="-s -w -X main.Version=$version" -o "$BINARY" ./cmd/server
    success "后端构建完成 ($version)"
}

# ============== 启动服务 ==============
do_start() {
    local existing=$(find_running_pid)
    if [ -n "$existing" ]; then
        warn "服务已在运行中 (PID: $existing)"
        return
    fi

    # 确保配置目录存在
    mkdir -p "$CONFIG_DIR"

    # 构建
    build_frontend
    build_backend

    # 启动服务
    info "启动服务..."
    cd "$BACKEND_DIR"
    nohup "$BINARY" > "$LOG_FILE" 2>&1 &
    local pid=$!
    echo "$pid" > "$PID_FILE"

    # 等待启动
    sleep 1

    if is_running; then
        # 读取配置获取端口和 PIN
        local port=$(get_port)
        local pin=$(grep -o '"pin"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_DIR/runtime.json" 2>/dev/null | cut -d'"' -f4 || echo "")

        echo ""
        echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║     WinTerm Bridge 已启动!            ║${NC}"
        echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
        echo ""
        echo -e "  ${CYAN}访问地址:${NC} http://localhost:$port"
        [ -n "$pin" ] && echo -e "  ${CYAN}PIN 码:${NC}   $pin"
        echo -e "  ${CYAN}进程 ID:${NC}  $pid"
        echo -e "  ${CYAN}日志文件:${NC} $LOG_FILE"
        echo ""
        echo -e "  使用 ${YELLOW}$0 logs${NC} 查看日志"
        echo -e "  使用 ${YELLOW}$0 stop${NC} 停止服务"
        echo ""
    else
        error "启动失败，查看日志: $LOG_FILE"
    fi
}

# ============== 停止服务 ==============
do_stop() {
    local pid=$(find_running_pid)
    if [ -z "$pid" ]; then
        warn "服务未在运行"
        rm -f "$PID_FILE"
        return
    fi

    info "停止服务 (PID: $pid)..."
    kill "$pid" 2>/dev/null

    # 等待进程结束
    local count=0
    while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
        sleep 0.5
        count=$((count + 1))
    done

    if kill -0 "$pid" 2>/dev/null; then
        warn "进程未响应，强制终止..."
        kill -9 "$pid" 2>/dev/null
    fi

    rm -f "$PID_FILE"
    success "服务已停止"
}

# ============== 重启服务 ==============
do_restart() {
    do_stop
    sleep 1
    do_start
}

# ============== 查看状态 ==============
do_status() {
    local pid=$(find_running_pid)
    if [ -n "$pid" ]; then
        local port=$(get_port)
        echo -e "${GREEN}● 服务运行中${NC}"
        echo "  PID:  $pid"
        echo "  端口: $port"
        echo "  URL:  http://localhost:$port"

        # 显示资源使用
        if command -v ps &>/dev/null; then
            echo ""
            ps -p "$pid" -o pid,pcpu,pmem,etime,args --no-headers 2>/dev/null | head -1
        fi
    else
        echo -e "${RED}● 服务未运行${NC}"
    fi
}

# ============== 查看日志 ==============
do_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        error "日志文件不存在: $LOG_FILE"
    fi
}

# ============== 仅构建 ==============
do_build() {
    build_frontend
    build_backend
    echo ""
    success "构建完成: $BINARY"
}

# ============== 主入口 ==============
main() {
    local cmd="${1:-start}"

    case "$cmd" in
        start)   do_start ;;
        stop)    do_stop ;;
        restart) do_restart ;;
        status)  do_status ;;
        logs)    do_logs ;;
        build)   do_build ;;
        -h|--help|help)
            echo "WinTerm Bridge 开发脚本"
            echo ""
            echo "用法: $0 [命令]"
            echo ""
            echo "命令:"
            echo "  start   构建并启动服务 (默认)"
            echo "  stop    停止服务"
            echo "  restart 重启服务 (重新构建)"
            echo "  status  查看运行状态"
            echo "  logs    查看实时日志 (Ctrl+C 退出)"
            echo "  build   仅构建不启动"
            echo "  help    显示此帮助"
            ;;
        *)
            error "未知命令: $cmd (使用 --help 查看帮助)"
            ;;
    esac
}

main "$@"
