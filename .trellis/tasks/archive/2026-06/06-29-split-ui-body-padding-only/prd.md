# 分屏正文区独立 padding

## Goal

将分屏 pane 的内边距从根容器下移到正文区域，使标题栏保持顶边贴齐，正文区域保留呼吸空间。

## Requirements

1. `SplitPane` 根容器不再设置整体 padding。
2. Pane 标题栏保持原有 `px-2` 水平内边距，垂直方向无额外 pane padding。
3. Pane 正文区域（body）设置 `p-1.5` 内边距，terminal / 空 pane / connecting 占位均在该 padding 内部。
4. 保持现有 active/inactive 标题栏背景色、左边框 accent 指示、分隔线宽度与颜色不变。

## Acceptance Criteria

- [x] `SplitPane` 根容器移除 `p-1.5`。
- [x] 正文容器带有 `p-1.5`，TerminalView 不贴 pane 边缘。
- [x] 标题栏没有 pane 级上下内边距，保持紧凑贴顶。
- [x] `npm run build` 通过。
- [x] 仅改动 `client/src/components/SplitView.tsx`。

## Out of Scope

- 不改标题栏高度、字体、颜色。
- 不改分隔线、snap overlay、空 pane / connecting 占位内容。
- 不改 store / socket / TerminalView / TabBar。
