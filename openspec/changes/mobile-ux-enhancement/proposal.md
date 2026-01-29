# OpenSpec Proposal: Mobile UX Enhancement

## Context

WinTerm Bridge 是一个终端桥接应用，支持桌面端和移动端访问 tmux 会话。当前移动端实现存在以下用户体验问题：

1. **单一显示模式**：终端始终适应手机屏幕大小渲染，无法查看桌面端尺寸的完整内容
2. **滚动交互受限**：虽然支持触摸滚动，但缺少惯性滚动，体验不够流畅
3. **输入法干扰**：点击屏幕自动弹出系统输入法，影响终端操作

## Requirements

### R1: 双显示模式切换

**用户故事**：作为移动端用户，我希望在"适应屏幕"和"固定桌面尺寸"两种模式间切换，以便在手机上查看完整的桌面终端内容。

**验收场景**：
- [ ] 用户可在设置或工具栏切换显示模式
- [ ] "适应屏幕"模式：终端 cols/rows 自动适应屏幕大小（当前行为）
- [ ] "固定尺寸"模式：终端渲染为 100x30（约等于 1920x1080 的 1/4 窗口）
- [ ] 模式切换后，后端 PTY 尺寸同步更新
- [ ] 用户偏好持久化到 localStorage

**技术约束**：
- MUST：使用 CSS transform 实现缩放，不影响 xterm.js 内部计算
- MUST：固定尺寸模式下禁用 FitAddon 自动调整
- MUST NOT：在固定尺寸模式下发送与实际渲染不符的 resize 消息

### R2: 固定尺寸模式的缩放与平移

**用户故事**：作为移动端用户，当终端内容大于屏幕时，我希望通过双指缩放和单指平移来查看完整内容。

**验收场景**：
- [ ] 双指捏合可缩放终端视图（50% ~ 200%）
- [ ] 单指拖拽可平移查看内容（当缩放 > 100% 时）
- [ ] 缩放操作流畅，帧率 ≥ 60fps
- [ ] 缩放级别持久化到 localStorage
- [ ] 提供"重置缩放"快捷按钮

**技术约束**：
- MUST：使用 CSS transform scale/translate 实现
- MUST：与现有触摸滚动（查看历史）互不冲突
- SHOULD：使用 @use-gesture/react 库处理手势

### R3: 惯性滚动增强

**用户故事**：作为移动端用户，我希望快速滑动后终端历史记录能继续滚动（惯性效果），提供更自然的阅读体验。

**验收场景**：
- [ ] 快速滑动后，滚动继续一段时间后逐渐停止
- [ ] 惯性滚动期间，用户触摸可立即停止滚动
- [ ] 滚动速度与滑动速度成正比
- [ ] 惯性衰减曲线感觉自然

**技术约束**：
- MUST：基于 touchend 时的滑动速度计算惯性
- MUST：使用 requestAnimationFrame 实现平滑动画
- SHOULD：衰减系数可配置（默认 0.95）

### R4: 输入法控制

**用户故事**：作为移动端用户，我希望点击屏幕不再自动弹出输入法，而是通过专用按钮控制，以减少误操作。

**验收场景**：
- [ ] 单击终端区域不弹出系统输入法
- [ ] 虚拟键盘栏新增"输入"按钮
- [ ] 点击"输入"按钮后，系统输入法弹出
- [ ] 输入法激活时，"输入"按钮变为"关闭"按钮
- [ ] 点击"关闭"按钮后，输入法收起
- [ ] IME 输入（中文等）仍正常工作

**技术约束**：
- MUST：移除 touchend 中的自动 textarea.focus()
- MUST：输入法激活状态通过 useViewport.keyboardVisible 检测
- MUST NOT：破坏现有的修饰键状态机（CTRL/ALT/SHIFT）
- SHOULD：物理键盘输入仍应工作（iPad 外接键盘场景）

## Dependencies

| 依赖 | 类型 | 用途 |
|------|------|------|
| xterm@5.3.0 | npm | 终端渲染 |
| xterm-addon-fit@0.8.0 | npm | 自适应尺寸（适应屏幕模式） |
| @use-gesture/react@10.3.0 | npm | 手势识别（已安装但未使用） |
| zustand@4.5.0 | npm | 状态管理 |
| visualViewport API | Browser | 键盘可见性检测 |
| CSS transform | Browser | 缩放/平移实现 |

## Risks

| 风险 | 严重性 | 缓解措施 |
|------|--------|----------|
| 缩放与滚动手势冲突 | 高 | 使用 @use-gesture 统一管理，设置互斥条件 |
| iOS/Android 输入法行为差异 | 中 | 测试多平台，必要时添加平台检测 |
| 后端 PTY 尺寸频繁变化 | 中 | 添加 resize 消息防抖，固定尺寸模式下减少 resize |
| 惯性滚动性能问题 | 低 | 使用 RAF + 节流，监控帧率 |

## Success Criteria

1. **功能完整**：所有验收场景通过
2. **性能达标**：缩放/平移/滚动操作 ≥ 60fps
3. **跨平台**：iOS Safari、Android Chrome 表现一致
4. **无回归**：现有桌面端功能不受影响
5. **代码质量**：TypeScript 类型完整，无 ESLint 错误

## Implementation Priority

1. **P0（必须）**：R4 输入法控制 - 最影响日常使用
2. **P1（重要）**：R3 惯性滚动 - 提升阅读体验
3. **P2（增强）**：R1 + R2 双显示模式 - 功能增强

---

## Confirmed Constraints (Multi-Model Validated)

以下约束已通过 Codex + Gemini 双模型分析并经用户确认：

| 决策点 | 确认值 | 来源 |
|--------|--------|------|
| 固定尺寸 | 100 cols × 30 rows | 用户确认（1920×1080 / 4） |
| 屏幕旋转行为 | 始终保持 100x30 | 用户确认 |
| 缩放后单指滑动 | 滚动优先（非平移） | 用户确认 |
| 缩放交互 | 双指捏合 + 单指平移 | 用户确认 |
| 惯性衰减系数 | 0.95 | 用户确认（默认值） |
| 最大惯性速度 | 2 px/ms | Codex 建议 |
| 惯性停止阈值 | 0.1 px/ms | Codex 建议 |
| 缩放范围 | 0.5 ~ 2.0 | Gemini 建议 |
| resize 防抖 | 模式切换时发送一次 | Codex 建议 |

---

## Integration Conflicts (Identified by Gemini)

| 冲突 | 位置 | 解决方案 |
|------|------|----------|
| Raw touch 事件 vs @use-gesture | `MobileTerminalHandler.ts` | 用 @use-gesture 统一替换 |
| FitAddon 自动调用 | `TerminalView.tsx` | 增加 fixedSize prop 跳过 |
| 自动聚焦逻辑 | `MobileTerminalHandler.ts:125` | 完全移除 |
| CSS transform 坐标映射 | 手势处理器 | 应用逆变换到屏幕坐标 |

---

## Status

- [x] Research completed (spec-research)
- [x] Multi-model analysis (Codex + Gemini)
- [x] User decisions confirmed
- [x] PBT properties extracted
- [ ] Ready for implementation (spec-impl)
