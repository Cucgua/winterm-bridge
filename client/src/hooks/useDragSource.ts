import { useRef } from 'react';
import { useDragState } from '../stores/dragState';

/**
 * Turns any element into a drag source for the split-pane flow.
 *
 * Returns pointer handlers to spread onto the element. On pointerdown we record
 * the start position; if the pointer moves beyond DRAG_THRESHOLD before release,
 * we call startDrag() (entering "dragging" mode). If the pointer is released
 * without crossing the threshold, nothing happens — the element's normal click
 * handler fires. This avoids hijacking clicks while still allowing a natural
 * press-move drag gesture.
 *
 * While dragging, a floating ghost (rendered by SplitView/SplitPane consumers
 * reading useDragState) follows the pointer. The drag ends on pointerup.
 */
const DRAG_THRESHOLD = 6; // px — small enough to feel responsive, large enough to not trigger on click jitter

export function useDragSource(sessionId: string, label: string) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    startRef.current = { x: event.clientX, y: event.clientY };
    draggingRef.current = false;
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!startRef.current || draggingRef.current) return;
    const dx = event.clientX - startRef.current.x;
    const dy = event.clientY - startRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
      draggingRef.current = true;
      useDragState.getState().startDrag(sessionId, label);
    }
  };

  const onPointerUp = () => {
    startRef.current = null;
    // If we were dragging, end it. The drop target (SplitPane) commits the
    // split on its own pointerup; ending here covers the case where the drop
    // missed a pane (release over empty space).
    if (draggingRef.current) {
      useDragState.getState().endDrag();
    }
    draggingRef.current = false;
  };

  const onPointerLeave = () => {
    // If the pointer leaves without moving enough, just reset — don't start a
    // drag. The drag itself continues once started because SplitPane tracks the
    // global pointer via its own handlers.
    if (!draggingRef.current) {
      startRef.current = null;
    }
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave };
}
