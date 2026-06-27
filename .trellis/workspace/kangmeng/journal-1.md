# Journal - kangmeng (Part 1)

> AI development session journal
> Started: 2026-06-17

---


## 2026-06-27 — Task: 06-27-termius-ui-restyle (已完成,已归档)

**目标**:将 Tauri 桌面客户端 `client/` 视觉与交互对齐 Termius 桌面端风格。

**完成内容**:
- **布局重构**:新建 ActivityBar(图标栏)+ DockPanel(可调宽停靠面板);重写 Sidebar(Termius Hosts 风格分组列表)、TabBar(browser 风格标签);删除未接线的 SessionPicker;App.tsx 重组为四栏布局。
- **样式系统统一**:全量改用 CSS 变量语义 token + alpha 修饰符;移除硬编码十六进制(AC4 grep 0 命中);清理 index.html body 冲突样式。
- **Termius 风格四项规格落地**:① 深蓝灰分层配色(canvas #171B21 / surface #23272E / accent #5D5CFF)+ rgba 文字层级(/95 /60 /30);② 大圆角(8-12px)+ 终端贴边;③ 排版双轨(UI 无衬线 + 终端 Fira Code/JetBrains Mono);④ 极弱半透明边框(border-white/10)+ 柔和 hover(bg-white/5 + 0.2s transition)。
- **终端字体适配**:接入后端 /api/fonts 动态字体加载(修复相对 URL 在 Tauri origin 下失效的问题);TerminalView 用 loadCustomFonts + FontFace 注册。
- **终端渲染 bug 修复**:
  - 补上缺失的 xterm.css(合并进 static.css,修白框+乱码 W)
  - 补 dataBuffer 缓冲(修关闭重开会话历史丢失)
  - 补 forceRefresh(cols-1→cols 抖动强制 tmux 重绘,修"必须 resize 才显示内容")
  - 补 checkAndInit 轮询(修容器尺寸为 0 时初始化失败)
  - 去掉终端区 p-4 padding(修 tmux 一屏装不下导致滚动条)
- **主题迁移**:默认 theme 改 dark + main.tsx 一次性迁移旧 system 值(修 WSLg 下 prefers-color-scheme 误判亮色导致白屏)。
- **字号调节**:SettingsDialog Terminal tab 加字号滑块(8-32px)+ 实时预览。
- 修复 AIPanel 遗留的未用 WorkflowEventType 导入(build blocker)。

**关键经验(值得入 spec)**:
1. Tauri WebKitGTK 下 `tauri dev` 因 Mesa/Zink GPU 问题 SIGBUS 崩溃;需用 `LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe` 软件渲染 + 直接跑 debug 二进制(绕过 tauri dev)。
2. client 的 CSS 必须经 `npx tailwindcss -i src/index.css -o public/static.css` 单独生成(`npm run build` 不生成,因为 main.tsx 不 import index.css)。
3. Tailwind alpha 修饰符只支持标准 opacity 档位(/5 /10 /20...),`/8` 不生成。
4. `border-theme-border/N` 这类 border 颜色类从不生成 CSS(历史遗留);用 `border-white/N` 替代。
5. 终端切换会话必须用 forceRefresh(cols-1→cols)强制 tmux 重绘,否则尺寸不变时 tmux 跳过重绘导致空白。
6. 终端区不能有 padding,否则 fit() 行数 < tmux 窗口行数 → 滚动条。

**未提交**:改动集中在 client/(16 改 + 4 新增),待用户确认后提交。


## Session 1: Client Phase 1 theme and overlay foundation

**Date**: 2026-06-28
**Task**: Client Phase 1 theme and overlay foundation
**Branch**: `main`

### Summary

Added client theme registry, language/theme settings, terminal overlay drawers, tokenized touched UI surfaces, and recorded the web-to-client feature inventory.

### Main Changes

- Added a typed client theme registry with `Midnight`, `Graphite`, `Forest`, and `Light`.
- Reworked theme application so CSS variables and xterm palettes are resolved from the registry.
- Added Settings Appearance controls for theme and Chinese/English language switching.
- Converted Terminal Files and AI tools from layout-consuming dock panels to right-side overlays above xterm.
- Tokenized touched Workspace, Terminal, Settings, auth, file, AI, server, and dialog surfaces.
- Added feature inventory and updated frontend specs for theme governance and terminal overlay contracts.

### Git Commits

| Hash | Message |
|------|---------|
| `8fb0f9810368e9c69f152f3759ef481f1c07210d` | (see git log) |

### Testing

- [OK] `git diff --check`
- [OK] `git diff --cached --check`
- [OK] `npm run build` from `client/` (Tailwind CSS generation, TypeScript, Vite build)
- [OK] `python3 .trellis/scripts/task.py validate client-web-feature-migration`
- [WARN] Native Windows Tauri visual smoke was not run in this WSL session.

### Status

[OK] **Phase 1 foundation committed**

### Next Steps

- Continue later phases for Trellis, IDE context, guest access, AI logs/presets, auto-reply logs, and remaining web-feature parity.
- Run native Windows Tauri visual acceptance screenshots at 150% display scaling before broad UI acceptance.
