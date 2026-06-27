import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { socket } from '../core/socket';
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme, TERMINAL_THEMES } from '../hooks/useTheme';
import { loadCustomFonts, getCachedFontName } from '../core/api';

interface Props {
  sessionId: string;
}

// Fallback monospace stack — mirrors frontend; overridden when a custom font
// is available from the backend (/api/fonts).
const FALLBACK_FONT = '"Fira Code", "JetBrains Mono", "Hack", "MesloLGS NF", "Menlo", "Courier New", monospace';

export function TerminalView({ sessionId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // Buffer for PTY data received before the terminal is ready. Without this,
  // history replayed by the backend on attach is dropped when switching
  // sessions (the new terminal hasn't initialized yet). Mirrors frontend.
  const dataBufferRef = useRef<(Uint8Array | string)[]>([]);
  const fontSize = useSettingsStore(s => s.fontSize);
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
    const offData = socket.onData(data => {
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
      theme: TERMINAL_THEMES[resolvedTheme],
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
        socket.setTerminalSize(termRef.current.cols, termRef.current.rows);
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

    // If socket is already connected (session switch), force refresh to get
    // tmux screen content. Also trigger on socket open.
    if (socket.isConnected) {
      setTimeout(forceRefresh, 300);
    }
    const offOpen = socket.onOpen(() => {
      setTimeout(forceRefresh, 200);
    });

    // (Socket → Terminal data subscription lives in a separate effect above,
    // so data is buffered even before/after this terminal instance exists.)


    // Terminal → Socket: keyboard input
    const onDataDisposable = term.onData(data => {
      socket.sendInput(data);
    });

    // Resize handling — wrapped in safeFit to avoid renderer race
    const syncSize = () => {
      safeFit();
      if (termRef.current && socket.isConnected) {
        socket.sendResize(termRef.current.cols, termRef.current.rows);
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
      onDataDisposable.dispose();
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

  // Update theme when resolvedTheme changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = TERMINAL_THEMES[resolvedTheme];
    }
  }, [resolvedTheme]);

  // Update font size when settings change
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize;
      try { fitRef.current?.fit(); } catch { /* renderer not ready */ }
    }
  }, [fontSize]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
