import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  api,
  AIRequestLog,
  AIPreset,
  AutoActionLog,
  SessionSettings,
  WorkflowEvent,
} from '../core/api';
import { TranslationKey } from '../i18n/translations';
import { useI18n } from '../i18n/i18nStore';
import { useAIStore } from '../stores/aiStore';
import {
  AIToolIcon,
  CheckIcon,
  ClockIcon,
  CrossIcon,
  DiamondIcon,
  PlayIcon,
  RefreshIcon,
  StopIcon,
} from './ToolIcons';

interface Props {
  sessionId: string;
  onClose: () => void;
}

// Distinctive avatar tone for the AI panel (violet spark).
const AI_AVATAR_TONE = { backgroundColor: '#7353ea', color: '#ffffff' };

interface EventMeta {
  icon: ReactNode;
  color: string;
  labelKey: TranslationKey;
}

const EVENT_META: Record<string, EventMeta> = {
  context_changed: { icon: <RefreshIcon className="h-4 w-4" />, color: 'text-text-secondary/65', labelKey: 'workflow_event_context_changed' },
  state_analysis_start: { icon: <DiamondIcon className="h-4 w-4" />, color: 'text-accent', labelKey: 'workflow_event_state_analysis_start' },
  state_analyzed: { icon: <CheckIcon className="h-4 w-4" />, color: 'text-success', labelKey: 'workflow_event_state_analyzed' },
  analysis_failed: { icon: <CrossIcon className="h-4 w-4" />, color: 'text-error', labelKey: 'workflow_event_analysis_failed' },
  action_analysis_start: { icon: <DiamondIcon className="h-4 w-4" />, color: 'text-accent', labelKey: 'workflow_event_action_analysis_start' },
  action_analysis_end: { icon: <DiamondIcon className="h-4 w-4" />, color: 'text-accent', labelKey: 'workflow_event_action_analysis_end' },
  action_queued: { icon: <ClockIcon className="h-4 w-4" />, color: 'text-warning', labelKey: 'workflow_event_action_queued' },
  action_executed: { icon: <PlayIcon className="h-4 w-4" />, color: 'text-accent', labelKey: 'workflow_event_action_executed' },
  action_start: { icon: <PlayIcon className="h-4 w-4" />, color: 'text-accent', labelKey: 'workflow_event_action_start' },
  action_end: { icon: <StopIcon className="h-4 w-4" />, color: 'text-text-secondary/65', labelKey: 'workflow_event_action_end' },
  action_success: { icon: <CheckIcon className="h-4 w-4" />, color: 'text-success', labelKey: 'workflow_event_action_success' },
  action_failed: { icon: <CrossIcon className="h-4 w-4" />, color: 'text-error', labelKey: 'workflow_event_action_failed' },
  action_removed: { icon: <CrossIcon className="h-4 w-4" />, color: 'text-text-secondary/65', labelKey: 'workflow_event_action_removed' },
  action_skipped: { icon: <ClockIcon className="h-4 w-4" />, color: 'text-warning', labelKey: 'workflow_event_action_skipped' },
  idle: { icon: <DiamondIcon className="h-4 w-4" />, color: 'text-text-secondary/65', labelKey: 'workflow_event_idle' },
};

type PanelTab = 'workflow' | 'auto_logs' | 'request_logs' | 'presets' | 'session';
type FilterCategory = 'all' | 'state' | 'auto_reply' | 'notify';

const panelTabs: Array<{ key: PanelTab; labelKey: TranslationKey }> = [
  { key: 'workflow', labelKey: 'workflow_events_title' },
  { key: 'auto_logs', labelKey: 'auto_logs_title' },
  { key: 'request_logs', labelKey: 'ai_request_logs_title' },
  { key: 'presets', labelKey: 'preset_label' },
  { key: 'session', labelKey: 'session_actions_title' },
];

function formatCompactTime(value: number | string) {
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatPresetTime(value: number) {
  const normalized = value > 1000000000000 ? value : value * 1000;
  return new Date(normalized).toLocaleString();
}

function clipText(value: string | undefined | null, max = 160) {
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

type TranslateFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

function translateActionKind(kind: string | undefined, t: TranslateFn) {
  switch (kind) {
    case 'auto_reply':
      return t('workflow_kind_auto_reply');
    case 'notify':
      return t('workflow_kind_notify');
    default:
      return kind || '-';
  }
}

function translateSkipReason(reason: string | undefined, t: TranslateFn) {
  switch (reason) {
    case 'tag_not_allowed':
      return t('workflow_reason_tag_not_allowed');
    case 'validation_failed':
      return t('workflow_reason_validation_failed');
    case 'no_actions':
      return t('workflow_reason_no_actions');
    case 'cooldown':
      return t('workflow_reason_cooldown');
    case 'goal_misaligned':
      return t('workflow_reason_goal_misaligned');
    case 'user_input':
      return t('workflow_reason_user_input');
    default:
      return reason || '-';
  }
}

function translateRequestType(type: string, t: TranslateFn) {
  switch (type) {
    case 'summarize':
      return t('ai_logs_type_summarize');
    case 'decide_action':
      return t('ai_logs_type_decide_action');
    default:
      return type;
  }
}

function formatActionSig(sig: string | undefined, t: TranslateFn) {
  if (!sig) return '-';
  return sig
    .replace(/enter/gi, t('workflow_action_enter'))
    .replace(/up/gi, t('workflow_action_up'))
    .replace(/down/gi, t('workflow_action_down'))
    .replace(/left/gi, t('workflow_action_left'))
    .replace(/right/gi, t('workflow_action_right'))
    .replace(/\+/g, ' / ');
}

function formatActionSteps(actions: AutoActionLog['actions'] | undefined, t: TranslateFn) {
  const safeActions = actions ?? [];
  if (safeActions.length === 0) return '-';
  return safeActions.map(action => {
    if (action.type === 'enter') return t('workflow_action_enter');
    if (action.type === 'arrow') {
      return formatActionSig(action.value, t);
    }
    if (action.type === 'yn') return action.value.toLowerCase() === 'y' ? t('workflow_action_yes') : t('workflow_action_no');
    if (action.type === 'digit') return t('workflow_action_digit', { value: action.value });
    if (action.type === 'text') return t('workflow_action_text', { value: action.value });
    return action.value ? `${action.type}: ${action.value}` : action.type;
  }).join(' / ');
}

function getWorkflowSubtitle(event: WorkflowEvent, t: TranslateFn) {
  if (event.error) return event.error;
  if (event.reason) return translateSkipReason(event.reason, t);
  if (event.reasoning) return event.reasoning;
  if (event.tag || event.description) {
    return [event.tag ? t('workflow_event_state_value', { status: event.tag }) : '', event.description]
      .filter(Boolean)
      .join(' · ');
  }
  if (event.action_sig) return formatActionSig(event.action_sig, t);
  if (event.duration_ms !== undefined && event.duration_ms > 0) return t('workflow_event_duration_hint', { duration: event.duration_ms });
  return t('workflow_event_no_detail');
}

export function AIPanel({ sessionId, onClose }: Props) {
  // onClose is part of the toggle contract (closed by re-clicking the toolbar
  // button) but the panel renders no in-card close affordance by design.
  void onClose;
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<PanelTab>('workflow');
  const [fetchedEvents, setFetchedEvents] = useState<WorkflowEvent[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [autoLogs, setAutoLogs] = useState<AutoActionLog[]>([]);
  const [autoLogsLoading, setAutoLogsLoading] = useState(false);
  const [requestLogs, setRequestLogs] = useState<AIRequestLog[]>([]);
  const [logDates, setLogDates] = useState<string[]>([]);
  const [selectedLogDate, setSelectedLogDate] = useState('');
  const [requestLogsLoading, setRequestLogsLoading] = useState(false);
  const [presets, setPresets] = useState<AIPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [sessionSettings, setSessionSettings] = useState<SessionSettings | null>(null);
  const [goalDraft, setGoalDraft] = useState('');
  const [sessionLoading, setSessionLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const realtimeEvents = useAIStore(s => s.workflowEvents[sessionId] || []);
  const summary = useAIStore(s => s.summaries[sessionId]);
  const clearWorkflowEvents = useAIStore(s => s.clearWorkflowEvents);
  const setStoreSessionGoal = useAIStore(s => s.setSessionGoal);

  const loadWorkflowEvents = async () => {
    setWorkflowLoading(true);
    try {
      const { events } = await api.getWorkflowEvents(sessionId, 100);
      setFetchedEvents(events ?? []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_load'));
    } finally {
      setWorkflowLoading(false);
    }
  };

  const loadAutoLogs = async () => {
    setAutoLogsLoading(true);
    try {
      const { logs } = await api.getAutoLogs(sessionId);
      // Defensive: backend may serialize a nil slice as JSON null, which
      // would crash logs.length/.map and blank the whole panel.
      setAutoLogs(logs ?? []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_load'));
    } finally {
      setAutoLogsLoading(false);
    }
  };

  const loadRequestLogs = async () => {
    setRequestLogsLoading(true);
    try {
      const [logsResult, datesResult] = await Promise.all([
        api.getAILogs({ date: selectedLogDate || undefined, limit: 80 }),
        api.getAILogDates(),
      ]);
      setRequestLogs(logsResult.logs ?? []);
      setLogDates(datesResult.dates ?? []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_load'));
    } finally {
      setRequestLogsLoading(false);
    }
  };

  const loadPresets = async () => {
    setPresetsLoading(true);
    try {
      const { presets: nextPresets } = await api.getAIPresets();
      setPresets(nextPresets ?? []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_load'));
    } finally {
      setPresetsLoading(false);
    }
  };

  const loadSessionSettings = async () => {
    setSessionLoading(true);
    try {
      const settings = await api.getSessionSettings(sessionId);
      setSessionSettings(settings);
      setGoalDraft(settings.session_goal || '');
      setStoreSessionGoal(sessionId, settings.session_goal || '');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_load'));
    } finally {
      setSessionLoading(false);
    }
  };

  useEffect(() => {
    setActiveTab('workflow');
    setFetchedEvents([]);
    setAutoLogs([]);
    setRequestLogs([]);
    setPresets([]);
    setSessionSettings(null);
    setGoalDraft('');
    setError('');
    setNotice('');
    loadWorkflowEvents();
    loadSessionSettings();
  }, [sessionId]);

  useEffect(() => {
    if (activeTab === 'auto_logs' && autoLogs.length === 0) {
      loadAutoLogs();
    }
    if (activeTab === 'request_logs' && requestLogs.length === 0) {
      loadRequestLogs();
    }
    if (activeTab === 'presets' && presets.length === 0) {
      loadPresets();
    }
    if (activeTab === 'session' && !sessionSettings) {
      loadSessionSettings();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'request_logs') {
      loadRequestLogs();
    }
  }, [selectedLogDate]);

  const allEvents = useMemo(() => {
    const merged = [...fetchedEvents];
    const ids = new Set(fetchedEvents.map(e => e.id));
    for (const event of realtimeEvents) {
      if (!ids.has(event.id)) {
        merged.push(event);
        ids.add(event.id);
      }
    }
    return merged
      .filter(event => event.event_type !== 'idle')
      .sort((a, b) => b.seq - a.seq)
      .slice(0, 100);
  }, [fetchedEvents, realtimeEvents]);

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return allEvents;
    return allEvents.filter(event => {
      if (filter === 'state') return event.event_type.includes('state') || event.event_type.includes('analysis');
      if (filter === 'auto_reply') return event.action_kind === 'auto_reply' || (event.event_type.includes('action') && event.action_kind !== 'notify');
      if (filter === 'notify') return event.action_kind === 'notify';
      return true;
    });
  }, [allEvents, filter]);

  const refreshActiveTab = () => {
    if (activeTab === 'workflow') {
      loadWorkflowEvents();
      return;
    }
    if (activeTab === 'auto_logs') {
      loadAutoLogs();
      return;
    }
    if (activeTab === 'request_logs') {
      loadRequestLogs();
      return;
    }
    if (activeTab === 'presets') {
      loadPresets();
      return;
    }
    loadSessionSettings();
  };

  const handleClearWorkflow = () => {
    clearWorkflowEvents(sessionId);
    setFetchedEvents([]);
    setNotice(t('auto_logs_clear'));
  };

  const handleClearAutoLogs = async () => {
    if (!confirm(t('auto_logs_clear_confirm'))) return;
    try {
      await api.clearAutoLogs();
      setAutoLogs([]);
      setNotice(t('auto_logs_clear'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_clear'));
    }
  };

  const handleClearRequestLogs = async () => {
    if (!confirm(t('ai_logs_clear_confirm'))) return;
    try {
      await api.clearAILogs();
      setRequestLogs([]);
      setLogDates([]);
      setNotice(t('auto_logs_clear'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_clear'));
    }
  };

  const handleSavePreset = async () => {
    const name = presetName.trim();
    if (!name) return;
    try {
      await api.createAIPreset(name);
      setPresetName('');
      await loadPresets();
      setNotice(t('preset_saved'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_save'));
    }
  };

  const handleApplyPreset = async (name: string) => {
    try {
      await api.applyAIPreset(name);
      setNotice(t('preset_applied'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_save'));
    }
  };

  const handleDeletePreset = async (name: string) => {
    if (!confirm(t('preset_delete_confirm', { name }))) return;
    try {
      await api.deleteAIPreset(name);
      await loadPresets();
      setNotice(t('preset_deleted'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_clear'));
    }
  };

  const handleToggleNotify = async () => {
    if (!sessionSettings) return;
    try {
      if (sessionSettings.notify_enabled) {
        await api.disableSessionNotify(sessionId);
      } else {
        await api.enableSessionNotify(sessionId);
      }
      await loadSessionSettings();
      setNotice(t('settings_saved'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_save'));
    }
  };

  const handleToggleAuto = async () => {
    if (!sessionSettings) return;
    try {
      if (sessionSettings.auto_enabled) {
        await api.disableSessionAuto(sessionId);
      } else {
        await api.enableSessionAuto(sessionId, goalDraft);
      }
      await loadSessionSettings();
      setNotice(t('settings_saved'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_save'));
    }
  };

  const handleSaveGoal = async () => {
    try {
      await api.setSessionGoal(sessionId, goalDraft);
      setStoreSessionGoal(sessionId, goalDraft);
      await loadSessionSettings();
      setNotice(t('settings_saved'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings_error_save'));
    }
  };

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* Header — icon avatar + title + session summary chip (no close button; toggled from toolbar) */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-theme-border/10 bg-surface px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={AI_AVATAR_TONE}
          >
            <AIToolIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-text-primary/95">{t('ai_settings_title')}</h2>
            {summary ? (
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                <span className="truncate text-xs font-semibold text-text-secondary/55">{summary.tag} · {summary.description}</span>
              </div>
            ) : (
              <p className="mt-0.5 truncate text-xs font-semibold text-text-tertiary/45">{t('ai_settings_subtitle')}</p>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {/* Quick toggles lifted from the Session tab for fast access.
              Reflect sessionSettings.notify_enabled / auto_enabled; the goal
              textarea + save button stay in the Session tab (form content). */}
          <HeaderToggle
            title={t(sessionSettings?.notify_enabled ? 'session_notify_on' : 'session_notify_off')}
            pressed={!!sessionSettings?.notify_enabled}
            disabled={!sessionSettings}
            onClick={handleToggleNotify}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </HeaderToggle>
          <HeaderToggle
            title={t(sessionSettings?.auto_enabled ? 'session_auto_on' : 'session_auto_off')}
            pressed={!!sessionSettings?.auto_enabled}
            disabled={!sessionSettings}
            onClick={handleToggleAuto}
          >
            <PlayIcon className="h-4 w-4" />
          </HeaderToggle>
          <button
            type="button"
            title={t('auto_logs_refresh')}
            onClick={refreshActiveTab}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-theme-border/10 bg-surface-highlight/25 text-text-secondary/70 transition-colors hover:bg-surface-highlight/45 hover:text-text-primary/95"
          >
            <RefreshIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-theme-border/10 px-3 py-2">
        {panelTabs.map(item => (
          <button
            key={item.key}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === item.key
                ? 'bg-accent text-accent-foreground'
                : 'text-text-secondary/60 hover:bg-surface-highlight/35 hover:text-text-primary/95'
            }`}
            onClick={() => setActiveTab(item.key)}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      {(error || notice) && (
        <div className={`border-b px-4 py-2 text-xs font-semibold ${error ? 'border-error/20 bg-error/10 text-error' : 'border-accent/20 bg-accent/10 text-accent'}`}>
          {error || notice}
        </div>
      )}

      {activeTab === 'workflow' && (
        <WorkflowView
          loading={workflowLoading}
          filter={filter}
          events={filteredEvents}
          expandedId={expandedEventId}
          onFilterChange={setFilter}
          onToggleExpanded={id => setExpandedEventId(expandedEventId === id ? null : id)}
          onClear={handleClearWorkflow}
        />
      )}

      {activeTab === 'auto_logs' && (
        <AutoLogsView
          loading={autoLogsLoading}
          logs={autoLogs}
          expandedId={expandedLogId}
          onToggleExpanded={id => setExpandedLogId(expandedLogId === id ? null : id)}
          onClear={handleClearAutoLogs}
        />
      )}

      {activeTab === 'request_logs' && (
        <RequestLogsView
          loading={requestLogsLoading}
          logs={requestLogs}
          dates={logDates}
          selectedDate={selectedLogDate}
          expandedId={expandedLogId}
          onDateChange={setSelectedLogDate}
          onToggleExpanded={id => setExpandedLogId(expandedLogId === id ? null : id)}
          onClear={handleClearRequestLogs}
        />
      )}

      {activeTab === 'presets' && (
        <PresetsView
          loading={presetsLoading}
          presets={presets}
          presetName={presetName}
          onPresetNameChange={setPresetName}
          onSavePreset={handleSavePreset}
          onApplyPreset={handleApplyPreset}
          onDeletePreset={handleDeletePreset}
        />
      )}

      {activeTab === 'session' && (
        <SessionActionsView
          loading={sessionLoading}
          settings={sessionSettings}
          goalDraft={goalDraft}
          onGoalChange={setGoalDraft}
          onSaveGoal={handleSaveGoal}
          onToggleNotify={handleToggleNotify}
          onToggleAuto={handleToggleAuto}
        />
      )}
    </div>
  );
}

function WorkflowView({ loading, filter, events, expandedId, onFilterChange, onToggleExpanded, onClear }: {
  loading: boolean;
  filter: FilterCategory;
  events: WorkflowEvent[];
  expandedId: string | null;
  onFilterChange: (filter: FilterCategory) => void;
  onToggleExpanded: (id: string) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-theme-border/10 px-3 py-2">
        <div className="flex items-center gap-1">
          {([
            ['all', t('filter_all')],
            ['state', t('filter_state')],
            ['auto_reply', t('filter_auto')],
            ['notify', t('filter_notify')],
          ] as [FilterCategory, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                filter === key
                  ? 'bg-accent text-accent-foreground'
                  : 'text-text-secondary/60 hover:bg-surface-highlight/35 hover:text-text-primary/95'
              }`}
              onClick={() => onFilterChange(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="rounded-lg px-2 py-1 text-xs font-semibold text-text-secondary/60 transition-colors hover:bg-surface-highlight/35 hover:text-text-primary/95" onClick={onClear}>
          {t('auto_logs_clear')}
        </button>
      </div>
      <ScrollableEmptyAware loading={loading} empty={events.length === 0} emptyLabel={t('workflow_events_empty')}>
        {events.map(event => {
          const meta = EVENT_META[event.event_type] || { icon: <DiamondIcon className="h-4 w-4" />, color: 'text-text-secondary/65', labelKey: 'workflow_event_unknown' };
          const expanded = expandedId === event.id;
          return (
            <TimelineItem
              key={event.id}
              icon={meta.icon}
              title={t(meta.labelKey)}
              tone={meta.color}
              time={formatCompactTime(event.timestamp_ms)}
              onClick={() => onToggleExpanded(event.id)}
            >
              <div className="truncate text-xs text-text-secondary/65">{getWorkflowSubtitle(event, t)}</div>
              {expanded && (
                <DetailStack>
                  <KeyValue label={t('workflow_detail_event_type')} value={event.event_type} mono />
                  {event.tag && <KeyValue label={t('workflow_detail_state')} value={event.tag} tone="warning" />}
                  {event.description && <KeyValue label={t('workflow_detail_description')} value={event.description} />}
                  {event.action_sig && <KeyValue label={t('workflow_detail_action')} value={formatActionSig(event.action_sig, t)} />}
                  {event.action_kind && <KeyValue label={t('workflow_detail_kind')} value={translateActionKind(event.action_kind, t)} />}
                  {event.duration_ms !== undefined && event.duration_ms > 0 && <KeyValue label={t('workflow_detail_duration')} value={`${event.duration_ms}ms`} />}
                  {event.reason && <KeyValue label={t('workflow_detail_reason')} value={translateSkipReason(event.reason, t)} tone="warning" />}
                  {event.error && <KeyValue label={t('workflow_detail_error')} value={event.error} tone="error" />}
                  {event.reasoning && <KeyValue label={t('workflow_detail_reasoning')} value={event.reasoning} />}
                </DetailStack>
              )}
            </TimelineItem>
          );
        })}
      </ScrollableEmptyAware>
    </div>
  );
}

function AutoLogsView({ loading, logs, expandedId, onToggleExpanded, onClear }: {
  loading: boolean;
  logs: AutoActionLog[];
  expandedId: string | null;
  onToggleExpanded: (id: string) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex justify-end border-b border-theme-border/10 px-3 py-2">
        <button className="rounded-lg px-2 py-1 text-xs font-semibold text-text-secondary/60 transition-colors hover:bg-surface-highlight/35 hover:text-text-primary/95" onClick={onClear}>
          {t('auto_logs_clear')}
        </button>
      </div>
      <ScrollableEmptyAware loading={loading} empty={logs.length === 0} emptyLabel={t('auto_logs_empty')}>
        {logs.map(log => {
          const expanded = expandedId === log.id;
          // Defensive access: backend may serialize nil slices as JSON null
          // (e.g. when the LLM omits actions/evidence). Accessing .map()/.length
          // on null throws and crashes the whole panel to a black screen.
          const actions = log.actions ?? [];
          const evidence = log.evidence ?? [];
          return (
            <TimelineItem
              key={log.id}
              icon={log.success ? <CheckIcon className="h-4 w-4" /> : <CrossIcon className="h-4 w-4" />}
              title={log.tag || log.description || log.session_name}
              tone={log.success ? 'text-success' : 'text-error'}
              time={formatCompactTime(log.timestamp)}
              onClick={() => onToggleExpanded(log.id)}
            >
              <div className="truncate text-xs text-text-secondary/65">{clipText(log.description || log.reasoning || '')}</div>
              {expanded && (
                <DetailStack>
                  <KeyValue label={t('auto_log_confidence')} value={`${Math.round((log.confidence ?? 0) * 100)}%`} />
                  <KeyValue label={t('auto_log_action_keywords')} value={formatActionSteps(actions, t)} />
                  {log.action_keywords && log.action_keywords.length > 0 && <KeyValue label={t('auto_log_tag')} value={log.action_keywords.join(', ')} />}
                  {log.reasoning && <KeyValue label={t('auto_log_reasoning')} value={log.reasoning} />}
                  {evidence.length > 0 && <PreBlock label={t('auto_log_evidence')} value={evidence.join('\n')} />}
                  {log.context && <PreBlock label={t('auto_log_context')} value={log.context} />}
                  {log.error && <KeyValue label={t('auto_log_error')} value={log.error} tone="error" />}
                </DetailStack>
              )}
            </TimelineItem>
          );
        })}
      </ScrollableEmptyAware>
    </div>
  );
}

function RequestLogsView({ loading, logs, dates, selectedDate, expandedId, onDateChange, onToggleExpanded, onClear }: {
  loading: boolean;
  logs: AIRequestLog[];
  dates: string[];
  selectedDate: string;
  expandedId: string | null;
  onDateChange: (date: string) => void;
  onToggleExpanded: (id: string) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-theme-border/10 px-3 py-2">
        <select
          className="h-9 rounded-lg border border-theme-border/10 bg-surface-highlight/25 px-3 text-xs font-semibold text-text-primary/95 outline-none focus:border-accent"
          value={selectedDate}
          onChange={event => onDateChange(event.target.value)}
        >
          <option value="">{t('ai_logs_date_all')}</option>
          {dates.map(date => <option key={date} value={date}>{date}</option>)}
        </select>
        <button className="rounded-lg px-2 py-1 text-xs font-semibold text-text-secondary/60 transition-colors hover:bg-surface-highlight/35 hover:text-text-primary/95" onClick={onClear}>
          {t('auto_logs_clear')}
        </button>
      </div>
      <ScrollableEmptyAware loading={loading} empty={logs.length === 0} emptyLabel={t('ai_logs_empty')}>
        {logs.map(log => {
          const expanded = expandedId === log.id;
          return (
            <TimelineItem
              key={log.id}
              icon={log.error ? <CrossIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
              title={`${translateRequestType(log.type, t)} · ${log.model}`}
              tone={log.error ? 'text-error' : 'text-accent'}
              time={formatCompactTime(log.timestamp)}
              onClick={() => onToggleExpanded(log.id)}
            >
              <div className="truncate text-xs text-text-secondary/65">{clipText(log.user_content)}</div>
              {expanded && (
                <DetailStack>
                  <KeyValue label={t('ai_logs_duration')} value={`${log.duration_ms}ms`} />
                  {log.session_id && <KeyValue label={t('workflow_detail_session')} value={log.session_id} mono />}
                  {log.error && <KeyValue label={t('ai_logs_error')} value={log.error} tone="error" />}
                  <PreBlock label={t('ai_logs_request')} value={log.user_content} />
                  {log.raw_response && <PreBlock label={t('ai_logs_response')} value={log.raw_response} />}
                  {log.parsed_json && <PreBlock label={t('workflow_detail_json')} value={log.parsed_json} />}
                </DetailStack>
              )}
            </TimelineItem>
          );
        })}
      </ScrollableEmptyAware>
    </div>
  );
}

function PresetsView({ loading, presets, presetName, onPresetNameChange, onSavePreset, onApplyPreset, onDeletePreset }: {
  loading: boolean;
  presets: AIPreset[];
  presetName: string;
  onPresetNameChange: (name: string) => void;
  onSavePreset: () => void;
  onApplyPreset: (name: string) => void;
  onDeletePreset: (name: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-theme-border/10 p-3">
        <div className="flex gap-2">
          <input
            className="h-10 min-w-0 flex-1 rounded-xl border border-theme-border/10 bg-surface-highlight/25 px-3 text-sm text-text-primary/95 outline-none placeholder:text-text-tertiary/40 focus:border-accent"
            value={presetName}
            onChange={event => onPresetNameChange(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && onSavePreset()}
            placeholder={t('preset_name_placeholder')}
          />
          <button className="h-10 rounded-xl bg-accent px-4 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90" onClick={onSavePreset}>
            {t('preset_save')}
          </button>
        </div>
      </div>
      <ScrollableEmptyAware loading={loading} empty={presets.length === 0} emptyLabel={t('preset_empty')}>
        {presets.map(preset => (
          <div key={preset.name} className="rounded-xl border border-theme-border/10 bg-surface-highlight/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-text-primary/95">{preset.name}</div>
                <div className="mt-1 text-xs font-semibold text-text-secondary/45">{formatPresetTime(preset.created_at)}</div>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <MiniButton onClick={() => onApplyPreset(preset.name)}>{t('preset_applied')}</MiniButton>
                <DangerButton onClick={() => onDeletePreset(preset.name)}>{t('preset_delete')}</DangerButton>
              </div>
            </div>
          </div>
        ))}
      </ScrollableEmptyAware>
    </div>
  );
}

function SessionActionsView({ loading, settings, goalDraft, onGoalChange, onSaveGoal, onToggleNotify, onToggleAuto }: {
  loading: boolean;
  settings: SessionSettings | null;
  goalDraft: string;
  onGoalChange: (goal: string) => void;
  onSaveGoal: () => void;
  onToggleNotify: () => void;
  onToggleAuto: () => void;
}) {
  const { t } = useI18n();

  if (loading) {
    return <CenteredLabel>{t('loading')}</CenteredLabel>;
  }

  if (!settings) {
    return <CenteredLabel>{t('session_actions_disabled')}</CenteredLabel>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="space-y-4">
        <ToggleAction label={t(settings.notify_enabled ? 'session_notify_on' : 'session_notify_off')} checked={settings.notify_enabled} onClick={onToggleNotify} />
        <ToggleAction label={t(settings.auto_enabled ? 'session_auto_on' : 'session_auto_off')} checked={settings.auto_enabled} onClick={onToggleAuto} />
        <label className="block space-y-2">
          <span className="text-sm font-bold text-text-secondary/60">{t('unattended_goal_title')}</span>
          <textarea
            className="min-h-[140px] w-full resize-none rounded-xl border border-theme-border/10 bg-surface-highlight/25 px-3 py-3 text-sm text-text-primary/95 outline-none placeholder:text-text-tertiary/40 focus:border-accent"
            value={goalDraft}
            onChange={event => onGoalChange(event.target.value)}
            placeholder={t('unattended_goal_placeholder')}
          />
        </label>
        <button className="h-10 rounded-xl bg-accent px-4 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90" onClick={onSaveGoal}>
          {t('session_actions_save_goal')}
        </button>
      </div>
    </div>
  );
}

function ScrollableEmptyAware({ loading, empty, emptyLabel, children }: {
  loading: boolean;
  empty: boolean;
  emptyLabel: string;
  children: ReactNode;
}) {
  const { t } = useI18n();

  if (loading) {
    return <CenteredLabel>{t('loading')}</CenteredLabel>;
  }
  if (empty) {
    return <CenteredLabel>{emptyLabel}</CenteredLabel>;
  }
  return <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{children}</div>;
}

function CenteredLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-10 text-center text-sm font-semibold text-text-tertiary/45">
      {children}
    </div>
  );
}

function TimelineItem({ icon, title, tone, time, onClick, children }: {
  icon: ReactNode;
  title: string;
  tone: string;
  time: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="w-full rounded-xl border border-theme-border/10 bg-surface-highlight/15 px-3 py-2.5 text-left transition-colors hover:border-theme-border/20 hover:bg-surface-highlight/30"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-theme-border/10 bg-canvas/55 ${tone}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-text-primary/95">{title}</span>
            <span className="flex-shrink-0 text-[11px] font-medium text-text-secondary/45">{time}</span>
          </div>
          <div className="mt-1 min-w-0">{children}</div>
        </div>
      </div>
    </button>
  );
}

function DetailStack({ children }: { children: ReactNode }) {
  return <div className="mt-2 space-y-1.5 rounded-lg border border-theme-border/10 bg-canvas/70 p-2.5 text-xs">{children}</div>;
}

function KeyValue({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: 'warning' | 'error' }) {
  return (
    <div className="min-w-0">
      <span className="font-semibold text-text-secondary/50">{label}: </span>
      <span className={`${mono ? 'font-mono' : ''} ${tone === 'warning' ? 'text-warning' : tone === 'error' ? 'text-error' : 'text-text-primary/90'}`}>{value}</span>
    </div>
  );
}

function PreBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 font-semibold text-text-secondary/50">{label}</div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-theme-border/10 bg-surface-highlight/15 p-2 font-mono text-xs leading-relaxed text-text-secondary/80">
        {value}
      </pre>
    </div>
  );
}

function MiniButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="h-8 rounded-lg border border-theme-border/10 bg-surface-highlight/25 px-3 text-xs font-semibold text-text-secondary/75 transition-colors hover:bg-surface-highlight/45 hover:text-text-primary/95"
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

/** Compact icon toggle for the AI panel header — mirrors the Session-tab
 *  notify/auto switches so they are reachable without switching tabs. */
function HeaderToggle({ title, pressed, disabled, onClick, children }: {
  title: string;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 ${
        pressed
          ? 'border-accent/40 bg-accent/15 text-accent'
          : 'border-theme-border/10 bg-surface-highlight/25 text-text-secondary/70 hover:bg-surface-highlight/45 hover:text-text-primary/95'
      }`}
    >
      {children}
    </button>
  );
}

function DangerButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="h-8 rounded-lg border border-error/25 bg-error/10 px-3 text-xs font-semibold text-error transition-colors hover:bg-error/15"
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function ToggleAction({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex min-h-[56px] w-full items-center justify-between rounded-xl border border-theme-border/10 bg-surface-highlight/20 px-4 py-3 text-left transition-colors hover:bg-surface-highlight/35"
      onClick={onClick}
    >
      <span className="text-sm font-bold text-text-primary/95">{label}</span>
      <span className={`flex h-7 w-12 items-center rounded-full border px-1 transition-colors ${checked ? 'border-accent bg-accent' : 'border-theme-border/15 bg-canvas'}`}>
        <span className={`h-5 w-5 rounded-full bg-accent-foreground shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </span>
    </button>
  );
}
