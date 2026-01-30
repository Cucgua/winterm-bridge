#!/bin/bash
# WinTerm Bridge 安装脚本
# 用法: curl -fsSL https://raw.githubusercontent.com/Cucgua/winterm-bridge/main/scripts/install.sh | bash
# 或者: ./install.sh [选项]
#
# 选项:
#   --cmd-name NAME    自定义命令名称 (默认: hiwb)
#   --port PORT        服务端口 (默认: 8345)
#   --pin PIN          访问 PIN 码 (默认: 123456)
#   --install-dir DIR  安装目录 (默认: /usr/local/bin 或 ~/.local/bin)
#   --no-service       不安装 systemd 服务
#   --from-source      从源码构建而非下载预编译二进制
#   --version VERSION  指定版本 (默认: latest)
#   --help             显示帮助

set -e

# ============== 配置 ==============
REPO="Cucgua/winterm-bridge"
BINARY_NAME="winterm-bridge"
DEFAULT_CMD_NAME="hiwb"
DEFAULT_PORT="8345"
DEFAULT_PIN="123456"
CONFIG_DIR="$HOME/.config/winterm-bridge"

# ============== 颜色输出 ==============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ============== 参数解析 ==============
CMD_NAME="$DEFAULT_CMD_NAME"
PORT="$DEFAULT_PORT"
PIN="$DEFAULT_PIN"
INSTALL_DIR=""
NO_SERVICE=false
FROM_SOURCE=false
VERSION="latest"

while [[ $# -gt 0 ]]; do
    case $1 in
        --cmd-name)
            CMD_NAME="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --pin)
            PIN="$2"
            shift 2
            ;;
        --install-dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --no-service)
            NO_SERVICE=true
            shift
            ;;
        --from-source)
            FROM_SOURCE=true
            shift
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        --help|-h)
            echo "WinTerm Bridge 安装脚本"
            echo ""
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --cmd-name NAME    自定义命令名称 (默认: hiwb)"
            echo "  --port PORT        服务端口 (默认: 8345)"
            echo "  --pin PIN          访问 PIN 码 (默认: 123456)"
            echo "  --install-dir DIR  安装目录 (默认: /usr/local/bin)"
            echo "  --no-service       不安装 systemd 服务"
            echo "  --from-source      从源码构建"
            echo "  --version VERSION  指定版本 (默认: latest)"
            echo "  --help             显示帮助"
            exit 0
            ;;
        *)
            error "未知选项: $1"
            ;;
    esac
done

# ============== 平台检测 ==============
detect_platform() {
    local os arch

    # 检测操作系统
    case "$(uname -s)" in
        Linux*)
            if grep -qi microsoft /proc/version 2>/dev/null; then
                os="linux"  # WSL 使用 linux 二进制
                info "检测到 WSL 环境" >&2
            else
                os="linux"
            fi
            ;;
        Darwin*)
            os="darwin"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            os="windows"
            ;;
        *)
            error "不支持的操作系统: $(uname -s)"
            ;;
    esac

    # 检测架构
    case "$(uname -m)" in
        x86_64|amd64)
            arch="amd64"
            ;;
        aarch64|arm64)
            arch="arm64"
            ;;
        armv7l|armv6l)
            arch="arm"
            ;;
        *)
            error "不支持的架构: $(uname -m)"
            ;;
    esac

    echo "${os}_${arch}"
}

# ============== 依赖检查 ==============
check_dependencies() {
    info "检查依赖..."

    # 检查 tmux
    if ! command -v tmux &>/dev/null; then
        warn "tmux 未安装，正在尝试安装..."
        if command -v apt-get &>/dev/null; then
            sudo apt-get update && sudo apt-get install -y tmux
        elif command -v yum &>/dev/null; then
            sudo yum install -y tmux
        elif command -v brew &>/dev/null; then
            brew install tmux
        elif command -v pacman &>/dev/null; then
            sudo pacman -S --noconfirm tmux
        else
            error "请手动安装 tmux: https://github.com/tmux/tmux"
        fi
    fi

    # 检查 tmux 版本
    local tmux_version
    tmux_version=$(tmux -V | grep -oE '[0-9]+\.[0-9]+' | head -1)
    local tmux_major="${tmux_version%%.*}"
    local tmux_minor="${tmux_version##*.}"

    if [ "$tmux_major" -lt 2 ] || { [ "$tmux_major" -eq 2 ] && [ "$tmux_minor" -lt 1 ]; }; then
        warn "tmux 版本 $tmux_version 较旧，建议升级到 2.1+ 以获得完整功能支持"
    else
        success "tmux $tmux_version"
    fi

    # 从源码构建时检查 Go
    if [ "$FROM_SOURCE" = true ]; then
        if ! command -v go &>/dev/null; then
            error "从源码构建需要 Go，请先安装: https://go.dev/dl/"
        fi
        success "Go $(go version | awk '{print $3}')"
    fi
}

# ============== 生成 tmux 配置 ==============
setup_tmux_config() {
    local tmux_conf="$CONFIG_DIR/tmux.conf"

    # 如果配置文件已存在，询问是否覆盖
    if [ -f "$tmux_conf" ]; then
        if [ -t 0 ]; then
            local overwrite
            read -p "tmux 配置文件已存在，是否覆盖? [y/N]: " overwrite
            if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
                info "保留现有 tmux 配置"
                return
            fi
        else
            info "保留现有 tmux 配置"
            return
        fi
    fi

    info "生成 tmux 配置..."
    cat > "$tmux_conf" << 'TMUXCONF'
# WinTerm Bridge tmux 配置
# 此文件由安装脚本生成，可自行修改

# 显示窗口标题
set -g set-titles on
set -g set-titles-string "#S:#W"

# 启用鼠标/触摸滚动
set -g mouse on

# 禁用右键菜单
unbind -n MouseDown3Pane

# 增加历史缓冲区
set -g history-limit 50000

# 允许不同客户端使用不同窗口大小
setw -g aggressive-resize on

# 减少命令延迟
set -s escape-time 0

# 单行滚动（默认是5行）
bind -T copy-mode WheelUpPane send -N 2 -X scroll-up
bind -T copy-mode WheelDownPane send -N 2 -X scroll-down
bind -T copy-mode-vi WheelUpPane send -N 2 -X scroll-up
bind -T copy-mode-vi WheelDownPane send -N 2 -X scroll-down
TMUXCONF

    success "tmux 配置已保存到 $tmux_conf"
}

# ============== 字体目录配置 ==============
setup_fonts_dir() {
    local fonts_dir="$CONFIG_DIR/fonts"
    local user_fonts_dir="$HOME/.local/share/fonts"

    # 创建字体目录
    mkdir -p "$fonts_dir"

    info "字体目录已创建: $fonts_dir"
    info "将字体文件 (.ttf, .otf) 放入该目录后运行 '$CMD_NAME --load-fonts' 加载"

    # 创建加载字体的说明文件
    cat > "$fonts_dir/README.txt" << 'FONTSREADME'
# WinTerm Bridge 字体目录

将你的字体文件 (.ttf, .otf) 放入此目录。

推荐字体:
- Nerd Fonts (https://www.nerdfonts.com/)
  - FiraCode Nerd Font
  - JetBrainsMono Nerd Font
  - Hack Nerd Font

字体会在服务启动时自动加载到系统字体目录。
FONTSREADME
}

# 加载字体到系统
load_fonts() {
    local fonts_dir="$CONFIG_DIR/fonts"
    local user_fonts_dir="$HOME/.local/share/fonts/winterm-bridge"

    # 检查是否有字体文件
    if ! ls "$fonts_dir"/*.ttf "$fonts_dir"/*.otf &>/dev/null 2>&1; then
        return 0
    fi

    info "加载字体..."

    # 创建用户字体目录
    mkdir -p "$user_fonts_dir"

    # 复制字体文件
    local count=0
    for font in "$fonts_dir"/*.ttf "$fonts_dir"/*.otf; do
        if [ -f "$font" ]; then
            cp "$font" "$user_fonts_dir/"
            count=$((count + 1))
        fi
    done

    if [ $count -gt 0 ]; then
        # 刷新字体缓存
        if command -v fc-cache &>/dev/null; then
            fc-cache -f "$user_fonts_dir"
            success "已加载 $count 个字体文件"
        else
            warn "fc-cache 未安装，字体可能需要手动刷新"
        fi
    fi
}

# ============== 确定安装目录 ==============
determine_install_dir() {
    if [ -n "$INSTALL_DIR" ]; then
        echo "$INSTALL_DIR"
        return
    fi

    # 优先使用 /usr/local/bin，如果没权限则用 ~/.local/bin
    if [ -w /usr/local/bin ]; then
        echo "/usr/local/bin"
    elif [ "$EUID" -eq 0 ]; then
        echo "/usr/local/bin"
    else
        mkdir -p "$HOME/.local/bin"
        echo "$HOME/.local/bin"
    fi
}

# ============== 停止运行中的服务 ==============
stop_running_service() {
    local runtime_info="$CONFIG_DIR/runtime.json"

    if [ -f "$runtime_info" ]; then
        local pid
        pid=$(grep -o '"pid"[[:space:]]*:[[:space:]]*[0-9]*' "$runtime_info" 2>/dev/null | sed 's/.*: *//')
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            info "检测到 winterm-bridge 正在运行 (PID: $pid)，正在停止..."
            kill "$pid" 2>/dev/null || true
            # 等待进程退出
            local wait_count=0
            while kill -0 "$pid" 2>/dev/null && [ $wait_count -lt 10 ]; do
                sleep 0.5
                wait_count=$((wait_count + 1))
            done
            if kill -0 "$pid" 2>/dev/null; then
                warn "进程未能正常退出，尝试强制终止..."
                kill -9 "$pid" 2>/dev/null || true
                sleep 0.5
            fi
            success "服务已停止"
        fi
    fi

    # 也检查是否有其他 winterm-bridge 进程在运行
    if pgrep -x "winterm-bridge" >/dev/null 2>&1; then
        info "检测到其他 winterm-bridge 进程，正在停止..."
        pkill -x "winterm-bridge" 2>/dev/null || true
        sleep 1
        if pgrep -x "winterm-bridge" >/dev/null 2>&1; then
            pkill -9 -x "winterm-bridge" 2>/dev/null || true
            sleep 0.5
        fi
        success "所有 winterm-bridge 进程已停止"
    fi
}

# ============== 下载预编译二进制 ==============
download_binary() {
    local platform="$1"
    local install_dir="$2"
    local tmp_dir

    tmp_dir=$(mktemp -d)
    trap "rm -rf $tmp_dir" EXIT

    info "下载 winterm-bridge ($platform)..."

    # 获取下载 URL
    local download_url
    if [ "$VERSION" = "latest" ]; then
        download_url="https://github.com/${REPO}/releases/latest/download/winterm-bridge_${platform}.tar.gz"
    else
        download_url="https://github.com/${REPO}/releases/download/${VERSION}/winterm-bridge_${platform}.tar.gz"
    fi

    # 下载
    if command -v curl &>/dev/null; then
        curl -fsSL "$download_url" -o "$tmp_dir/winterm-bridge.tar.gz" || error "下载失败: $download_url"
    elif command -v wget &>/dev/null; then
        wget -q "$download_url" -O "$tmp_dir/winterm-bridge.tar.gz" || error "下载失败: $download_url"
    else
        error "需要 curl 或 wget"
    fi

    # 解压
    tar -xzf "$tmp_dir/winterm-bridge.tar.gz" -C "$tmp_dir"

    # 安装二进制
    if [ -w "$install_dir" ]; then
        cp "$tmp_dir/winterm-bridge" "$install_dir/"
        chmod +x "$install_dir/winterm-bridge"
    else
        sudo cp "$tmp_dir/winterm-bridge" "$install_dir/"
        sudo chmod +x "$install_dir/winterm-bridge"
    fi

    success "已安装 winterm-bridge 到 $install_dir/"
}

# ============== 从源码构建 ==============
build_from_source() {
    local install_dir="$1"
    local tmp_dir

    tmp_dir=$(mktemp -d)
    trap "rm -rf $tmp_dir" EXIT

    info "克隆仓库..."
    git clone --depth 1 "https://github.com/${REPO}.git" "$tmp_dir/winterm-bridge"

    info "构建前端..."
    if command -v npm &>/dev/null; then
        cd "$tmp_dir/winterm-bridge/frontend"
        npm install
        npm run build
    else
        warn "npm 未安装，跳过前端构建（将使用嵌入的静态文件）"
    fi

    info "构建后端..."
    cd "$tmp_dir/winterm-bridge/backend"

    # 复制前端构建产物
    if [ -d "$tmp_dir/winterm-bridge/frontend/dist" ]; then
        rm -rf cmd/server/static
        cp -r "$tmp_dir/winterm-bridge/frontend/dist" cmd/server/static
    fi

    go build -ldflags="-s -w" -o winterm-bridge ./cmd/server

    # 安装
    if [ -w "$install_dir" ]; then
        cp winterm-bridge "$install_dir/"
        chmod +x "$install_dir/winterm-bridge"
    else
        sudo cp winterm-bridge "$install_dir/"
        sudo chmod +x "$install_dir/winterm-bridge"
    fi

    success "已从源码构建并安装到 $install_dir/"
}

# ============== 安装 CLI 命令 ==============
install_cli_command() {
    local install_dir="$1"
    local cmd_name="$2"

    info "安装 $cmd_name 命令..."

    # 生成 CLI 脚本
    local cli_script
    cli_script=$(cat << 'EOFCLI'
#!/bin/bash
# {{CMD_NAME}} - WinTerm Bridge CLI
# 创建/连接 tmux session，同时可通过 Web 访问

set -e

# 配置
SESSION_PREFIX="winterm-"
DEFAULT_SESSION_NAME="${1:-$(whoami)}"
FULL_SESSION_NAME="${SESSION_PREFIX}${DEFAULT_SESSION_NAME}"
CONFIG_DIR="$HOME/.config/winterm-bridge"
RUNTIME_INFO="$CONFIG_DIR/runtime.json"

# 颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# 显示帮助
show_help() {
    echo "{{CMD_NAME}} - WinTerm Bridge CLI"
    echo ""
    echo "用法: {{CMD_NAME}} [session_name] [选项]"
    echo ""
    echo "参数:"
    echo "  session_name    Session 名称 (默认: 用户名)"
    echo ""
    echo "选项:"
    echo "  -l, --list      列出所有 winterm sessions"
    echo "  -k, --kill      终止指定 session"
    echo "  -s, --start     启动 winterm-bridge 服务"
    echo "  -S, --stop      停止 winterm-bridge 服务"
    echo "  -r, --restart   重启 winterm-bridge 服务"
    echo "  -i, --info      显示服务信息"
    echo "  -v, --version   显示版本信息"
    echo "  --uninstall     卸载 winterm-bridge"
    echo "  -h, --help      显示帮助"
    echo ""
    echo "示例:"
    echo "  {{CMD_NAME}}              # 使用用户名创建/连接 session"
    echo "  {{CMD_NAME}} myproject    # 创建/连接 'myproject' session"
    echo "  {{CMD_NAME}} -l           # 列出所有 sessions"
    echo "  {{CMD_NAME}} -s           # 启动后台服务"
    echo "  {{CMD_NAME}} -r           # 重启服务"
    echo "  {{CMD_NAME}} --uninstall  # 卸载"
}

# 获取服务信息
get_service_info() {
    if [ -f "$RUNTIME_INFO" ]; then
        local port pin pid ip
        port=$(grep -o '"port"[[:space:]]*:[[:space:]]*"[^"]*"' "$RUNTIME_INFO" 2>/dev/null | sed 's/.*"\([^"]*\)"$/\1/')
        pin=$(grep -o '"pin"[[:space:]]*:[[:space:]]*"[^"]*"' "$RUNTIME_INFO" 2>/dev/null | sed 's/.*"\([^"]*\)"$/\1/')
        pid=$(grep -o '"pid"[[:space:]]*:[[:space:]]*[0-9]*' "$RUNTIME_INFO" 2>/dev/null | sed 's/.*: *//')

        # 检查进程是否运行 (PID 必须大于 0)
        if [ -n "$pid" ] && [ "$pid" -gt 0 ] 2>/dev/null && kill -0 "$pid" 2>/dev/null; then
            ip=$(hostname -I 2>/dev/null | awk '{print $1}')
            [ -z "$ip" ] && ip="localhost"
            echo -e "${GREEN}服务运行中${NC} (PID: $pid)"
            echo -e "  Web: ${BLUE}http://${ip}:${port}${NC}"
            echo -e "  PIN: ${BLUE}${pin}${NC}"
            return 0
        fi
    fi
    echo "服务未运行"
    return 1
}

# 启动服务
start_service() {
    if get_service_info >/dev/null 2>&1; then
        echo "服务已在运行"
        get_service_info
        return 0
    fi

    echo "启动 winterm-bridge 服务..."
    mkdir -p "$CONFIG_DIR"
    nohup winterm-bridge > "$CONFIG_DIR/server.log" 2>&1 &
    sleep 1
    get_service_info
}

# 停止服务
stop_service() {
    if [ -f "$RUNTIME_INFO" ]; then
        local pid
        pid=$(grep -o '"pid"[[:space:]]*:[[:space:]]*[0-9]*' "$RUNTIME_INFO" 2>/dev/null | sed 's/.*: *//')
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            echo "服务已停止"
            return 0
        fi
    fi
    echo "服务未运行"
}

# 重启服务
restart_service() {
    echo "重启 winterm-bridge 服务..."
    stop_service
    sleep 0.5
    start_service
}

# 卸载
uninstall_service() {
    echo "卸载 winterm-bridge..."

    # 停止服务
    stop_service 2>/dev/null

    # 停止并删除 systemd 服务
    if command -v systemctl &>/dev/null; then
        local service_file="$HOME/.config/systemd/user/winterm-bridge.service"
        if [ -f "$service_file" ]; then
            echo "停止并移除 systemd 服务..."
            systemctl --user stop winterm-bridge 2>/dev/null || true
            systemctl --user disable winterm-bridge 2>/dev/null || true
            rm -f "$service_file"
            systemctl --user daemon-reload 2>/dev/null || true
            echo "已删除: $service_file"
        fi
    fi

    # 删除二进制文件
    local cmd_path
    for path in /usr/local/bin/{{CMD_NAME}} "$HOME/.local/bin/{{CMD_NAME}}" /usr/local/bin/winterm-bridge "$HOME/.local/bin/winterm-bridge"; do
        if [ -f "$path" ]; then
            if [ -w "$path" ]; then
                rm -f "$path"
            else
                sudo rm -f "$path"
            fi
            echo "已删除: $path"
        fi
    done

    # 询问是否删除配置
    echo ""
    read -p "是否删除配置目录 $CONFIG_DIR? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$CONFIG_DIR"
        echo "已删除配置目录"
    else
        echo "保留配置目录"
    fi

    echo ""
    echo "卸载完成"
}

# 列出 sessions
list_sessions() {
    echo "WinTerm Sessions:"
    tmux list-sessions -F "  #{session_name} (#{session_windows} windows, created #{session_created_string})" 2>/dev/null | grep "winterm-" || echo "  (无)"
}

# 显示版本信息
show_version() {
    echo "{{CMD_NAME}} (WinTerm Bridge CLI)"
    echo ""
    # 获取 winterm-bridge 版本
    if command -v winterm-bridge &>/dev/null; then
        local server_version
        server_version=$(winterm-bridge -version 2>/dev/null || echo "未知")
        echo "  服务版本: $server_version"
    else
        echo "  服务版本: 未安装"
    fi
    # tmux 版本
    if command -v tmux &>/dev/null; then
        echo "  tmux 版本: $(tmux -V)"
    fi
}

# 终止 session
kill_session() {
    local name="${1:-$DEFAULT_SESSION_NAME}"
    local full_name="${SESSION_PREFIX}${name}"
    if tmux has-session -t "$full_name" 2>/dev/null; then
        tmux kill-session -t "$full_name"
        echo "已终止 session: $full_name"
    else
        echo "Session 不存在: $full_name"
    fi
}

# 解析参数
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    -l|--list)
        list_sessions
        exit 0
        ;;
    -k|--kill)
        kill_session "$2"
        exit 0
        ;;
    -s|--start)
        start_service
        exit 0
        ;;
    -S|--stop)
        stop_service
        exit 0
        ;;
    -r|--restart)
        restart_service
        exit 0
        ;;
    --uninstall)
        uninstall_service
        exit 0
        ;;
    -i|--info)
        get_service_info
        exit 0
        ;;
    -v|--version)
        show_version
        exit 0
        ;;
esac

# 检查 tmux
if ! command -v tmux &>/dev/null; then
    echo "错误: tmux 未安装"
    exit 1
fi

# 检查是否已在 tmux 中
if [ -n "$TMUX" ]; then
    echo "你已经在 tmux session 中了"
    tmux display-message -p "当前 session: #S"
    exit 0
fi

# 自动启动服务（如果未运行）
ensure_service_running() {
    # 检查服务是否运行
    if [ -f "$RUNTIME_INFO" ]; then
        local pid
        pid=$(grep -o '"pid"[[:space:]]*:[[:space:]]*[0-9]*' "$RUNTIME_INFO" 2>/dev/null | sed 's/.*: *//')
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            return 0  # 服务已运行
        fi
    fi

    # 服务未运行，启动它
    if command -v winterm-bridge &>/dev/null; then
        mkdir -p "$CONFIG_DIR"
        nohup winterm-bridge > "$CONFIG_DIR/server.log" 2>&1 &
        sleep 0.5
        echo -e "${GREEN}已自动启动 winterm-bridge 服务${NC}"
    fi
}

ensure_service_running

# 显示弹窗
show_popup() {
    local info
    info=$(get_service_info 2>/dev/null | tail -2)
    if [ -n "$info" ]; then
        tmux display-popup -t "$FULL_SESSION_NAME" -w 50 -h 6 -E "echo ''; echo '  WinTerm Bridge 已就绪'; echo '$info' | head -2; sleep 10" 2>/dev/null || true
    fi
}

# tmux 配置文件
TMUX_CONF="$CONFIG_DIR/tmux.conf"

# 连接或创建 session
if tmux has-session -t "$FULL_SESSION_NAME" 2>/dev/null; then
    echo "连接到已有 session: $FULL_SESSION_NAME"
    exec tmux attach-session -t "$FULL_SESSION_NAME"
else
    echo "创建新 session: $FULL_SESSION_NAME"
    tmux new-session -d -s "$FULL_SESSION_NAME" -n "main"

    # 加载自定义配置
    if [ -f "$TMUX_CONF" ]; then
        tmux source-file "$TMUX_CONF" 2>/dev/null || true
    fi

    tmux set-option -t "$FULL_SESSION_NAME" window-size latest 2>/dev/null || true
    tmux set-option -t "$FULL_SESSION_NAME" status off 2>/dev/null || true

    # 后台显示弹窗
    (sleep 0.5 && show_popup) &

    exec tmux attach-session -t "$FULL_SESSION_NAME"
fi
EOFCLI
)

    # 替换命令名占位符
    cli_script="${cli_script//\{\{CMD_NAME\}\}/$cmd_name}"

    # 写入文件
    local cli_path="$install_dir/$cmd_name"
    if [ -w "$install_dir" ]; then
        echo "$cli_script" > "$cli_path"
        chmod +x "$cli_path"
    else
        echo "$cli_script" | sudo tee "$cli_path" > /dev/null
        sudo chmod +x "$cli_path"
    fi

    success "已安装 $cmd_name 命令到 $cli_path"
}

# ============== 安装 systemd 服务 ==============
install_systemd_service() {
    if [ "$NO_SERVICE" = true ]; then
        return
    fi

    # 检查 systemd 是否可用
    if ! command -v systemctl &>/dev/null; then
        warn "systemd 不可用，跳过服务安装"
        return
    fi

    info "安装 systemd 用户服务..."

    local service_dir="$HOME/.config/systemd/user"
    mkdir -p "$service_dir"

    cat > "$service_dir/winterm-bridge.service" << EOF
[Unit]
Description=WinTerm Bridge Server
After=network.target

[Service]
Type=simple
ExecStart=$(which winterm-bridge 2>/dev/null || echo "/usr/local/bin/winterm-bridge")
Restart=on-failure
RestartSec=5
Environment=HOME=$HOME

[Install]
WantedBy=default.target
EOF

    systemctl --user daemon-reload

    success "systemd 服务已安装"
    echo ""
    echo "  启用开机自启: systemctl --user enable winterm-bridge"
    echo "  启动服务:     systemctl --user start winterm-bridge"
    echo "  查看状态:     systemctl --user status winterm-bridge"
}

# ============== 配置 PATH ==============
setup_path() {
    local install_dir="$1"

    # 如果安装到 ~/.local/bin，确保在 PATH 中
    if [ "$install_dir" = "$HOME/.local/bin" ]; then
        if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
            warn "$HOME/.local/bin 不在 PATH 中"
            echo ""
            echo "请添加以下内容到 ~/.bashrc 或 ~/.zshrc:"
            echo '  export PATH="$HOME/.local/bin:$PATH"'
            echo ""
        fi
    fi
}

# ============== 交互式配置 ==============
interactive_config() {
    # 读取已有配置作为默认值
    local runtime_config="$CONFIG_DIR/runtime.json"
    if [ -f "$runtime_config" ]; then
        local existing_port existing_pin
        existing_port=$(grep -o '"port"[[:space:]]*:[[:space:]]*"[^"]*"' "$runtime_config" 2>/dev/null | sed 's/.*"\([^"]*\)"$/\1/')
        existing_pin=$(grep -o '"pin"[[:space:]]*:[[:space:]]*"[^"]*"' "$runtime_config" 2>/dev/null | sed 's/.*"\([^"]*\)"$/\1/')

        # 如果读取到值且用户没有通过命令行参数指定，则使用已有配置
        [ -n "$existing_port" ] && [ "$PORT" = "$DEFAULT_PORT" ] && PORT="$existing_port"
        [ -n "$existing_pin" ] && [ "$PIN" = "$DEFAULT_PIN" ] && PIN="$existing_pin"
    fi

    echo ""
    echo "┌─────────────────────────────────────────┐"
    echo "│           配置 WinTerm Bridge           │"
    echo "└─────────────────────────────────────────┘"
    echo ""

    # 询问命令名称
    local input_cmd
    read -p "唤醒命令名称 [默认: $CMD_NAME]: " input_cmd
    if [ -n "$input_cmd" ]; then
        CMD_NAME="$input_cmd"
    fi

    # 询问端口
    local input_port
    read -p "服务端口 [默认: $PORT]: " input_port
    if [ -n "$input_port" ]; then
        PORT="$input_port"
    fi

    # 询问 PIN
    local input_pin
    read -p "访问 PIN 码 [默认: $PIN]: " input_pin
    if [ -n "$input_pin" ]; then
        PIN="$input_pin"
    fi

    echo ""
    info "配置确认: 命令=$CMD_NAME, 端口=$PORT, PIN=$PIN"
    echo ""
}

# ============== 主流程 ==============
main() {
    echo ""
    echo "╔═══════════════════════════════════════╗"
    echo "║     WinTerm Bridge 安装程序           ║"
    echo "╚═══════════════════════════════════════╝"
    echo ""

    # 检测平台
    local platform
    platform=$(detect_platform)
    info "平台: $platform"

    # 检查依赖
    check_dependencies

    # 确定安装目录
    local install_dir
    install_dir=$(determine_install_dir)
    info "安装目录: $install_dir"

    # 交互式配置（如果是终端且未通过参数指定）
    if [ -t 0 ]; then
        interactive_config
    fi

    # 创建配置目录
    mkdir -p "$CONFIG_DIR"

    # 生成 tmux 配置
    setup_tmux_config

    # 创建字体目录
    setup_fonts_dir

    # 加载已有字体
    load_fonts

    # 生成配置文件（保留现有配置）
    local runtime_config="$CONFIG_DIR/runtime.json"
    if [ -f "$runtime_config" ]; then
        info "检测到现有配置文件，保留现有配置..."
        # 读取现有配置作为默认值
        local existing_port existing_pin existing_autocreate existing_session
        existing_port=$(grep -o '"port"[[:space:]]*:[[:space:]]*"[^"]*"' "$runtime_config" 2>/dev/null | sed 's/.*"\([^"]*\)"$/\1/' || echo "$PORT")
        existing_pin=$(grep -o '"pin"[[:space:]]*:[[:space:]]*"[^"]*"' "$runtime_config" 2>/dev/null | sed 's/.*"\([^"]*\)"$/\1/' || echo "$PIN")
        existing_autocreate=$(grep -o '"autocreate"[[:space:]]*:[[:space:]]*[a-z]*' "$runtime_config" 2>/dev/null | sed 's/.*: *//' || echo "true")
        existing_session=$(grep -o '"default_session"[[:space:]]*:[[:space:]]*"[^"]*"' "$runtime_config" 2>/dev/null | sed 's/.*"\([^"]*\)"$/\1/' || echo "Main")

        # 如果用户没有通过参数指定，使用现有值
        [ "$PORT" = "$DEFAULT_PORT" ] && PORT="$existing_port"
        [ "$PIN" = "$DEFAULT_PIN" ] && PIN="$existing_pin"

        # 保留其他现有字段
        cat > "$runtime_config" << EOF
{
    "port": "$PORT",
    "pin": "$PIN",
    "autocreate": $existing_autocreate,
    "default_session": "$existing_session"
}
EOF
        success "配置已更新（保留现有设置）: 端口=$PORT, PIN=$PIN"
    else
        info "生成配置文件..."
        cat > "$runtime_config" << EOF
{
    "port": "$PORT",
    "pin": "$PIN",
    "autocreate": true,
    "default_session": "Main"
}
EOF
        success "配置: 端口=$PORT, PIN=$PIN"
    fi

    # 停止运行中的服务（避免 "Text file busy" 错误）
    stop_running_service

    # 安装二进制
    if [ "$FROM_SOURCE" = true ]; then
        build_from_source "$install_dir"
    else
        download_binary "$platform" "$install_dir"
    fi

    # 安装 CLI 命令
    install_cli_command "$install_dir" "$CMD_NAME"

    # 安装 systemd 服务
    install_systemd_service

    # 配置 PATH
    setup_path "$install_dir"

    echo ""
    echo "╔═══════════════════════════════════════╗"
    echo "║           安装完成!                   ║"
    echo "╚═══════════════════════════════════════╝"
    echo ""
    echo "配置信息:"
    echo "  命令名称:  $CMD_NAME"
    echo "  服务端口:  $PORT"
    echo "  访问 PIN:  $PIN"
    echo ""
    echo "使用方法:"
    echo "  1. 启动服务:  $CMD_NAME -s"
    echo "  2. 进入终端:  $CMD_NAME [session_name]"
    echo "  3. 查看帮助:  $CMD_NAME -h"
    echo ""
    echo "或者手动启动: winterm-bridge -port $PORT"
    echo ""
}

main "$@"
