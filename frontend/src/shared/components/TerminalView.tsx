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

  useEffect(() => {
    if (termRef.current && fitAddonRef.current) {
      termRef.current.options.fontSize = fontSize;
      setTimeout(() => {
        try {
          if (fixedSize) {
            // Fixed mode: resize terminal to fixed dimensions
            termRef.current?.resize(fixedSize.cols, fixedSize.rows);
          } else {
            // Fit mode: auto-fit to container
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
          console.warn('fit error:', e);
        }
      }, 50);
    }
  }, [fontSize, socket, fixedSize]);

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

      term.writeln('\x1b[32m[WinTerm Bridge]\x1b[0m Terminal initialized');
      term.writeln('Waiting for data from server...');
      term.writeln('');

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      // Call platform-specific handler if provided
      onTerminalReady?.(term, container);

      // Unified size sync function
      const syncTermSize = () => {
        try {
          // Skip fit if using fixed size mode
          if (!fixedSize) {
            fitAddon.fit();
          }
          const cols = term.cols;
          const rows = term.rows;
          if (cols > 0 && rows > 0 && socket.isConnected) {
            socket.sendResize(cols, rows);
          }
        } catch (e) {
          console.warn('[Terminal] Sync size error:', e);
        }
      };

      setTimeout(syncTermSize, 100);

      const unsubData = socket.onData((data) => {
        if (typeof data === 'string') {
          term.write(data);
        } else {
          term.write(new Uint8Array(data));
        }
        // Note: Removed automatic scrollToBottom() to allow user scroll control
        // Users can use FloatingScrollController to jump to bottom when needed
      });

      const unsubOpen = socket.onOpen(() => {
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

      // Only add click-to-focus on desktop (mobile uses dedicated INPUT button)
      const handleClick = () => term.focus();
      if (!disableClickFocus) {
        container.addEventListener('click', handleClick);
      }

      const resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(container);

      return () => {
        unsubData();
        unsubOpen();
        window.removeEventListener('resize', handleResize);
        if (!disableClickFocus) {
          container.removeEventListener('click', handleClick);
        }
        resizeObserver.disconnect();
        term.dispose();
      };
    };

    checkAndInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, onResize, onTerminalReady]);

  return (
    <div
      className="w-full h-full overflow-hidden"
      ref={containerRef}
      style={{ minHeight: '200px', background: '#1a1a1a' }}
    />
  );
};
