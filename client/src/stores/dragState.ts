/**
 * Lightweight drag state for the split-pane "drag session onto pane edge" flow.
 *
 * We avoid HTML5 drag-and-drop (draggable + dataTransfer) because its drop
 * target hit-testing is unreliable across Tauri's WebView2/WebKitGTK and the
 * drag image / forbidden cursors are hard to tame. Instead, SessionTab and the
 * session list set `draggingSessionId` on pointerdown+move; SplitPane reads it
 * on pointerenter/over to show the four-way snap overlay and commits the split
 * on pointerup.
 *
 * This keeps the interaction fully under our control and works identically on
 * every WebView backend.
 */
import { create } from 'zustand';

interface DragState {
  /** The session id currently being dragged, or null when idle. */
  draggingSessionId: string | null;
  /** Optional display label for the drag ghost. */
  draggingLabel: string | null;
  startDrag: (sessionId: string, label?: string) => void;
  endDrag: () => void;
}

export const useDragState = create<DragState>((set) => ({
  draggingSessionId: null,
  draggingLabel: null,
  startDrag: (sessionId, label) => set({ draggingSessionId: sessionId, draggingLabel: label ?? null }),
  endDrag: () => set({ draggingSessionId: null, draggingLabel: null }),
}));

/**
 * Which snap zone the pointer is hovering over within a pane. Determines where
 * a dragged session lands when dropped:
 *   start = left (horizontal) / top (vertical) half → new pane becomes first child
 *   end   = right (horizontal) / bottom (vertical) half → new pane becomes second child
 *   center = replace the pane's session
 *
 * The zone is computed from the pointer position relative to the pane rect
 * (see SplitPane's onPointerMove). The four-way indicator overlay visualizes it.
 */
export type SnapZone = 'start' | 'end' | 'center' | null;

/**
 * Compute the snap zone from pointer coords + pane rect.
 * - Within the outer 35% band of each axis → that side.
 * - Within the central 30% → center (replace).
 * This gives a clear four-way + center layout that doesn't overlap even on
 * small panes.
 */
export function computeSnapZone(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { zone: SnapZone; direction: 'horizontal' | 'vertical' } {
  const relX = (clientX - rect.left) / rect.width; // 0..1
  const relY = (clientY - rect.top) / rect.height; // 0..1
  const BAND = 0.35; // outer 35% on each side

  const left = relX < BAND;
  const right = relX > 1 - BAND;
  const top = relY < BAND;
  const bottom = relY > 1 - BAND;

  // Prefer the axis with the stronger edge proximity so corner drags resolve
  // to a single split direction (not a diagonal ambiguity).
  const xEdge = left || right;
  const yEdge = top || bottom;

  if (xEdge && (!yEdge || Math.min(relX, 1 - relX) < Math.min(relY, 1 - relY))) {
    // Horizontal split (left|right): the dropped session takes the left/right half.
    return { zone: left ? 'start' : 'end', direction: 'horizontal' };
  }
  if (yEdge) {
    // Vertical split (top|bottom).
    return { zone: top ? 'start' : 'end', direction: 'vertical' };
  }
  // Central region → replace.
  return { zone: 'center', direction: 'horizontal' };
}
