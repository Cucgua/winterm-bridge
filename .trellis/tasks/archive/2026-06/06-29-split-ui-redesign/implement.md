# 分屏会话 UI 美术重设计 — 执行计划

## 前置条件

- 已读取相关 spec：`visual-style.md`、`component-guidelines.md`。
- 已确认基线文件：`client/src/components/SplitView.tsx`（git status `??`，当前为最新未提交实现）。
- 主题 token 已存在，无需新增 CSS 变量。

## 实施清单

1. **备份与基线确认**
   - [ ] 复制当前 `SplitView.tsx` 到临时路径作为回滚备份（不提交到仓库）。
   - [ ] 确认 `npm run build` 在改动前可通过（基线无编译错误）。

2. **容器与分隔线调整**
   - [ ] `SplitNodeView` 容器：移除 `gap-1 p-1`，背景改为 `bg-canvas`。
   - [ ] `Divider`：视觉宽度改为 `w-0.5/h-0.5`，默认颜色 `bg-theme-border/10`，hover `bg-accent/40`，dragging `bg-accent/60`。
   - [ ] 保持热区大于视觉宽度，便于鼠标抓取。

3. **Pane 外壳与标题栏重设计**
   - [ ] `SplitPane` 外层：背景 `bg-surface`，圆角 `rounded-lg`，边框改为 `border-theme-border/8` 或完全移除。
   - [ ] active pane：标题栏左侧加 `border-l-2 border-accent`，背景 `bg-accent/8`，前景 `text-text-primary`。
   - [ ] inactive pane：标题栏背景 `bg-surface-highlight/30`，前景 `text-text-secondary/70`。
   - [ ] 关闭按钮 hover 颜色与背景按设计调整。

4. **空 pane 与 connecting 状态**
   - [ ] 空 pane：添加小图标（拖拽/屏幕 SVG）+ `split_drop_hint` 文字，颜色 `text-text-tertiary/40`。
   - [ ] connecting：添加脉冲点 + `connecting…` 文字，颜色 `text-text-tertiary/50`。

5. **Drag-snap overlay 优化**
   - [ ] 将 overlay 的 `border-2` 改为 `border`，颜色 `border-accent/50`。
   - [ ] 背景改为 `bg-accent/15`。
   - [ ] 统一圆角 `rounded-lg`，过渡 `transition-all duration-150 ease-out`。

6. **构建与视觉验证**
   - [ ] 运行 `npm run build` 通过 TypeScript 与 Vite 构建。
   - [ ] 运行 `npx tsc --noEmit`（或 `npm run build` 已包含 tsc）确认无类型错误。
   - [ ] 通过 `npm run dev` 启动桌面客户端，验证分屏创建、拖拽分屏、关闭 pane、active 切换、空 pane 提示、分隔线拖拽等交互。

## 验证命令

```bash
cd client
npm run build
```

## 风险文件与回滚点

- **高风险文件**：`client/src/components/SplitView.tsx`（唯一改动文件）。
- **回滚方式**：`git checkout -- client/src/components/SplitView.tsx` 或从备份复制回原始内容。

## 开始实施前检查

- [ ] `prd.md` 与 `design.md` 已写毕。
- [ ] 用户已审阅并同意规划，或明确指示开始实施。
