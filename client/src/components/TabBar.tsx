import { getCurrentWindow } from '@tauri-apps/api/window';
import { SessionInfo } from '../core/api';
import { useI18n } from '../i18n/i18nStore';
import { AISummary } from '../stores/aiStore';
import { getStatusTextColor, hasAiTagColor } from '../utils/statusColor';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { WindowControls } from './WindowControls';
import {
  CloseIcon,
  FilesToolIcon,
  AIToolIcon,
  TrellisToolIcon,
  IDEToolIcon,
  SaveProjectIcon,
} from './ToolIcons';

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
  saveProjectActive: boolean;
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
  saveProjectActive,
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

        <div className="mx-2 h-8 w-px bg-theme-border/10" />

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden pr-1">
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

        {/* Compact drag region: keeps the window draggable without competing
            with the tab strip for width (avoids 1:1 flex split that clipped
            tabs to ~half the header on wide screens). */}
        <div
          data-tauri-drag-region
          className="hidden w-16 min-w-6 flex-none self-stretch xl:block"
          onDoubleClick={() => { void getCurrentWindow().toggleMaximize().catch(() => undefined); }}
        />

        <div className="flex items-center gap-2">
          <IconButton title={t('settings_save_project')} active={saveProjectActive} disabled={!activeTab} onClick={onSaveProject}>
            <SaveProjectIcon className="h-5 w-5" />
          </IconButton>
          <IconButton title={t('files_title')} active={filesActive} onClick={onOpenFiles}>
            <FilesToolIcon className="h-5 w-5" />
          </IconButton>
          <IconButton title={t('ai_settings_title')} active={aiActive || aiEnabled} onClick={onOpenAI}>
            <AIToolIcon className="h-5 w-5" />
          </IconButton>
          <IconButton title={t('trellis_title')} active={trellisActive} onClick={onOpenTrellis}>
            <TrellisToolIcon className="h-5 w-5" />
          </IconButton>
          <IconButton title={t('ide_panel_title')} active={ideActive} onClick={onOpenIDE}>
            <IDEToolIcon className="h-5 w-5" />
          </IconButton>
          <div className="h-8 w-px bg-theme-border/10" />
          <WindowControls />
        </div>
      </div>
    </header>
  );
}

/** Resolve the live status to show on a tab: prefer the AI summary tag + a
 *  short description line (shown via title tooltip), fall back to the session
 *  lifecycle state. Pure data only — the component handles i18n for the
 *  lifecycle fallback label. Returns the chip text color (not a dot). */
function tabStatus(tab: TabInfo): { tag?: string; detail?: string; text: string; isAi: boolean; state: 'active' | 'detached' } {
  const summary = tab.summary;
  if (summary && summary.tag) {
    return {
      tag: summary.tag,
      detail: summary.description,
      text: hasAiTagColor(summary.tag)
        ? getStatusTextColor({ kind: 'ai', tag: summary.tag })
        : getStatusTextColor({ kind: 'session', state: tab.session.state, isGhost: tab.session.is_ghost }),
      isAi: true,
      state: tab.session.state,
    };
  }
  return {
    text: getStatusTextColor({ kind: 'session', state: tab.session.state, isGhost: tab.session.is_ghost }),
    isAi: false,
    state: tab.session.state,
  };
}

function TabMenuItem({ tab, active, onSelect, onClose }: {
  tab: TabInfo;
  active?: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const status = tabStatus(tab);
  const fallbackLabel = status.state === 'active' ? t('session_state_active') : t('session_state_idle');
  const chipLabel = status.isAi && status.tag ? status.tag : fallbackLabel;
  const titleText = status.detail ? `${titleOf(tab.session)} — ${status.detail}` : titleOf(tab.session);

  return (
    <button
      className={`group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
        active ? 'bg-accent/15 text-accent' : 'text-text-secondary/75 hover:bg-surface-highlight/30 hover:text-text-primary/95'
      }`}
      onClick={onSelect}
      title={titleText}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{titleOf(tab.session)}</span>
      <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
        active ? 'bg-accent-foreground/15 text-accent' : `bg-surface-highlight/45 ${status.isAi ? status.text : 'text-text-tertiary/55'}`
      }`}>
        {chipLabel}
      </span>
      <span
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-text-tertiary/45 opacity-70 transition-all hover:bg-surface-highlight/35 hover:text-error group-hover:opacity-100"
        title={t('end_session')}
        onClick={event => {
          event.stopPropagation();
          onClose();
        }}
      >
        <CloseIcon className="h-3.5 w-3.5" />
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
  const status = tabStatus(tab);
  const fallbackLabel = status.state === 'active' ? t('session_state_active') : t('session_state_idle');
  const chipLabel = status.isAi && status.tag ? status.tag : fallbackLabel;
  const titleText = status.detail ? `${titleOf(tab.session)} — ${status.detail}` : titleOf(tab.session);

  return (
    <button
      className={`group flex h-12 w-[280px] flex-shrink-0 items-center gap-2.5 rounded-2xl px-4 text-left transition-colors md:w-[300px] ${
        active
          ? 'bg-accent/15 text-accent'
          : 'bg-surface-highlight/25 text-text-secondary/70 hover:bg-surface-highlight/40 hover:text-text-primary/95'
      }`}
      onClick={() => onSelectTab(tab.session.id)}
      title={titleText}
    >
      <span className="min-w-0 flex-1 truncate text-lg font-bold">{titleOf(tab.session)}</span>
      <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
        active
          ? 'bg-accent-foreground/15 text-accent'
          : `bg-surface-highlight/45 ${status.isAi ? status.text : 'text-text-tertiary/55'}`
      }`}>
        {chipLabel}
      </span>
      <span
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-text-tertiary/45 opacity-60 transition-opacity hover:bg-surface-highlight/35 hover:text-error hover:opacity-100"
        title={t('end_session')}
        onClick={event => {
          event.stopPropagation();
          onCloseTab(tab.session.id);
        }}
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
