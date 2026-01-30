/**
 * Mobile input handler - controls when xterm's textarea can receive focus.
 * Prevents keyboard from popping up on screen tap, only allows focus via INPUT button.
 */
export function attachInputHandler(
  container: HTMLElement
): () => void {
  // Get xterm's native textarea
  const textarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
  if (!textarea) {
    return () => {};
  }

  // Store reference for focus control (used by MobileTerminalLayer)
  (container as any).__mobileInput = textarea;

  // Initially disable focus
  textarea.dataset.allowFocus = 'false';

  // Prevent focus when clicking on terminal area (unless explicitly allowed)
  const handleFocus = (e: FocusEvent) => {
    if (textarea.dataset.allowFocus !== 'true') {
      e.preventDefault();
      textarea.blur();
    }
  };

  // Prevent touch from triggering focus
  const handleTouchEnd = (_e: TouchEvent) => {
    if (textarea.dataset.allowFocus !== 'true') {
      // Blur immediately if it got focused
      setTimeout(() => {
        if (document.activeElement === textarea && textarea.dataset.allowFocus !== 'true') {
          textarea.blur();
        }
      }, 0);
    }
  };

  textarea.addEventListener('focus', handleFocus);
  container.addEventListener('touchend', handleTouchEnd, { passive: true });

  return () => {
    delete (container as any).__mobileInput;
    textarea.removeEventListener('focus', handleFocus);
    container.removeEventListener('touchend', handleTouchEnd);
  };
}
