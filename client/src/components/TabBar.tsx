import { SessionInfo } from '../core/api';
import { useI18n } from '../i18n/i18nStore';
import { AISummary } from '../stores/aiStore';
import { getStatusDotColor, hasAiTagColor } from '../utils/statusColor';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { WindowControls, WindowDragRegion } from './WindowControls';

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
  trellisActive: boolean;
  ideActive: boolean;
  onSelectTab: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
  onNewTab: () => void;
  onBackToSessions: () => void;
  onSaveProject: () => void;
  onOpenFiles: () => void;
  onOpenAI: () => void;
  onOpenTrellis: () => void;
  onOpenIDE: () => void;
}

function titleOf(session: SessionInfo) {
  return session.title || session.tmux_name || `Session ${session.id.slice(0, 6)}`;
}

function IconButton({ title, active, disabled, onClick, children }: { title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
        active
          ? 'border-accent/40 bg-accent/15 text-accent'
          : 'border-theme-border/5 bg-surface-highlight/20 text-text-secondary/60 hover:border-theme-border/15 hover:bg-surface-highlight/35 hover:text-text-primary/95 disabled:opacity-35 disabled:hover:border-theme-border/5 disabled:hover:bg-surface-highlight/20 disabled:hover:text-text-secondary/60'
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
  trellisActive,
  ideActive,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onBackToSessions,
  onSaveProject,
  onOpenFiles,
  onOpenAI,
  onOpenTrellis,
  onOpenIDE,
}: Props) {
  const { t } = useI18n();
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
    <header data-tauri-drag-region className="h-[68px] shrink-0 border-b border-theme-border/5 bg-surface px-6 select-none">
      <div data-tauri-drag-region className="flex h-full items-center gap-4">
        <button
          onClick={onBackToSessions}
          className="flex h-11 items-center gap-3 rounded-2xl bg-surface-highlight/30 px-4 text-text-secondary/80 transition-colors hover:bg-surface-highlight/45 hover:text-text-primary/95"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h6l2 2h10v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <span className="text-lg font-semibold">{t('workspace')}</span>
        </button>

        <div className="h-8 w-px bg-theme-border/10" />

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
                className="flex h-11 w-[240px] flex-shrink-0 items-center gap-3 rounded-2xl bg-surface-highlight/30 px-4 text-text-secondary/70 transition-colors hover:bg-surface-highlight/45 hover:text-text-primary/95"
              >
                <span className="truncate text-lg font-semibold">{t('select_session')}</span>
              </button>
            )}

          </div>

          <div className="relative flex-shrink-0" ref={tabMenuRef}>
            <button
              onClick={() => setTabMenuOpen(open => !open)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                tabMenuOpen
                  ? 'bg-surface-highlight/45 text-text-primary/95'
                  : 'text-text-tertiary/50 hover:bg-surface-highlight/30 hover:text-text-primary/95'
              }`}
              title={t('all_sessions')}
              disabled={tabs.length === 0}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M5 12h14M5 17h14" />
              </svg>
            </button>

            {tabMenuOpen && (
              <div className="absolute right-0 top-12 z-40 w-80 overflow-hidden rounded-xl border border-theme-border/10 bg-surface-elevated py-2 shadow-2xl">
                <div className="border-b border-theme-border/10 px-3 pb-2 text-xs font-semibold uppercase text-text-secondary/45">
                  {t('open_sessions')}
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
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-text-tertiary/40 transition-colors hover:bg-surface-highlight/30 hover:text-text-primary/95"
            title={t('session_new')}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
            </svg>
          </button>
        </div>

        <WindowDragRegion className="hidden xl:block" />

        <div className="flex items-center gap-2">
          <IconButton title={t('settings_save_project')} disabled={!activeTab} onClick={onSaveProject}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h7v7H4V6zm9 5h7v7h-7v-7zM8 15h3v3H8v-3zm7-9h3v3h-3V6z" />
            </svg>
          </IconButton>
          <IconButton title={t('files_title')} active={filesActive} onClick={onOpenFiles}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h6l2 2h10v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
          </IconButton>
          <IconButton title={t('ai_settings_title')} active={aiActive || aiEnabled} onClick={onOpenAI}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
            </svg>
          </IconButton>
          <IconButton title={t('trellis_title')} active={trellisActive} onClick={onOpenTrellis}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h4v4H7zM13 13h4v4h-4zM11 9h3a1 1 0 011 1v3M9 11v3a1 1 0 001 1h3" />
            </svg>
          </IconButton>
          <IconButton title={t('ide_panel_title')} active={ideActive} onClick={onOpenIDE}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16v12H4V6zm4 4h4m-4 4h8m4-4h.01" />
            </svg>
          </IconButton>
          <div className="h-8 w-px bg-theme-border/10" />
          <WindowControls />
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
  const { t } = useI18n();

  return (
    <button
      className={`group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
        active ? 'bg-accent/15 text-accent' : 'text-text-secondary/75 hover:bg-surface-highlight/30 hover:text-text-primary/95'
      }`}
      onClick={onSelect}
      title={titleOf(tab.session)}
    >
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${statusDotClass(tab)}`} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{titleOf(tab.session)}</span>
      <span
        className="rounded-md p-1 text-text-tertiary/45 opacity-70 transition-all hover:bg-surface-highlight/35 hover:text-error group-hover:opacity-100"
        title={t('end_session')}
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
  const { t } = useI18n();
  const dotColor = statusDotClass(tab);

  return (
    <button
      className={`group flex h-11 w-[220px] flex-shrink-0 items-center gap-3 rounded-2xl px-4 text-left transition-colors md:w-[240px] ${
        active
          ? 'bg-accent/15 text-accent'
          : 'bg-surface-highlight/25 text-text-secondary/70 hover:bg-surface-highlight/40 hover:text-text-primary/95'
      }`}
      onClick={() => onSelectTab(tab.session.id)}
      title={titleOf(tab.session)}
    >
      {active ? (
        <span className="text-accent">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      ) : (
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      )}
      <span className="min-w-0 flex-1 truncate text-lg font-bold">{titleOf(tab.session)}</span>
      <span
        className="rounded-lg p-1 opacity-60 transition-opacity hover:bg-surface-highlight/35 hover:opacity-100"
        title={t('end_session')}
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
