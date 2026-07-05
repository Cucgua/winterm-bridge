import type { SessionInfo } from '../core/api';

/**
 * Prefix used by the backend for all winterm-managed tmux session names.
 * Mirrors `tmux.SessionPrefix` in the Go server.
 */
const WINTERM_PREFIX = 'winterm-';

/**
 * Strip the `winterm-` prefix from a tmux session name, returning the
 * human-readable display title embedded in it. Returns the original string
 * when it does not carry the prefix.
 */
export function stripWintermPrefix(tmuxName: string): string {
  if (tmuxName.startsWith(WINTERM_PREFIX)) {
    const stripped = tmuxName.slice(WINTERM_PREFIX.length);
    if (stripped) return stripped;
  }
  return tmuxName;
}

/**
 * Derive a display title for a session.
 *
 * Resolution order:
 *   1. `session.title`  — authoritative title from the backend
 *   2. `session.tmux_name` with the `winterm-` prefix stripped — recovers a
 *      friendly name when the backend loses the title (e.g. after a restart)
 *   3. `Session <short id>` — last-resort fallback
 *
 * Never returns the raw `winterm-<digits>` tmux name, which is what users see
 * when the backend title goes missing.
 */
export function sessionDisplayTitle(session: SessionInfo): string {
  if (session.title) return session.title;
  if (session.tmux_name) {
    return stripWintermPrefix(session.tmux_name) || `Session ${session.id.slice(0, 6)}`;
  }
  return `Session ${session.id.slice(0, 6)}`;
}
