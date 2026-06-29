# 分屏会话 UI 美术重设计

## Goal

提升 WinTerm Bridge 分屏会话（Split View）的视觉品质，让多 pane 工作区看起来更专业、更沉浸，同时保持现有 Termius 风格的暗色层级表面和紧凑控件语言。

用户价值：减少当前分屏布局中破碎的边框、过细的分隔线、暗淡的空 pane 提示所带来的“廉价感”，让开发者长时间工作时界面更安静、更易扫描。

## Background / Confirmed Facts

- 分屏组件入口为 `client/src/components/SplitView.tsx`（新增未提交文件，git status `??`）。
- 分屏状态机位于 `client/src/stores/splitStore.ts`：二叉树布局、每个 pane 可绑定一个 session 或保持空、支持拖拽边缘分屏。
- 当前视觉实现（基于 `SplitView.tsx` 检查）：
  - 容器使用 `flex gap-1 bg-surface p-1`，导致 pane 之间有明显间隙。
  - 每个 pane 使用 `rounded-md border border-theme-border bg-canvas`，多个圆角边框叠加显得破碎。
  - active pane 只有 `ring-1 ring-inset ring-accent/40`，区分度弱。
  - 分隔线（Divider）宽度仅 `w-1/h-1`，hover 时才显示 `bg-accent/30`，默认几乎不可见。
  - pane header 高 `h-7`，active/inactive 状态使用 `bg-accent/10` 与 `bg-surface`，对比不够。
  - 空 pane 提示仅显示暗淡文字 `split_drop_hint`，没有图标，引导性弱。
  - connecting 状态同样只有暗淡文字。
  - drag-snap overlay 使用 `bg-accent/25 border-2 border-accent/60`，形状切换有 `transition-all` 但略显生硬。
- 主题系统通过 `client/src/utils/themeRegistry.ts` + `client/src/index.css` + `client/tailwind.config.js` 提供语义 token：`bg-canvas`、`bg-surface`、`bg-surface-highlight`、`bg-surface-elevated`、`border-theme-border`、`text-text-primary/secondary/tertiary`、`bg-accent`、`text-success` 等。
- 视觉风格指南要求：Termius-like、暗色层级表面、紧凑控件、subtle borders、不用 component-local raw colors、无营销式装饰。

## Requirements

1. **整体布局更沉浸**
   - 减少 pane 之间的外边框与间隙，让多个终端表面在视觉上更连贯。
   - 分隔线在默认状态下应可见但不抢眼；hover 和拖拽时给出清晰的 accent 反馈。

2. **Pane 外壳与标题栏**
   - pane 使用更 subtle 的边框或仅通过背景层级区分，避免多个粗圆角叠加。
   - 标题栏保持紧凑，但 active pane 的标题栏必须有明确的状态指示（accent 色调 + 清晰的前景对比）。
   - 标题栏文字、状态点、关闭按钮在视觉层级上更协调。

3. **空 pane 与 loading 状态**
   - 空 pane 显示图标 + 文字组合，提示用户拖拽 session 进入。
   - connecting 状态显示 loading indicator + 文字，避免纯文本的“半成品”感。

4. **Drag-snap 反馈**
   - 拖拽 session 到 pane 边缘或中心时，overlay 形状与过渡更柔和、更现代。
   - 使用 theme accent token，不引入新的颜色。

5. **兼容性与约束**
   - 保持现有 `SplitViewProps`、`SplitNode` 数据结构和行为不变。
   - 不使用 `as any`、`@ts-ignore` 或 `@ts-expect-error`。
   - 所有新样式必须使用语义 theme token，禁止在组件内硬编码颜色。
   - 保持 `npm run build` 通过。

## Acceptance Criteria

- [x] 分屏容器不再使用 `gap-1 p-1` 造成明显间隙；pane 之间通过分隔线或 subtle 边框区分。
- [x] 分隔线默认可见（如 `bg-theme-border/10`），hover 时为 `bg-accent/40`，拖拽 `bg-accent/60`，并仍保证易抓取。
- [x] Pane 圆角统一且不叠加产生破碎感；active pane 有清晰的 accent 边框/背景指示。
- [x] Pane header 在 active 状态下使用 accent 背景色调与清晰的前景对比；inactive 状态保持安静。
- [x] 空 pane 显示图标 + 国际化提示文字 `split_drop_hint`。
- [x] Connecting 状态显示 spinner/脉冲点 + 文字。
- [x] Drag-snap overlay 使用半透明 accent 区域，形状过渡柔和，不遮挡整个 pane。
- [x] `npm run build` 在 `client/` 目录下通过，无 TypeScript 错误。
- [x] 不改动 `splitStore.ts` 数据结构或分屏逻辑；仅调整 `SplitView.tsx` 样式与少量 JSX 结构。

## Out of Scope

- 不新增动画库或第三方依赖。
- 不改移动端分屏布局（当前分屏为桌面功能）。
- 不改 `TabBar.tsx` 中 split tab 的外观。
- 不改主题变量或新增主题。
- 不改 WebSocket / PTY / TerminalView 行为。

## Open Questions

- 已解决：active pane 标题栏使用 `bg-accent/8` 填充 + 左侧 `border-l-accent` 边线，inactive 时使用透明左边框保持布局稳定。
