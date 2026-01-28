import { SocketService } from '../../../shared/core/socket';
import { useKeyboardStore } from '../../../shared/stores/keyboardStore';

export function attachInputHandler(
  container: HTMLElement,
  socket: SocketService
): () => void {
  const textarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
  const screen = container.querySelector('.xterm-screen') as HTMLElement;

  if (!textarea) return () => {};

  // Apply wetty-style mobile keyboard attributes to xterm-screen
  if (screen) {
    screen.setAttribute('spellcheck', 'false');
    screen.setAttribute('autocorrect', 'off');
    screen.setAttribute('autocomplete', 'off');
    screen.setAttribute('autocapitalize', 'off');
  }

  // Also apply to textarea
  textarea.setAttribute('spellcheck', 'false');
  textarea.setAttribute('autocorrect', 'off');
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocapitalize', 'off');
  textarea.setAttribute('enterkeyhint', 'send');

  // Prevent xterm's default click-to-focus behavior on mobile
  const preventAutoFocus = (e: FocusEvent) => {
    if (textarea.dataset.allowFocus !== 'true') {
      e.preventDefault();
      textarea.blur();
    }
  };

  textarea.addEventListener('focus', preventAutoFocus, true);

  // Prevent click on terminal from focusing textarea (but allow touch scrolling)
  const preventClickFocus = (e: MouseEvent) => {
    if (textarea.dataset.allowFocus !== 'true') {
      e.preventDefault();
    }
  };

  container.addEventListener('mousedown', preventClickFocus, true);

  // IME composition handling
  let isComposing = false;

  const handleCompositionStart = () => {
    isComposing = true;
  };

  const handleCompositionEnd = (e: CompositionEvent) => {
    isComposing = false;
    if (e.data) {
      const { modifiers, consumeModifiers } = useKeyboardStore.getState();
      let finalData = e.data;

      if (modifiers.alt !== 'idle') {
        finalData = `\x1b${finalData}`;
      }

      socket.sendInput(finalData);
      consumeModifiers();
    }
  };

  // Handle special keys via beforeinput
  const handleBeforeInput = (e: InputEvent) => {
    if (isComposing) return;

    switch (e.inputType) {
      case 'deleteContentBackward':
        socket.sendInput('\x7f');
        e.preventDefault();
        break;
      case 'deleteContentForward':
        socket.sendInput('\x1b[3~');
        e.preventDefault();
        break;
      case 'insertLineBreak':
        socket.sendInput('\r');
        e.preventDefault();
        break;
    }
  };

  textarea.addEventListener('compositionstart', handleCompositionStart);
  textarea.addEventListener('compositionend', handleCompositionEnd as EventListener);
  textarea.addEventListener('beforeinput', handleBeforeInput as EventListener);

  return () => {
    textarea.removeEventListener('focus', preventAutoFocus, true);
    container.removeEventListener('mousedown', preventClickFocus, true);
    textarea.removeEventListener('compositionstart', handleCompositionStart);
    textarea.removeEventListener('compositionend', handleCompositionEnd as EventListener);
    textarea.removeEventListener('beforeinput', handleBeforeInput as EventListener);
  };
}
