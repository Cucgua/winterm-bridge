# PC/移动端路由分离重构计划

## 目标

将前端对于 PC 和手机的支持完全分开，通过路由区分（`/desktop`、`/mobile`），在同一客户端内实现两端独立适配。

---

## 阶段 1：基础架构搭建

### 1.1 安装路由依赖

```bash
cd frontend && pnpm add react-router-dom
```

### 1.2 创建目录结构

```
frontend/src/
├── App.tsx                    # 路由入口 + 自动重定向
├── main.tsx                   # 保持不变
├── routes/
│   ├── desktop/
│   │   ├── DesktopApp.tsx     # PC 端主入口
│   │   ├── DesktopLayout.tsx  # PC 端布局容器
│   │   └── components/        # PC 端独有组件
│   │       ├── Sidebar.tsx         # 侧边栏会话列表
│   │       ├── TabBar.tsx          # 顶部多标签栏
│   │       └── ContextMenu.tsx     # 右键菜单
│   └── mobile/
│       ├── MobileApp.tsx      # 移动端主入口
│       ├── MobileLayout.tsx   # 移动端布局容器
│       └── components/        # 移动端独有组件
│           ├── MobileToolbar.tsx   # 底部工具栏
│           └── SwipeDrawer.tsx     # 侧滑抽屉
├── shared/
│   ├── core/
│   │   └── socket.ts          # WebSocket 通信（从 src/core 移入）
│   ├── stores/
│   │   └── keyboardStore.ts   # 键盘状态管理（从 src/stores 移入）
│   ├── components/
│   │   ├── TerminalView.tsx   # 纯净版终端组件（移除平台特定逻辑）
│   │   ├── SessionPicker.tsx  # 会话选择（共享）
│   │   └── AuthScreen.tsx     # 认证页面（共享）
│   ├── hooks/
│   │   ├── useViewport.ts     # 视口监听
│   │   └── useDeviceType.ts   # 设备类型检测
│   └── types/
│       └── index.ts           # 共享类型定义
└── index.css                  # 保持不变
```

### 1.3 实现路由入口

**文件：`frontend/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { useDeviceType } from './shared/hooks/useDeviceType';

const DesktopApp = lazy(() => import('./routes/desktop/DesktopApp'));
const MobileApp = lazy(() => import('./routes/mobile/MobileApp'));

function AutoRedirect() {
  const navigate = useNavigate();
  const isMobile = useDeviceType();

  useEffect(() => {
    navigate(isMobile ? '/mobile' : '/desktop', { replace: true });
  }, [isMobile, navigate]);

  return <LoadingScreen />;
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-black text-white">
      <div className="text-center">
        <h1 className="text-xl font-bold">WinTerm Bridge</h1>
        <p className="text-gray-400 mt-2">Loading...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/desktop/*" element={<DesktopApp />} />
          <Route path="/mobile/*" element={<MobileApp />} />
          <Route path="/" element={<AutoRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

### 1.4 实现设备检测 Hook

**文件：`frontend/src/shared/hooks/useDeviceType.ts`**

```tsx
import { useState, useEffect } from 'react';

export function useDeviceType(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    // 优先检查 URL 参数（允许手动覆盖）
    const params = new URLSearchParams(window.location.search);
    if (params.has('mode')) {
      return params.get('mode') === 'mobile';
    }
    // 检查触摸能力 + UA
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    );
  });

  return isMobile;
}
```

---

## 阶段 2：共享模块抽离

### 2.1 移动现有文件到 shared

| 原路径 | 新路径 |
|--------|--------|
| `src/core/socket.ts` | `src/shared/core/socket.ts` |
| `src/stores/keyboardStore.ts` | `src/shared/stores/keyboardStore.ts` |
| `src/hooks/useViewport.ts` | `src/shared/hooks/useViewport.ts` |
| `src/components/SessionPicker.tsx` | `src/shared/components/SessionPicker.tsx` |

### 2.2 重构 TerminalView 为纯净版

**文件：`frontend/src/shared/components/TerminalView.tsx`**

移除移动端特定逻辑（IME 处理、触摸滚动），通过 Props 注入：

```tsx
interface TerminalViewProps {
  socket: SocketService;
  fontSize: number;
  onResize?: (cols: number, rows: number) => void;
  // 新增：平台特定配置
  enableTouchScroll?: boolean;
  enableIMEHandler?: boolean;
  onTerminalReady?: (term: Terminal, container: HTMLElement) => void;
}
```

### 2.3 提取认证逻辑为共享组件

**文件：`frontend/src/shared/components/AuthScreen.tsx`**

将 PIN 输入界面从 App.tsx 提取为独立组件，PC 和移动端共用。

---

## 阶段 3：PC 端实现

### 3.1 DesktopApp 主入口

**文件：`frontend/src/routes/desktop/DesktopApp.tsx`**

```tsx
import { useState, useCallback } from 'react';
import { DesktopLayout } from './DesktopLayout';
import { TerminalView } from '../../shared/components/TerminalView';
import { AuthScreen } from '../../shared/components/AuthScreen';
import { SessionPicker } from '../../shared/components/SessionPicker';
import { socket, SessionInfo } from '../../shared/core/socket';

export default function DesktopApp() {
  const [authState, setAuthState] = useState<'pin' | 'sessions' | 'terminal'>('pin');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [fontSize, setFontSize] = useState(14);

  // ... 认证逻辑（复用现有）

  if (authState === 'pin') {
    return <AuthScreen onSuccess={() => setAuthState('sessions')} />;
  }

  if (authState === 'sessions') {
    return (
      <SessionPicker
        sessions={sessions}
        onSelect={() => setAuthState('terminal')}
        onCreate={() => setAuthState('terminal')}
      />
    );
  }

  return (
    <DesktopLayout
      sessions={sessions}
      onFontSizeChange={setFontSize}
    >
      <TerminalView socket={socket} fontSize={fontSize} />
    </DesktopLayout>
  );
}
```

### 3.2 DesktopLayout 布局

**文件：`frontend/src/routes/desktop/DesktopLayout.tsx`**

```tsx
interface DesktopLayoutProps {
  sessions: SessionInfo[];
  children: React.ReactNode;
  onFontSizeChange: (size: number) => void;
}

export function DesktopLayout({ sessions, children, onFontSizeChange }: DesktopLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-black text-white">
      {/* 侧边栏 */}
      <aside className={`${sidebarCollapsed ? 'w-12' : 'w-64'} border-r border-gray-800 transition-all`}>
        <Sidebar
          sessions={sessions}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 flex flex-col">
        {/* 顶部标签栏 */}
        <TabBar />

        {/* 终端视图 */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>

        {/* 底部状态栏 */}
        <StatusBar onFontSizeChange={onFontSizeChange} />
      </main>
    </div>
  );
}
```

### 3.3 PC 端独有组件

- **Sidebar.tsx**: 会话列表，支持展开/收起，显示连接状态
- **TabBar.tsx**: 多标签页切换（预留，当前单会话可简化）
- **StatusBar.tsx**: 底部状态栏，显示字体大小调节、连接延迟
- **ContextMenu.tsx**: 右键菜单（复制/粘贴/清屏）

---

## 阶段 4：移动端实现

### 4.1 MobileApp 主入口

**文件：`frontend/src/routes/mobile/MobileApp.tsx`**

```tsx
import { useState, useCallback } from 'react';
import { MobileLayout } from './MobileLayout';
import { TerminalView } from '../../shared/components/TerminalView';
import { AuthScreen } from '../../shared/components/AuthScreen';
import { VirtualKeyboardAccessory } from './components/VirtualKeyboardAccessory';
import { MobileTerminalHandler } from './components/MobileTerminalHandler';
import { socket } from '../../shared/core/socket';
import { useViewport } from '../../shared/hooks/useViewport';

export default function MobileApp() {
  const [authState, setAuthState] = useState<'pin' | 'sessions' | 'terminal'>('pin');
  const [fontSize, setFontSize] = useState(16); // 移动端默认更大
  const viewport = useViewport();

  // ... 认证逻辑

  return (
    <MobileLayout viewportHeight={viewport.height} keyboardVisible={viewport.keyboardVisible}>
      <TerminalView
        socket={socket}
        fontSize={fontSize}
        onTerminalReady={(term, container) => {
          // 注入移动端特定处理
          MobileTerminalHandler.attach(term, container, socket);
        }}
      />
      <VirtualKeyboardAccessory onSendKey={(key) => socket.send(key)} />
    </MobileLayout>
  );
}
```

### 4.2 MobileLayout 布局

**文件：`frontend/src/routes/mobile/MobileLayout.tsx`**

```tsx
interface MobileLayoutProps {
  children: React.ReactNode;
  viewportHeight: number;
  keyboardVisible: boolean;
}

export function MobileLayout({ children, viewportHeight, keyboardVisible }: MobileLayoutProps) {
  return (
    <div
      className="fixed inset-0 flex flex-col bg-black"
      style={{ height: `${viewportHeight}px` }}
    >
      {/* 顶部状态栏（极简） */}
      {!keyboardVisible && (
        <header className="h-10 flex items-center justify-between px-4 bg-gray-900 border-b border-gray-800">
          <span className="text-sm text-gray-400">WinTerm</span>
          <ConnectionIndicator />
        </header>
      )}

      {/* 终端 + 虚拟键盘 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
```

### 4.3 移动端独有组件

- **VirtualKeyboardAccessory.tsx**: 从现有组件迁移，保持原有功能
- **MobileTerminalHandler.ts**: 封装移动端特定逻辑（IME、触摸滚动、点击聚焦）
- **SwipeDrawer.tsx**: 边缘侧滑抽屉（会话切换/设置）
- **MobileToolbar.tsx**: 键盘未弹出时的底部工具栏

### 4.4 移动端特定处理器

**文件：`frontend/src/routes/mobile/components/MobileTerminalHandler.ts`**

将现有 TerminalView 中的移动端逻辑提取到此：

```tsx
export class MobileTerminalHandler {
  static attach(term: Terminal, container: HTMLElement, socket: SocketService) {
    const textarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;

    // IME 输入处理
    this.setupIMEHandler(textarea, socket);

    // 触摸滚动
    this.setupTouchScroll(term, container);

    // 点击聚焦
    this.setupTapToFocus(term, container, textarea);
  }

  private static setupIMEHandler(...) { /* 现有逻辑 */ }
  private static setupTouchScroll(...) { /* 现有逻辑 */ }
  private static setupTapToFocus(...) { /* 现有逻辑 */ }
}
```

---

## 阶段 5：构建配置调整

### 5.1 Vite 配置更新

**文件：`frontend/vite.config.ts`**

```tsx
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../backend/cmd/server/static',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // 分离各端代码，按需加载
          desktop: ['./src/routes/desktop/DesktopApp.tsx'],
          mobile: ['./src/routes/mobile/MobileApp.tsx'],
          shared: ['./src/shared/core/socket.ts', './src/shared/stores/keyboardStore.ts'],
        },
      },
    },
  },
});
```

### 5.2 后端路由处理

确保所有路径（`/desktop/*`、`/mobile/*`）都返回 `index.html`，由前端路由处理：

```go
// 示例：Go 后端 SPA fallback
http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
    // 如果不是静态资源，返回 index.html
    if !strings.HasPrefix(r.URL.Path, "/assets/") && r.URL.Path != "/ws" {
        http.ServeFile(w, r, "static/index.html")
        return
    }
    http.FileServer(http.Dir("static")).ServeHTTP(w, r)
})
```

---

## 阶段 6：测试与优化

### 6.1 测试矩阵

| 平台 | 测试项 |
|------|--------|
| PC (Chrome/Firefox/Safari) | 侧边栏展开/收起、快捷键、右键菜单、终端输入 |
| iOS Safari | 软键盘弹出/收起、IME 输入、触摸滚动、虚拟键盘栏 |
| Android Chrome | 同 iOS + 返回键行为 |
| 平板 | 手动切换 PC/移动模式 |

### 6.2 性能优化

- 使用 `React.lazy` + `Suspense` 实现路由级代码分割
- 移动端移除 PC 专用组件，PC 端移除移动端组件
- 共享模块提取为独立 chunk

### 6.3 用户体验优化

- 添加「切换到 PC 版」/「切换到移动版」入口
- 记住用户选择到 localStorage
- 平板设备提供模式选择提示

---

## 执行顺序

1. [ ] 安装 react-router-dom
2. [ ] 创建目录结构
3. [ ] 实现 useDeviceType hook
4. [ ] 重构 App.tsx 为路由入口
5. [ ] 移动共享模块到 shared/
6. [ ] 重构 TerminalView 为纯净版
7. [ ] 实现 DesktopApp + DesktopLayout
8. [ ] 实现 MobileApp + MobileLayout
9. [ ] 迁移 VirtualKeyboardAccessory 到移动端
10. [ ] 提取 MobileTerminalHandler
11. [ ] 实现 PC 端独有组件（Sidebar、StatusBar）
12. [ ] 实现移动端独有组件（SwipeDrawer、MobileToolbar）
13. [ ] 更新 Vite 配置
14. [ ] 测试各端功能
15. [ ] 性能优化与代码分割验证

---

## 预期成果

- PC 端：类 IDE 布局，侧边栏会话管理，键盘操作优先
- 移动端：沉浸式全屏，虚拟键盘辅助栏，触摸优化
- 共享：WebSocket 通信、认证流程、终端核心渲染
- 构建：单一产物，按需加载，bundle 体积优化
