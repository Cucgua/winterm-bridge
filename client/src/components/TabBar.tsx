import { SessionInfo } from '../core/api';
import { AISummary } from '../stores/aiStore';

interface TabInfo {
  session: SessionInfo;
  summary?: AISummary;
}

interface Props {
  tabs: TabInfo[];
  activeSessionId: string | null;
  onSelectTab: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
  onNewTab: () => void;
  onSwitchToPicker: () => void;
}

/** Tag → dot color mapping for AI status */
function getTagDotColor(tag?: string): string {
  if (!tag) return '';
  const map: Record<string, string> = {
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
  return map[tag] || 'bg-text-secondary';
}

export function TabBar({ tabs, activeSessionId, onSelectTab, onCloseTab, onNewTab, onSwitchToPicker }: Props) {
  return (
    <div className="flex items-center bg-surface border-b border-theme-border h-9 shrink-0 select-none">
      {/* Sessions button */}
      <button
        className="flex items-center gap-1 px-3 h-full text-sm text-text-secondary hover:text-text-primary hover:bg-surface-highlight transition-colors shrink-0"
        onClick={onSwitchToPicker}
        title="Session picker"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="12" height="10" rx="1" />
          <line x1="6" y1="3" x2="6" y2="13" />
        </svg>
      </button>

      {/* Tab strip */}
      <div className="flex items-center flex-1 overflow-x-auto h-full">
        {tabs.map(tab => {
          const isActive = tab.session.id === activeSessionId;
          const dotColor = getTagDotColor(tab.summary?.tag);
          return (
            <div
              key={tab.session.id}
              className={`group flex items-center gap-2 px-3 h-full cursor-pointer border-r border-theme-border transition-colors shrink-0 max-w-[200px] ${
                isActive ? 'bg-canvas text-text-primary' : 'bg-surface text-text-secondary hover:bg-surface-highlight'
              }`}
              onClick={() => onSelectTab(tab.session.id)}
            >
              {/* Status dot / AI dot */}
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                tab.session.is_ghost ? 'bg-text-secondary' :
                tab.session.state === 'active' ? 'bg-success' :
                'bg-warning'
              } ${dotColor ? '!hidden' : ''}`} />
              {dotColor && <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />}

              {/* Title */}
              <span className="text-sm truncate flex-1">
                {tab.session.title || `Session ${tab.session.id.slice(0, 8)}`}
              </span>

              {/* Close button */}
              <button
                className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-error transition-opacity shrink-0 px-0.5"
                onClick={(e) => { e.stopPropagation(); onCloseTab(tab.session.id); }}
                title="Close tab"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="3" y1="3" x2="9" y2="9" />
                  <line x1="9" y1="3" x2="3" y2="9" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* New tab button */}
      <button
        className="flex items-center justify-center w-9 h-full text-text-secondary hover:text-text-primary hover:bg-surface-highlight transition-colors shrink-0"
        onClick={onNewTab}
        title="New session"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="8" y1="3" x2="8" y2="13" />
          <line x1="3" y1="8" x2="13" y2="8" />
        </svg>
      </button>
    </div>
  );
}
