import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { SocketService } from '../core/socket';
import { useKeyboardStore } from '../stores/keyboardStore';

interface TerminalViewProps {
  socket: SocketService;
  fontSize: number;
  fixedSize?: { cols: number; rows: number };
  disableClickFocus?: boolean;
  onResize?: (cols: number, rows: number) => void;
  onTerminalReady?: (term: Terminal, container: HTMLElement) => void;
}

export const TerminalView: React.FC<TerminalViewProps> = ({
  socket,
  fontSize,
  fixedSize,
  disableClickFocus = false,
  onResize,
  onTerminalReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initializedRef = useRef(false);
  // Buffer for data received before terminal is ready
  const dataBufferRef = useRef<(Uint8Array | string)[]>([]);

  // Handle font size changes
  useEffect(() => {
    if (termRef.current && fitAddonRef.current) {
      termRef.current.options.fontSize = fontSize;
      setTimeout(() => {
        try {
          if (fixedSize) {
            termRef.current?.resize(fixedSize.cols, fixedSize.rows);
          } else {
            fitAddonRef.current?.fit();
          }
          if (termRef.current && socket.isConnected) {
            const cols = termRef.current.cols;
            const rows = termRef.current.rows;
            if (cols > 0 && rows > 0) {
              socket.sendResize(cols, rows);
            }
          }
        } catch (e) {
          // fit error, ignore
        }
      }, 50);
    }
  }, [fontSize, socket, fixedSize]);

  // Subscribe to socket data - separate from terminal initialization
  useEffect(() => {
    const unsubData = socket.onData((data) => {
      const term = termRef.current;
      if (term) {
        if (typeof data === 'string') {
          term.write(data);
        } else {
          term.write(new Uint8Array(data));
        }
      } else {
        // Terminal not ready, buffer the data (copy ArrayBuffer to avoid reuse issues)
        if (typeof data === 'string') {
          dataBufferRef.current.push(data);
        } else {
          // Copy the ArrayBuffer
          const copy = new Uint8Array(data).slice();
          dataBufferRef.current.push(copy);
        }
      }
    });

    return () => {
      unsubData();
    };
  }, [socket]);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;

    const container = containerRef.current;

    const checkAndInit = () => {
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        requestAnimationFrame(checkAndInit);
        return;
      }
      initTerminal();
    };

    const initTerminal = () => {
      if (initializedRef.current) return;
      initializedRef.current = true;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: fontSize,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#1a1a1a',
          foreground: '#f0f0f0',
          cursor: '#00ff00',
        },
        cols: fixedSize?.cols ?? 80,
        rows: fixedSize?.rows ?? 24,
        allowProposedApi: true,
        scrollback: 1000,
      });

      term.attachCustomKeyEventHandler(() => true);

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      term.open(container);

      // Wait for terminal to be fully ready before setting refs and flushing data
      requestAnimationFrame(() => {
        termRef.current = term;
        fitAddonRef.current = fitAddon;

        // Flush buffered data
        if (dataBufferRef.current.length > 0) {
          for (const data of dataBufferRef.current) {
            if (typeof data === 'string') {
              term.write(data);
            } else {
              term.write(data); // Already Uint8Array
            }
          }
          dataBufferRef.current = [];
        }

        // Call platform-specific handler if provided
        onTerminalReady?.(term, container);

        // Unified size sync function
        const syncTermSize = () => {
          try {
            if (!fixedSize) {
              fitAddon.fit();
            }
            const cols = term.cols;
            const rows = term.rows;
            if (cols > 0 && rows > 0 && socket.isConnected) {
              socket.sendResize(cols, rows);
            }
          } catch (e) {
            // sync size error, ignore
          }
        };

        setTimeout(syncTermSize, 100);

        // If socket is already connected, sync size to refresh tmux screen
        if (socket.isConnected) {
          setTimeout(syncTermSize, 300);
        }

        socket.onOpen(() => {
          setTimeout(syncTermSize, 200);
        });

        term.onData((data) => {
          const { modifiers, consumeModifiers } = useKeyboardStore.getState();
          let finalData = data;

          if (modifiers.ctrl !== 'idle' && data.length === 1) {
            const code = data.charCodeAt(0);
            if (code >= 97 && code <= 122) {
              finalData = String.fromCharCode(code - 96);
            } else if (code >= 65 && code <= 90) {
              finalData = String.fromCharCode(code - 64);
            }
          }

          if (modifiers.alt !== 'idle') {
            finalData = `\x1b${finalData}`;
          }

          socket.sendInput(finalData);
          consumeModifiers();
        });

        const handleResize = () => {
          syncTermSize();
          onResize?.(term.cols, term.rows);
        };

        window.addEventListener('resize', handleResize);

        // Resize on page visibility change and window focus
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            setTimeout(syncTermSize, 100);
          }
        };
        const handleWindowFocus = () => {
          setTimeout(syncTermSize, 100);
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleWindowFocus);

        // Only add click-to-focus on desktop (mobile uses dedicated INPUT button)
        const handleClick = () => term.focus();
        if (!disableClickFocus) {
          container.addEventListener('click', handleClick);
        }

        const resizeObserver = new ResizeObserver(() => {
          handleResize();
        });
        resizeObserver.observe(container);
      });

      // Cleanup is not returned here since this effect should only run once
    };

    checkAndInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      termRef.current?.dispose();
    };
  }, []);

  return (
    <div
      className="w-full h-full overflow-hidden"
      ref={containerRef}
      style={{ minHeight: '200px', background: '#1a1a1a' }}
    />
  );
};
