# 分屏标题栏颜色与主题色区分

## Goal

让分屏 pane 标题栏的背景色与主题 accent 色做出区分，同时保持 active/inactive 状态可辨识。

## Requirements

1. Active pane 标题栏背景不再使用直接的 `bg-accent/8` 填充。
2. Active pane 标题栏改用 surface 层级的 subtle 色调（如 `bg-surface-highlight/50` 或 `bg-surface-elevated`），与 inactive pane 形成轻微对比。
3. Active pane 仍保留 `border-l-accent` 左侧边线作为明确的状态指示，文字仍使用 `text-text-primary`。
4. Inactive pane 标题栏保持安静的 surface 色调（如 `bg-surface-highlight/25`）。

## Acceptance Criteria

- [x] Active pane header 背景使用 surface 系列 token，不再是 `bg-accent/8`。
- [x] Active pane header 仍保留左侧 accent 边线。
- [x] Inactive pane header 使用比 active 更淡的 surface 色调，二者有可见区分。
- [x] 标题栏高度、文字、状态点、关闭按钮均不变。
- [x] `npm run build` 通过。
- [x] 仅改动 `client/src/components/SplitView.tsx`。

## Out of Scope

- 不新增 CSS 变量或 theme token。
- 不改 pane padding、分隔线、snap overlay、空 pane / connecting 占位。
- 不改 store / socket / TerminalView / TabBar。
