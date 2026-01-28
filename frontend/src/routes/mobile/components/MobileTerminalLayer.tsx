import { useRef, useCallback, useState, useEffect } from 'react';
import { Terminal } from 'xterm';
import { TerminalView } from '../../../shared/components/TerminalView';
import { SocketService } from '../../../shared/core/socket';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { attachInputHandler } from './InputHandler';

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

  const handleTerminalReady = useCallback((term: Terminal, container: HTMLElement) => {
    termRef.current = term;
    containerRef.current = container;

    // Attach input handler
    cleanupInputRef.current = attachInputHandler(container, socket);

    onTerminalReady?.(term);
  }, [onTerminalReady, socket]);

  // 直接在组件层面处理触摸滚动
  const touchStateRef = useRef({
    startY: 0,
    lastY: 0,
    accumulatedDelta: 0,
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const y = e.touches[0].clientY;
    touchStateRef.current = {
      startY: y,
      lastY: y,
      accumulatedDelta: 0,
    };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const term = termRef.current;
    const container = containerRef.current;
    if (!term || !container) return;

    const touch = e.touches[0];
    const y = touch.clientY;
    const deltaY = touchStateRef.current.lastY - y; // positive = swipe up
    touchStateRef.current.lastY = y;
    touchStateRef.current.accumulatedDelta += deltaY;

    const THRESHOLD = 30;
    while (Math.abs(touchStateRef.current.accumulatedDelta) >= THRESHOLD) {
      const rect = container.getBoundingClientRect();
      const cols = term.cols || 80;
      const rows = term.rows || 24;
      const cellWidth = rect.width / cols;
      const cellHeight = rect.height / rows;

      let col = Math.ceil((touch.clientX - rect.left) / cellWidth);
      let row = Math.ceil((touch.clientY - rect.top) / cellHeight);
      col = Math.max(1, Math.min(col, cols));
      row = Math.max(1, Math.min(row, rows));

      if (touchStateRef.current.accumulatedDelta > 0) {
        // Swipe up → scroll down (natural scrolling)
        const sequence = `\x1b[<65;${col};${row}M`;
        socket.sendInput(sequence);
        touchStateRef.current.accumulatedDelta -= THRESHOLD;
      } else {
        // Swipe down → scroll up (natural scrolling)
        const sequence = `\x1b[<64;${col};${row}M`;
        socket.sendInput(sequence);
        touchStateRef.current.accumulatedDelta += THRESHOLD;
      }
    }
  }, [socket]);

  // Handle input focus state changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const textarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    if (isInputActive) {
      textarea.dataset.allowFocus = 'true';
      textarea.focus();
    } else {
      textarea.dataset.allowFocus = 'false';
      textarea.blur();
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
      className="flex-1 overflow-hidden relative"
      style={{ touchAction: 'none' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
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
