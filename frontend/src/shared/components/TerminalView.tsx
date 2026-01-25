import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { SocketService } from '../core/socket';
import { useKeyboardStore } from '../stores/keyboardStore';

interface TerminalViewProps {
  socket: SocketService;
  fontSize: number;
  onResize?: (cols: number, rows: number) => void;
  onTerminalReady?: (term: Terminal, container: HTMLElement) => void;
}

export const TerminalView: React.FC<TerminalViewProps> = ({
  socket,
  fontSize,
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
      // Use setTimeout to ensure DOM has updated before fitting
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          // Send resize to server
          if (termRef.current && socket.isConnected) {
            const cols = termRef.current.cols;
            const rows = termRef.current.rows;
            // Only send if we have valid dimensions
            if (cols > 0 && rows > 0) {
              socket.sendControl({
                type: 'resize',
                payload: { cols, rows },
              });
            }
          }
        } catch (e) {
          console.warn('fit error:', e);
        }
      }, 50);
    }
  }, [fontSize, socket]);

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
        cols: 80,
        rows: 24,
        allowProposedApi: true,
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

      setTimeout(() => {
        try {
          fitAddon.fit();
          if (socket.isConnected) {
            socket.sendControl({
              type: 'resize',
              payload: { cols: term.cols, rows: term.rows },
            });
          }
        } catch (e) {
          console.warn('[Terminal] Initial fit error:', e);
        }
      }, 100);

      const unsubData = socket.onData((data) => {
        if (typeof data === 'string') {
          term.write(data);
        } else {
          term.write(new Uint8Array(data));
        }
        term.scrollToBottom();
      });

      const unsubOpen = socket.onOpen(() => {
        setTimeout(() => {
          socket.sendControl({
            type: 'resize',
            payload: { cols: term.cols, rows: term.rows },
          });
        }, 200);
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

        socket.send(finalData);
        consumeModifiers();
      });

      const handleResize = () => {
        try {
          fitAddon.fit();
          if (socket.isConnected) {
            socket.sendControl({
              type: 'resize',
              payload: { cols: term.cols, rows: term.rows },
            });
          }
          onResize?.(term.cols, term.rows);
        } catch (e) {
          console.warn('[Terminal] Resize error:', e);
        }
      };

      window.addEventListener('resize', handleResize);
      container.addEventListener('click', () => {
        term.focus();
      });

      // Add ResizeObserver to detect container size changes (e.g., when mobile keyboard appears)
      const resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(container);

      return () => {
        unsubData();
        unsubOpen();
        window.removeEventListener('resize', handleResize);
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
