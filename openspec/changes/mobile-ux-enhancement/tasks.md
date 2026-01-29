# Tasks: Mobile UX Enhancement

## Phase 1: 输入法控制 (P0)

### Task 1.1: 移除自动聚焦行为
- [x] **文件**: `frontend/src/routes/mobile/components/MobileTerminalHandler.ts`
- **修改**: 移除 touchend 事件中的 `term.focus()` 和 `textarea.focus()` 调用
- **验证**: 点击终端区域不再弹出输入法

### Task 1.2: 添加输入控制按钮
- [x] **文件**: `frontend/src/routes/mobile/components/VirtualKeyboardAccessory.tsx`
- **修改**:
  - 新增"输入"按钮（键盘图标）
  - 接收 `onInputToggle` 回调
  - 根据 `isKeyboardActive` 状态切换图标和文本
- **验证**: 按钮可见且可点击

### Task 1.3: 实现输入法状态管理
- [x] **文件**: `frontend/src/routes/mobile/MobileApp.tsx`
- **修改**:
  - 新增 `isInputActive` 状态
  - 实现 `handleInputToggle` 函数
  - 当激活时调用 `termRef.current?.focus()`，textarea 聚焦
  - 当关闭时调用 `textarea.blur()`
- **验证**: 状态正确切换，输入法响应

### Task 1.4: 集成 useViewport 检测
- [x] **文件**: `frontend/src/routes/mobile/MobileApp.tsx`
- **修改**: 使用 `viewport.keyboardVisible` 同步输入法状态
- **验证**: 系统级收起输入法时，按钮状态正确更新

---

## Phase 2: 惯性滚动 (P1)

### Task 2.1: 记录滑动速度
- [x] **文件**: `frontend/src/routes/mobile/components/MobileTerminalHandler.ts`
- **修改**:
  - 在 touchmove 中记录时间戳和位置
  - 在 touchend 时计算滑动速度（px/ms）
- **验证**: 控制台输出速度值

### Task 2.2: 实现惯性动画
- [x] **文件**: `frontend/src/routes/mobile/components/MobileTerminalHandler.ts`
- **修改**:
  - 使用 requestAnimationFrame 实现惯性滚动
  - 速度衰减系数 0.95
  - 速度 < 阈值时停止
- **验证**: 快速滑动后继续滚动

### Task 2.3: 触摸中断惯性
- [x] **文件**: `frontend/src/routes/mobile/components/MobileTerminalHandler.ts`
- **修改**: touchstart 时取消正在进行的惯性动画
- **验证**: 用户触摸立即停止惯性滚动

---

## Phase 3: 双显示模式 (P2)

### Task 3.1: 扩展 settingsStore
- [x] **文件**: `frontend/src/shared/stores/settingsStore.ts`
- **修改**:
  - 新增 `displayMode: 'fit' | 'fixed'`
  - 新增 `fixedTerminalSize: { cols: number, rows: number }`
  - 新增 `zoomLevel: number`（默认 1.0）
- **验证**: 设置持久化到 localStorage

### Task 3.2: 创建 DisplayModeContext
- [x] **文件**: `frontend/src/routes/mobile/context/DisplayModeContext.tsx`（新建）
- **内容**:
  - 提供 displayMode、zoomLevel、panOffset 状态
  - 提供 setDisplayMode、setZoomLevel、resetView 方法
- **验证**: Context 可在子组件中使用
- **备注**: 已整合到 settingsStore 中

### Task 3.3: 创建 ZoomableTerminalContainer
- [x] **文件**: `frontend/src/routes/mobile/components/ZoomableTerminalContainer.tsx`（新建）
- **内容**:
  - 包裹 TerminalView
  - 应用 CSS transform: scale(zoomLevel) translate(panX, panY)
  - 根据 displayMode 切换容器样式
- **验证**: 缩放和平移视觉效果正确

### Task 3.4: 集成 @use-gesture
- [x] **文件**: `frontend/src/routes/mobile/components/ZoomableTerminalContainer.tsx`
- **修改**:
  - 使用 usePinch 处理缩放手势
  - 使用 useDrag 处理平移手势
  - 设置手势互斥条件（缩放时禁用滚动）
- **验证**: 双指缩放和单指平移工作正常

### Task 3.5: 修改 TerminalView 支持固定尺寸
- [x] **文件**: `frontend/src/shared/components/TerminalView.tsx`
- **修改**:
  - 新增 `fixedSize?: { cols: number, rows: number }` prop
  - 当 fixedSize 存在时，跳过 FitAddon.fit()
  - 使用 fixedSize 初始化 Terminal
- **验证**: 固定尺寸模式下终端大小不随容器变化

### Task 3.6: 添加模式切换 UI
- [x] **文件**: `frontend/src/routes/mobile/components/VirtualKeyboardAccessory.tsx`
- **修改**:
  - 新增"模式切换"按钮（屏幕图标）
  - 点击切换 fit/fixed 模式
- **验证**: 按钮可见，模式切换正确

### Task 3.7: 同步后端 PTY 尺寸
- [x] **文件**: `frontend/src/routes/mobile/MobileApp.tsx`
- **修改**:
  - 模式切换时发送 resize 消息
  - 固定模式：发送 100x30
  - 适应模式：发送 FitAddon 计算的尺寸
- **验证**: 后端 tmux 窗口尺寸正确更新

---

## Phase 4: 测试与优化

### Task 4.1: 跨平台测试
- **设备**: iOS Safari、Android Chrome、iPad
- **测试项**:
  - 输入法控制
  - 惯性滚动
  - 缩放平移（固定模式）
- **输出**: 测试报告

### Task 4.2: 性能优化
- **检查项**:
  - 缩放/平移帧率
  - 惯性滚动流畅度
  - 内存泄漏（事件监听清理）
- **工具**: Chrome DevTools Performance

### Task 4.3: 清理与文档
- **内容**:
  - 清理未使用代码
  - 更新 README
  - 添加关键函数注释
