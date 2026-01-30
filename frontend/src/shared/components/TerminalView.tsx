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
  onTerminalReady?: (term: Terminal, container: HTMLElement, resizeFn: () => void) => void;
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
  // Track IME composition state to prevent sending partial input on mobile
  const isComposingRef = useRef(false);
  // Track last sent data to prevent duplicate sends (mobile input event + desktop onData)
  const lastSentRef = useRef({ data: '', time: 0 });

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

        // Set up IME composition event listeners on xterm's hidden textarea
        const textarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
        if (textarea) {
          textarea.addEventListener('compositionstart', () => {
            isComposingRef.current = true;
          });

          textarea.addEventListener('compositionend', () => {
            isComposingRef.current = false;
          });

          // Mobile keyboard workaround: handle input event directly
          // since xterm's onData doesn't fire reliably on mobile virtual keyboards
          textarea.addEventListener('input', (e: Event) => {
            const inputEvent = e as InputEvent;
            const data = inputEvent.data;

            // Skip during composition (wait for compositionend)
            if (isComposingRef.current) {
              return;
            }

            // Send the input data directly
            if (data) {
              // Dedup: don't send if same data was sent very recently (prevents double-send)
              const now = Date.now();
              if (data === lastSentRef.current.data && now - lastSentRef.current.time < 50) {
                return;
              }
              lastSentRef.current = { data, time: now };
              socket.sendInput(data);
            }
          });
        }

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

        // Force tmux to redraw by sending a slightly different size then the correct size.
        // This handles the case where terminal dimensions haven't changed between sessions,
        // which would cause tmux to skip redrawing.
        const forceRefresh = () => {
          try {
            const cols = term.cols;
            const rows = term.rows;
            if (cols > 1 && rows > 0 && socket.isConnected) {
              socket.sendResize(cols - 1, rows);
              setTimeout(() => {
                if (socket.isConnected) {
                  socket.sendResize(cols, rows);
                }
              }, 50);
            }
          } catch (e) {
            // ignore
          }
        };

        // Call platform-specific handler with resize function
        onTerminalReady?.(term, container, syncTermSize);

        setTimeout(syncTermSize, 100);

        // Mobile keyboard resize: trigger fit after keyboard animation completes
        const textareaForFocus = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
        if (textareaForFocus) {
          textareaForFocus.addEventListener('focus', () => {
            // Keyboard animation takes ~300ms, trigger multiple resyncs
            setTimeout(syncTermSize, 100);
            setTimeout(syncTermSize, 300);
            setTimeout(syncTermSize, 500);
          });
          textareaForFocus.addEventListener('blur', () => {
            setTimeout(syncTermSize, 100);
            setTimeout(syncTermSize, 300);
          });
        }

        // If socket is already connected, force refresh to get tmux screen content
        // (this happens during session switch where WS might already be open)
        if (socket.isConnected) {
          setTimeout(forceRefresh, 300);
        }

        socket.onOpen(() => {
          // Force refresh when socket opens to ensure tmux redraws
          setTimeout(forceRefresh, 200);
        });

        term.onData((data) => {
          // Skip sending during IME composition to prevent partial character input
          if (isComposingRef.current) {
            return;
          }

          // Dedup: don't send if same data was sent very recently via input event
          const now = Date.now();
          if (data === lastSentRef.current.data && now - lastSentRef.current.time < 50) {
            return;
          }

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
          lastSentRef.current = { data: finalData, time: Date.now() };
          consumeModifiers();
        });

        const handleResize = () => {
          syncTermSize();
          onResize?.(term.cols, term.rows);
        };

        window.addEventListener('resize', handleResize);

        // Listen to visualViewport for mobile keyboard changes
        const viewport = window.visualViewport;
        if (viewport) {
          viewport.addEventListener('resize', handleResize);
          viewport.addEventListener('scroll', handleResize);
        }

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
