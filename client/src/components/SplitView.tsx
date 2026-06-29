import { useCallback, useEffect, useRef, useState } from 'react';
import { TerminalView } from './TerminalView';
import { socketManager } from '../core/socketManager';
import { useSplitStore, sessionsInTree, type SplitNode, type SplitDirection } from '../stores/splitStore';
import { useDragState, computeSnapZone, type SnapZone } from '../stores/dragState';
import { useI18n } from '../i18n';
import type { SocketService } from '../core/socket';
import type { SessionInfo } from '../core/api';

/** Derive a display title from a session, mirroring titleOf in other components. */
function paneTitle(session: SessionInfo): string {
  return session.title || session.current_path?.split('/').pop() || session.id.slice(0, 8);
}

interface SplitViewProps {
  splitTabId: string;
  root: SplitNode;
  activePaneId: string;
  /** sessionId → SessionInfo, for pane header titles. */
  sessionMap: Record<string, SessionInfo>;
  /** Called after a session is dropped into a pane (move semantics: remove its tab). */
  onSessionDropped: (sessionId: string) => void;
  /** Called when a pane is closed (disconnect its socket). */
  onClosePane: (sessionId: string) => void;
}

/**
 * Renders a split-pane layout tree.
 *
 * Container nodes recurse into two children laid out via flexbox (horizontal =
 * row / left|right, vertical = column / top|bottom) with a draggable divider
 * whose position reflects `ratio`. Leaf nodes render either a TerminalView (when
 * a session is bound) or an empty "drop a session here" placeholder.
 */
export function SplitView({ splitTabId, root, activePaneId, sessionMap, onSessionDropped, onClosePane }: SplitViewProps) {
  return (
    <div className="h-full w-full overflow-hidden bg-canvas">
      <SplitNodeView
        node={root}
        splitTabId={splitTabId}
        activePaneId={activePaneId}
        sessionMap={sessionMap}
        onSessionDropped={onSessionDropped}
        onClosePane={onClosePane}
        depth={0}
      />
    </div>
  );
}

interface NodeViewProps {
  node: SplitNode;
  splitTabId: string;
  activePaneId: string;
  sessionMap: Record<string, SessionInfo>;
  onSessionDropped: (sessionId: string) => void;
  onClosePane: (sessionId: string) => void;
  depth: number;
}

function SplitNodeView({ node, splitTabId, activePaneId, sessionMap, onSessionDropped, onClosePane, depth }: NodeViewProps) {
  // Leaf pane (may be empty or bound to a session).
  if (!node.children) {
    return (
      <SplitPane
        sessionId={node.sessionId}
        paneId={node.id}
        splitTabId={splitTabId}
        active={activePaneId === node.id}
        sessionMap={sessionMap}
        onSessionDropped={onSessionDropped}
        onClosePane={onClosePane}
      />
    );
  }

  // Container node — render the two children with a divider.
  if (node.direction) {
    const ratio = node.ratio ?? 0.5;
    return (
      <div className={`flex h-full w-full ${node.direction === 'horizontal' ? 'flex-row' : 'flex-col'}`}>
        <div style={{ flexBasis: `${ratio * 100}%`, flexGrow: 0, flexShrink: 0 }} className="min-h-0 min-w-0 overflow-hidden">
          <SplitNodeView node={node.children[0]} splitTabId={splitTabId} activePaneId={activePaneId} sessionMap={sessionMap} onSessionDropped={onSessionDropped} onClosePane={onClosePane} depth={depth + 1} />
        </div>
        <Divider
          direction={node.direction}
          ratio={ratio}
          onResize={(newRatio) => {
            useSplitStore.getState().setRatio(splitTabId, node.id, newRatio);
          }}
        />
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <SplitNodeView node={node.children[1]} splitTabId={splitTabId} activePaneId={activePaneId} sessionMap={sessionMap} onSessionDropped={onSessionDropped} onClosePane={onClosePane} depth={depth + 1} />
        </div>
      </div>
    );
  }

  return null;
}

/**
 * A single pane. When bound to a session, renders a header (title + close) and
 * a TerminalView connected via its own socket. When empty, renders a drop target
 * prompting the user to drag a session in. Clicking sets it as the active pane.
 */
function SplitPane({ sessionId, paneId, splitTabId, active, sessionMap, onSessionDropped, onClosePane }: {
  sessionId?: string;
  paneId: string;
  splitTabId: string;
  active: boolean;
  sessionMap: Record<string, SessionInfo>;
  onSessionDropped: (sessionId: string) => void;
  onClosePane: (sessionId: string) => void;
}) {
  const { t } = useI18n();
  const [sock, setSock] = useState<SocketService | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const session = sessionId ? sessionMap[sessionId] : undefined;

  // Connect this pane's own socket when a session is bound.
  useEffect(() => {
    if (!sessionId) { setSock(null); return; }
    let cancelled = false;
    const existing = socketManager.get(sessionId);
    if (existing && existing.isConnected) {
      setSock(existing);
      return;
    }
    socketManager.connect(sessionId).then(instance => {
      if (!cancelled) setSock(instance);
    }).catch(() => {
      // Connection failure leaves sock null; the pane shows "connecting…".
    });
    return () => { cancelled = true; };
  }, [sessionId]);

  // Disconnect this pane's socket when the pane unmounts or its session changes,
  // unless the session still lives elsewhere in the split tab.
  useEffect(() => {
    if (!sessionId) return;
    return () => {
      const state = useSplitStore.getState();
      const tab = state.splitTabs.find(st => st.id === splitTabId);
      if (!tab || !sessionsInTree(tab.root).includes(sessionId)) {
        void socketManager.disconnect(sessionId);
      }
    };
  }, [sessionId, splitTabId]);

  const handleFocus = useCallback(() => {
    useSplitStore.getState().setActivePane(splitTabId, paneId);
  }, [splitTabId, paneId]);

  const handleClose = useCallback(() => {
    if (!sessionId) return;
    onClosePane(sessionId);
    useSplitStore.getState().closePane(splitTabId, paneId);
  }, [sessionId, splitTabId, paneId, onClosePane]);

  // --- Drag-to-edge snap state ---
  const draggingSessionId = useDragState(s => s.draggingSessionId);
  const [snapZone, setSnapZone] = useState<SnapZone>(null);
  const [snapDirection, setSnapDirection] = useState<SplitDirection>('horizontal');
  // Don't drop a session onto a pane that already shows it. Empty panes accept
  // any drop (including center → bind).
  const canDrop = draggingSessionId !== null && draggingSessionId !== sessionId;

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!canDrop || !paneRef.current) return;
    const rect = paneRef.current.getBoundingClientRect();
    const { zone, direction } = computeSnapZone(event.clientX, event.clientY, rect);
    setSnapZone(zone);
    setSnapDirection(direction);
  }, [canDrop]);

  const onPointerLeave = useCallback(() => {
    setSnapZone(null);
  }, []);

  const onPointerUp = useCallback(() => {
    if (!canDrop || !draggingSessionId || snapZone === null) {
      setSnapZone(null);
      return;
    }
    const draggedId = draggingSessionId;
    if (!sessionId) {
      // Empty pane → bind the dropped session directly (no split needed).
      useSplitStore.getState().setPaneSession(splitTabId, paneId, draggedId);
    } else if (snapZone === 'center') {
      // Replace: the pane's current session is released back to the tab bar so
      // it isn't lost (its standalone tab was removed when it was dragged in).
      onClosePane(sessionId);
      useSplitStore.getState().replacePaneSession(splitTabId, paneId, draggedId);
    } else {
      // Edge split: the original session keeps its half (no overlap/cover).
      useSplitStore.getState().splitPane(splitTabId, paneId, snapDirection, draggedId, snapZone);
    }
    // Move semantics: tell App to remove the dragged session's standalone tab.
    onSessionDropped(draggedId);
    useDragState.getState().endDrag();
    setSnapZone(null);
  }, [canDrop, draggingSessionId, snapZone, snapDirection, sessionId, splitTabId, paneId, onSessionDropped, onClosePane]);

  const title = session ? paneTitle(session) : '';

  return (
    <div
      ref={paneRef}
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-lg bg-surface ${
        active ? 'z-10 ring-1 ring-inset ring-accent/30' : ''
      }`}
      onMouseDown={handleFocus}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerUp={onPointerUp}
    >
      {/* Pane header: title + close. Empty panes show a hint instead. */}
      <div
        className={`flex h-7 flex-none items-center justify-between gap-2 border-l-2 px-2 text-xs ${
          active
            ? 'border-l-accent bg-accent/8 text-text-primary'
            : 'border-l-transparent bg-surface-highlight/30 text-text-secondary/70'
        }`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`h-1.5 w-1.5 flex-none rounded-full ${sessionId ? 'bg-success' : 'bg-text-tertiary/25'}`} />
          <span className="truncate font-semibold">
            {sessionId ? (title || sessionId.slice(0, 6)) : t('split_empty_pane')}
          </span>
        </span>
        {sessionId && (
          <button
            className={`flex h-5 w-5 flex-none items-center justify-center rounded transition-colors ${
              active
                ? 'text-text-secondary/60 hover:bg-surface-highlight/50 hover:text-error'
                : 'text-text-tertiary/40 hover:bg-surface-highlight/50 hover:text-error'
            }`}
            onClick={handleClose}
            title={t('split_close_pane')}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Pane body: terminal or empty placeholder. */}
      <div className="relative min-h-0 flex-1 p-1.5">
        {sessionId && sock ? (
          <TerminalView sessionId={sessionId} socketInstance={sock} />
        ) : sessionId ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-tertiary/50 text-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent/80" />
            </span>
            <span>connecting…</span>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-tertiary/40 text-sm">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            <span>{t('split_drop_hint')}</span>
          </div>
        )}

        {/* Four-way snap overlay: shown only while a session is being dragged
            over this pane. Highlights the half the pointer is in. */}
        {canDrop && snapZone && (
          <div className="pointer-events-none absolute inset-0 z-20 p-1">
            {snapZone === 'center' ? (
              <div className="h-full w-full rounded-lg border border-accent/50 bg-accent/15 transition-all duration-150 ease-out" />
            ) : (
              <div
                className={`absolute rounded-lg border border-accent/50 bg-accent/15 transition-all duration-150 ease-out ${
                  snapDirection === 'horizontal'
                    ? snapZone === 'start'
                      ? 'inset-y-1 left-1 w-[48%]'
                      : 'inset-y-1 right-1 w-[48%]'
                    : snapZone === 'start'
                      ? 'inset-x-1 top-1 h-[48%]'
                      : 'inset-x-1 bottom-1 h-[48%]'
                }`}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Draggable divider between two panes. Computes the new absolute ratio from the
 * pointer's total displacement since drag start — NOT incrementally — so that
 * re-renders during the drag (which update the `ratio` prop) can't accumulate
 * drift. Uses pointer events (mouse+touch) and disables selection while dragging.
 */
function Divider({ direction, ratio, onResize }: {
  direction: SplitDirection;
  ratio: number;
  onResize: (newRatio: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  // Snapshot taken at drag start: pointer position, container size, and the
  // ratio at that moment. The new ratio is always startRatio + delta/size.
  const startRef = useRef<{ pos: number; size: number; ratio: number }>({ pos: 0, size: 0, ratio: 0.5 });
  const dividerRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setDragging(true);

    const parent = dividerRef.current?.parentElement;
    if (!parent) return;
    const size = direction === 'horizontal' ? parent.clientWidth : parent.clientHeight;
    startRef.current = {
      pos: direction === 'horizontal' ? event.clientX : event.clientY,
      size,
      ratio,
    };
  }, [direction, ratio]);

  useEffect(() => {
    if (!dragging) return;

    const onPointerMove = (event: PointerEvent) => {
      const current = direction === 'horizontal' ? event.clientX : event.clientY;
      const delta = current - startRef.current.pos;
      const newRatio = startRef.current.ratio + delta / startRef.current.size;
      onResize(newRatio);
    };
    const onPointerUp = () => setDragging(false);

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';

    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [dragging, direction, onResize]);

  const isHorizontal = direction === 'horizontal';
  return (
    <div
      ref={dividerRef}
      onPointerDown={onPointerDown}
      className={`group relative flex-none rounded-full transition-colors ${
        isHorizontal ? 'w-0.5 cursor-col-resize' : 'h-0.5 cursor-row-resize'
      } ${dragging ? 'bg-accent/60' : 'bg-theme-border/5 hover:bg-accent/35'}`}
    >
      {/* Wider invisible hit area for easier grabbing. */}
      <div className={`absolute ${isHorizontal ? 'inset-y-0 -left-2 -right-2' : 'inset-x-0 -top-2 -bottom-2'}`} />
    </div>
  );
}
