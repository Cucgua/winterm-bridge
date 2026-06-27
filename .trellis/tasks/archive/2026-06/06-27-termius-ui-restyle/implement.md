# Implement — 客户端 UI 改造为 Termius 风格

> 执行顺序设计为"先地基后上层、先样式系统后布局"，每步可独立 build 验证。

## 阶段 0：地基与样式系统统一

- [ ] **0.1** 清理 `client/index.html`：`<body class="bg-black text-white overflow-hidden">` → `<body class="overflow-hidden">`。
- [ ] **0.2** 新建 `client/src/utils/statusColor.ts`，实现 `getStatusDotColor(src: DotSource)`（见 design.md §3）。
- [ ] **0.3** `settingsStore.ts`：`Settings` 新增 `sidePanelWidth: number`（默认 320）、`sidePanelCollapsed: boolean`（默认 false）；加入 `DEFAULT_SETTINGS`、`partialize` 白名单。
- [ ] **0.4** 全量 token 化扫描基线：`grep -rnE "#[0-9a-fA-F]{3,8}|bg-(gray|green|yellow|blue|red|cyan|orange)-[0-9]|text-(gray|red|yellow)-[0-9]" client/src` 记录命中点（预期命中：App.tsx、Sidebar.tsx）。

**验证**：`cd client && npm run build`（tsc 通过；此时 static.css 尚未含新类，下一步补）。

## 阶段 1：通用组件新建

- [ ] **1.1** 新建 `client/src/components/ActivityBar.tsx`：从现 `Sidebar.tsx` 的 icon rail（w-14 区块 + navItems + Servers/Logout 按钮）抽离为独立组件，全量 token 化。props：`{ activeSection, aiEnabled, hasToken, onSectionChange, onOpenServers, onLogout }`。
- [ ] **1.2** 新建 `client/src/components/DockPanel.tsx`：
  - props：`{ width, minWidth=240, maxWidth=560, collapsed, onWidthChange, onCollapsedChange, title, onClose, children }`
  - 左边缘 4px 拖拽手柄（`cursor-col-resize`），mousedown→document mousemove 计算 `clientX` 差值更新 width（clamp），mouseup 解绑。
  - 右上角收起按钮 → `onCollapsedChange(true)`；collapsed 时渲染 `null`（由父级据 activeSection + collapsed 决定是否挂载）。
  - header：标题 + 收起 + 关闭按钮。
- [ ] **1.3** 重写 `client/src/components/TabBar.tsx` 为 browser 风格圆角卡片标签（见 design.md §2 R2）：活动态 `bg-canvas` + 顶部 accent 指示条 + `rounded-t-lg`，非活动 `bg-surface/70` + hover `bg-surface-highlight`，状态点走 `getStatusDotColor`，末尾 `+` 新建按钮，横向 `overflow-x-auto`。全量 token 化。

**验证**：`cd client && npm run build`（tsc 通过；新类进入 static.css）。

## 阶段 2：Sidebar 重写为 Hosts 列表

- [ ] **2.1** 重写 `client/src/components/Sidebar.tsx`：
  - 保留 sessions state + 30s 轮询 + 增删持久化归档逻辑（从原文件迁移，行为不变）。
  - 顶部区：搜索框（`useState` query，按 title 过滤 visibleSessions）+ 服务器切换条（显示 activeServer name/url + 在线点，点击 → `setShowServerModal(true)`）。
  - 列表区：每条 Hosts 风格条目 = 连接图标 + 标题 + 状态点（`getStatusDotColor`）+ 副信息（`formatRelativeTime` 从 SessionPicker 迁到 utils）+ hover admin 操作。
  - 底部：admin 新建会话输入框。
  - 保留 `ServerModal` 子组件（仅 token 化，逻辑不变）。
- [ ] **2.2** 抽取 `formatRelativeTime` 到 `client/src/utils/time.ts`，Sidebar 与（如仍存在）其他处共用。
- [ ] **2.3** 删除 `client/src/components/SessionPicker.tsx`（确认无 import 引用：`grep -rn SessionPicker client/src`）。

**验证**：`cd client && npm run build`。

## 阶段 3：App.tsx 布局编排重构

- [ ] **3.1** 重写 `client/src/App.tsx` 的 ready 态 JSX：
  - 外层 `flex`：`<ActivityBar/>` + `<Sidebar/>` + 右侧主区。
  - 右侧主区 `flex-col`：`<TabBar/>`（接线，替换原内联标签栏）+ 内容区 `flex`。
  - 内容区：`<TerminalView/>`（flex-1）+ `<DockPanel/>`（当 activeSection 为 files/ai 且非 collapsed）。
  - DockPanel 内：files → `<FileManager/>`，ai → `<AIPanel/>`。
  - 移除内联标签栏 JSX 与内联 `getDotColor`，改用 TabBar + `getStatusDotColor`。
  - 全量 token 化（移除 `bg-[#0e0e12]`/`bg-[#09090b]`/`bg-[#1a1a1f]` 等）。
- [ ] **3.2** DockPanel 状态接线：从 `useSettingsStore` 读 `sidePanelWidth/sidePanelCollapsed`，拖拽/收起时写回。`activeSection` 切到 files/ai 时若 collapsed 则自动展开。
- [ ] **3.3** ActivityBar 的 `onOpenServers` → 复用 Sidebar 的 ServerModal（把 `showServerModal` 提升到 App 或由 Sidebar 暴露）。取舍：ServerModal 留在 Sidebar 内部，ActivityBar 的 Servers 按钮通过回调让 Sidebar 打开（Sidebar 新增 `openServerModal` ref/受控 prop），或直接把 Servers 入口也放 Sidebar 顶部切换条（design 已定后者）→ 则 ActivityBar 的 Servers 按钮改为切换 `activeSection` 到 sessions 并触发 Sidebar 滚动到服务器条。**采用：Servers 入口放 Sidebar 顶部，ActivityBar 不再单独放 Servers 按钮**（简化）。

**验证**：`cd client && npm run build`。

## 阶段 4：视觉质感收尾

- [ ] **4.1** 统一图标：确认所有 SVG 为 1.8 描边线性风格（ActivityBar/Sidebar/TabBar/DockPanel）；空状态、加载态、错误条样式对齐（`text-text-secondary` + 居中 + 统一图标尺寸）。
- [ ] **4.2** AuthScreen / SettingsDialog 复查 token 化（已基本是 token，确认无遗留硬编码），微调圆角/间距与全局一致。
- [ ] **4.3** 暗亮主题切换复查：`useTheme` 切 `[data-theme]` 后无硬编码色穿帮（重点：DockPanel 拖拽手柄、TabBar 活动指示条）。

## 阶段 5：验证

- [ ] **5.1** AC4 grep 验证（必须 0 命中）：
  ```bash
  grep -rnE "#[0-9a-fA-F]{3,8}" client/src --include="*.tsx" --include="*.ts"
  grep -rnE "bg-(gray|green|yellow|blue|red|cyan|orange)-[0-9]" client/src --include="*.tsx"
  grep -rnE "text-(gray|red|yellow)-[0-9]" client/src --include="*.tsx"
  ```
  例外允许：`client/src/utils/terminalBackground.ts` 等纯数据/终端配色常量（非 UI className）。
- [ ] **5.2** AC5 验证：`index.html` body 无 `bg-black text-white`；`npm run build` 后 `public/static.css` 含 `.cursor-col-resize`/`.rounded-t-lg` 等新类。
- [ ] **5.3** AC6：`cd client && npm run build` 通过；`grep -rn "SessionPicker" client/src` 无引用。
- [ ] **5.4** AC7 手动流程（Tauri WebKitGTK）：登录 → 选会话开标签 → 开第二个标签 → 切换 → 打开 Files 面板 → 拖拽调宽 → 收起 → 点 ActivityBar Files 图标恢复 → 打开 AI 面板 → 改设置保存 → 登出。全流程无回归、无控制台报错。
- [ ] **5.5** AC8：切亮色主题，无穿帮。

## 风险点与回滚

- **风险 A — WebKitGTK 样式不生效**：新增 Tailwind 类若未重新 build，static.css 缺类导致样式丢失。**缓解**：每个阶段末 `npm run build`；5.2 专项验证。
- **风险 B — DockPanel 拖拽在 WebKitGTK 事件异常**：mousemove 可能丢事件。**缓解**：用 document 级 listener + `pointer events`（而非 mouse），拖拽中 `user-select:none` 防文本选中。
- **风险 C — sessions 列表迁移漏掉 admin 操作**：持久化/归档/删除逻辑分散。**缓解**：2.1 逐项对照原 Sidebar 的 handle* 函数迁移，行为不变。
- **回滚**：`git checkout client/src client/index.html`，无后端/构建配置改动，回滚零副作用。

## 关键文件清单（改动面）

| 文件 | 动作 |
|---|---|
| `client/index.html` | 改 body class |
| `client/src/utils/statusColor.ts` | 新建 |
| `client/src/utils/time.ts` | 新建 |
| `client/src/stores/settingsStore.ts` | 加 2 字段 + partialize |
| `client/src/components/ActivityBar.tsx` | 新建 |
| `client/src/components/DockPanel.tsx` | 新建 |
| `client/src/components/TabBar.tsx` | 重写 + 接线 |
| `client/src/components/Sidebar.tsx` | 重写为 Hosts 列表 |
| `client/src/components/SessionPicker.tsx` | 删除 |
| `client/src/App.tsx` | 布局编排重构 |
| `client/src/components/AuthScreen.tsx` | 微调（token 复查） |
| `client/src/components/SettingsDialog.tsx` | 微调（token 复查） |
