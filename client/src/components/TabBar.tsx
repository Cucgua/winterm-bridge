import { SessionInfo } from '../core/api';
import { AISummary } from '../stores/aiStore';
import { getStatusDotColor, hasAiTagColor } from '../utils/statusColor';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface TabInfo {
  session: SessionInfo;
  summary?: AISummary;
}

interface Props {
  tabs: TabInfo[];
  activeSessionId: string | null;
  aiEnabled: boolean;
  filesActive: boolean;
  aiActive: boolean;
  onSelectTab: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
  onNewTab: () => void;
  onBackToSessions: () => void;
  onSaveProject: () => void;
  onOpenFiles: () => void;
  onOpenAI: () => void;
}

function titleOf(session: SessionInfo) {
  return session.title || session.tmux_name || `Session ${session.id.slice(0, 6)}`;
}

function IconButton({ title, active, disabled, onClick, children }: { title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
        active
          ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
          : 'border-white/5 bg-white/[0.04] text-text-secondary/60 hover:border-white/15 hover:bg-white/[0.08] hover:text-text-primary/95 disabled:opacity-35 disabled:hover:border-white/5 disabled:hover:bg-white/[0.04] disabled:hover:text-text-secondary/60'
      }`}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function TabBar({
  tabs,
  activeSessionId,
  aiEnabled,
  filesActive,
  aiActive,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onBackToSessions,
  onSaveProject,
  onOpenFiles,
  onOpenAI,
}: Props) {
  const activeTab = tabs.find(tab => tab.session.id === activeSessionId);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const tabMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!tabMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!tabMenuRef.current?.contains(event.target as Node)) {
        setTabMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTabMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [tabMenuOpen]);

  return (
    <header className="h-[68px] shrink-0 border-b border-white/5 bg-[#101426] px-6 select-none">
      <div className="flex h-full items-center gap-4">
        <button
          onClick={onBackToSessions}
          className="flex h-11 items-center gap-3 rounded-2xl bg-white/[0.06] px-4 text-text-secondary/80 transition-colors hover:bg-white/[0.09] hover:text-text-primary/95"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h6l2 2h10v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <span className="text-lg font-semibold">Workspace</span>
        </button>

        <div className="h-8 w-px bg-white/10" />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden pr-1">
            {tabs.length > 0 ? (
              tabs.map(tab => (
                <SessionTab
                  key={tab.session.id}
                  tab={tab}
                  active={tab.session.id === activeSessionId}
                  onSelectTab={onSelectTab}
                  onCloseTab={onCloseTab}
                />
              ))
            ) : (
              <button
                onClick={onBackToSessions}
                className="flex h-11 w-[240px] flex-shrink-0 items-center gap-3 rounded-2xl bg-white/[0.06] px-4 text-text-secondary/70 transition-colors hover:bg-white/[0.09] hover:text-text-primary/95"
              >
                <span className="truncate text-lg font-semibold">Select a session</span>
              </button>
            )}

          </div>

          <div className="relative flex-shrink-0" ref={tabMenuRef}>
            <button
              onClick={() => setTabMenuOpen(open => !open)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                tabMenuOpen
                  ? 'bg-white/[0.1] text-text-primary/95'
                  : 'text-text-tertiary/50 hover:bg-white/[0.06] hover:text-text-primary/95'
              }`}
              title="All tabs"
              disabled={tabs.length === 0}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M5 12h14M5 17h14" />
              </svg>
            </button>

            {tabMenuOpen && (
              <div className="absolute right-0 top-12 z-40 w-80 overflow-hidden rounded-xl border border-white/10 bg-[#11182b] py-2 shadow-2xl">
                <div className="border-b border-white/10 px-3 pb-2 text-xs font-semibold uppercase text-text-secondary/45">
                  Open Sessions
                </div>
                <div className="max-h-[420px] overflow-y-auto py-1">
                  {tabs.map(tab => (
                    <TabMenuItem
                      key={tab.session.id}
                      tab={tab}
                      active={tab.session.id === activeSessionId}
                      onSelect={() => {
                        setTabMenuOpen(false);
                        onSelectTab(tab.session.id);
                      }}
                      onClose={() => {
                        setTabMenuOpen(false);
                        onCloseTab(tab.session.id);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onNewTab}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-text-tertiary/40 transition-colors hover:bg-white/[0.06] hover:text-text-primary/95"
            title="New session"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
            </svg>
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <IconButton title="Save as Project" disabled={!activeTab} onClick={onSaveProject}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h7v7H4V6zm9 5h7v7h-7v-7zM8 15h3v3H8v-3zm7-9h3v3h-3V6z" />
            </svg>
          </IconButton>
          <IconButton title="Files" active={filesActive} onClick={onOpenFiles}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h6l2 2h10v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
          </IconButton>
          <IconButton title="AI Monitor" active={aiActive || aiEnabled} onClick={onOpenAI}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
            </svg>
          </IconButton>
        </div>
      </div>
    </header>
  );
}

function statusDotClass(tab: TabInfo) {
  const summary = tab.summary;
  return summary && hasAiTagColor(summary.tag)
    ? getStatusDotColor({ kind: 'ai', tag: summary.tag })
    : getStatusDotColor({ kind: 'session', state: tab.session.state, isGhost: tab.session.is_ghost });
}

function TabMenuItem({ tab, active, onSelect, onClose }: {
  tab: TabInfo;
  active?: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <button
      className={`group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
        active ? 'bg-emerald-500/15 text-emerald-300' : 'text-text-secondary/75 hover:bg-white/[0.06] hover:text-text-primary/95'
      }`}
      onClick={onSelect}
      title={titleOf(tab.session)}
    >
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${statusDotClass(tab)}`} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{titleOf(tab.session)}</span>
      <span
        className="rounded-md p-1 text-text-tertiary/45 opacity-70 transition-all hover:bg-white/[0.08] hover:text-error group-hover:opacity-100"
        title="End session"
        onClick={event => {
          event.stopPropagation();
          onClose();
        }}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    </button>
  );
}

function SessionTab({ tab, active, onSelectTab, onCloseTab }: {
  tab: TabInfo;
  active?: boolean;
  onSelectTab: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
}) {
  const dotColor = statusDotClass(tab);

  return (
    <button
      className={`group flex h-11 w-[220px] flex-shrink-0 items-center gap-3 rounded-2xl px-4 text-left transition-colors md:w-[240px] ${
        active
          ? 'bg-emerald-500/15 text-emerald-300'
          : 'bg-white/[0.05] text-text-secondary/70 hover:bg-white/[0.09] hover:text-text-primary/95'
      }`}
      onClick={() => onSelectTab(tab.session.id)}
      title={titleOf(tab.session)}
    >
      {active ? (
        <span className="text-emerald-300">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      ) : (
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      )}
      <span className="min-w-0 flex-1 truncate text-lg font-bold">{titleOf(tab.session)}</span>
      <span
        className="rounded-lg p-1 opacity-60 transition-opacity hover:bg-white/[0.08] hover:opacity-100"
        title="End session"
        onClick={event => {
          event.stopPropagation();
          onCloseTab(tab.session.id);
        }}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    </button>
  );
}
