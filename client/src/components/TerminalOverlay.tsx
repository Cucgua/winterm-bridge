import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/i18nStore';

interface TerminalOverlayHostProps {
  open: boolean;
  children: ReactNode;
}

interface TerminalOverlayDrawerProps {
  label: string;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  children: ReactNode;
}

export function TerminalOverlayHost({ open, children }: TerminalOverlayHostProps) {
  if (!open) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {children}
    </div>
  );
}

export function TerminalOverlayDrawer({
  label,
  width,
  minWidth = 280,
  maxWidth = 620,
  onWidthChange,
  onClose,
  children,
}: TerminalOverlayDrawerProps) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; width: number }>({ x: 0, width: 0 });

  const onHandlePointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setDragging(true);
    dragStart.current = { x: event.clientX, width };
  }, [width]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!dragging) return;

    const onPointerMove = (event: PointerEvent) => {
      const delta = dragStart.current.x - event.clientX;
      const next = dragStart.current.width + delta;
      onWidthChange(Math.max(minWidth, Math.min(maxWidth, next)));
    };
    const onPointerUp = () => setDragging(false);

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.body.style.userSelect = '';
    };
  }, [dragging, minWidth, maxWidth, onWidthChange]);

  return (
    <section
      aria-label={label}
      className="pointer-events-auto absolute bottom-0 right-0 top-0 flex min-w-0 flex-col border-l border-theme-border/10 bg-surface-elevated"
      style={{
        width,
        boxShadow: '-24px 0 48px rgb(var(--c-canvas) / 0.28)',
      }}
    >
      <div
        className={`absolute bottom-0 left-0 top-0 z-10 w-1 -translate-x-1/2 cursor-col-resize ${dragging ? 'bg-accent/55' : 'bg-transparent hover:bg-accent/35'}`}
        onPointerDown={onHandlePointerDown}
        title={t('resize_panel')}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
    </section>
  );
}
