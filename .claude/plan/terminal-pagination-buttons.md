# 功能规划：Page Up/Page Down 终端翻页按钮

**规划时间**：2026-01-25
**需求**：在移动端 App 添加按钮用于终端历史翻页

---

## 1. 功能概述

### 1.1 目标
在移动端 App 的虚拟键盘工具栏中添加 Page Up/Page Down 按钮，实现终端历史内容的快速翻页浏览功能。

### 1.2 范围
**包含**：
- 在 VirtualKeyboardAccessory 工具栏末尾添加两个翻页按钮
- 通过分隔线将按钮分为逻辑分组
- 实现本地滚动缓冲区（调用 xterm.js 的 scrollPages 方法）
- 保存 Terminal 实例引用以支持跨组件调用

**不包含**：
- 不发送任何数据到服务端
- 不修改终端内容或状态
- 不涉及后端改动

---

## 2. UI 设计

### 2.1 按钮布局
```
[CTRL][ALT][SHIFT] | [TAB][ESC] | [▲][▼] | [PgUp][PgDn]
   修饰键组        |  功能键组   | 行级导航 |  翻页导航
```

### 2.2 交互行为
- **PgUp**：调用 `term.scrollPages(-1)` 向上翻一页
- **PgDn**：调用 `term.scrollPages(1)` 向下翻一页
- 本地滚动操作，不发送数据到服务端

---

## 3. WBS 任务分解

### 模块 A：VirtualKeyboardAccessory 组件修改

**文件**: `frontend/src/routes/mobile/components/VirtualKeyboardAccessory.tsx`

- [ ] **A.1** 添加 Separator 分隔线组件
- [ ] **A.2** 扩展 Props 接口添加 `onScrollPage?: (direction: 'up' | 'down') => void`
- [ ] **A.3** 重构按钮布局：添加分隔线 + Page Up/Down 按钮

### 模块 B：MobileApp 组件修改

**文件**: `frontend/src/routes/mobile/MobileApp.tsx`

- [ ] **B.1** 添加 `termRef = useRef<Terminal | null>(null)` 保存 Terminal 实例
- [ ] **B.2** 修改 `handleTerminalReady` 保存 Terminal 引用
- [ ] **B.3** 添加 `handleScrollPage` 回调函数
- [ ] **B.4** 传递 `onScrollPage={handleScrollPage}` 给 VirtualKeyboardAccessory

---

## 4. 代码变更预览

### 4.1 VirtualKeyboardAccessory.tsx

```diff
 interface VirtualKeyboardAccessoryProps {
   onSendKey: (key: string) => void;
+  onScrollPage?: (direction: 'up' | 'down') => void;
 }

+const Separator: React.FC = () => (
+  <div className="w-px h-6 bg-gray-600 mx-1 self-center" />
+);

 export const VirtualKeyboardAccessory: React.FC<VirtualKeyboardAccessoryProps> = ({
   onSendKey,
+  onScrollPage,
 }) => {
   return (
     <div className="...">
       {/* 修饰键组 */}
       <ModifierButton label="CTRL" ... />
       <ModifierButton label="ALT" ... />
       <ModifierButton label="SHIFT" ... />
+      <Separator />
       {/* 功能键组 */}
       <ActionButton label="TAB" ... />
       <ActionButton label="ESC" ... />
+      <Separator />
       {/* 行级导航组 */}
       <ActionButton label="▲" ... />
       <ActionButton label="▼" ... />
+      <Separator />
+      {/* 翻页导航组 */}
+      <ActionButton label="PgUp" onClick={() => onScrollPage?.('up')} />
+      <ActionButton label="PgDn" onClick={() => onScrollPage?.('down')} />
     </div>
   );
 };
```

### 4.2 MobileApp.tsx

```diff
 const isConnectingRef = useRef(false);
 const initRef = useRef(false);
+const termRef = useRef<Terminal | null>(null);

 const handleTerminalReady = useCallback((term: Terminal, container: HTMLElement) => {
+  termRef.current = term;
   attachMobileHandlers(term, container, socket);
 }, []);

+const handleScrollPage = useCallback((direction: 'up' | 'down') => {
+  if (termRef.current) {
+    termRef.current.scrollPages(direction === 'up' ? -1 : 1);
+  }
+}, []);

 return (
   <MobileLayout ...>
     ...
-    <VirtualKeyboardAccessory onSendKey={handleSendKey} />
+    <VirtualKeyboardAccessory
+      onSendKey={handleSendKey}
+      onScrollPage={handleScrollPage}
+    />
   </MobileLayout>
 );
```

---

## 5. 验收标准

- [ ] 工具栏末尾显示 PgUp 和 PgDn 两个按钮
- [ ] 按钮之间有分隔线分组
- [ ] 点击 PgUp 按钮，终端向上滚动一页
- [ ] 点击 PgDn 按钮，终端向下滚动一页
- [ ] 滚动操作不发送数据到服务端
- [ ] 边界情况无异常（顶部/底部/未初始化）
- [ ] TypeScript 编译无错误

---

## 6. 测试检查项

| 编号 | 测试场景 | 预期结果 |
|------|----------|----------|
| T1 | 进入终端界面 | 工具栏显示 PgUp/PgDn 按钮 |
| T2 | 点击 PgUp | 终端向上滚动一页 |
| T3 | 点击 PgDn | 终端向下滚动一页 |
| T4 | 在顶部点击 PgUp | 无异常 |
| T5 | 在底部点击 PgDn | 无异常 |
| T6 | 快速连续点击 | 连续滚动正常 |
