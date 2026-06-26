import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { socket } from '../core/socket';
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme, TERMINAL_THEMES } from '../hooks/useTheme';

interface Props {
  sessionId: string;
}

export function TerminalView({ sessionId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const fontSize = useSettingsStore(s => s.fontSize);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;

    // Create terminal — use DOM renderer for WebKitGTK compatibility
    // (canvas/WebGL renderers have issues in Tauri's WebKitGTK WebView)
    const term = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
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

    term.open(containerRef.current);

    // Wait for the renderer to be ready before fitting.
    // xterm's renderer initializes async; calling fit() before it's ready
    // throws "this._renderer.value.dimensions" error.
    const safeFit = () => {
      try {
        if (fitRef.current && termRef.current) {
          fitRef.current.fit();
        }
      } catch (e) {
        // Renderer not ready yet — retry after a short delay
        console.warn('[TerminalView] fit() deferred, renderer not ready');
      }
    };

    // Initial fit after a microtask delay to let renderer initialize
    requestAnimationFrame(() => {
      safeFit();
      // Report initial size to socket
      if (termRef.current) {
        socket.setTerminalSize(termRef.current.cols, termRef.current.rows);
      }
    });

    // Socket → Terminal: PTY output
    const offData = socket.onData(data => {
      if (termRef.current) {
        if (typeof data === 'string') {
          term.write(data);
        } else {
          term.write(data);
        }
      }
    });

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
    resizeObserver.observe(containerRef.current);
    window.addEventListener('resize', syncSize);

    return () => {
      offData();
      onDataDisposable.dispose();
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncSize);
      term.dispose();
      termRef.current = null;
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

  return <div ref={containerRef} className="h-full w-full" />;
}
