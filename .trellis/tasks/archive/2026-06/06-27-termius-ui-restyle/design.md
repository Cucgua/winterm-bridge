# Design — 客户端 UI 改造为 Termius 风格

## 1. 架构与边界

改造范围限定 `client/src/`，不触碰后端与 `frontend/`。数据模型不变，仅重构 UI 层布局与样式。

```
client/src/
  App.tsx                  ← 布局编排：ActivityBar + Sidebar + (TabBar + Workspace + DockPanel)
  components/
    ActivityBar.tsx        ← 新建：最左侧窄图标栏（Sessions/Files/AI/Settings/Servers/Logout）
    Sidebar.tsx            ← 重写：Hosts 风格会话列表 + 搜索 + 服务器切换
    TabBar.tsx             ← 接线并重写：browser 风格圆角标签
    DockPanel.tsx          ← 新建：可调宽/可收起的通用右侧停靠容器
    TerminalView.tsx       ← 不变
    FileManager.tsx        ← 不变（套入 DockPanel）
    AIPanel.tsx            ← 不变（套入 DockPanel）
    SettingsDialog.tsx     ← 仅样式 token 化（已是 token，微调）
    AuthScreen.tsx         ← 仅样式 token 化（已是 token，微调）
  stores/
    settingsStore.ts       ← 新增 sidePanelWidth / sidePanelCollapsed 持久化字段
  index.css                ← token 微调（如有）；index.html body 清理
```

### 组件职责边界

- **ActivityBar**（新建）：纯展示型窄栏（w-14），仅发 `onSectionChange` 事件，不持有数据。对应现 `Sidebar.tsx` 的 icon rail 部分抽离。
- **Sidebar**（重写）：持有 sessions 列表 state + 轮询 + 增删持久化归档逻辑（从现 Sidebar 迁移），渲染 Hosts 风格列表 + 顶部搜索 + 服务器切换条。发 `onSelectSession`。
- **TabBar**（接线重写）：纯展示型，接收 `tabs/activeSessionId/summary`，发 `onSelect/onClose/onNew`。状态点颜色统一走 `getTagDotColor`。
- **DockPanel**（新建）：通用容器，props `{ width, minWidth, maxWidth, collapsed, onWidthChange, onCollapsedChange, title, icon, onClose, children }`。内部实现拖拽调宽（mousedown 边缘 + mousemove + mouseup）与收起/展开动画。FileManager / AIPanel 作为 children 嵌入。
- **App.tsx**：编排层，管理 `activeSection / showSettings / tabs / activeSessionId`，把 Files/AI 包进 DockPanel。

## 2. 布局结构

```
┌─────────────────────────────────────────────────────────────┐
│ ActivityBar │ Sidebar(Hosts列表) │ TabBar(顶部 browser标签) │
│  (w-14)     │  (w-72,可搜索)     │ ─────────────────────── │
│  Sessions   │  [搜索框]          │ [会话1][会话2][+]        │
│  Files      │  [服务器切换]      ├─────────────────────────┤
│  AI         │  ─────────────     │                         │
│  Settings   │  • session A       │   Terminal (xterm)      │
│  ───────    │  • session B  ★    │                         │
│  Servers    │  • session C       │                         │
│  Logout     │                    │                  ┌──────┤
│             │  [新建会话...]     │                  │ Dock │
│             │                    │                  │Panel │ ← 可拖拽调宽/收起
└─────────────────────────────────────────────────────────────┘
```

- **会话列表区**（R1）：每条 = 连接图标（terminal 图标，ghost 用虚线版本）+ 标题 + 状态点（active=success/detached=warning/ghost=text-secondary，有 AI tag 时覆盖为 tag 映射色）+ 副信息（formatRelativeTime + ghost/archived 标签）+ hover 出现的 admin 操作（持久化★/归档/删除）。顶部搜索框实时按 title 过滤；服务器切换条（点击展开 ServerModal 或内联列表）放搜索框下方。
- **标签栏**（R2）：位于终端区正上方。标签为圆角卡片（`rounded-t-lg`），活动态 `bg-canvas` + 顶部 accent 指示条，非活动 `bg-surface` 半透明 + hover `bg-surface-highlight`。含状态点 + 标题 + hover 关闭 ✕。末尾 `+` 新建按钮。横向 `overflow-x-auto`。
- **停靠面板**（R3）：DockPanel 包裹 FileManager/AIPanel。左边缘有 4px 拖拽手柄（`cursor-col-resize`），拖动改 `width`（clamp 到 `[minWidth, maxWidth]`）。右上角收起按钮 → `collapsed=true` 时面板宽度坍缩为 0（或仅留一个边缘图标条，点击恢复）。宽度写入 settingsStore 持久化。

## 3. 样式系统统一

### Token 策略
全量使用 `tailwind.config.js` 已定义的语义 token，不新增色板：

| 用途 | token | 当前硬编码值（待替换） |
|---|---|---|
| 最底层背景 | `bg-canvas` | `#0e0e12` / `#09090b` |
| 面板背景 | `bg-surface` | `#1a1a1f` |
| 列表/次级面板 | `bg-surface-highlight` | `#222229` / `#2a2a32` |
| 状态点 active | `bg-success` | `bg-green-500` |
| 状态点 detached | `bg-warning` | `bg-yellow-500` |
| 状态点 ghost | `bg-text-secondary` | `bg-gray-600` |
| AI tag 映射色 | `bg-accent`/`bg-warning`/`bg-error`/`bg-success` | `bg-blue-500`/`bg-cyan-500`/`bg-red-500`/`bg-orange-500` |

### 统一映射函数
新建 `client/src/utils/statusColor.ts`，导出单一 `getStatusDotColor(opts)`，被 Sidebar、TabBar、App 共用，消除三处重复的 `getDotColor`/`getSummaryColor`/`getTagDotColor`。

```ts
export type DotSource =
  | { kind: 'ai'; tag: string }
  | { kind: 'session'; state: 'active' | 'detached'; isGhost?: boolean };

const TAG_MAP: Record<string, string> = {
  '完毕': 'bg-success', '进行': 'bg-accent', '需确认': 'bg-warning',
  '需输入': 'bg-warning', '需选择': 'bg-warning', '错误': 'bg-error',
  '等待': 'bg-accent', '自动处理': 'bg-accent', '休眠中': 'bg-text-secondary',
  '目标偏离': 'bg-error',
};

export function getStatusDotColor(src: DotSource): string {
  if (src.kind === 'ai') return TAG_MAP[src.tag] || 'bg-text-secondary';
  if (src.isGhost) return 'bg-text-secondary';
  return src.state === 'active' ? 'bg-success' : 'bg-warning';
}
```

### index.html 清理
`<body class="bg-black text-white overflow-hidden">` → `<body class="overflow-hidden">`（颜色由 `index.css` 的 `html,body,#root` 统一用 token 控制）。

### static.css 约束
新增 Tailwind 类（如 DockPanel 拖拽手柄、TabBar 圆角卡片）后，必须 `cd client && npm run build` 重新生成 `public/static.css`，否则 WebKitGTK 下新类不生效。

## 4. 数据流与状态

- `activeSection: 'sessions' | 'files' | 'ai' | 'settings'` 仍在 App.tsx。
- sessions 列表 state + 轮询（30s）+ 增删操作从现 Sidebar 迁移到重写后的 Sidebar。
- DockPanel 宽度/收起态：`settingsStore` 新增 `sidePanelWidth: number`（默认 320）、`sidePanelCollapsed: boolean`（默认 false），加入 `partialize` 白名单与 `DEFAULT_SETTINGS`。
- 服务器切换：复用现 `ServerModal`，但入口从 ActivityBar 底部按钮改为 Sidebar 顶部切换条（点击展开 modal）。切换后仍 `window.location.reload()`（保持现行为，R6 不变）。

## 5. 兼容性与迁移

- **无数据迁移**：settingsStore 新字段有默认值，旧持久化数据缺少字段时走默认（persist merge 已是 `{...current, ...persisted}`）。
- **无 API 变更**：所有 `api.*` 调用保持原样。
- **功能守恒清单**（R6）：认证流程、`socket.connectWithToken`、`api.attachSession`、AI 轮询 10s、`socket.onControl` 事件分发、Settings 六 tab 保存——逻辑代码原样保留，只动 JSX/className。
- **回滚**：改动集中在 `client/src`，回滚即 `git checkout client/src`。无后端/构建配置变更。

## 6. 关键取舍

- **标签拖拽重排不做**（Out of Scope）：R2 仅 browser 风格视觉，避免引入 dnd 依赖与复杂度。
- **面板收起策略**：选"坍缩为 0 + ActivityBar 图标高亮指示当前面板"而非"留窄图标条"，因为 ActivityBar 已有 Files/AI 入口，收起后点图标即可恢复，更干净。
- **服务器切换不做成内联树**：保持现 `ServerModal` 弹窗，仅改入口位置，降低改动面。
- **死代码处理**：`SessionPicker.tsx` 删除（其搜索/时间格式化逻辑抽取到 utils 复用）；旧 `TabBar.tsx` 重写后接线（而非另建新文件），保留文件名减少 import 改动。
