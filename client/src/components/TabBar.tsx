import { SessionInfo } from '../core/api';
import { AISummary } from '../stores/aiStore';
import { getStatusDotColor, hasAiTagColor } from '../utils/statusColor';

export interface TabInfo {
  session: SessionInfo;
  summary?: AISummary;
}

interface Props {
  tabs: TabInfo[];
  activeSessionId: string | null;
  onSelectTab: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
  onNewTab: () => void;
}

/**
 * Termius-style top tab strip.
 *
 * Flat tabs sitting on a toolbar bar above the terminal: the active tab
 * lifts onto the canvas with an accent bottom border; inactive tabs sit
 * flush and brighten on hover. A connection count and new-tab button sit
 * on the right. Status dots reuse the shared color mapping.
 */
export function TabBar({ tabs, activeSessionId, onSelectTab, onCloseTab, onNewTab }: Props) {
  return (
    <div className="flex items-stretch bg-sidebar border-b border-white/10 h-9 shrink-0 select-none">
      {/* Tab strip */}
      <div className="flex items-stretch flex-1 overflow-x-auto h-full">
        {tabs.map(tab => {
          const isActive = tab.session.id === activeSessionId;
          const summary = tab.summary;
          const dotColor = summary && hasAiTagColor(summary.tag)
            ? getStatusDotColor({ kind: 'ai', tag: summary.tag })
            : getStatusDotColor({ kind: 'session', state: tab.session.state, isGhost: tab.session.is_ghost });

          return (
            <div
              key={tab.session.id}
              className={`group relative flex items-center gap-1.5 pl-3 pr-2 h-full cursor-pointer transition-colors shrink-0 max-w-[190px] ${
                isActive
                  ? 'bg-canvas text-text-primary/95'
                  : 'bg-sidebar text-text-secondary/60 hover:bg-white/5/50 hover:text-text-primary/95'
              }`}
              onClick={() => onSelectTab(tab.session.id)}
            >
              {/* Active tab: accent bottom border */}
              {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}

              {/* Status dot */}
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />

              {/* Title */}
              <span className="text-xs truncate flex-1">
                {tab.session.title || `Session ${tab.session.id.slice(0, 8)}`}
              </span>

              {/* Close button */}
              <button
                className={`shrink-0 p-0.5 rounded transition-colors ${
                  isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
                } text-text-tertiary/30 hover:text-error hover:bg-error/10`}
                onClick={(e) => { e.stopPropagation(); onCloseTab(tab.session.id); }}
                title="Close tab"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
              </button>
            </div>
          );
        })}

        {tabs.length === 0 && (
          <div className="flex items-center px-4 text-xs text-text-tertiary/30">
            No active sessions — select from sidebar
          </div>
        )}
      </div>

      {/* Connection count + new tab */}
      <div className="flex items-center gap-1 px-2 border-l border-white/10 shrink-0">
        {tabs.length > 0 && (
          <span className="text-[11px] text-text-tertiary/30 px-1">{tabs.length}</span>
        )}
        <button
          className="flex items-center justify-center w-7 h-7 text-text-tertiary/30 hover:text-accent hover:bg-white/5 rounded transition-colors"
          onClick={onNewTab}
          title="New session"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>
    </div>
  );
}
