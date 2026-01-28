import { SocketService } from '../../../shared/core/socket';

interface TouchScrollOptions {
  onScrollStateChange?: (isAtBottom: boolean) => void;
  // Function to calculate grid coordinates from screen position
  getGridPosition: (clientX: number, clientY: number) => { col: number; row: number };
}

// Mouse wheel escape sequences for tmux (SGR extended mouse mode)
// Format: \x1b[<button;col;rowM for press
// Button 64 = scroll up, Button 65 = scroll down
// Note: tmux requires 'set -g mouse on' for this to work

const SCROLL_THRESHOLD = 30; // pixels per scroll event
const VELOCITY_THRESHOLD = 0.5; // px/ms for inertia
const DECAY_FACTOR = 0.92;
const INERTIA_INTERVAL = 50; // ms between inertia scroll events

export function attachTouchScrollHandler(
  container: HTMLElement,
  socket: SocketService,
  options: TouchScrollOptions
): () => void {
  // 立即显示初始化调试
  if ((window as any).__setScrollDebug) {
    (window as any).__setScrollDebug('TouchScroll 初始化');
    setTimeout(() => (window as any).__setScrollDebug?.(''), 1000);
  }
  console.log('[TouchScroll] bindding to:', container.tagName, container.className);

  let lastTouchX = 0;
  let touchStartY = 0;
  let lastTouchY = 0;
  let lastTouchTime = 0;
  let velocity = 0;
  let accumulatedDelta = 0;
  let inertiaIntervalId: number | null = null;

  const cancelInertia = () => {
    if (inertiaIntervalId !== null) {
      clearInterval(inertiaIntervalId);
      inertiaIntervalId = null;
    }
  };

  const sendScroll = (direction: 'up' | 'down') => {
    // Calculate dynamic coordinates based on last known touch position
    const { col, row } = options.getGridPosition(lastTouchX, lastTouchY);

    // Send mouse wheel event to tmux (requires 'set -g mouse on')
    // Button 64 = scroll up, 65 = scroll down
    const button = direction === 'up' ? 64 : 65;
    const sequence = `\x1b[<${button};${col};${row}M`;

    // 调试显示
    if ((window as any).__setScrollDebug) {
      (window as any).__setScrollDebug(`${direction === 'up' ? '⬆️' : '⬇️'} (${col},${row})`);
      setTimeout(() => (window as any).__setScrollDebug?.(''), 500);
    }

    socket.sendInput(sequence);
  };

  const runInertia = () => {
    if (Math.abs(velocity) < VELOCITY_THRESHOLD) {
      cancelInertia();
      return;
    }

    // Send scroll based on velocity direction
    if (velocity > 0) {
      sendScroll('up');
    } else {
      sendScroll('down');
    }

    // Decay velocity
    velocity *= DECAY_FACTOR;
  };

  const handleTouchStart = (e: TouchEvent) => {
    cancelInertia();
    lastTouchX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    lastTouchY = touchStartY;
    lastTouchTime = performance.now();
    velocity = 0;
    accumulatedDelta = 0;
  };

  const handleTouchMove = (e: TouchEvent) => {
    // Prevent native scroll/overscroll from hijacking the gesture
    if (e.cancelable) {
      e.preventDefault();
    }
    const touchY = e.touches[0].clientY;
    lastTouchX = e.touches[0].clientX;
    const currentTime = performance.now();
    const deltaY = lastTouchY - touchY; // positive = swipe up
    const deltaTime = currentTime - lastTouchTime;

    // Calculate velocity for inertia
    if (deltaTime > 0) {
      velocity = deltaY / deltaTime;
    }

    // Accumulate delta and send scroll when threshold reached
    accumulatedDelta += deltaY;

    while (Math.abs(accumulatedDelta) >= SCROLL_THRESHOLD) {
      if (accumulatedDelta > 0) {
        sendScroll('up');
        accumulatedDelta -= SCROLL_THRESHOLD;
      } else {
        sendScroll('down');
        accumulatedDelta += SCROLL_THRESHOLD;
      }
    }

    lastTouchY = touchY;
    lastTouchTime = currentTime;
  };

  const handleTouchEnd = () => {
    // Start inertia if velocity is significant
    if (Math.abs(velocity) >= VELOCITY_THRESHOLD) {
      inertiaIntervalId = window.setInterval(runInertia, INERTIA_INTERVAL);
    }
  };

  const handleTouchCancel = () => {
    cancelInertia();
    velocity = 0;
    accumulatedDelta = 0;
  };

  const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window;

  const handlePointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;

    // 调试
    if ((window as any).__setScrollDebug) {
      (window as any).__setScrollDebug(`按下 (${Math.round(e.clientX)},${Math.round(e.clientY)})`);
    }

    // Capture to keep receiving move events even if finger leaves the element
    if (container.setPointerCapture) {
      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture errors (e.g., Safari quirks)
      }
    }
    cancelInertia();
    lastTouchX = e.clientX;
    touchStartY = e.clientY;
    lastTouchY = touchStartY;
    lastTouchTime = performance.now();
    velocity = 0;
    accumulatedDelta = 0;
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    if (e.cancelable) {
      e.preventDefault();
    }
    const touchY = e.clientY;
    lastTouchX = e.clientX;
    const currentTime = performance.now();
    const deltaY = lastTouchY - touchY; // positive = swipe up
    const deltaTime = currentTime - lastTouchTime;

    if (deltaTime > 0) {
      velocity = deltaY / deltaTime;
    }

    accumulatedDelta += deltaY;

    while (Math.abs(accumulatedDelta) >= SCROLL_THRESHOLD) {
      if (accumulatedDelta > 0) {
        sendScroll('up');
        accumulatedDelta -= SCROLL_THRESHOLD;
      } else {
        sendScroll('down');
        accumulatedDelta += SCROLL_THRESHOLD;
      }
    }

    lastTouchY = touchY;
    lastTouchTime = currentTime;
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    handleTouchEnd();
  };

  const handlePointerCancel = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    handleTouchCancel();
  };

  let debugCount = 0;
  const showDebug = (msg: string) => {
    debugCount++;
    if ((window as any).__setScrollDebug) {
      (window as any).__setScrollDebug(`[${debugCount}] ${msg}`);
    }
  };

  if (supportsPointer) {
    showDebug('使用 Pointer 事件');
    // 直接绑定到 document 来测试
    document.addEventListener('pointerdown', handlePointerDown, { passive: false, capture: true });
    document.addEventListener('pointermove', handlePointerMove, { passive: false, capture: true });
    document.addEventListener('pointerup', handlePointerUp, { passive: true, capture: true });
    document.addEventListener('pointercancel', handlePointerCancel, { passive: true, capture: true });
  } else {
    showDebug('使用 Touch 事件');
    document.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', handleTouchEnd, { capture: true });
    document.addEventListener('touchcancel', handleTouchCancel, { capture: true });
  }

  return () => {
    cancelInertia();
    if (supportsPointer) {
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true } as EventListenerOptions);
      document.removeEventListener('pointermove', handlePointerMove, { capture: true } as EventListenerOptions);
      document.removeEventListener('pointerup', handlePointerUp, { capture: true } as EventListenerOptions);
      document.removeEventListener('pointercancel', handlePointerCancel, { capture: true } as EventListenerOptions);
    } else {
      document.removeEventListener('touchstart', handleTouchStart, { capture: true } as EventListenerOptions);
      document.removeEventListener('touchmove', handleTouchMove, { capture: true } as EventListenerOptions);
      document.removeEventListener('touchend', handleTouchEnd, { capture: true } as EventListenerOptions);
      document.removeEventListener('touchcancel', handleTouchCancel, { capture: true } as EventListenerOptions);
    }
  };
}
