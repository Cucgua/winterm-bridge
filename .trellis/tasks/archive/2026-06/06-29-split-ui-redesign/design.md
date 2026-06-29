# 分屏会话 UI 美术重设计 — 技术设计

## 架构与边界

- **改动范围**：仅 `client/src/components/SplitView.tsx` 的 JSX 结构与 Tailwind className。
- **不涉及**：
  - `client/src/stores/splitStore.ts` 的数据结构与 mutation 逻辑。
  - `client/src/core/socketManager.ts` 的连接生命周期。
  - `client/src/components/TerminalView.tsx` 的渲染与输入行为。
  - `client/src/components/TabBar.tsx` 的 split tab 标签样式。
  - 主题变量（`themeRegistry.ts`、`tailwind.config.js`、`index.css`）。

## 数据流与契约

- `SplitView` 接收 `root`、`activePaneId`、`sessionMap`、`onSessionDropped`、`onClosePane` 等 props，全部保持不变。
- `SplitNodeView` 递归渲染容器节点；容器节点通过 `flex` + `ratio` 控制子节点尺寸， Divider 组件通过 pointer events 调整 ratio。
- `SplitPane` 叶子节点渲染 header + body：
  - body：已连接 session 渲染 `TerminalView`；未连接显示 connecting；空 pane 显示 drop hint。
  - 拖拽 session 到 pane 上时，通过 `useDragState` 与 `computeSnapZone` 计算 snap zone，渲染 overlay。
- 本次改动只调整 className 与局部 DOM（空/connecting 占位），不修改事件处理、状态更新或 WebSocket 调用。

## 视觉设计决策

### 1. 容器与分隔线

- 移除容器级 `gap-1 p-1`，改为 `bg-canvas` 作为统一背景。
- pane 之间使用 2px 分隔线（`w-0.5` / `h-0.5`），颜色 `bg-theme-border/10`。
- 分隔线 hover：`bg-accent/40`；dragging：`bg-accent/60`。
- 增大抓取热区：分隔线实际视觉 2px，热区保持 `inset-y-0 -left-2 -right-2`（横向）或 `inset-x-0 -top-2 -bottom-2`（纵向）。

### 2. Pane 外壳

- pane 外层：
  - 背景 `bg-surface`。
  - 边框仅在需要时使用 `border-theme-border/8`，或完全依赖背景层级与分隔线。
  - 圆角 `rounded-lg`（8px）。
- active pane：
  - 标题栏左侧 2px accent 边线（`border-l-2 border-accent`）。
  - 标题栏背景 `bg-accent/8` 左右加深，前景 `text-text-primary`。
  - body 区域可选 `ring-1 ring-inset ring-accent/25` 保持 subtle active glow。
- inactive pane：
  - 标题栏背景 `bg-surface-highlight/30`，前景 `text-text-secondary/70`。

### 3. Pane 标题栏

- 高度保持 `h-7`（28px），紧凑。
- 左侧：状态点（connected `bg-success` / empty `bg-text-tertiary/25`）+ 标题文字。
- 右侧：关闭按钮，默认 `text-text-tertiary/40`，hover `text-error` + `bg-surface-highlight/50`。
- active 状态关闭按钮颜色提升到 `text-text-secondary/70`。

### 4. 空 pane 与 connecting

- 空 pane：
  - 居中图标（拖拽/屏幕图标 SVG）+ `split_drop_hint` 文字。
  - 颜色 `text-text-tertiary/40`。
- connecting：
  - 脉冲点（animate-pulse）+ `connecting…` 文字。
  - 颜色 `text-text-tertiary/50`。

### 5. Drag-snap overlay

- 保持四向半区高亮逻辑，但 overlay 形状改为 inset 更小、圆角与 pane 一致（`rounded-lg`）。
- 颜色 `bg-accent/15` + `border border-accent/50`（不再使用 2px 粗边框）。
- 添加 `transition-all duration-150 ease-out`，让形状切换更柔和。

## 兼容性与迁移

- 所有 className 改动均为纯视觉，不影响事件绑定、ref、state 或 props。
- 如果效果不如预期，可直接 revert `SplitView.tsx` 到改动前版本；其他文件未改。
- 需要验证当前已有未提交的 `SplitView.tsx` 为基线，确保在基线之上修改。

## 权衡

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| 完全无边框 | 最沉浸 |  pane 边界在复杂布局中难辨认 | 否 |
| 保留 subtle 边框 + 分隔线 | 边界清晰且不过度破碎 | 需要精细调整颜色透明度 | 是 |
| 标题栏加粗/变大 | active 状态更显眼 | 占用终端垂直空间 | 否，保持 h-7 |
| 空 pane 显示大图标 | 引导性强 | 可能显得花哨 | 否，使用 16–20px 小图标 |

