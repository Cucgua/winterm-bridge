import { Terminal } from 'xterm';
import { SocketService } from '../../../shared/core/socket';
import { useKeyboardStore } from '../../../shared/stores/keyboardStore';

export function attachMobileHandlers(
  term: Terminal,
  container: HTMLElement,
  socket: SocketService
): void {
  const textarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
  if (!textarea) return;

  let isComposing = false;
  let lastCompositionData = '';

  // Helper function to apply modifiers and send data
  const sendWithModifiers = (data: string) => {
    const { modifiers, consumeModifiers } = useKeyboardStore.getState();
    let finalData = data;

    // Apply Ctrl modifier: convert to control character
    if (modifiers.ctrl !== 'idle' && data.length === 1) {
      const code = data.charCodeAt(0);
      // a-z -> Ctrl+A to Ctrl+Z (0x01 - 0x1A)
      if (code >= 97 && code <= 122) {
        finalData = String.fromCharCode(code - 96);
      } else if (code >= 65 && code <= 90) {
        finalData = String.fromCharCode(code - 64);
      }
    }

    // Apply Alt modifier: prefix with ESC
    if (modifiers.alt !== 'idle') {
      finalData = `\x1b${finalData}`;
    }

    socket.sendInput(finalData);
    consumeModifiers();
  };

  // IME composition handling
  textarea.addEventListener('compositionstart', () => {
    isComposing = true;
  });

  textarea.addEventListener('compositionend', (e: CompositionEvent) => {
    isComposing = false;
    lastCompositionData = e.data || '';
    if (e.data) {
      sendWithModifiers(e.data);
    }
  });

  // Direct input handling (non-IME)
  textarea.addEventListener('beforeinput', (e: InputEvent) => {
    if (isComposing) return;

    if (e.data === lastCompositionData && lastCompositionData !== '') {
      lastCompositionData = '';
      return;
    }

    // Handle different input types
    switch (e.inputType) {
      case 'insertText':
        if (e.data) {
          sendWithModifiers(e.data);
          e.preventDefault();
        }
        break;
      case 'deleteContentBackward':
        // Backspace - send DEL (0x7f)
        socket.sendInput('\x7f');
        e.preventDefault();
        break;
      case 'deleteContentForward':
        // Delete key - send escape sequence
        socket.sendInput('\x1b[3~');
        e.preventDefault();
        break;
      case 'insertLineBreak':
        // Enter key
        socket.sendInput('\r');
        e.preventDefault();
        break;
    }
  });

  // Touch scroll handling
  let touchStartY = 0;
  let touchStartTime = 0;
  let isScrolling = false;

  container.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    isScrolling = false;
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    const touchY = e.touches[0].clientY;
    const deltaY = touchStartY - touchY;

    if (Math.abs(deltaY) > 10) {
      isScrolling = true;

      const scrollLines = Math.floor(Math.abs(deltaY) / 20);
      if (scrollLines > 0) {
        if (deltaY > 0) {
          term.scrollLines(-scrollLines);
        } else {
          term.scrollLines(scrollLines);
        }
        touchStartY = touchY;
      }
    }
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    const touchDuration = Date.now() - touchStartTime;
    const touchDistance = Math.abs(touchEndY - touchStartY);

    // Quick tap = focus keyboard
    if (!isScrolling && touchDuration < 300 && touchDistance < 10) {
      // Only prevent default for tap-to-focus, not for scrolling
      e.preventDefault();
      term.focus();
      textarea.focus();
    }
    // For scrolling, don't prevent default behavior
  });
}
