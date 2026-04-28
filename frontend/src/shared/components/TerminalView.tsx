import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { SocketService } from '../core/socket';
import { useKeyboardStore } from '../stores/keyboardStore';
import { loadCustomFonts } from '../core/api';
import { copyToClipboard } from '../utils/clipboard';
import { useTheme, TERMINAL_THEMES } from '../hooks/useTheme';

function getVisibleText(term: Terminal): string {
  const buffer = term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < term.rows; i++) {
    const line = buffer.getLine(buffer.viewportY + i);
    if (line) {
      lines.push(line.translateToString(true));
    }
  }
  return lines.join('\n');
}

interface TerminalViewProps {
  socket: SocketService;
  fontSize: number;
  fixedSize?: { cols: number; rows: number };
  disableClickFocus?: boolean;
  onResize?: (cols: number, rows: number) => void;
  onTerminalReady?: (term: Terminal, container: HTMLElement, resizeFn: () => void) => void;
  onImagePaste?: (blob: Blob) => void;
}

export const TerminalView: React.FC<TerminalViewProps> = ({
  socket,
  fontSize,
  fixedSize,
  disableClickFocus = false,
  onResize,
  onTerminalReady,
  onImagePaste,
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
  // Font loading state
  const [fontReady, setFontReady] = useState(false);
  const [customFont, setCustomFont] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  // Copy mode: overlay with selectable terminal text for when TUI apps capture mouse
  const [copyMode, setCopyMode] = useState(false);
  const [bufferText, setBufferText] = useState('');
  const copyModeRef = useRef(false);

  const exitCopyMode = useCallback(() => {
    setCopyMode(false);
    copyModeRef.current = false;
    window.dispatchEvent(new CustomEvent('copy-mode-changed', { detail: { active: false } }));
    termRef.current?.focus();
  }, []);

  const enterCopyMode = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    setBufferText(getVisibleText(term));
    setCopyMode(true);
    copyModeRef.current = true;
    window.dispatchEvent(new CustomEvent('copy-mode-changed', { detail: { active: true } }));
  }, []);

  // Load custom fonts first, before terminal initialization
  useEffect(() => {
    loadCustomFonts().then((fontName) => {
      setCustomFont(fontName);
      setFontReady(true);
    });
  }, []);

  // Handle theme changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = TERMINAL_THEMES[resolvedTheme];
    }
  }, [resolvedTheme]);

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

  // Initialize terminal (wait for font to be ready first)
  useEffect(() => {
    if (!containerRef.current || initializedRef.current || !fontReady) return;

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
        fontFamily: customFont
          ? `"${customFont}", Menlo, Monaco, "Courier New", monospace`
          : 'Menlo, Monaco, "Courier New", monospace',
        theme: TERMINAL_THEMES[resolvedTheme],
        cols: fixedSize?.cols ?? 80,
        rows: fixedSize?.rows ?? 24,
        allowProposedApi: true,
        scrollback: 1000,
      });

      // Handle keyboard shortcuts: Ctrl+Shift+X to copy, Ctrl+V to paste
      term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        if (e.key === 'Escape' && e.type === 'keydown' && copyModeRef.current) {
          exitCopyMode();
          return false;
        }

        // Ctrl+Shift+X: copy selection, or enter copy mode if no selection
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'X' && e.type === 'keydown') {
          const selection = term.getSelection();
          if (selection) {
            copyToClipboard(selection).catch(() => {});
          } else {
            enterCopyMode();
          }
          return false;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'v' && e.type === 'keydown') {
          e.preventDefault();

          navigator.clipboard.read().then(async (items) => {
            for (const item of items) {
              const imageType = item.types.find(t => t.startsWith('image/'));
              if (imageType) {
                try {
                  const blob = await item.getType(imageType);
                  onImagePaste?.(blob);
                } catch {
                  // Image extraction failed, continue to text
                }
                return;
              }
            }
            // No image found, fall back to text
            const textItem = items.find(i => i.types.includes('text/plain'));
            if (textItem) {
              const blob = await textItem.getType('text/plain');
              let text = await blob.text();
              if (text) {
                // Strip trailing newline from pasted content
                text = text.replace(/\r?\n$/, '');
                // Let xterm handle paste so bracketed paste mode reaches the PTY.
                term.paste(text);
              }
            }
          }).catch(() => {
            // Clipboard API read() not supported, fall back to readText
            navigator.clipboard.readText().then((rawText) => {
              const text = rawText?.replace(/\r?\n$/, '');
              if (text) {
                term.paste(text);
              }
            }).catch(() => {
              // Clipboard access denied
            });
          });

          return false;
        }
        return true;
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      term.open(container);

      // Handle OSC 52 clipboard sequence from tmux
      // When tmux copies text (with set-clipboard on), it sends OSC 52 with base64-encoded content
      term.parser.registerOscHandler(52, (data) => {
        // OSC 52 format: Pc;Pd where Pc is clipboard name (c/p/s) and Pd is base64 data
        const parts = data.split(';');
        if (parts.length >= 2) {
          const base64Data = parts.slice(1).join(';');
          if (base64Data && base64Data !== '?') {
            try {
              // Decode base64 to binary, then decode as UTF-8
              const binaryStr = atob(base64Data);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              const text = new TextDecoder('utf-8').decode(bytes);
              copyToClipboard(text).catch(() => {
                // Clipboard access denied
              });
            } catch {
              // Invalid base64, ignore
            }
          }
        }
        return true; // Mark as handled
      });

      // Auto-copy on selection: mirrors Linux terminal behavior (select = copy)
      term.onSelectionChange(() => {
        const selection = term.getSelection();
        if (selection) {
          copyToClipboard(selection).catch(() => {});
        }
      });

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
  }, [fontReady]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      termRef.current?.dispose();
    };
  }, []);

  // Global Escape listener for copy mode (terminal may not have focus when overlay is shown)
  useEffect(() => {
    if (!copyMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitCopyMode();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [copyMode, exitCopyMode]);

  // Listen for copy-mode toggle from external UI (e.g. toolbar button)
  useEffect(() => {
    const handler = () => {
      if (copyModeRef.current) {
        exitCopyMode();
      } else {
        enterCopyMode();
      }
    };
    window.addEventListener('toggle-copy-mode', handler);
    return () => window.removeEventListener('toggle-copy-mode', handler);
  }, [enterCopyMode, exitCopyMode]);

  const handleCopyModeMouseUp = useCallback(() => {
    const sel = window.getSelection()?.toString();
    if (sel) {
      copyToClipboard(sel).catch(() => {});
    }
  }, []);

  const fontFamily = customFont
    ? `"${customFont}", Menlo, Monaco, "Courier New", monospace`
    : 'Menlo, Monaco, "Courier New", monospace';

  return (
    <div className="w-full h-full overflow-hidden relative">
      <div
        className="w-full h-full"
        ref={containerRef}
        style={{ minHeight: '200px', background: TERMINAL_THEMES[resolvedTheme].background }}
      />
      {copyMode && (
        <div
          className="absolute inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(0, 0, 0, 0.85)' }}
        >
          <div className="flex items-center justify-between px-3 py-1 text-xs text-white bg-accent/90">
            <span>Copy Mode — select text, auto-copied</span>
            <button onClick={exitCopyMode} className="px-1.5 hover:opacity-80">Esc ✕</button>
          </div>
          <pre
            className="flex-1 overflow-auto p-2 m-0 whitespace-pre cursor-text"
            style={{
              fontFamily,
              fontSize: `${fontSize}px`,
              lineHeight: '1.2',
              color: '#e4e4e7',
              userSelect: 'text',
              WebkitUserSelect: 'text',
            }}
            onMouseUp={handleCopyModeMouseUp}
          >
            {bufferText}
          </pre>
        </div>
      )}
    </div>
  );
};
