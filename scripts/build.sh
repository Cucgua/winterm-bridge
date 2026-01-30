#!/bin/bash
# WinTerm Bridge 构建脚本
# 用法: ./build.sh [选项]
#
# 选项:
#   --all           构建所有平台 (linux, darwin, windows)
#   --platform OS   指定平台 (linux/darwin/windows)
#   --arch ARCH     指定架构 (amd64/arm64/arm)
#   --output DIR    输出目录 (默认: dist/)
#   --skip-frontend 跳过前端构建
#   --help          显示帮助

set -e

# ============== 配置 ==============
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
OUTPUT_DIR="$PROJECT_ROOT/dist"
BINARY_NAME="winterm-bridge"

# 支持的平台
PLATFORMS=(
    "linux_amd64"
    "linux_arm64"
    "darwin_amd64"
    "darwin_arm64"
)

# ============== 颜色输出 ==============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ============== 参数解析 ==============
BUILD_ALL=false
TARGET_PLATFORM=""
TARGET_ARCH=""
SKIP_FRONTEND=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            BUILD_ALL=true
            shift
            ;;
        --platform)
            TARGET_PLATFORM="$2"
            shift 2
            ;;
        --arch)
            TARGET_ARCH="$2"
            shift 2
            ;;
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --skip-frontend)
            SKIP_FRONTEND=true
            shift
            ;;
        --help|-h)
            echo "WinTerm Bridge 构建脚本"
            echo ""
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --all           构建所有平台"
            echo "  --platform OS   指定平台 (linux/darwin/windows)"
            echo "  --arch ARCH     指定架构 (amd64/arm64)"
            echo "  --output DIR    输出目录 (默认: dist/)"
            echo "  --skip-frontend 跳过前端构建"
            echo "  --help          显示帮助"
            echo ""
            echo "示例:"
            echo "  $0                          # 构建当前平台"
            echo "  $0 --all                    # 构建所有平台"
            echo "  $0 --platform linux --arch amd64"
            exit 0
            ;;
        *)
            error "未知选项: $1"
            ;;
    esac
done

# ============== 检查依赖 ==============
check_dependencies() {
    info "检查构建依赖..."

    if ! command -v go &>/dev/null; then
        error "Go 未安装，请先安装: https://go.dev/dl/"
    fi
    success "Go $(go version | awk '{print $3}')"

    if [ "$SKIP_FRONTEND" = false ]; then
        if ! command -v npm &>/dev/null; then
            warn "npm 未安装，将跳过前端构建"
            SKIP_FRONTEND=true
        else
            success "npm $(npm --version)"
        fi
    fi
}

# ============== 构建前端 ==============
build_frontend() {
    if [ "$SKIP_FRONTEND" = true ]; then
        warn "跳过前端构建"
        return
    fi

    info "构建前端..."
    cd "$FRONTEND_DIR"

    # 安装依赖
    if [ ! -d "node_modules" ]; then
        npm install
    fi

    # 构建
    npm run build

    # 复制到后端静态目录
    rm -rf "$BACKEND_DIR/cmd/server/static"
    cp -r "$FRONTEND_DIR/dist" "$BACKEND_DIR/cmd/server/static"

    success "前端构建完成"
}

# ============== 构建单个平台 ==============
build_single() {
    local os="$1"
    local arch="$2"
    local output_name="${BINARY_NAME}"

    # Windows 添加 .exe 后缀
    if [ "$os" = "windows" ]; then
        output_name="${BINARY_NAME}.exe"
    fi

    local output_path="$OUTPUT_DIR/${BINARY_NAME}_${os}_${arch}"
    mkdir -p "$output_path"

    info "构建 ${os}/${arch}..."

    cd "$BACKEND_DIR"

    # 交叉编译
    CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build \
        -ldflags="-s -w" \
        -o "$output_path/$output_name" \
        ./cmd/server

    # 复制 README 和 LICENSE
    cp "$PROJECT_ROOT/README.md" "$output_path/" 2>/dev/null || true
    cp "$PROJECT_ROOT/LICENSE" "$output_path/" 2>/dev/null || true

    # 创建压缩包
    cd "$OUTPUT_DIR"
    tar -czf "${BINARY_NAME}_${os}_${arch}.tar.gz" -C "$output_path" .

    # 清理临时目录
    rm -rf "$output_path"

    success "构建完成: ${BINARY_NAME}_${os}_${arch}.tar.gz"
}

# ============== 构建当前平台 ==============
build_current() {
    local os arch

    case "$(uname -s)" in
        Linux*)  os="linux" ;;
        Darwin*) os="darwin" ;;
        MINGW*|MSYS*|CYGWIN*) os="windows" ;;
        *) error "不支持的操作系统: $(uname -s)" ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64) arch="amd64" ;;
        aarch64|arm64) arch="arm64" ;;
        *) error "不支持的架构: $(uname -m)" ;;
    esac

    build_single "$os" "$arch"
}

# ============== 构建所有平台 ==============
build_all() {
    for platform in "${PLATFORMS[@]}"; do
        local os="${platform%_*}"
        local arch="${platform#*_}"
        build_single "$os" "$arch"
    done
}

# ============== 主流程 ==============
main() {
    echo ""
    echo "╔═══════════════════════════════════════╗"
    echo "║     WinTerm Bridge 构建脚本           ║"
    echo "╚═══════════════════════════════════════╝"
    echo ""

    # 检查依赖
    check_dependencies

    # 创建输出目录
    mkdir -p "$OUTPUT_DIR"

    # 构建前端
    build_frontend

    # 构建后端
    if [ "$BUILD_ALL" = true ]; then
        build_all
    elif [ -n "$TARGET_PLATFORM" ]; then
        local arch="${TARGET_ARCH:-amd64}"
        build_single "$TARGET_PLATFORM" "$arch"
    else
        build_current
    fi

    echo ""
    echo "╔═══════════════════════════════════════╗"
    echo "║           构建完成!                   ║"
    echo "╚═══════════════════════════════════════╝"
    echo ""
    echo "输出目录: $OUTPUT_DIR"
    ls -lh "$OUTPUT_DIR"/*.tar.gz 2>/dev/null || true
    echo ""
}

main "$@"
