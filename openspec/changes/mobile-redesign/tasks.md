# Tasks: Mobile Terminal Complete Redesign

## Phase 0: 准备工作

### Task 0.1: 清理旧移动端代码
- **操作**: 备份并删除现有 `routes/mobile/` 目录（保留作为参考）
- **命令**: `mv routes/mobile routes/mobile.bak`
- **验证**: 旧代码不再被引用

### Task 0.2: 创建新目录结构
- **操作**: 创建新的移动端目录结构
- **文件**:
  ```
  routes/mobile/
  ├── MobileShell.tsx
  ├── components/
  │   ├── StatusBar.tsx
  │   ├── ConnectionIndicator.tsx
  │   ├── MobileTerminalLayer.tsx
  │   ├── TouchScrollHandler.ts
  │   ├── ScrollToBottomButton.tsx
  │   ├── KeyboardBar.tsx
  │   ├── KeyboardPanel.tsx
  │   └── ImeController.ts
  └── hooks/
      └── useConnectionStatus.ts
  ```
- **验证**: 目录结构存在

---

## Phase 1: 根容器与布局 (MobileShell)

### Task 1.1: 创建 MobileShell 根容器
- **文件**: `routes/mobile/MobileShell.tsx`
- **实现**:
  ```typescript
  // 固定布局：100dvh, flex-col, portrait-only
  // 子组件：StatusBar, MobileTerminalLayer, KeyboardBar
  ```
- **CSS 约束**:
  - `height: 100dvh`
  - `display: flex; flex-direction: column`
  - `touch-action: none`
  - `background: #000000`
- **验证**: 组件渲染，占满全屏

### Task 1.2: 集成路由入口
- **文件**: `App.tsx` 或路由配置
- **修改**: 移动端路由指向新的 `MobileShell`
- **验证**: 移动端访问显示新布局

---

## Phase 2: 状态栏 (StatusBar)

### Task 2.1: 创建 ConnectionIndicator 组件
- **文件**: `components/ConnectionIndicator.tsx`
- **Props**: `status: 'connecting' | 'connected' | 'disconnected'`
- **实现**:
  - connecting: 黄色闪烁圆点 `#EAB308`
  - connected: 绿色实心圆点 `#22C55E`
  - disconnected: 红色空心圆点 `#EF4444`
- **验证**: 三种状态视觉正确

### Task 2.2: 创建 StatusBar 组件
- **文件**: `components/StatusBar.tsx`
- **高度**: 40px 固定
- **内容**:
  - 左侧: ConnectionIndicator + 状态文本
  - 右侧: Logout 按钮
- **断线样式**: 背景 `rgba(239, 68, 68, 0.2)`
- **验证**: 状态栏显示正确

### Task 2.3: 创建 useConnectionStatus hook
- **文件**: `hooks/useConnectionStatus.ts`
- **实现**: 订阅 `socket.onOpen/onClose/onError`
- **返回**: `{ status, reconnect }`
- **验证**: 状态与 socket 同步

---

## Phase 3: 终端交互层 (MobileTerminalLayer)

### Task 3.1: 创建 MobileTerminalLayer 容器
- **文件**: `components/MobileTerminalLayer.tsx`
- **布局**: `flex: 1`, 占据剩余空间
- **子组件**: TerminalView, ScrollToBottomButton
- **验证**: 终端正确渲染

### Task 3.2: 迁移 TouchScrollHandler
- **文件**: `components/TouchScrollHandler.ts`
- **来源**: 复用 `mobile.bak/components/MobileTerminalHandler.ts` 的滚动逻辑
- **参数**:
  - DECAY_FACTOR: 0.95
  - MAX_VELOCITY: 2 px/ms
  - STOP_THRESHOLD: 0.1 px/ms
  - PIXELS_PER_LINE: 20
- **验证**: 触摸滚动 + 惯性工作正常

### Task 3.3: 创建 ScrollToBottomButton
- **文件**: `components/ScrollToBottomButton.tsx`
- **位置**: 右下角，距 KeyboardBar 上方 16px
- **显示条件**: 滚动位置不在底部
- **点击**: `term.scrollToBottom()`
- **验证**: 按钮显隐正确，点击回到底部

---

## Phase 4: 虚拟键盘 (KeyboardBar + KeyboardPanel)

### Task 4.1: 创建 KeyboardBar 主栏
- **文件**: `components/KeyboardBar.tsx`
- **高度**: 48px + safe-area-inset-bottom
- **按钮**: INPUT | CTRL | ALT | ESC | TAB | ↑ | ↓ | ▼展开
- **按钮尺寸**: 最小 44×48px
- **验证**: 所有按钮可点击

### Task 4.2: 实现修饰键状态显示
- **文件**: `components/KeyboardBar.tsx`
- **来源**: 订阅 `keyboardStore.modifiers`
- **样式**:
  - idle: `bg-gray-800`
  - latched: `border-2 border-blue-500`
  - locked: `bg-blue-600`
- **验证**: 状态视觉反馈正确

### Task 4.3: 创建 KeyboardPanel 展开面板
- **文件**: `components/KeyboardPanel.tsx`
- **高度**: 200px
- **内容**: 方向键区 + 功能键区 (F1-F10) + 特殊键区
- **动画**: 展开/收起 200ms 过渡
- **验证**: 展开/收起动画流畅

### Task 4.4: 集成展开逻辑
- **文件**: `components/KeyboardBar.tsx`
- **状态**: `isPanelOpen: boolean`
- **按钮**: ▼/▲ 图标切换
- **验证**: 面板展开/收起正确

---

## Phase 5: 输入法控制 (ImeController)

### Task 5.1: 创建 ImeController hook
- **文件**: `components/ImeController.ts`
- **功能**:
  - 管理 `isInputActive` 状态
  - 控制 textarea 聚焦/失焦
  - 监听 visualViewport 变化同步状态
- **验证**: INPUT 按钮控制输入法显隐

### Task 5.2: 禁用 xterm 自动聚焦
- **文件**: `components/MobileTerminalLayer.tsx`
- **实现**:
  - TerminalView 传入 `disableClickFocus={true}`
  - textarea 添加 `data-allow-focus` 属性
  - focus 事件中检查属性，非显式触发时 blur
- **验证**: 点击终端不弹出输入法

### Task 5.3: 实现 INPUT 按钮
- **文件**: `components/KeyboardBar.tsx`
- **实现**:
  - 点击时调用 `imeController.toggleInput()`
  - 激活时显示 "HIDE"，否则显示 "INPUT"
  - 激活时按钮高亮 `bg-green-600`
- **验证**: 按钮控制输入法，状态同步

---

## Phase 6: 集成与连接

### Task 6.1: 集成 WebSocket 连接流程
- **文件**: `MobileShell.tsx`
- **实现**:
  - 复用现有 `api.attachSession()` 和 `socket.connectWithToken()`
  - 认证流程保持不变
- **验证**: 连接成功显示终端

### Task 6.2: 实现断线重连
- **文件**: `components/StatusBar.tsx`
- **实现**:
  - 断线时状态栏显示 "点击重连"
  - 点击触发 `reconnect()`
- **验证**: 断线后可重连

### Task 6.3: 集成键盘输入发送
- **文件**: `components/KeyboardBar.tsx`
- **实现**:
  - 所有按键通过 `socket.sendInput()` 发送
  - 修饰键通过 `keyboardStore` 管理
- **验证**: 所有按键输入正常

---

## Phase 7: 样式与优化

### Task 7.1: 应用深色主题
- **文件**: 所有组件
- **样式**:
  - 背景: `#000000`
  - 按钮: `bg-gray-800`, `active:bg-gray-700`
  - 文本: `text-gray-300`
- **验证**: 视觉统一

### Task 7.2: 添加过渡动画
- **文件**: 所有交互组件
- **动画**: `transition-all duration-200`
- **验证**: 过渡流畅

### Task 7.3: 性能优化
- **检查点**:
  - 惯性滚动帧率 >= 60fps
  - 无内存泄漏（动画清理）
  - 无重复渲染
- **验证**: Chrome DevTools Performance 面板

---

## Phase 8: 测试

### Task 8.1: 单元测试
- **覆盖**:
  - TouchScrollHandler 惯性逻辑
  - ImeController 状态机
  - useConnectionStatus hook
- **验证**: 所有测试通过

### Task 8.2: 真机测试
- **设备**: iOS Safari, Android Chrome
- **测试项**:
  - 触摸滚动 + 惯性
  - 输入法控制
  - 断线重连
  - 键盘输入
- **验证**: 两平台功能正常

---

## 任务依赖图

```
Phase 0 ─┬─> Phase 1 ─> Phase 2 ─┐
         │                        ├─> Phase 6 ─> Phase 7 ─> Phase 8
         └─> Phase 3 ─> Phase 4 ─┘
                   │
                   └─> Phase 5
```

---

## 预估工作量

| Phase | 任务数 | 复杂度 |
|-------|--------|--------|
| Phase 0 | 2 | 低 |
| Phase 1 | 2 | 低 |
| Phase 2 | 3 | 低 |
| Phase 3 | 3 | 中 |
| Phase 4 | 4 | 中 |
| Phase 5 | 3 | 中 |
| Phase 6 | 3 | 低 |
| Phase 7 | 3 | 低 |
| Phase 8 | 2 | 中 |
| **总计** | **25** | - |
