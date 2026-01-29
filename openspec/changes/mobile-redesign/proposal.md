# OpenSpec Proposal: Mobile Terminal Complete Redesign

## Context

WinTerm Bridge 是一个终端桥接应用，当前移动端需要完全重构以提升易用性和美观性。用户期望：
- 完全重新设计 UI 界面（保留 WebSocket 交互层）
- 利用 tmux 鼠标支持实现滚动历史查看
- 极简风格的虚拟键盘工具栏
- 仅支持竖屏模式

### 现有技术栈
- **前端框架**: React + TypeScript + Tailwind CSS
- **终端渲染**: xterm.js + FitAddon
- **WebSocket**: ttyd 协议（MUST NOT 修改）
- **状态管理**: Zustand (persist)
- **手势库**: @use-gesture/react（已安装）

### 保留的核心模块
| 模块 | 路径 | 说明 |
|------|------|------|
| SocketService | `shared/core/socket.ts` | ttyd WebSocket 协议实现 |
| API | `shared/core/api.ts` | 后端 REST API 调用 |
| TerminalView | `shared/components/TerminalView.tsx` | xterm.js 封装 |
| settingsStore | `shared/stores/settingsStore.ts` | 持久化设置 |
| keyboardStore | `shared/stores/keyboardStore.ts` | 修饰键状态机 |

---

## Requirements

### R1: 全新移动端布局架构

**用户故事**: 作为移动端用户，我希望有一个专为手机设计的简洁界面，专注于终端操作。

**验收场景**:
- [ ] 竖屏全屏布局，无多余边距
- [ ] 顶部状态栏：连接状态指示 + 最小化操作按钮
- [ ] 中部终端区域：占据主要空间，支持触摸滚动
- [ ] 底部工具栏：极简虚拟键盘 + 可展开面板

**技术约束**:
- MUST: 使用 CSS `dvh` 单位处理移动端视口
- MUST: 锁定竖屏方向（portrait-only）
- MUST NOT: 修改 SocketService 的 WebSocket 协议实现
- SHOULD: 使用 CSS-in-JS 或 Tailwind 实现响应式样式

---

### R2: tmux 鼠标滚动支持

**用户故事**: 作为移动端用户，我希望通过滑动手势浏览 tmux 历史输出。

**验收场景**:
- [ ] 单指上下滑动触发 tmux copy-mode 滚动
- [ ] 滑动距离与滚动行数成比例
- [ ] 惯性滚动：快速滑动后继续滚动
- [ ] 触摸立即中断惯性滚动
- [ ] 滚动时显示"返回底部"悬浮按钮

**技术约束**:
- MUST: 通过 `term.scrollLines()` 实现滚动（利用 xterm.js 内置）
- MUST: 惯性动画使用 requestAnimationFrame
- MUST: 速度衰减系数 0.95，最大速度 2px/ms，停止阈值 0.1px/ms
- MUST NOT: 发送鼠标转义序列到 tmux（仅使用 xterm 本地滚动）
- SHOULD: 使用现有 MobileTerminalHandler 的惯性滚动实现

---

### R3: 极简虚拟键盘工具栏

**用户故事**: 作为移动端用户，我希望工具栏简洁，仅显示最常用按键。

**验收场景**:
- [ ] 主栏高度 44px，包含核心按钮
- [ ] 核心按钮：INPUT | CTRL | ALT | ESC | TAB | ↑ | ↓
- [ ] 展开按钮：点击展开完整快捷键面板
- [ ] 展开面板：方向键区 + 功能键区 + 数字键区
- [ ] 按钮触摸区域最小 44×44px（无障碍标准）

**技术约束**:
- MUST: 按钮最小触摸区域 44×44px
- MUST: INPUT 按钮控制系统输入法显隐
- MUST: CTRL/ALT 修饰键支持 sticky 和 locked 状态
- MUST NOT: 破坏现有修饰键状态机逻辑
- SHOULD: 使用 Tailwind 的 `active:` 状态提供触觉反馈

---

### R4: 输入法控制机制

**用户故事**: 作为移动端用户，我希望自己控制何时弹出输入法，避免误触。

**验收场景**:
- [ ] 点击终端区域不弹出输入法
- [ ] 点击 INPUT 按钮弹出/收起输入法
- [ ] 输入法激活时 INPUT 按钮高亮显示
- [ ] IME 中文输入正常工作
- [ ] 系统收起输入法时按钮状态同步

**技术约束**:
- MUST: 禁用 xterm textarea 自动聚焦
- MUST: 使用 visualViewport API 检测键盘可见性
- MUST: 保持 textarea 在 DOM 中用于接收 IME 输入
- MUST NOT: 使用 `readonly` 属性（会破坏 IME）

---

### R5: 视觉设计语言

**用户故事**: 作为移动端用户，我希望界面美观、现代、专业。

**验收场景**:
- [ ] 深色主题为主（终端原生黑色背景）
- [ ] 状态栏使用渐变或毛玻璃效果
- [ ] 按钮有明显的按下反馈
- [ ] 连接状态使用颜色编码（绿/黄/红）
- [ ] 过渡动画流畅（< 300ms）

**技术约束**:
- MUST: 终端背景保持纯黑 `#000000`
- MUST: 使用系统字体栈减少加载时间
- SHOULD: 毛玻璃效果使用 `backdrop-filter: blur()`
- SHOULD: 过渡动画使用 `transition-duration: 200ms`

---

## Dependencies

| 依赖 | 版本 | 用途 | 变更 |
|------|------|------|------|
| xterm | 5.3.0 | 终端渲染 | 保留 |
| xterm-addon-fit | 0.8.0 | 自适应尺寸 | 保留 |
| @use-gesture/react | 10.3.0 | 手势识别 | 保留 |
| zustand | 4.5.0 | 状态管理 | 保留 |
| tailwindcss | 3.x | 样式 | 保留 |
| clsx | - | 条件类名 | 保留 |

**无需新增依赖**

---

## Risks

| 风险 | 严重性 | 缓解措施 |
|------|--------|----------|
| iOS Safari 视口计算差异 | 高 | 使用 `visualViewport` API + `dvh` 单位 |
| 触摸滚动与系统手势冲突 | 中 | 终端区域使用 `touch-action: none` |
| 输入法高度变化影响布局 | 中 | 使用 `useViewport` hook 动态调整高度 |
| xterm 默认聚焦行为 | 低 | 使用 `disableClickFocus` + data 属性控制 |

---

## Success Criteria

1. **性能**: 滚动/滑动帧率 >= 60fps
2. **可用性**: 所有触摸目标 >= 44×44px
3. **稳定性**: WebSocket 连接保持与原版一致
4. **美观性**: 用户主观评价"现代、专业"
5. **代码质量**: 新代码通过 TypeScript 严格检查

---

## Confirmed Constraints (User Decisions)

| 决策点 | 确认值 | 理由 |
|--------|--------|------|
| 重构范围 | 完全重新设计 UI | 用户明确要求 |
| tmux 鼠标功能 | 仅滚动历史 | 用户选择 |
| 虚拟键盘风格 | 极简 | 用户选择 |
| 屏幕方向 | 仅竖屏 | 用户选择 |
| WebSocket 协议 | 不修改 | 用户要求保留 |

---

## Out of Scope

- 桌面端 UI 修改
- 后端 API 修改
- ttyd WebSocket 协议修改
- 横屏模式支持
- tmux 点击选择功能
- tmux 文本选择复制功能
- 自定义键盘布局功能
