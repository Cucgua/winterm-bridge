import { useRef, useCallback, useState, useEffect } from 'react';
import { Terminal } from 'xterm';
import { TerminalView } from '../../../shared/components/TerminalView';
import { SocketService } from '../../../shared/core/socket';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { attachInputHandler } from './InputHandler';

// 简化的滚动阈值 - 越小越灵敏
const SCROLL_THRESHOLD = 4;
// 方向锁定：忽略小于此值的反向移动（防抖动）
const DIRECTION_LOCK_THRESHOLD = 2;
// 发送间隔 (ms)
const SEND_INTERVAL = 0.2;

interface MobileTerminalLayerProps {
  socket: SocketService;
  fontSize: number;
  fixedSize?: { cols: number; rows: number };
  isInputActive: boolean;
  onTerminalReady?: (term: Terminal) => void;
}

export function MobileTerminalLayer({
  socket,
  fontSize,
  fixedSize,
  isInputActive,
  onTerminalReady,
}: MobileTerminalLayerProps) {
  const termRef = useRef<Terminal | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const cleanupScrollRef = useRef<(() => void) | null>(null);
  const cleanupInputRef = useRef<(() => void) | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollDivRef = useRef<HTMLDivElement>(null);

  // 简单的触摸状态
  const touchRef = useRef({
    lastY: 0,
    lastX: 0,
    delta: 0,
    direction: 0 as -1 | 0 | 1, // -1=下滑, 0=未定, 1=上滑
    lastSendTime: 0,
  });

  // 调试显示
  const [debugInfo, setDebugInfo] = useState('');

  const handleTerminalReady = useCallback((term: Terminal, container: HTMLElement) => {
    termRef.current = term;
    containerRef.current = container;
    cleanupInputRef.current = attachInputHandler(container);
    onTerminalReady?.(term);
  }, [onTerminalReady]);

  // 直接、简单的触摸处理
  useEffect(() => {
    const div = scrollDivRef.current;
    if (!div) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchRef.current = {
        lastY: touch.clientY,
        lastX: touch.clientX,
        delta: 0,
        direction: 0,
        lastSendTime: 0,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const term = termRef.current;
      const container = containerRef.current;
      if (!term || !container) return;

      const touch = e.touches[0];
      const y = touch.clientY;
      const x = touch.clientX;

      // 计算位移
      const deltaY = touchRef.current.lastY - y;
      touchRef.current.lastY = y;
      touchRef.current.lastX = x;

      // 方向锁定：确定方向后，忽略小幅度的反向抖动
      const currentDir = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;

      if (touchRef.current.direction === 0) {
        // 首次确定方向
        if (Math.abs(deltaY) > DIRECTION_LOCK_THRESHOLD) {
          touchRef.current.direction = currentDir as -1 | 1;
          touchRef.current.delta += deltaY;
        }
      } else if (currentDir === touchRef.current.direction) {
        // 同方向，正常累积
        touchRef.current.delta += deltaY;
      } else if (Math.abs(deltaY) > DIRECTION_LOCK_THRESHOLD * 2) {
        // 明显反向，切换方向
        touchRef.current.direction = currentDir as -1 | 1;
        touchRef.current.delta = deltaY;
      }
      // 否则忽略小幅度反向抖动

      // 调试显示
      const dir = touchRef.current.direction === 1 ? '↑' : touchRef.current.direction === -1 ? '↓' : '?';
      setDebugInfo(`${dir} delta: ${touchRef.current.delta.toFixed(1)} | move: ${deltaY.toFixed(1)}`);

      // 达到阈值就发送，带间隔控制
      const now = performance.now();
      while (Math.abs(touchRef.current.delta) >= SCROLL_THRESHOLD) {
        // 检查发送间隔
        if (now - touchRef.current.lastSendTime < SEND_INTERVAL) {
          break;
        }

        // 计算终端坐标
        const rect = container.getBoundingClientRect();
        const cols = term.cols || 80;
        const rows = term.rows || 24;
        let col = Math.ceil((x - rect.left) / (rect.width / cols));
        let row = Math.ceil((y - rect.top) / (rect.height / rows));
        col = Math.max(1, Math.min(col, cols));
        row = Math.max(1, Math.min(row, rows));

        if (touchRef.current.delta > 0) {
          // 向上滑 = 查看历史 = scroll down (65)
          socket.sendInput(`\x1b[<65;${col};${row}M`);
          touchRef.current.delta -= SCROLL_THRESHOLD;
        } else {
          // 向下滑 = 回到最新 = scroll up (64)
          socket.sendInput(`\x1b[<64;${col};${row}M`);
          touchRef.current.delta += SCROLL_THRESHOLD;
        }
        touchRef.current.lastSendTime = now;
      }
    };

    // capture + passive:false 确保优先处理
    div.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
    div.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });

    return () => {
      div.removeEventListener('touchstart', handleTouchStart, { capture: true });
      div.removeEventListener('touchmove', handleTouchMove, { capture: true });
    };
  }, [socket]);

  // Handle input focus state changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Use our custom input element instead of xterm's textarea
    const input = (container as any).__mobileInput as HTMLInputElement;
    if (!input) {
      return;
    }

    if (isInputActive) {
      input.focus();
    } else {
      input.blur();
    }
  }, [isInputActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupScrollRef.current?.();
      cleanupInputRef.current?.();
    };
  }, []);

  const handleScrollToBottom = useCallback(() => {
    termRef.current?.scrollToBottom();
    setShowScrollButton(false);
  }, []);

  return (
    <div
      ref={scrollDivRef}
      className="flex-1 overflow-hidden relative"
      style={{ touchAction: 'none' }}
    >
      {/* 调试弹窗 */}
      {debugInfo && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/90 text-green-400 px-6 py-4 rounded-lg text-lg z-[99999] pointer-events-none font-mono">
          {debugInfo}
        </div>
      )}
      <TerminalView
        socket={socket}
        fontSize={fontSize}
        fixedSize={fixedSize}
        disableClickFocus={true}
        onTerminalReady={handleTerminalReady}
      />
      <ScrollToBottomButton
        visible={showScrollButton}
        onClick={handleScrollToBottom}
      />
    </div>
  );
}
