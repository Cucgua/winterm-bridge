# 分屏分隔线收窄并透明化

## Goal

让分屏 pane 之间的分隔线更低调：视觉上更窄、默认更透明，只在 hover 或拖拽时给出清晰的交互反馈。

## Requirements

1. `Divider` 视觉宽度从当前 `w-1/h-1` 收窄到 `w-0.5/h-0.5`。
2. 默认状态颜色大幅透明化，例如 `bg-theme-border/5` 或 `bg-transparent`。
3. Hover 状态使用 subtle accent（如 `bg-accent/35`），dragging 状态保持清晰（如 `bg-accent/60`）。
4. 抓取热区保持足够宽度，不因为视觉变细而难操作。

## Acceptance Criteria

- [x] `Divider` 视觉尺寸为 `w-0.5/h-0.5`。
- [x] 默认颜色为 `bg-theme-border/5`。
- [x] Hover 颜色为 `bg-accent/35`，dragging 颜色为 `bg-accent/60`。
- [x] 热区仍保持 `±8px` 左右。
- [x] `npm run build` 通过。
- [x] 仅改动 `client/src/components/SplitView.tsx`。

## Out of Scope

- 不改 pane padding、标题栏、snap overlay、空 pane / connecting 占位。
- 不改 store / socket / TerminalView / TabBar。
