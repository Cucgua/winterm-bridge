import { getCurrentWindow } from '@tauri-apps/api/window';
import { SessionInfo } from '../core/api';
import { useI18n } from '../i18n/i18nStore';
import { AISummary } from '../stores/aiStore';
import { getStatusTextColor, hasAiTagColor } from '../utils/statusColor';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { WindowControls } from './WindowControls';
import { useDragSource } from '../hooks/useDragSource';
import {
  CloseIcon,
  FilesToolIcon,
  AIToolIcon,
  TrellisToolIcon,
  IDEToolIcon,
  SaveProjectIcon,
  SplitIcon,
} from './ToolIcons';

export interface TabInfo {
  /** Present for single-session tabs; absent for split-page tabs. */
  session?: SessionInfo;
  summary?: AISummary;
  /** 'single' = one terminal; 'split' = split-pane page (splitTabId set). */
  kind: 'single' | 'split';
  /** For 'split' tabs: the id in the split store. */
  splitTabId?: string;
  /** For 'split' tabs: leaf count for the tab label. */
  splitCount?: number;
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
  /** Close a split-page tab (by splitTabId). */
  onCloseSplitTab: (splitTabId: string) => void;
  onNewTab: () => void;
  onBackToSessions: () => void;
  onSaveProject: () => void;
  onOpenFiles: () => void;
  onOpenAI: () => void;
  onOpenTrellis: () => void;
  onOpenIDE: () => void;
  /** Convert the active single-session tab into a split tab. */
  onStartSplit: () => void;
}

function titleOf(session: SessionInfo) {
  return session.title || session.tmux_name || `Session ${session.id.slice(0, 6)}`;
}

function IconButton({ title, active, disabled, onClick, children }: { title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
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
  onCloseSplitTab,
  onNewTab,
  onBackToSessions,
  onSaveProject,
  onOpenFiles,
  onOpenAI,
  onOpenTrellis,
  onOpenIDE,
  onStartSplit,
}: Props) {
  const { t } = useI18n();
  const activeTab = tabs.find(tab =>
    tab.kind === 'split' ? tab.splitTabId === activeSessionId : tab.session?.id === activeSessionId,
  );
  const isSplitTab = activeTab?.kind === 'split';
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
    <header data-tauri-drag-region className="h-11 shrink-0 border-b border-theme-border/5 bg-surface px-5 select-none">
      <div data-tauri-drag-region className="flex h-full items-center gap-3">
        <button
          onClick={onBackToSessions}
          className="flex h-9 items-center gap-2 rounded-xl bg-surface-highlight/30 px-3 text-sm text-text-secondary/80 transition-colors hover:bg-surface-highlight/45 hover:text-text-primary/95"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h6l2 2h10v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <span className="text-sm font-semibold">{t('workspace')}</span>
        </button>

        <div className="mx-1.5 h-6 w-px bg-theme-border/10" />

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden pr-1">
            {tabs.length > 0 ? (
              tabs.map(tab => (
                tab.kind === 'split' && tab.splitTabId ? (
                  <SplitPageTab
                    key={tab.splitTabId}
                    splitTabId={tab.splitTabId}
                    splitCount={tab.splitCount ?? 0}
                    active={tab.splitTabId === activeSessionId}
                    onSelectTab={onSelectTab}
                    onCloseSplitTab={onCloseSplitTab}
                  />
                ) : tab.session ? (
                  <SessionTab
                    key={tab.session.id}
                    tab={tab}
                    active={tab.session.id === activeSessionId}
                    onSelectTab={onSelectTab}
                    onCloseTab={onCloseTab}
                  />
                ) : null
              ))
            ) : (
              <button
                onClick={onBackToSessions}
                className="flex h-9 w-[12rem] flex-shrink-0 items-center gap-2 rounded-xl bg-surface-highlight/30 px-3 text-text-secondary/70 transition-colors hover:bg-surface-highlight/45 hover:text-text-primary/95"
              >
                <span className="truncate text-sm font-semibold">{t('select_session')}</span>
              </button>
            )}

          </div>

          <div className="relative flex-shrink-0" ref={tabMenuRef}>
            <button
              onClick={() => setTabMenuOpen(open => !open)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
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
              <div className="absolute right-0 top-10 z-40 w-80 overflow-hidden rounded-lg border border-theme-border/10 bg-surface-elevated py-1.5 shadow-2xl">
                <div className="border-b border-theme-border/10 px-3 pb-1.5 text-xs font-semibold uppercase text-text-secondary/45">
                  {t('open_sessions')}
                </div>
                <div className="max-h-[26.25rem] overflow-y-auto py-1">
                  {tabs.filter(tab => tab.kind === 'single' && tab.session).map(tab => (
                    <TabMenuItem
                      key={tab.session!.id}
                      tab={tab}
                      active={tab.session!.id === activeSessionId}
                      onSelect={() => {
                        setTabMenuOpen(false);
                        onSelectTab(tab.session!.id);
                      }}
                      onClose={() => {
                        setTabMenuOpen(false);
                        onCloseTab(tab.session!.id);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onNewTab}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-tertiary/40 transition-colors hover:bg-surface-highlight/30 hover:text-text-primary/95"
            title={t('session_new')}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

        <div className="flex items-center gap-1.5">
          <IconButton title={t('settings_save_project')} active={saveProjectActive} disabled={!activeTab} onClick={onSaveProject}>
            <SaveProjectIcon className="h-4 w-4" />
          </IconButton>
          {/* In split mode the per-pane headers own the tool buttons; disable the
              global ones to avoid two conflicting entry points. */}
          <IconButton title={t('files_title')} active={!isSplitTab && filesActive} disabled={isSplitTab} onClick={onOpenFiles}>
            <FilesToolIcon className="h-4 w-4" />
          </IconButton>
          <IconButton title={t('ai_settings_title')} active={(!isSplitTab && aiActive) || aiEnabled} disabled={isSplitTab} onClick={onOpenAI}>
            <AIToolIcon className="h-4 w-4" />
          </IconButton>
          <IconButton title={t('trellis_title')} active={!isSplitTab && trellisActive} disabled={isSplitTab} onClick={onOpenTrellis}>
            <TrellisToolIcon className="h-4 w-4" />
          </IconButton>
          <IconButton title={t('ide_panel_title')} active={!isSplitTab && ideActive} disabled={isSplitTab} onClick={onOpenIDE}>
            <IDEToolIcon className="h-4 w-4" />
          </IconButton>
          <IconButton
            title={t('split_start')}
            active={isSplitTab}
            disabled={!activeTab || isSplitTab}
            onClick={onStartSplit}
          >
            <SplitIcon className="h-4 w-4" />
          </IconButton>
          <div className="h-6 w-px bg-theme-border/10" />
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
  const session = tab.session;
  // Split-page tabs have no session; return a neutral status.
  if (!session) {
    return { text: 'text-text-tertiary/50', isAi: false, state: 'detached' };
  }
  if (summary && summary.tag) {
    return {
      tag: summary.tag,
      detail: summary.description,
      text: hasAiTagColor(summary.tag)
        ? getStatusTextColor({ kind: 'ai', tag: summary.tag })
        : getStatusTextColor({ kind: 'session', state: session.state, isGhost: session.is_ghost }),
      isAi: true,
      state: session.state,
    };
  }
  return {
    text: getStatusTextColor({ kind: 'session', state: session.state, isGhost: session.is_ghost }),
    isAi: false,
    state: session.state,
  };
}

function TabMenuItem({ tab, active, onSelect, onClose }: {
  tab: TabInfo;
  active?: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const session = tab.session!; // TabMenuItem only renders for single-session tabs
  const status = tabStatus(tab);
  const fallbackLabel = status.state === 'active' ? t('session_state_active') : t('session_state_idle');
  const chipLabel = status.isAi && status.tag ? status.tag : fallbackLabel;
  const titleText = status.detail ? `${titleOf(session)} — ${status.detail}` : titleOf(session);

  return (
    <button
      className={`group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
        active ? 'bg-accent/15 text-accent' : 'text-text-secondary/75 hover:bg-surface-highlight/30 hover:text-text-primary/95'
      }`}
      onClick={onSelect}
      title={titleText}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{titleOf(session)}</span>
      <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold ${
        active ? 'bg-accent-foreground/15 text-accent' : `bg-surface-highlight/45 ${status.isAi ? status.text : 'text-text-tertiary/55'}`
      }`}>
        {chipLabel}
      </span>
      <span
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-text-tertiary/45 opacity-70 transition-all hover:bg-surface-highlight/35 hover:text-error group-hover:opacity-100"
        title={t('end_session')}
        onClick={event => {
          event.stopPropagation();
          onClose();
        }}
      >
        <CloseIcon className="h-3 w-3" />
      </span>
    </button>
  );
}

/** A split-page tab: shows a split icon + pane count, no session drag source. */
function SplitPageTab({ splitTabId, splitCount, active, onSelectTab, onCloseSplitTab }: {
  splitTabId: string;
  splitCount: number;
  active?: boolean;
  onSelectTab: (tabKey: string) => void;
  onCloseSplitTab: (splitTabId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <button
      className={`group flex h-9 w-[10rem] flex-shrink-0 items-center gap-2 rounded-xl px-3 text-left transition-colors ${
        active
          ? 'bg-accent/15 text-accent'
          : 'bg-surface-highlight/25 text-text-secondary/70 hover:bg-surface-highlight/40 hover:text-text-primary/95'
      }`}
      onClick={() => onSelectTab(splitTabId)}
      title={t('split_start')}
    >
      <SplitIcon className="h-4 w-4 flex-none" />
      <span className="min-w-0 flex-1 truncate text-sm font-bold">{t('split_tab_label', { n: splitCount })}</span>
      <span
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-text-tertiary/45 opacity-60 transition-opacity hover:bg-surface-highlight/35 hover:text-error group-hover:opacity-100"
        title={t('close')}
        onClick={event => {
          event.stopPropagation();
          onCloseSplitTab(splitTabId);
        }}
      >
        <CloseIcon className="h-3 w-3" />
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
  const session = tab.session!; // SessionTab only renders for single-session tabs
  const status = tabStatus(tab);
  const fallbackLabel = status.state === 'active' ? t('session_state_active') : t('session_state_idle');
  const chipLabel = status.isAi && status.tag ? status.tag : fallbackLabel;
  const titleText = status.detail ? `${titleOf(session)} — ${status.detail}` : titleOf(session);
  // Make single-session tabs draggable so they can be dropped onto split panes.
  // Split tabs themselves aren't draggable (they're containers, not sessions).
  const drag = useDragSource(session.id, titleOf(session));

  return (
    <button
      className={`group flex h-9 w-[13.75rem] flex-shrink-0 items-center gap-2 rounded-xl px-3 text-left transition-colors md:w-[15rem] ${
        active
          ? 'bg-accent/15 text-accent'
          : 'bg-surface-highlight/25 text-text-secondary/70 hover:bg-surface-highlight/40 hover:text-text-primary/95'
      }`}
      onClick={() => onSelectTab(session.id)}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerLeave={drag.onPointerLeave}
      title={titleText}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-bold">{titleOf(session)}</span>
      <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold ${
        active
          ? 'bg-accent-foreground/15 text-accent'
          : `bg-surface-highlight/45 ${status.isAi ? status.text : 'text-text-tertiary/55'}`
      }`}>
        {chipLabel}
      </span>
      <span
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-text-tertiary/45 opacity-60 transition-opacity hover:bg-surface-highlight/35 hover:text-error hover:opacity-100"
        title={t('end_session')}
        onClick={event => {
          event.stopPropagation();
          onCloseTab(session.id);
        }}
      >
        <CloseIcon className="h-3 w-3" />
      </span>
    </button>
  );
}
