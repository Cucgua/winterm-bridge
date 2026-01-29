#!/bin/bash
# WinTerm Bridge 安装脚本

set -e

echo "=== WinTerm Bridge 安装 ==="

# 检查是否为 root 或有 sudo 权限
if [ "$EUID" -ne 0 ]; then
    SUDO="sudo"
else
    SUDO=""
fi

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 检查 winterm-bridge 二进制文件
if [ ! -f "$PROJECT_DIR/backend/winterm-bridge" ]; then
    echo "错误: 未找到 winterm-bridge 二进制文件"
    echo "请先构建: cd backend && go build -o winterm-bridge ./cmd/server"
    exit 1
fi

# 安装二进制文件
echo "安装 winterm-bridge 到 /usr/local/bin/"
$SUDO cp "$PROJECT_DIR/backend/winterm-bridge" /usr/local/bin/
$SUDO chmod +x /usr/local/bin/winterm-bridge

# 安装 hiwb 命令
echo "安装 hiwb 命令到 /usr/local/bin/"
$SUDO cp "$SCRIPT_DIR/hiwb" /usr/local/bin/
$SUDO chmod +x /usr/local/bin/hiwb

# 安装 systemd 服务（可选）
if [ -d /etc/systemd/system ]; then
    echo "安装 systemd 服务文件..."
    $SUDO cp "$SCRIPT_DIR/winterm-bridge@.service" /etc/systemd/system/
    $SUDO systemctl daemon-reload
    echo ""
    echo "启用服务（以当前用户运行）:"
    echo "  sudo systemctl enable winterm-bridge@$USER"
    echo "  sudo systemctl start winterm-bridge@$USER"
fi

echo ""
echo "=== 安装完成 ==="
echo ""
echo "使用方法:"
echo "  1. 启动服务:  winterm-bridge  (或 systemctl start winterm-bridge@$USER)"
echo "  2. 终端进入:  hiwb            (创建/连接 tmux session)"
echo "  3. Web 访问:  http://localhost:8080"
echo ""
echo "hiwb 命令用法:"
echo "  hiwb              # 使用用户名作为 session 名"
echo "  hiwb myproject    # 使用 'myproject' 作为 session 名"
