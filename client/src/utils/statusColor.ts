/**
 * Unified status-dot color mapping.
 *
 * Single source of truth for the colored status dot shown next to sessions
 * and tabs. Replaces the three duplicated `getDotColor` / `getSummaryColor`
 * / `getTagDotColor` helpers that previously lived in App.tsx, Sidebar.tsx,
 * and TabBar.tsx.
 */

/** AI summary tag → semantic token color class. */
const TAG_COLOR: Record<string, string> = {
  '完毕': 'bg-success',
  '进行': 'bg-accent',
  '需确认': 'bg-warning',
  '需输入': 'bg-warning',
  '需选择': 'bg-warning',
  '错误': 'bg-error',
  '等待': 'bg-accent',
  '自动处理': 'bg-accent',
  '休眠中': 'bg-text-secondary',
  '目标偏离': 'bg-error',
};

/** Discriminated source describing what the dot represents. */
export type DotSource =
  | { kind: 'ai'; tag: string }
  | { kind: 'session'; state: 'active' | 'detached'; isGhost?: boolean };

/**
 * Resolve the semantic Tailwind background class for a status dot.
 *
 * AI summary tags take precedence (they reflect live agent state). When there
 * is no AI tag, the dot falls back to session lifecycle state.
 */
export function getStatusDotColor(src: DotSource): string {
  if (src.kind === 'ai') {
    return TAG_COLOR[src.tag] || 'bg-text-secondary';
  }
  if (src.isGhost) return 'bg-text-secondary';
  return src.state === 'active' ? 'bg-success' : 'bg-warning';
}

/** True when an AI tag has an explicit color mapping (non-idle). */
export function hasAiTagColor(tag?: string): tag is string {
  return !!tag && tag in TAG_COLOR;
}
