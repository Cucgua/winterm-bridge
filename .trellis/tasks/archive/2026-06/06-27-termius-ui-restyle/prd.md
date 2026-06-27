# 客户端 UI 改造为 Termius 风格

## Goal

将 WinTerm Bridge 的 Tauri 桌面客户端（`client/`）视觉与交互风格对齐 Termius 桌面端，使其在布局结构、配色质感、信息层级、控件交互上更接近 Termius 的成熟体验。每个 session 被当作 Termius 中的一个 SSH 连接。

## Background

- `client/` 是 Tauri v2 桌面客户端（提交 `e838651`），已在 "Phase 6a — Termius-style UI" 落地第一版骨架，但存在布局结构待优化与样式技术债。
- 数据模型（`client/src/core/api.ts`、`stores/serverStore.ts`）：
  - `ServerEntry`：客户端侧多服务器（name/url/token/role），无分组字段。
  - `SessionInfo`：每 server 下的会话（id/state/title/is_persistent/is_ghost/is_archived 等）。
  - 无"主机树/分组"概念 —— session 即连接，符合 Termius Hosts 列表的扁平语义。
- 样式机制（`tailwind.config.js` / `index.html` / `public/static.css`）：
  - Tailwind 3.4 + CSS 变量语义 token（`bg-canvas` / `bg-surface` / `text-text-primary` / `border-theme-border` / `accent` / `success` / `warning` / `error`），`index.css` 定义 `:root`（暗）与 `[data-theme='light']`（亮）两套。
  - **限制**：Vite 的 JS 注入在 WebKitGTK 不可靠，样式必须经 `<link rel="stylesheet" href="/static.css">` 静态加载（编译后的 Tailwind 产物）。
  - `index.html` 的 `<body class="bg-black text-white">` 与 token 系统冲突，需清理。

## Scope

- **范围对象**：仅 `client/`（Tauri 桌面端）。`frontend/`（浏览器 SPA）不动。
- **改造性质**：布局重构 + 视觉升级，非推倒重做。保留三栏骨架精神，整改结构与技术债。
- **参照来源**：Termius 桌面端通用印象，由 AI 据记忆与代码现状给出设计，无需等待外部截图。

### 布局要素（全部纳入）

1. **会话列表 = Termius Hosts 列表样式**：每个 session 作为一条"连接"条目（图标 + 标题 + 状态点 + 副信息），支持搜索/筛选，点击打开为新标签。服务器切换控件放列表顶部或底部。
2. **顶部 browser 风格标签**：Tab 改为窗口顶部真实浏览器风格标签（圆角、活动态高亮、hover 态、紧凑关闭按钮）。
3. **面板可停靠/调宽**：Files / AI 面板从固定宽度右侧 drawer 改为可收起、可拖拽调宽的停靠面板。
4. **统一列表与样式系统**：
   - 消除两套并存的 session 列表：`App.tsx` 内联列表（硬编码十六进制）vs 未接线的 `SessionPicker.tsx`（语义 token）。
   - 消除两套并存的 TabBar：`App.tsx` 内联标签栏（硬编码十六进制）vs 未接线的 `TabBar.tsx`（语义 token）。
   - 全量改用 CSS 变量语义 token，移除硬编码十六进制色（`#0e0e12` / `#1a1a1f` / `#222229` / `#2a2a32` / `#09090b` 等）与裸 Tailwind 调色板色（`bg-gray-500` / `bg-green-500` / `bg-yellow-500` / `bg-blue-500` / `bg-red-500` / `bg-cyan-500` / `bg-orange-500` 等）。

## Requirements

- **R1 — 会话列表（Hosts 样式）**：侧边栏会话列表每条含连接图标、标题、状态点（active/detached/ghost + AI summary tag 映射色）、副信息（最后活跃时间 / ghost / archived 标签）。列表顶部提供搜索框（按标题过滤）与服务器切换控件。admin 可见的持久化/归档/删除操作以 hover 出现的图标按钮呈现。
- **R2 — 顶部 browser 风格标签**：标签栏位于终端区上方，标签为圆角卡片样式，活动标签高亮（accent 边/底）、非活动标签半透明、hover 提亮；含状态点、标题、hover 关闭按钮；末尾有新建按钮；标签区可横向滚动。
- **R3 — 可停靠/调宽面板**：Files / AI 面板作为右侧停靠面板，支持拖拽左右边缘调宽（最小/最大宽度约束）、一键收起/展开；收起后仅保留图标入口。面板宽度持久化到 settings。
- **R4 — 样式系统统一**：
  - 所有组件改用语义 token（`bg-canvas` / `bg-surface` / `bg-surface-highlight` / `text-text-primary` / `text-text-secondary` / `border-theme-border` / `accent` / `success` / `warning` / `error`）。
  - 移除 `App.tsx`、`Sidebar.tsx` 中所有硬编码十六进制与裸调色板色。
  - 状态点颜色统一走 `getTagDotColor` 一处映射（复用 `TabBar.tsx` 已有的语义 token 版本）。
  - 清理 `index.html` 的 `<body class="bg-black text-white">`，改由 `index.css` 的 `html,body,#root` 统一控制。
  - 删除未接线死代码：`SessionPicker.tsx`、`TabBar.tsx`（若其逻辑被新组件吸收）或在接线后保留其一。
- **R5 — Termius 视觉质感**：深色基调沿用现有 token 体系（canvas `9 9 11` / surface `24 24 27`），统一圆角、间距、阴影、过渡；图标统一为 1.8 描边线性 SVG 风格；空状态、加载态、错误条样式统一。
- **R6 — 不破坏功能**：认证（PIN→JWT、多服务器 token）、终端（xterm resize/IME/fit）、多标签开关切换、会话增删持久化归档、AI 轮询与实时事件、文件管理、设置各 tab 保存——全部行为保持不变。

## Acceptance Criteria

- [ ] AC1：侧边栏会话列表呈现 Termius Hosts 风格条目，含连接图标 + 标题 + 状态点 + 副信息；搜索框可按标题过滤；服务器可在列表区切换，无需弹 modal。
- [ ] AC2：标签栏为窗口顶部 browser 风格圆角卡片标签，活动态高亮、hover 提亮、可滚动、含新建按钮。
- [ ] AC3：Files / AI 面板可拖拽调宽（有最小/最大约束）、可一键收起/展开，收起后留图标入口；宽度刷新后保持。
- [ ] AC4：`client/src` 全量 grep 无硬编码十六进制色（`#[0-9a-fA-F]{3,8}`）与裸调色板色类（`bg-gray-*`/`bg-green-*`/`bg-yellow-*`/`bg-blue-*`/`bg-red-*`/`bg-cyan-*`/`bg-orange-*`/`text-gray-*`/`text-red-*`/`text-yellow-*`），状态点颜色统一走单一映射函数。
- [ ] AC5：`index.html` 的 `<body>` 不再有 `bg-black text-white`；样式仍经 `<link>` 静态加载，`npm run build` 后 `static.css` 包含新布局所需类。
- [ ] AC6：`npm run build`（`tsc && vite build`）通过，无 TS 错误；死代码（未接线的 SessionPicker / 旧 TabBar）已删除或接线。
- [ ] AC7：登录→选会话→开多标签→切标签→开 Files/AI 面板→调宽→收起→改设置保存，全流程在 Tauri WebKitGTK 下可用，无回归。
- [ ] AC8：暗/亮主题切换正常（token 驱动），无硬编码色穿帮。

## Out of Scope

- `frontend/` 浏览器 SPA 的任何改动。
- 后端 Go 代码改动（API/数据模型不变）。
- 新增分组/主机树数据模型（保持扁平 session 列表）。
- 标签拖拽重排（R2 仅要求 browser 风格视觉，不要求拖拽排序）。
- 移动端适配（`client/` 为桌面端）。

## Notes

- 复杂任务，需 `design.md`（布局/样式系统/组件映射）与 `implement.md`（有序 checklist + 验证）。
- 关键约束：WebKitGTK 下样式必须经 `static.css` 静态加载，新增 Tailwind 类后必须重新 build 才能生效。
- 现有可复用资产：`TabBar.tsx` 的语义 token 版标签逻辑、`SessionPicker.tsx` 的搜索/格式化时间逻辑、`Sidebar.tsx` 的状态点映射。
