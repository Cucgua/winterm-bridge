# Specs: Mobile Terminal Complete Redesign

## Spec 1: 组件架构分层

### 组件树结构

```
MobileShell (根容器)
├── StatusBar (顶部状态栏)
│   ├── ConnectionIndicator (连接状态指示)
│   └── ActionButtons (最小化操作按钮)
├── MobileTerminalLayer (终端交互层)
│   ├── TerminalView (xterm.js 封装，来自 shared)
│   ├── ScrollToBottomButton (悬浮返回底部按钮)
│   └── TouchScrollHandler (触摸滚动逻辑)
└── KeyboardBar (底部工具栏)
    ├── InputToggle (输入法控制按钮)
    ├── ModifierKeys (CTRL/ALT 修饰键)
    ├── QuickKeys (ESC/TAB/方向键)
    └── ExpandButton (展开面板按钮)
        └── KeyboardPanel (展开的完整键盘面板)
```

### 文件结构

```
frontend/src/routes/mobile/
├── MobileShell.tsx          # 根容器 (dvh 布局, portrait-only)
├── components/
│   ├── StatusBar.tsx        # 顶部状态栏
│   ├── ConnectionIndicator.tsx  # 连接状态指示器
│   ├── MobileTerminalLayer.tsx  # 终端交互层容器
│   ├── TouchScrollHandler.ts    # 触摸滚动逻辑 (复用现有惯性实现)
│   ├── ScrollToBottomButton.tsx # 悬浮返回底部按钮
│   ├── KeyboardBar.tsx      # 底部工具栏主栏
│   ├── KeyboardPanel.tsx    # 展开的完整键盘面板
│   └── ImeController.ts     # 输入法控制 hook
└── hooks/
    └── useConnectionStatus.ts   # 连接状态订阅 hook
```

---

## Spec 2: 布局与视口规格

### CSS 约束

```css
/* MobileShell 根容器 */
.mobile-shell {
  position: fixed;
  inset: 0;
  height: 100dvh;           /* 动态视口高度 */
  display: flex;
  flex-direction: column;
  background: #000000;
  overflow: hidden;
  touch-action: none;       /* 防止系统手势干扰 */
}

/* 竖屏锁定 (通过 meta viewport 或 CSS) */
@media (orientation: landscape) {
  .mobile-shell::before {
    content: "请旋转至竖屏模式";
    /* 横屏时显示提示 */
  }
}
```

### 区域尺寸

| 区域 | 高度 | 说明 |
|------|------|------|
| StatusBar | 40px | 固定高度 |
| MobileTerminalLayer | flex-1 | 占据剩余空间 |
| KeyboardBar | 48px | 固定高度，含 safe-area-inset-bottom |
| KeyboardPanel | 200px | 展开时显示，动画过渡 |

---

## Spec 3: 状态栏规格

### 视觉设计

```typescript
interface StatusBarProps {
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  sessionId?: string;
  onLogout: () => void;
}
```

### 连接状态指示

| 状态 | 颜色 | 图标/文本 |
|------|------|----------|
| connecting | 黄色 `#EAB308` | 闪烁圆点 + "连接中..." |
| connected | 绿色 `#22C55E` | 实心圆点 + "已连接" |
| disconnected | 红色 `#EF4444` | 空心圆点 + "已断开" |

### 断线 UI 行为

- **仅状态栏提示**：不遮挡终端内容
- 状态栏背景变为 `rgba(239, 68, 68, 0.2)` 红色透明
- 显示 "点击重连" 文本，点击触发重连

---

## Spec 4: 触摸滚动规格

### 惯性滚动参数

```typescript
const SCROLL_PHYSICS = {
  DECAY_FACTOR: 0.95,        // 速度衰减系数
  MAX_VELOCITY: 2,           // 最大速度 (px/ms)
  STOP_THRESHOLD: 0.1,       // 停止阈值 (px/ms)
  PIXELS_PER_LINE: 20,       // 像素到行的转换比例
} as const;
```

### 触摸事件处理流程

```
touchstart
  → 取消正在进行的惯性动画
  → 记录起始位置和时间

touchmove
  → 计算速度 = deltaY / deltaTime
  → 限制速度范围 [-MAX_VELOCITY, MAX_VELOCITY]
  → 立即调用 term.scrollLines(delta)

touchend
  → 启动 requestAnimationFrame 惯性动画
  → 每帧：velocity *= DECAY_FACTOR
  → 当 |velocity| < STOP_THRESHOLD 时停止
```

### 返回底部按钮

- 位置：右下角，距离 KeyboardBar 上方 16px
- 显示条件：当前滚动位置不在底部时显示
- 点击行为：`term.scrollToBottom()`

---

## Spec 5: 虚拟键盘规格

### KeyboardBar (主栏)

```
┌──────┬──────┬─────┬─────┬─────┬───┬───┬───────┐
│INPUT │ CTRL │ ALT │ ESC │ TAB │ ↑ │ ↓ │ ▼展开 │
└──────┴──────┴─────┴─────┴─────┴───┴───┴───────┘
```

- 每个按钮最小尺寸：44×48px
- INPUT 按钮宽度：60px（更醒目）
- 展开按钮：显示 ▼ 或 ▲ 表示状态

### KeyboardPanel (展开面板)

```
┌─────────────────────────────────────────────┐
│  ▲  方向键区                                │
│ ◀ ▶    Home  End  PgUp  PgDn               │
│  ▼                                          │
├─────────────────────────────────────────────┤
│ 功能键区                                     │
│ F1  F2  F3  F4  F5  F6  F7  F8  F9  F10    │
├─────────────────────────────────────────────┤
│ 特殊键区                                     │
│ Ins  Del  |  ~  `  [  ]  \  /              │
└─────────────────────────────────────────────┘
```

### 修饰键状态显示

| 状态 | 视觉表现 |
|------|----------|
| idle | 默认灰色背景 `bg-gray-800` |
| latched | 蓝色边框 `border-blue-500` |
| locked | 蓝色填充 `bg-blue-600` |

---

## Spec 6: 输入法控制规格

### ImeController Hook

```typescript
interface UseImeController {
  isInputActive: boolean;
  toggleInput: () => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

function useImeController(termRef: RefObject<Terminal>): UseImeController;
```

### 实现约束

1. **禁用自动聚焦**：
   - xterm textarea 添加 `data-allow-focus="false"`
   - focus 事件监听器中检查此属性，非显式触发时 blur

2. **INPUT 按钮触发聚焦**：
   - 设置 `data-allow-focus="true"`
   - 调用 `textarea.focus()`
   - 200ms 后重置 `data-allow-focus="false"`

3. **键盘可见性检测**：
   ```typescript
   const keyboardVisible = visualViewport
     ? visualViewport.height < window.innerHeight * 0.8
     : false;
   ```

4. **状态同步**：
   - 当 `keyboardVisible` 变为 false 时，同步更新 `isInputActive`

---

## Spec 7: PBT (Property-Based Testing) 属性

### P1: 惯性滚动单调衰减

```typescript
// INVARIANT: 每帧速度 <= 上一帧速度 * DECAY_FACTOR
property("inertia_decay_monotonic", () => {
  const velocities = recordInertiaVelocities();
  for (let i = 1; i < velocities.length; i++) {
    assert(Math.abs(velocities[i]) <= Math.abs(velocities[i-1]) * 1.001);
  }
});

// FALSIFICATION: 找到 velocities[i] > velocities[i-1]
```

### P2: 触摸中断惯性

```typescript
// INVARIANT: touchstart 后，惯性动画立即停止
property("touch_cancels_inertia", () => {
  startInertiaAnimation();
  fireTouchStart();
  assert(inertiaAnimationId === null);
});

// FALSIFICATION: touchstart 后 inertiaAnimationId 非空
```

### P3: 修饰键状态机正确性

```typescript
// INVARIANT: 状态转换遵循 idle → latched → locked → idle
property("modifier_state_machine", () => {
  const transitions = recordModifierTransitions();
  const validTransitions = [
    ['idle', 'latched'],
    ['latched', 'locked'],
    ['latched', 'idle'],  // 使用后重置
    ['locked', 'idle'],   // 再次点击解锁
  ];
  transitions.forEach(([from, to]) => {
    assert(validTransitions.some(v => v[0] === from && v[1] === to));
  });
});
```

### P4: 输入法控制一致性

```typescript
// INVARIANT: isInputActive === (textarea.dataset.allowFocus === 'true')
property("ime_state_consistency", () => {
  const controller = useImeController(termRef);
  assert(controller.isInputActive ===
    (textareaRef.current?.dataset.allowFocus === 'true'));
});
```

### P5: 连接状态与 UI 同步

```typescript
// INVARIANT: socket.isConnected ↔ connectionStatus === 'connected'
property("connection_ui_sync", () => {
  assert(socket.isConnected === (connectionStatus === 'connected'));
});
```

---

## Spec 8: 确认的约束总结

| 决策点 | 确认值 | 来源 |
|--------|--------|------|
| 重构范围 | 完全重新设计 UI | 用户确认 |
| 组件架构 | 分层容器 (MobileShell → MobileTerminalLayer) | 用户确认 |
| tmux 鼠标功能 | 仅滚动历史 | 用户确认 |
| 虚拟键盘风格 | 极简 (7个主栏按钮 + 展开面板) | 用户确认 |
| 屏幕方向 | 仅竖屏 | 用户确认 |
| 手势库 | 原生触摸事件 | 用户确认 |
| 断线 UI | 仅状态栏提示 | 用户确认 |
| WebSocket 协议 | 不修改 | 用户要求 |
| 惯性衰减系数 | 0.95 | 技术规格 |
| 最大速度 | 2 px/ms | 技术规格 |
| 停止阈值 | 0.1 px/ms | 技术规格 |
| 按钮最小尺寸 | 44×44px | 无障碍标准 |

---

## Spec 9: 保留模块清单

| 模块 | 路径 | 修改类型 |
|------|------|----------|
| SocketService | `shared/core/socket.ts` | **不修改** |
| API | `shared/core/api.ts` | **不修改** |
| TerminalView | `shared/components/TerminalView.tsx` | **不修改** |
| settingsStore | `shared/stores/settingsStore.ts` | **不修改** |
| keyboardStore | `shared/stores/keyboardStore.ts` | **不修改** |
| useViewport | `shared/hooks/useViewport.ts` | **复用** |
