import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { socket, SocketService } from '../core/socket';
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme, TERMINAL_THEMES } from '../hooks/useTheme';
import { api, loadCustomFonts, getCachedFontName } from '../core/api';
import { getEffectiveTerminalBackground } from '../utils/terminalBackground';
import { copyToClipboard } from '../utils/clipboard';
import { mapBrowserReservedTerminalShortcut } from '../utils/terminalKeys';
import {
  readPasteEventPayload,
  readTerminalClipboardPayload,
  type ClipboardItemLike,
  type TerminalClipboardPayload,
} from '../utils/terminalClipboard';

interface Props {
  sessionId: string;
  /**
   * Optional dedicated socket instance for split-pane mode. When provided,
   * this TerminalView subscribes to/sends through it instead of the global
   * singleton, so multiple panes can each bind their own session's data stream.
   * Single-session tabs omit this and use the global `socket` (unchanged behavior).
   */
  socketInstance?: SocketService;
}

// Fallback monospace stack — mirrors frontend; overridden when a custom font
// is available from the backend (/api/fonts).
const FALLBACK_FONT = '"Fira Code", "JetBrains Mono", "Hack", "MesloLGS NF", "Menlo", "Courier New", monospace';

export function TerminalView({ sessionId, socketInstance }: Props) {
  // Resolve the socket once: a split pane passes its own instance; single-session
  // tabs use the global singleton. Captured in a ref so effect closures see a
  // stable value without re-running on every render.
  const sockRef = useRef(socketInstance ?? socket);
  sockRef.current = socketInstance ?? socket;
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // Buffer for PTY data received before the terminal is ready. Without this,
  // history replayed by the backend on attach is dropped when switching
  // sessions (the new terminal hasn't initialized yet). Mirrors frontend.
  const dataBufferRef = useRef<(Uint8Array | string)[]>([]);
  const fontSize = useSettingsStore(s => s.fontSize);
  const terminalBackground = useSettingsStore(s => s.terminalBackground);
  const effectiveBackground = useMemo(
    () => getEffectiveTerminalBackground(terminalBackground),
    [terminalBackground],
  );
  const { resolvedTheme } = useTheme();

  // Custom font loaded from the backend (if any). Mirrors frontend's
  // loadCustomFonts() flow so the terminal renders the same font on desktop.
  const [customFont, setCustomFont] = useState<string | null>(getCachedFontName());
  const fontFamily = customFont
    ? `"${customFont}", ${FALLBACK_FONT}`
    : FALLBACK_FONT;

  // Load custom fonts from the backend before terminal init (mirrors frontend).
  // If a font is already cached, getCachedFontName() returned it synchronously
  // and customFont is already set; otherwise fetch + register via FontFace.
  useEffect(() => {
    if (customFont) return; // already loaded (cached)
    let cancelled = false;
    loadCustomFonts().then(name => {
      if (!cancelled && name) setCustomFont(name);
    });
    return () => { cancelled = true; };
  }, [customFont]);

  // Update fontFamily on the live terminal once a custom font resolves.
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontFamily = fontFamily;
      try { fitRef.current?.fit(); } catch { /* renderer not ready */ }
    }
  }, [fontFamily]);

  // Socket → terminal data subscription. SEPARATE from terminal init so that
  // data arriving before the terminal is ready is buffered (not dropped).
  // This is what preserves session history when re-opening a session: the
  // backend replays history over the socket immediately on attach, and we
  // hold it until the new terminal instance is ready to render it.
  useEffect(() => {
    const sock = sockRef.current;
    const offData = sock.onData(data => {
      const term = termRef.current;
      if (term) {
        if (typeof data === 'string') {
          term.write(data);
        } else {
          term.write(data);
        }
      } else {
        // Terminal not ready yet — buffer the data. Copy ArrayBuffer-backed
        // data to avoid reuse issues (mirrors frontend).
        if (typeof data === 'string') {
          dataBufferRef.current.push(data);
        } else {
          dataBufferRef.current.push(new Uint8Array(data).slice());
        }
      }
    });
    return () => { offData(); };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const sock = sockRef.current;

    // Track cancellation so the rAF loop doesn't initialize after unmount.
    let cancelled = false;
    // Captured cleanup from initTerminal (only set once initialized).
    let initCleanup: (() => void) | null = null;

    // Wait for the container to have a non-zero size before initializing.
    // When switching sessions the DOM mounts fresh; if we open xterm before
    // layout settles, fit() computes a 0×0 size and nothing renders until a
    // manual resize. Poll with requestAnimationFrame until ready (mirrors
    // frontend's checkAndInit). Also retry fit a few times because xterm's
    // DOM renderer initializes asynchronously.
    const checkAndInit = () => {
      if (cancelled) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        requestAnimationFrame(checkAndInit);
        return;
      }
      initCleanup = initTerminal();
    };

    const initTerminal = () => {
    // Create terminal — use DOM renderer for WebKitGTK compatibility
    // (canvas/WebGL renderers have issues in Tauri's WebKitGTK WebView)
    const term = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily,
      cols: 80,
      rows: 24,
      allowProposedApi: true,
      allowTransparency: true,
      scrollback: 1000,
      theme: {
        ...TERMINAL_THEMES[resolvedTheme],
        background: effectiveBackground ? 'rgba(0, 0, 0, 0)' : TERMINAL_THEMES[resolvedTheme].background,
      },
    });

    termRef.current = term;

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitRef.current = fitAddon;

    term.open(container);

    // Wait for the renderer to be ready before fitting.
    // xterm's renderer initializes async; calling fit() before it's ready
    // throws "this._renderer.value.dimensions" error. Retry a few times.
    let fitAttempts = 0;
    const safeFit = () => {
      try {
        if (fitRef.current && termRef.current) {
          fitRef.current.fit();
        }
      } catch (e) {
        // Renderer not ready yet — retry after a short delay (max a few tries)
        if (++fitAttempts < 10) {
          console.warn('[TerminalView] fit() deferred, retrying');
          requestAnimationFrame(safeFit);
        }
      }
    };

    // Wait for the renderer to be fully ready before flushing buffered data.
    // The backend replays session history over the socket on attach; if the
    // terminal wasn't ready yet, that data was buffered in dataBufferRef. We
    // flush it here so re-opened sessions show their history. (Mirrors frontend.)
    requestAnimationFrame(() => {
      safeFit();
      // Report initial size to socket
      if (termRef.current) {
        sock.setTerminalSize(termRef.current.cols, termRef.current.rows);
      }
      // Flush buffered PTY data (session history replayed on attach)
      if (dataBufferRef.current.length > 0) {
        for (const data of dataBufferRef.current) {
          term.write(data);
        }
        dataBufferRef.current = [];
      }
    });

    // Force tmux to redraw by sending a slightly different size then the
    // correct size. When switching/reopening a session whose terminal
    // dimensions haven't changed, tmux skips redrawing and the screen stays
    // blank until a manual resize. This is the key fix for "must resize to
    // see content". (Mirrors frontend's forceRefresh.)
    const forceRefresh = () => {
      try {
        const cols = term.cols;
        const rows = term.rows;
        if (cols > 1 && rows > 0 && sock.isConnected) {
          sock.sendResize(cols - 1, rows);
          setTimeout(() => {
            if (sock.isConnected) {
              sock.sendResize(cols, rows);
            }
          }, 50);
        }
      } catch (e) {
        // ignore
      }
    };

    // If socket is already connected (session switch), force refresh to get
    // tmux screen content. Also trigger on socket open.
    if (sock.isConnected) {
      setTimeout(forceRefresh, 300);
    }
    const offOpen = sock.onOpen(() => {
      setTimeout(forceRefresh, 200);
    });

    // (Socket → Terminal data subscription lives in a separate effect above,
    // so data is buffered even before/after this terminal instance exists.)


    const pastePayload = async (payload: TerminalClipboardPayload | null) => {
      if (!payload) return;
      if (payload.kind === 'text') {
        term.paste(payload.text);
        return;
      }

      try {
        const result = await api.uploadFile(payload.blob);
        sock.sendInput(`${result.path} `);
      } catch (error) {
        console.warn('Failed to paste image', error);
      }
    };

    const readClipboardAndPaste = async () => {
      const clipboard = navigator.clipboard;
      if (!clipboard) return;

      try {
        const readItems =
          'read' in clipboard
            ? await clipboard.read()
            : [];
        await pastePayload(
          await readTerminalClipboardPayload(
            readItems as readonly ClipboardItemLike[],
            () => clipboard.readText(),
          ),
        );
      } catch {
        try {
          await pastePayload(
            await readTerminalClipboardPayload([], () => clipboard.readText()),
          );
        } catch {
          // Clipboard access denied or unsupported by the current WebView.
        }
      }
    };

    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      const terminalShortcut = mapBrowserReservedTerminalShortcut(
        event,
        navigator.platform.toLowerCase().includes('mac'),
      );
      if (terminalShortcut && event.type === 'keydown') {
        event.preventDefault();
        sock.sendInput(terminalShortcut);
        return false;
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'c' && event.type === 'keydown') {
        const selection = term.getSelection();
        if (selection) {
          copyToClipboard(selection).catch(() => {});
          return false;
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && event.type === 'keydown') {
        event.preventDefault();
        readClipboardAndPaste();
        return false;
      }

      return true;
    });

    const osc52Disposable = term.parser.registerOscHandler(52, (data) => {
      const parts = data.split(';');
      if (parts.length >= 2) {
        const base64Data = parts.slice(1).join(';');
        if (base64Data && base64Data !== '?') {
          try {
            const binary = atob(base64Data);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
              bytes[index] = binary.charCodeAt(index);
            }
            copyToClipboard(new TextDecoder('utf-8').decode(bytes)).catch(() => {});
          } catch {
            // Ignore malformed OSC 52 data from terminal applications.
          }
        }
      }
      return true;
    });

    const selectionDisposable = term.onSelectionChange(() => {
      const selection = term.getSelection();
      if (selection) {
        copyToClipboard(selection).catch(() => {});
      }
    });

    const handlePaste = (event: ClipboardEvent) => {
      const payload = readPasteEventPayload(event);
      if (!payload) return;
      event.preventDefault();
      pastePayload(payload);
    };
    container.addEventListener('paste', handlePaste);

    // Terminal → Socket: keyboard input
    const onDataDisposable = term.onData(data => {
      sock.sendInput(data);
    });

    // Resize handling — wrapped in safeFit to avoid renderer race
    const syncSize = () => {
      safeFit();
      if (termRef.current && sock.isConnected) {
        sock.sendResize(termRef.current.cols, termRef.current.rows);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize events
      requestAnimationFrame(syncSize);
    });
    resizeObserver.observe(container);
    window.addEventListener('resize', syncSize);

    return () => {
      offOpen();
      osc52Disposable.dispose();
      selectionDisposable.dispose();
      onDataDisposable.dispose();
      container.removeEventListener('paste', handlePaste);
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncSize);
      term.dispose();
      termRef.current = null;
    };
    }; // end initTerminal

    // Kick off: wait for non-zero container size, then initialize.
    checkAndInit();

    // Cleanup at effect level: cancel the pending init loop if the component
    // unmounts (or sessionId changes) before the container was ready, and run
    // the terminal cleanup if initialization did happen.
    return () => {
      cancelled = true;
      initCleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Update theme when resolvedTheme or background setting changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = {
        ...TERMINAL_THEMES[resolvedTheme],
        background: effectiveBackground ? 'rgba(0, 0, 0, 0)' : TERMINAL_THEMES[resolvedTheme].background,
      };
    }
  }, [resolvedTheme, effectiveBackground]);

  // Update font size when settings change
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize;
      try { fitRef.current?.fit(); } catch { /* renderer not ready */ }
    }
  }, [fontSize]);

  return (
    <div className="w-full h-full overflow-hidden relative bg-black">
      {effectiveBackground && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${JSON.stringify(effectiveBackground.imageUrl)})`,
              opacity: effectiveBackground.opacity,
            }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 bg-black"
            style={{ opacity: effectiveBackground.overlayOpacity }}
            aria-hidden="true"
          />
        </>
      )}
      <div
        ref={containerRef}
        className="relative z-10 w-full h-full"
        style={{
          minHeight: '200px',
          background: effectiveBackground ? 'transparent' : TERMINAL_THEMES[resolvedTheme].background,
        }}
      />
    </div>
  );
}
