import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Split-pane layout engine.
 *
 * The layout is a recursive binary tree. Each node is either:
 *  - a leaf pane (has `sessionId`, renders one TerminalView), or
 *  - a container (has `direction` + two `children`, split by ratio).
 *
 * Any layout the user builds via drag-to-edge splits is expressible:
 *   left|right        = horizontal split
 *   top/bottom        = vertical split
 *   quadrant (田)     = horizontal split whose children are each vertical splits
 *   left + right(top/bottom) = horizontal split, right child is a vertical split
 *
 * All tree mutations are pure recursive helpers returning new trees — the store
 * replaces the affected SplitTab's root with the result. This keeps React
 * reconciliation correct (immutable updates) and makes the operations testable
 * in isolation.
 */

export type SplitDirection = 'horizontal' | 'vertical';
// horizontal = children laid out left|right; vertical = children laid out top|bottom.

/** Which terminal overlay tool a pane has open (null = none). Shared with App.tsx. */
export type TerminalTool = 'files' | 'ai' | 'trellis' | 'ide' | null;

/**
 * The overlay tool currently open in a split tab. At most one drawer may be open
 * at a time across the whole split tab — `paneId` identifies which pane owns it,
 * `tool` identifies which panel (Files/AI/Trellis/IDE) is shown.
 */
export interface ActiveSplitTool {
  paneId: string;
  tool: Exclude<TerminalTool, null>;
}

export interface SplitNode {
  /** Stable unique id (used as React key and active-pane tracker). */
  id: string;
  /** Present on container nodes. Absent on leaf nodes. */
  direction?: SplitDirection;
  /** Present on container nodes. Absent on leaf nodes. */
  children?: [SplitNode, SplitNode];
  /** Present on leaf nodes. The session this pane renders. */
  sessionId?: string;
  /** Split ratio for the two children, 0–1 (first child's share). Default 0.5. */
  ratio?: number;
}

export interface SplitTab {
  id: string;
  /** The layout tree root. */
  root: SplitNode;
  /** Which leaf pane currently has focus (receives keyboard input). */
  activePaneId: string;
  /** Human label shown in the tab bar, e.g. "Split · 3". */
  label: string;
}

interface SplitState {
  splitTabs: SplitTab[];
  /** id of the split tab currently displayed (null when viewing a single session). */
  activeSplitTabId: string | null;
  /** Which pane's overlay tool is open in the active split tab (null = none).
   *  At most one drawer is open at a time. Cleared when the active split tab changes. */
  activeTool: ActiveSplitTool | null;

  /** Create a split tab seeded with a single empty pane (no session yet). */
  createSplitTab: () => string;
  /** Remove a split tab entirely. */
  removeSplitTab: (splitTabId: string) => void;
  setActiveSplitTab: (splitTabId: string | null) => void;
  setActivePane: (splitTabId: string, paneId: string) => void;

  /**
   * Open a tool's drawer on a pane, or close it. Toggling the same tool on the
   * same pane closes it; opening any tool on another pane replaces the current
   * one (only one drawer is open at a time).
   */
  setActiveTool: (paneId: string, tool: Exclude<TerminalTool, null> | null) => void;

  /**
   * Split a leaf pane in the given direction, placing the new session in the
   * specified half ('start' = first child / left-or-top, 'end' = second child /
   * right-or-bottom). The original session keeps the other half.
   */
  splitPane: (
    splitTabId: string,
    paneId: string,
    direction: SplitDirection,
    newSessionId: string,
    placement: 'start' | 'end',
  ) => void;

  /** Close a leaf pane: remove it and collapse its sibling up into the parent. */
  closePane: (splitTabId: string, paneId: string) => void;

  /** Adjust a container's split ratio (drag the divider). */
  setRatio: (splitTabId: string, paneId: string, ratio: number) => void;

  /** Replace the session bound to a leaf pane (drag-onto-center). */
  replacePaneSession: (splitTabId: string, paneId: string, sessionId: string) => void;

  /** Bind a session to an empty pane (first drop into an empty pane). */
  setPaneSession: (splitTabId: string, paneId: string, sessionId: string) => void;

  /** Clear the session from a pane (returns it to an empty "drop here" pane). */
  clearPaneSession: (splitTabId: string, paneId: string) => void;

  /**
   * Clear (turn into empty panes) every leaf whose sessionId is not in
   * liveSessionIds. Preserves the tree topology so the user can re-drop a
   * session into an emptied pane. Used both at cold-start (reconcile persisted
   * layouts against the live session list) and during polling (self-heal when a
   * session is deleted elsewhere).
   */
  pruneDeadSessions: (splitTabId: string, liveSessionIds: Set<string>) => void;
}

/** Collect every sessionId currently bound in a split tab's tree. */
export function sessionsInTree(node: SplitNode): string[] {
  if (node.sessionId) return [node.sessionId];
  if (node.children) return [...sessionsInTree(node.children[0]), ...sessionsInTree(node.children[1])];
  return [];
}

/** Find a node by id in the tree (returns undefined if not found). */
export function findNode(node: SplitNode, id: string): SplitNode | undefined {
  if (node.id === id) return node;
  if (node.children) {
    return findNode(node.children[0], id) ?? findNode(node.children[1], id);
  }
  return undefined;
}

/** Count leaf panes in a tree. */
export function countLeaves(node: SplitNode): number {
  if (node.sessionId) return 1;
  if (node.children) return countLeaves(node.children[0]) + countLeaves(node.children[1]);
  return 0;
}

let idCounter = 0;
function genId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

/** Create a leaf pane. Without sessionId it's an empty "drop a session here" pane. */
function makeLeaf(sessionId?: string): SplitNode {
  return { id: genId('pane'), sessionId };
}

/**
 * Recursively split a leaf: returns a new node. If `targetId` matches a leaf,
 * wrap it into a container with the new session per direction/placement.
 * If it matches a container, recurse into both children.
 */
function splitNode(
  node: SplitNode,
  targetId: string,
  direction: SplitDirection,
  newSessionId: string,
  placement: 'start' | 'end',
): SplitNode {
  if (node.id === targetId && !node.children) {
    // Leaf hit (may be empty or bound to a session) — wrap into a fresh container.
    const originalLeaf: SplitNode = { ...node };
    const newLeaf = makeLeaf(newSessionId);
    const children: [SplitNode, SplitNode] =
      placement === 'start' ? [newLeaf, originalLeaf] : [originalLeaf, newLeaf];
    return { id: genId('split'), direction, children, ratio: 0.5 };
  }
  if (node.children) {
    return {
      ...node,
      children: [
        splitNode(node.children[0], targetId, direction, newSessionId, placement),
        splitNode(node.children[1], targetId, direction, newSessionId, placement),
      ],
    };
  }
  return node;
}

/**
 * Close a leaf: remove it and promote its sibling up into the parent's slot.
 * Returns the new tree. If the root itself is the closed leaf, returns null
 * (the split tab should be removed by the caller).
 */
function closeNode(node: SplitNode, targetId: string): SplitNode | null {
  if (node.id === targetId) {
    // This leaf is being closed. Only valid at the root if it's the sole pane;
    // otherwise the parent handles promotion. Returning null signals removal.
    return null;
  }
  if (node.children) {
    const [left, right] = node.children;
    const leftResult = closeNode(left, targetId);
    const rightResult = closeNode(right, targetId);

    if (leftResult === null) return right; // left closed → promote right
    if (rightResult === null) return left; // right closed → promote left
    return { ...node, children: [leftResult, rightResult] };
  }
  return node;
}

function setRatioNode(node: SplitNode, targetId: string, ratio: number): SplitNode {
  if (node.id === targetId && node.children) {
    return { ...node, ratio: Math.max(0.1, Math.min(0.9, ratio)) };
  }
  if (node.children) {
    return {
      ...node,
      children: [
        setRatioNode(node.children[0], targetId, ratio),
        setRatioNode(node.children[1], targetId, ratio),
      ],
    };
  }
  return node;
}

function replaceSessionNode(node: SplitNode, targetId: string, sessionId: string): SplitNode {
  if (node.id === targetId && !node.children) {
    // Leaf (empty or bound) — bind the session to it.
    return { ...node, sessionId };
  }
  if (node.children) {
    return {
      ...node,
      children: [
        replaceSessionNode(node.children[0], targetId, sessionId),
        replaceSessionNode(node.children[1], targetId, sessionId),
      ],
    };
  }
  return node;
}

function clearSessionNode(node: SplitNode, targetId: string): SplitNode {
  if (node.id === targetId && !node.children) {
    return { id: node.id }; // empty leaf — no sessionId
  }
  if (node.children) {
    return {
      ...node,
      children: [
        clearSessionNode(node.children[0], targetId),
        clearSessionNode(node.children[1], targetId),
      ],
    };
  }
  return node;
}

/**
 * Recursively prune: any leaf bound to a sessionId NOT in liveSessionIds is
 * turned into an empty leaf (keeps its id, drops the sessionId). Container
 * nodes recurse into both children and keep their direction/ratio — the layout
 * skeleton is preserved so the user can re-drop sessions into emptied panes.
 */
function pruneDeadSessionsNode(node: SplitNode, liveSessionIds: Set<string>): SplitNode {
  if (node.children) {
    return {
      ...node,
      children: [
        pruneDeadSessionsNode(node.children[0], liveSessionIds),
        pruneDeadSessionsNode(node.children[1], liveSessionIds),
      ],
    };
  }
  // Leaf: clear it if its session no longer exists.
  if (node.sessionId && !liveSessionIds.has(node.sessionId)) {
    return { id: node.id };
  }
  return node;
}

export const useSplitStore = create<SplitState>()(persist((set, get) => ({
      splitTabs: [],
      activeSplitTabId: null,
      activeTool: null,

      createSplitTab: () => {
        const id = genId('splitab');
        const root = makeLeaf(); // empty pane — user drops a session into it
        const tab: SplitTab = { id, root, activePaneId: root.id, label: 'Split · 0' };
        set(state => ({ splitTabs: [...state.splitTabs, tab], activeSplitTabId: id }));
        return id;
      },

      removeSplitTab: (splitTabId) => {
        set(state => ({
          splitTabs: state.splitTabs.filter(tab => tab.id !== splitTabId),
          activeSplitTabId: state.activeSplitTabId === splitTabId ? null : state.activeSplitTabId,
        }));
      },

      setActiveSplitTab: (splitTabId) => set({ activeSplitTabId: splitTabId, activeTool: null }),

      setActivePane: (splitTabId, paneId) => {
        set(state => ({
          splitTabs: state.splitTabs.map(tab =>
            tab.id === splitTabId ? { ...tab, activePaneId: paneId } : tab,
          ),
        }));
      },

      setActiveTool: (paneId, tool) => {
        const current = get().activeTool;
        // Toggle: tapping the already-open tool on the same pane closes it.
        if (current && current.paneId === paneId && current.tool === tool) {
          set({ activeTool: null });
          return;
        }
        if (tool === null) {
          set({ activeTool: null });
          return;
        }
        set({ activeTool: { paneId, tool } });
      },

      splitPane: (splitTabId, paneId, direction, newSessionId, placement) => {
        set(state => ({
          splitTabs: state.splitTabs.map(tab => {
            if (tab.id !== splitTabId) return tab;
            const root = splitNode(tab.root, paneId, direction, newSessionId, placement);
            // New pane becomes active.
            const newLeaf = findNode(root, paneId);
            const activePaneId = newLeaf?.sessionId === newSessionId
              ? newLeaf.id
              : tab.activePaneId;
            return { ...tab, root, activePaneId, label: `Split · ${countLeaves(root)}` };
          }),
        }));
      },

      closePane: (splitTabId, paneId) => {
        const tab = get().splitTabs.find(t => t.id === splitTabId);
        if (!tab) return;
        const newRoot = closeNode(tab.root, paneId);
        // If the closed pane had the tool drawer open, clear it.
        const clearTool = get().activeTool?.paneId === paneId;
        if (newRoot === null) {
          // Closed the last pane — remove the whole split tab.
          set(state => ({
            splitTabs: state.splitTabs.filter(t => t.id !== splitTabId),
            activeSplitTabId: state.activeSplitTabId === splitTabId ? null : state.activeSplitTabId,
            activeTool: clearTool ? null : state.activeTool,
          }));
          return;
        }
        set(state => ({
          splitTabs: state.splitTabs.map(t =>
            t.id === splitTabId
              ? {
                  ...t,
                  root: newRoot,
                  activePaneId: t.activePaneId === paneId
                    ? (findNode(newRoot, t.activePaneId) ? t.activePaneId : newRoot.id)
                    : t.activePaneId,
                  label: `Split · ${countLeaves(newRoot)}`,
                }
              : t,
          ),
          activeTool: clearTool ? null : state.activeTool,
        }));
      },

      setRatio: (splitTabId, paneId, ratio) => {
        set(state => ({
          splitTabs: state.splitTabs.map(tab =>
            tab.id === splitTabId ? { ...tab, root: setRatioNode(tab.root, paneId, ratio) } : tab,
          ),
        }));
      },

      replacePaneSession: (splitTabId, paneId, sessionId) => {
        set(state => ({
          splitTabs: state.splitTabs.map(tab =>
            tab.id === splitTabId
              ? { ...tab, root: replaceSessionNode(tab.root, paneId, sessionId), activePaneId: paneId }
              : tab,
          ),
        }));
      },

      setPaneSession: (splitTabId, paneId, sessionId) => {
        set(state => ({
          splitTabs: state.splitTabs.map(tab =>
            tab.id === splitTabId
              ? {
                  ...tab,
                  root: replaceSessionNode(tab.root, paneId, sessionId),
                  activePaneId: paneId,
                  label: `Split · ${countLeaves(replaceSessionNode(tab.root, paneId, sessionId))}`,
                }
              : tab,
          ),
        }));
      },

      clearPaneSession: (splitTabId, paneId) => {
        set(state => ({
          splitTabs: state.splitTabs.map(tab =>
            tab.id === splitTabId
              ? {
                  ...tab,
                  root: clearSessionNode(tab.root, paneId),
                  label: `Split · ${countLeaves(clearSessionNode(tab.root, paneId))}`,
                }
              : tab,
          ),
        }));
      },

      pruneDeadSessions: (splitTabId, liveSessionIds) => {
        set(state => ({
          splitTabs: state.splitTabs.map(tab => {
            if (tab.id !== splitTabId) return tab;
            const root = pruneDeadSessionsNode(tab.root, liveSessionIds);
            return { ...tab, root, label: `Split · ${countLeaves(root)}` };
          }),
        }));
      },
    }),
    {
      name: 'winterm-splits',
      // Only the layout data is persisted; activeTool (which drawer is open) is
      // transient UI state and all action functions are excluded automatically.
      partialize: (state) => ({
        splitTabs: state.splitTabs,
        activeSplitTabId: state.activeSplitTabId,
      }),
    },
  ),
);
