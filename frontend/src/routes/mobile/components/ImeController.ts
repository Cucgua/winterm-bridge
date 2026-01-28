import { useState, useEffect, useCallback, useRef } from 'react';

interface UseImeControllerResult {
  isInputActive: boolean;
  toggleInput: () => void;
  getTextarea: () => HTMLTextAreaElement | null;
  setTextareaRef: (textarea: HTMLTextAreaElement | null) => void;
}

export function useImeController(): UseImeControllerResult {
  const [isInputActive, setIsInputActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const setTextareaRef = useCallback((textarea: HTMLTextAreaElement | null) => {
    textareaRef.current = textarea;
  }, []);

  const getTextarea = useCallback(() => textareaRef.current, []);

  const toggleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (isInputActive) {
      textarea.dataset.allowFocus = 'false';
      textarea.blur();
      setIsInputActive(false);
    } else {
      textarea.dataset.allowFocus = 'true';
      textarea.focus();
      setIsInputActive(true);
    }
  }, [isInputActive]);

  // Sync with visualViewport to detect keyboard visibility
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let initialHeight = viewport.height;

    const handleResize = () => {
      const currentHeight = viewport.height;
      const heightDiff = initialHeight - currentHeight;

      // Keyboard is likely visible if viewport shrunk significantly
      if (heightDiff > 100) {
        setIsInputActive(true);
      } else if (heightDiff < 50) {
        setIsInputActive(false);
        if (textareaRef.current) {
          textareaRef.current.dataset.allowFocus = 'false';
        }
      }
    };

    viewport.addEventListener('resize', handleResize);
    return () => viewport.removeEventListener('resize', handleResize);
  }, []);

  return { isInputActive, toggleInput, getTextarea, setTextareaRef };
}
