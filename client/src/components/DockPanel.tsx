import { useEffect, useRef, useState, ReactNode, useCallback } from 'react';

interface Props {
  /** Current width in px. */
  width: number;
  minWidth?: number;
  maxWidth?: number;
  /** Whether the panel is collapsed (renders nothing). */
  collapsed: boolean;
  onWidthChange: (width: number) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  title: string;
  /** Optional icon shown in the header. */
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Right-side dock panel with a draggable resize handle and collapse toggle.
 *
 * Wraps FileManager / AIPanel. Resizing uses document-level pointer events
 * (rather than mouse events) for reliable tracking in WebKitGTK. Width and
 * collapse state are owned by the parent (persisted via settingsStore).
 */
export function DockPanel({
  width,
  minWidth = 240,
  maxWidth = 560,
  collapsed,
  onWidthChange,
  onCollapsedChange,
  title,
  icon,
  onClose,
  children,
}: Props) {
  const [dragging, setDragging] = useState(false);
  // Track the starting pointer X and starting width so each move is a delta.
  const dragStart = useRef<{ x: number; width: number }>({ x: 0, width: 0 });

  const onHandlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only the left edge handle initiates a drag.
    if (e.button !== 0) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, width };
  }, [width]);

  useEffect(() => {
    if (!dragging) return;

    const onPointerMove = (e: PointerEvent) => {
      // Moving the pointer left grows the panel (it is docked on the right).
      const delta = dragStart.current.x - e.clientX;
      const next = dragStart.current.width + delta;
      onWidthChange(Math.max(minWidth, Math.min(maxWidth, next)));
    };
    const onPointerUp = () => setDragging(false);

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    // Prevent text selection while dragging across the document.
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.body.style.userSelect = '';
    };
  }, [dragging, minWidth, maxWidth, onWidthChange]);

  if (collapsed) return null;

  return (
    <div
      className="shrink-0 flex flex-col bg-surface-elevated border-l border-white/10 relative"
      style={{ width }}
    >
      {/* Left-edge drag handle. cursor-col-resize; grows on hover for an easy grab target. */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 -translate-x-1/2 cursor-col-resize z-10 group/handle ${dragging ? 'bg-accent/50' : 'bg-transparent hover:bg-accent/30'}`}
        onPointerDown={onHandlePointerDown}
        title="Drag to resize"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-text-secondary/60 shrink-0">{icon}</span>}
          <h2 className="text-xs font-semibold text-text-primary/95 truncate uppercase tracking-wider">{title}</h2>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            className="p-1 text-text-tertiary/30 hover:text-text-primary/95 rounded hover:bg-white/5 transition-colors"
            onClick={() => onCollapsedChange(true)}
            title="Collapse"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 4 L5 8 L9 12" /></svg>
          </button>
          <button
            className="p-1 text-text-tertiary/30 hover:text-text-primary/95 rounded hover:bg-white/5 transition-colors"
            onClick={onClose}
            title="Close"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3 L13 13 M13 3 L3 13" /></svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden min-h-0">
        {children}
      </div>
    </div>
  );
}
