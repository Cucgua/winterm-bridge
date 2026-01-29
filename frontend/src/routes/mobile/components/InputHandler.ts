/**
 * Mobile input handler - simply exposes xterm's textarea for focus control.
 * All actual input is handled by term.onData in TerminalView.
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

  return () => {
    delete (container as any).__mobileInput;
  };
}
