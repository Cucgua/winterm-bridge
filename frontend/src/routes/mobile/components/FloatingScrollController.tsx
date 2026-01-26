import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal } from 'xterm';
import { clsx } from 'clsx';

interface FloatingScrollControllerProps {
  terminalRef: React.RefObject<Terminal | null>;
  visible?: boolean;
}

export const FloatingScrollController: React.FC<FloatingScrollControllerProps> = ({
  terminalRef,
  visible = true,
}) => {
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef<number | null>(null);

  // Reset idle timer on any interaction
  const resetIdleTimer = useCallback(() => {
    setIsIdle(false);
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(() => {
      setIsIdle(true);
    }, 3000);
  }, []);

  // Initialize idle timer
  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [resetIdleTimer]);

  // Scroll functions
  const scrollUp = useCallback(() => {
    console.log('[FloatingScroll] scrollUp, termRef:', !!terminalRef.current);
    terminalRef.current?.scrollLines(-3);
    resetIdleTimer();
  }, [terminalRef, resetIdleTimer]);

  const scrollDown = useCallback(() => {
    console.log('[FloatingScroll] scrollDown, termRef:', !!terminalRef.current);
    terminalRef.current?.scrollLines(3);
    resetIdleTimer();
  }, [terminalRef, resetIdleTimer]);

  const scrollToBottom = useCallback(() => {
    console.log('[FloatingScroll] scrollToBottom');
    terminalRef.current?.scrollToBottom();
    resetIdleTimer();
  }, [terminalRef, resetIdleTimer]);

  if (!visible) {
    return null;
  }

  const buttonClass = clsx(
    'w-11 h-11 rounded-full',
    'flex items-center justify-center',
    'text-white text-lg font-bold',
    'shadow-lg',
    'transition-all duration-150',
    'select-none',
    'bg-gray-800/80 backdrop-blur active:bg-green-600 active:scale-95'
  );

  return (
    <div
      className={clsx(
        'fixed right-4 top-1/2 -translate-y-1/2',
        'flex flex-col gap-2',
        'z-50',
        'transition-opacity duration-300',
        isIdle ? 'opacity-30' : 'opacity-100'
      )}
    >
      {/* Scroll Up Button */}
      <button
        type="button"
        className={buttonClass}
        onPointerDown={(e) => {
          e.stopPropagation();
          console.log('[FloatingScroll] UP pressed');
          scrollUp();
        }}
        aria-label="Scroll up"
      >
        <svg className="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Jump to Bottom Button */}
      <button
        type="button"
        className={clsx(buttonClass, 'text-xs')}
        onPointerDown={(e) => {
          e.stopPropagation();
          console.log('[FloatingScroll] BOTTOM pressed');
          scrollToBottom();
        }}
        aria-label="Scroll to bottom"
      >
        <svg className="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>

      {/* Scroll Down Button */}
      <button
        type="button"
        className={buttonClass}
        onPointerDown={(e) => {
          e.stopPropagation();
          console.log('[FloatingScroll] DOWN pressed');
          scrollDown();
        }}
        aria-label="Scroll down"
      >
        <svg className="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
};
