# 分屏 UI 细节微调

## Goal

在已提交的分屏美术基础上，按用户反馈做三处细节调整，让 pane 之间更有呼吸感、标题栏更干净、分屏边界更明显。

## Requirements

1. 每个分屏（pane）内部四周增加少量 padding，不要让 terminal/surface 完全占满整个 pane 区域。
2. 去掉 pane 标题栏下方的水平分割线，仅靠标题栏背景色与 body 区域自然区分。
3. 分屏交界处的分隔线（Divider）适当加宽，提升边界可见性。

## Acceptance Criteria

- [x] `SplitPane` 根容器带有统一的小 padding `p-1.5`，terminal 不会贴到 pane 边缘。
- [x] Pane header 不再使用 `border-b` 与 body 分隔；通过 `bg-surface-highlight/30`（inactive）或 `bg-accent/8`（active）与 body 背景区分。
- [x] `Divider` 视觉宽度从 `w-0.5/h-0.5` 增加到 `w-1/h-1`，hover/drag 状态颜色保持 accent 反馈。
- [x] `npm run build` 通过。
- [x] 仅改动 `client/src/components/SplitView.tsx`。

## Out of Scope

- 不改 pane 标题栏高度、字体、active indicator 形状。
- 不改 snap overlay、空 pane / connecting 占位。
- 不改 store / socket / TerminalView / TabBar。
