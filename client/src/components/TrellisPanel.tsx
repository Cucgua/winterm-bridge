import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  api,
  type TrellisArchivedTaskGroup,
  type TrellisDocument,
  type TrellisLink,
  type TrellisManifestItem,
  type TrellisSection,
  type TrellisSectionItem,
  type TrellisSourceResponse,
  type TrellisSpecLayer,
  type TrellisSummaryResponse,
  type TrellisTaskDetailResponse,
  type TrellisTaskReadiness,
  type TrellisTaskSummary,
  type TrellisWarning,
  type TrellisWorkflowState,
} from '../core/api';
import { useI18n } from '../i18n/i18nStore';
import { CheckIcon, ExternalLinkIcon, FileIcon, RefreshIcon, TrellisToolIcon } from './ToolIcons';

interface Props {
  sessionId: string;
  onClose: () => void;
}

// Distinctive avatar tone for the Trellis panel (teal).
const TRELLIS_AVATAR_TONE = { backgroundColor: '#18a0a6', color: '#ffffff' };

type TrellisTab = 'overview' | 'tasks' | 'specs' | 'workflow' | 'warnings' | 'source';
type TaskDetailTab = 'summary' | 'prd' | 'design' | 'implement' | 'research' | 'source';
type SpecDetailTab = 'structured' | 'source';

interface SourceCandidate {
  label: string;
  path: string;
  group: string;
}

interface SpecEntry {
  packageName: string;
  layer: TrellisSpecLayer;
}

const TAB_KEYS: { id: TrellisTab; labelKey: 'trellis_overview' | 'trellis_tasks' | 'trellis_specs' | 'trellis_workflow' | 'trellis_warnings' | 'trellis_source' }[] = [
  { id: 'overview', labelKey: 'trellis_overview' },
  { id: 'tasks', labelKey: 'trellis_tasks' },
  { id: 'specs', labelKey: 'trellis_specs' },
  { id: 'workflow', labelKey: 'trellis_workflow' },
  { id: 'warnings', labelKey: 'trellis_warnings' },
  { id: 'source', labelKey: 'trellis_source' },
];

const TASK_DETAIL_TABS: { id: TaskDetailTab; labelKey: 'trellis_summary' | 'trellis_prd' | 'trellis_design' | 'trellis_implement' | 'trellis_research' | 'trellis_source' }[] = [
  { id: 'summary', labelKey: 'trellis_summary' },
  { id: 'prd', labelKey: 'trellis_prd' },
  { id: 'design', labelKey: 'trellis_design' },
  { id: 'implement', labelKey: 'trellis_implement' },
  { id: 'research', labelKey: 'trellis_research' },
  { id: 'source', labelKey: 'trellis_source' },
];

// === helpers ===

function progressText(done: number, total: number): string {
  return total > 0 ? `${done}/${total}` : '0/0';
}

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function statusTone(status?: string): 'good' | 'warn' | 'muted' | 'default' {
  if (status === 'completed') return 'good';
  if (status === 'blocked') return 'warn';
  if (!status) return 'muted';
  return 'default';
}

function countArchivedTasks(groups?: TrellisArchivedTaskGroup[]): number {
  return (groups || []).reduce((count, group) => count + group.tasks.length, 0);
}

function itemKey(item: TrellisSectionItem, index: number): string {
  return `${item.kind || 'item'}-${index}-${item.text || item.cells?.join('|') || ''}`;
}

function readinessRows(readiness: TrellisTaskReadiness): { label: string; value: string; ok: boolean }[] {
  return [
    { label: 'trellis_prd', value: readiness.has_prd ? 'yes' : 'no', ok: readiness.has_prd },
    { label: 'trellis_design', value: readiness.has_design ? 'yes' : 'no', ok: readiness.has_design },
    { label: 'trellis_implement', value: readiness.has_implement ? 'yes' : 'no', ok: readiness.has_implement },
    { label: 'trellis_research', value: String(readiness.research_count), ok: readiness.has_research },
    { label: 'trellis_related_files', value: String(readiness.related_files_count), ok: readiness.related_files_count > 0 },
    { label: 'trellis_acceptance', value: progressText(readiness.acceptance_done, readiness.acceptance_total), ok: readiness.acceptance_total === 0 || readiness.acceptance_done === readiness.acceptance_total },
    { label: 'trellis_implement_context', value: String(readiness.implement_context_count), ok: readiness.implement_context_count > 0 },
    { label: 'trellis_check_context', value: String(readiness.check_context_count), ok: readiness.check_context_count > 0 },
  ];
}

function flattenSpecEntries(summary: TrellisSummaryResponse | null): SpecEntry[] {
  const entries: SpecEntry[] = [];
  for (const specPackage of summary?.specs?.packages ?? []) {
    for (const layer of specPackage.layers) {
      entries.push({ packageName: specPackage.name, layer });
    }
  }
  return entries;
}

function flattenArchivedTasks(groups?: TrellisArchivedTaskGroup[]): TrellisTaskSummary[] {
  return (groups ?? []).flatMap(group => group.tasks);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

// === Component ===

export function TrellisPanel({ sessionId, onClose }: Props) {
  const { t } = useI18n();
  // onClose is part of the toggle contract (closed by re-clicking the toolbar
  // button) but the panel renders no in-card close affordance by design.
  void onClose;

  const [summary, setSummary] = useState<TrellisSummaryResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TrellisTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Task state
  const [taskQuery, setTaskQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [archiveFilter, setArchiveFilter] = useState('');
  const [selectedTaskPath, setSelectedTaskPath] = useState('');
  const [taskDetail, setTaskDetail] = useState<TrellisTaskDetailResponse | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskDetailTab, setTaskDetailTab] = useState<TaskDetailTab>('summary');

  // Spec state
  const [specQuery, setSpecQuery] = useState('');
  const [selectedSpecPath, setSelectedSpecPath] = useState('');
  const [specDoc, setSpecDoc] = useState<TrellisDocument | null>(null);
  const [specLoading, setSpecLoading] = useState(false);
  const [specDetailTab, setSpecDetailTab] = useState<SpecDetailTab>('structured');

  // Source state
  const [selectedSourcePath, setSelectedSourcePath] = useState('');
  const [source, setSource] = useState<TrellisSourceResponse | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getSessionTrellisSummary(sessionId);
      setSummary(response);
      if (!response.available) {
        setTaskDetail(null);
        setSpecDoc(null);
        setSource(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('trellis_error_generic'));
    } finally {
      setLoading(false);
    }
  }, [sessionId, t]);

  useEffect(() => {
    setActiveTab('overview');
    setTaskQuery('');
    setStatusFilter('');
    setPriorityFilter('');
    setArchiveFilter('');
    setSelectedTaskPath('');
    setTaskDetail(null);
    setTaskDetailTab('summary');
    setSelectedSpecPath('');
    setSpecDoc(null);
    setSpecDetailTab('structured');
    setSelectedSourcePath('');
    setSource(null);
    loadSummary();
  }, [loadSummary]);

  // === derived task/spec data ===

  const allTasks = useMemo(() => {
    const active = summary?.active_tasks ?? [];
    const archived = flattenArchivedTasks(summary?.archived_tasks);
    return [...active, ...archived];
  }, [summary]);

  const statusOptions = useMemo(() => Array.from(new Set(allTasks.map(task => task.status).filter(Boolean))).sort(), [allTasks]);
  const priorityOptions = useMemo(() => Array.from(new Set(allTasks.map(task => task.priority || '').filter(Boolean))).sort(), [allTasks]);
  const archiveOptions = useMemo(() => (summary?.archived_tasks || []).map(group => group.archive_month), [summary]);

  const filteredActiveTasks = useMemo(() => {
    const q = normalize(taskQuery);
    return (summary?.active_tasks ?? []).filter(task =>
      taskMatchesQuery(task, q)
      && (!statusFilter || task.status === statusFilter)
      && (!priorityFilter || task.priority === priorityFilter)
      && !archiveFilter,
    );
  }, [summary, taskQuery, statusFilter, priorityFilter, archiveFilter]);

  const filteredArchiveGroups = useMemo<TrellisArchivedTaskGroup[]>(() => {
    const q = normalize(taskQuery);
    return (summary?.archived_tasks ?? [])
      .filter(group => !archiveFilter || group.archive_month === archiveFilter)
      .map(group => ({
        archive_month: group.archive_month,
        tasks: group.tasks.filter(task =>
          taskMatchesQuery(task, q, group.archive_month)
          && (!statusFilter || task.status === statusFilter)
          && (!priorityFilter || task.priority === priorityFilter),
        ),
      }))
      .filter(group => group.tasks.length > 0);
  }, [summary, taskQuery, statusFilter, priorityFilter, archiveFilter]);

  const specEntries = useMemo(() => {
    const entries = flattenSpecEntries(summary);
    const q = normalize(specQuery);
    if (!q) return entries;
    return entries.filter(entry => normalize(`${entry.packageName} ${entry.layer.title} ${entry.layer.name} ${entry.layer.path}`).includes(q));
  }, [summary, specQuery]);

  const sourceCandidates = useMemo(
    () => buildSourceCandidates(summary, taskDetail, specDoc, t('trellis_workflow'), t('trellis_task_json')),
    [summary, taskDetail, specDoc, t],
  );

  // === actions ===

  const openTask = useCallback(async (task: TrellisTaskSummary) => {
    setActiveTab('tasks');
    setSelectedTaskPath(task.path);
    setTaskDetail(null);
    setTaskDetailTab('summary');
    setSource(null);
    setTaskLoading(true);
    try {
      const detail = await api.getSessionTrellisTask(sessionId, task.path);
      setTaskDetail(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('trellis_error_generic'));
    } finally {
      setTaskLoading(false);
    }
  }, [sessionId, t]);

  const openSpec = useCallback(async (entry: SpecEntry) => {
    setActiveTab('specs');
    setSelectedSpecPath(entry.layer.path);
    setSpecDoc(null);
    setSpecDetailTab('structured');
    setSource(null);
    setSpecLoading(true);
    try {
      const document = await api.getSessionTrellisSpec(sessionId, entry.layer.path);
      setSpecDoc(document);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('trellis_error_generic'));
    } finally {
      setSpecLoading(false);
    }
  }, [sessionId, t]);

  const openSource = useCallback(async (candidate: SourceCandidate) => {
    setActiveTab('source');
    setSelectedSourcePath(candidate.path);
    setSourceLoading(true);
    setError('');
    try {
      const response = await api.getSessionTrellisSource(sessionId, candidate.path);
      setSource(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('trellis_error_generic'));
    } finally {
      setSourceLoading(false);
    }
  }, [sessionId, t]);

  const openTaskSource = useCallback(async (path: string) => {
    setTaskDetailTab('source');
    await openSource({ label: t('trellis_source'), path, group: '' });
  }, [openSource, t]);

  const openSpecSource = useCallback(async (path: string) => {
    setSpecDetailTab('source');
    await openSource({ label: t('trellis_source'), path, group: '' });
  }, [openSource, t]);

  // === render dispatcher ===

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <SkeletonBlock className="w-full max-w-sm" />
        </div>
      );
    }

    if (error) {
      return (
        <CenteredState>
          <span className="text-error">{error}</span>
          <button className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground" onClick={loadSummary}>
            <RefreshIcon className="h-3.5 w-3.5" />
            {t('trellis_retry')}
          </button>
        </CenteredState>
      );
    }

    if (!summary?.available) {
      return (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-theme-border/10 bg-surface-highlight/25 text-text-secondary/70">
            <TrellisToolIcon className="h-5 w-5" />
          </div>
          <h3 className="text-base font-bold text-text-primary/95">{t('trellis_no_project')}</h3>
          {summary?.current_path && (
            <p className="mt-2 max-w-full truncate font-mono text-xs text-text-secondary/55" title={summary.current_path}>
              {summary.current_path}
            </p>
          )}
        </div>
      );
    }

    if (activeTab === 'overview') {
      return <OverviewTab summary={summary} onOpenTask={openTask} onOpenSpec={openSpec} />;
    }

    if (activeTab === 'tasks') {
      return (
        <TasksTab
          filteredActiveTasks={filteredActiveTasks}
          filteredArchiveGroups={filteredArchiveGroups}
          selectedTaskPath={selectedTaskPath}
          taskQuery={taskQuery}
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
          archiveFilter={archiveFilter}
          statusOptions={statusOptions}
          priorityOptions={priorityOptions}
          archiveOptions={archiveOptions}
          onTaskQueryChange={setTaskQuery}
          onStatusFilterChange={setStatusFilter}
          onPriorityFilterChange={setPriorityFilter}
          onArchiveFilterChange={setArchiveFilter}
          onOpenTask={openTask}
          taskDetail={taskDetail}
          taskLoading={taskLoading}
          taskDetailTab={taskDetailTab}
          source={source}
          sourceLoading={sourceLoading}
          onTaskTabChange={setTaskDetailTab}
          onSource={openTaskSource}
        />
      );
    }

    if (activeTab === 'specs') {
      return (
        <SpecsTab
          specEntries={specEntries}
          specQuery={specQuery}
          selectedSpecPath={selectedSpecPath}
          specDoc={specDoc}
          specLoading={specLoading}
          specDetailTab={specDetailTab}
          source={source}
          sourceLoading={sourceLoading}
          onSpecQueryChange={setSpecQuery}
          onOpenSpec={openSpec}
          onSpecTabChange={setSpecDetailTab}
          onSource={openSpecSource}
        />
      );
    }

    if (activeTab === 'workflow') {
      return <WorkflowTab summary={summary} />;
    }

    if (activeTab === 'warnings') {
      return <WarningsTab warnings={summary.warnings ?? []} />;
    }

    return (
      <SourceTab
        candidates={sourceCandidates}
        selectedSourcePath={selectedSourcePath}
        source={source}
        loading={sourceLoading}
        onOpenSource={openSource}
      />
    );
  };

  return (
    <div className="flex h-full flex-col bg-canvas text-text-primary/95">
      {/* Header — icon avatar + title + read-only chip (no close button; toggled from toolbar) */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-theme-border/10 bg-surface px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={TRELLIS_AVATAR_TONE}
          >
            <TrellisToolIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-bold text-text-primary/95">{t('trellis_title')}</h2>
              <span className="rounded-md border border-theme-border/10 bg-surface-highlight/25 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-text-secondary/65">
                {t('trellis_read_only')}
              </span>
            </div>
            {summary?.project_root ? (
              <p className="mt-0.5 max-w-[760px] truncate font-mono text-xs text-text-secondary/55" title={summary.project_root}>
                {summary.project_root}
              </p>
            ) : (
              <p className="mt-0.5 truncate text-xs font-semibold text-text-tertiary/45">{t('trellis_workflow')}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          title={t('trellis_refresh')}
          onClick={loadSummary}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-theme-border/10 bg-surface-highlight/25 text-text-secondary/70 transition-colors hover:bg-surface-highlight/45 hover:text-text-primary/95"
        >
          <RefreshIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-theme-border/10 px-3 py-2">
        {TAB_KEYS.map(tab => (
          <button
            key={tab.id}
            className={`flex-shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === tab.id
                ? 'bg-accent text-accent-foreground'
                : 'text-text-secondary/65 hover:bg-surface-highlight/35 hover:text-text-primary/95'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}

// === Overview ===

function OverviewTab({ summary, onOpenTask, onOpenSpec }: {
  summary: TrellisSummaryResponse;
  onOpenTask: (task: TrellisTaskSummary) => void;
  onOpenSpec: (entry: SpecEntry) => void;
}) {
  const { t } = useI18n();
  const activeTasks = summary.active_tasks ?? [];
  const specEntries = flattenSpecEntries(summary);
  const archivedCount = countArchivedTasks(summary.archived_tasks);
  const warnings = summary.warnings ?? [];
  const activeTask = activeTasks[0];

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_300px] gap-4 overflow-auto p-5">
      <main className="min-w-0 space-y-5">
        <MetricGrid
          metrics={[
            { label: t('trellis_active_tasks'), value: activeTasks.length },
            { label: t('trellis_archived_tasks'), value: archivedCount },
            { label: t('trellis_specs'), value: specEntries.length },
            { label: t('trellis_warnings'), value: warnings.length, tone: warnings.length > 0 ? 'warn' : 'good' },
          ]}
        />

        <Section title={t('trellis_active_tasks')}>
          {activeTask ? (
            <div className="rounded-xl border border-theme-border/10 bg-surface-highlight/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-text-primary/95">{activeTask.title || activeTask.id}</div>
                  <div className="mt-0.5 truncate font-mono text-xs text-text-secondary/55">{activeTask.path}</div>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-[0.6875rem] text-text-secondary">
                  <StatusDot tone={statusTone(activeTask.status)} />
                  {activeTask.status || '-'}
                </span>
              </div>
              <div className="mt-2.5">
                <ProgressBar done={activeTask.acceptance_done} total={activeTask.acceptance_total} />
              </div>
            </div>
          ) : <EmptyState label={t('trellis_no_items')} />}
        </Section>

        <Section title={t('trellis_workspace')}>
          {!summary.workspace?.exists ? (
            <EmptyState label={t('trellis_no_items')} />
          ) : (
            <div className="divide-y divide-theme-border/10 rounded-xl border border-theme-border/10">
              {summary.workspace.developers.map(developer => (
                <div key={developer.name} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span className="min-w-0 truncate font-semibold text-text-primary/90">{developer.name}</span>
                  <div className="flex shrink-0 items-center gap-2 text-[0.6875rem] text-text-secondary">
                    <span className={`inline-flex items-center gap-1 ${developer.has_index ? 'text-success' : 'text-warning'}`}>
                      <CheckIcon className="h-3 w-3" />
                      index
                    </span>
                    <span>{developer.journal_count} {t('trellis_journals')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {summary.workflow && (
          <Section title={summary.workflow.title || t('trellis_workflow')}>
            <div className="grid grid-cols-2 gap-2">
              {(summary.workflow.phases ?? []).slice(0, 8).map(phase => (
                <div key={phase.name} className="rounded-xl bg-surface-highlight/15 px-3 py-2">
                  <div className="text-sm font-semibold text-text-primary/95">{phase.name}</div>
                  {phase.summary && <div className="mt-0.5 text-xs text-text-secondary/60">{phase.summary}</div>}
                  {phase.states && phase.states.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {phase.states.map(state => <Pill key={state} tone="muted">{state}</Pill>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title={t('trellis_warnings')}>
          <WarningList warnings={warnings} compact />
        </Section>
      </main>

      <aside className="min-w-0 space-y-5 border-l border-theme-border/10 pl-4">
        <Section title={t('trellis_quick_open')}>
          <div className="space-y-2">
            {activeTasks.slice(0, 5).map(task => (
              <TaskRow key={task.path} task={task} selected={false} onOpen={() => onOpenTask(task)} />
            ))}
            {specEntries.slice(0, 5).map(entry => (
              <SpecRow key={entry.layer.path} entry={entry} selected={false} onOpen={() => onOpenSpec(entry)} />
            ))}
            {activeTasks.length === 0 && specEntries.length === 0 && <EmptyState label={t('trellis_no_items')} />}
          </div>
        </Section>
      </aside>
    </div>
  );
}

// === Tasks ===

function TasksTab({
  filteredActiveTasks,
  filteredArchiveGroups,
  selectedTaskPath,
  taskQuery,
  statusFilter,
  priorityFilter,
  archiveFilter,
  statusOptions,
  priorityOptions,
  archiveOptions,
  onTaskQueryChange,
  onStatusFilterChange,
  onPriorityFilterChange,
  onArchiveFilterChange,
  onOpenTask,
  taskDetail,
  taskLoading,
  taskDetailTab,
  source,
  sourceLoading,
  onTaskTabChange,
  onSource,
}: {
  filteredActiveTasks: TrellisTaskSummary[];
  filteredArchiveGroups: TrellisArchivedTaskGroup[];
  selectedTaskPath: string;
  taskQuery: string;
  statusFilter: string;
  priorityFilter: string;
  archiveFilter: string;
  statusOptions: string[];
  priorityOptions: string[];
  archiveOptions: string[];
  onTaskQueryChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onPriorityFilterChange: (value: string) => void;
  onArchiveFilterChange: (value: string) => void;
  onOpenTask: (task: TrellisTaskSummary) => void;
  taskDetail: TrellisTaskDetailResponse | null;
  taskLoading: boolean;
  taskDetailTab: TaskDetailTab;
  source: TrellisSourceResponse | null;
  sourceLoading: boolean;
  onTaskTabChange: (tab: TaskDetailTab) => void;
  onSource: (path: string) => void;
}) {
  const { t } = useI18n();
  const selectClass = 'h-9 min-w-0 rounded-lg border border-theme-border/10 bg-surface-highlight/25 px-2 text-xs font-semibold text-text-primary/95 outline-none focus:border-accent';

  return (
    <div className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col overflow-hidden border-r border-theme-border/10">
        <div className="shrink-0 space-y-2 border-b border-theme-border/10 p-3">
          <input
            className="h-9 w-full rounded-lg border border-theme-border/10 bg-surface-highlight/20 px-3 text-sm text-text-primary/95 outline-none placeholder:text-text-secondary/45 focus:border-accent"
            value={taskQuery}
            onChange={event => onTaskQueryChange(event.target.value)}
            placeholder={t('trellis_search')}
          />
          <div className="grid grid-cols-3 gap-1.5">
            <select value={statusFilter} onChange={event => onStatusFilterChange(event.target.value)} className={selectClass}>
              <option value="">{t('trellis_status')}</option>
              {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
            <select value={priorityFilter} onChange={event => onPriorityFilterChange(event.target.value)} className={selectClass}>
              <option value="">{t('trellis_priority')}</option>
              {priorityOptions.map(priority => <option key={priority} value={priority}>{priority}</option>)}
            </select>
            <select value={archiveFilter} onChange={event => onArchiveFilterChange(event.target.value)} className={selectClass}>
              <option value="">{t('trellis_archive_month')}</option>
              {archiveOptions.map(month => <option key={month} value={month}>{month}</option>)}
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {!archiveFilter && (
            <div className="mb-2">
              <div className="px-1 pb-1.5 text-[0.6875rem] font-semibold text-text-secondary/55">{t('trellis_active_tasks')}</div>
              <div className="space-y-2">
                {filteredActiveTasks.map(task => (
                  <TaskRow key={task.path} task={task} selected={task.path === selectedTaskPath} onOpen={() => onOpenTask(task)} />
                ))}
                {filteredActiveTasks.length === 0 && <EmptyState label={t('trellis_no_items')} />}
              </div>
            </div>
          )}

          <div>
            <div className="px-1 pb-1.5 text-[0.6875rem] font-semibold text-text-secondary/55">{t('trellis_archived_tasks')}</div>
            {filteredArchiveGroups.length === 0 && <EmptyState label={t('trellis_no_items')} />}
            {filteredArchiveGroups.map(group => (
              <div key={group.archive_month} className="mb-2">
                <div className="rounded-lg bg-surface-highlight/25 px-2 py-1 text-[0.6875rem] font-semibold text-text-secondary/65">
                  {group.archive_month}
                </div>
                <div className="mt-1 space-y-2">
                  {group.tasks.map(task => (
                    <TaskRow key={task.path} task={task} selected={task.path === selectedTaskPath} onOpen={() => onOpenTask(task)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="min-h-0 overflow-auto p-5">
        <div className="mx-auto max-w-[820px]">
          {taskLoading ? (
            <div className="space-y-3">
              <div className="h-5 w-2/3 animate-pulse rounded bg-surface-highlight/40" />
              <SkeletonBlock lines={4} />
            </div>
          ) : !taskDetail ? (
            <EmptyState label={t('trellis_no_selection')} />
          ) : (
            <TaskDetail
              detail={taskDetail}
              activeTab={taskDetailTab}
              source={source}
              sourceLoading={sourceLoading}
              onTabChange={onTaskTabChange}
              onSource={onSource}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function TaskDetail({ detail, activeTab, source, sourceLoading, onTabChange, onSource }: {
  detail: TrellisTaskDetailResponse;
  activeTab: TaskDetailTab;
  source: TrellisSourceResponse | null;
  sourceLoading: boolean;
  onTabChange: (tab: TaskDetailTab) => void;
  onSource: (path: string) => void;
}) {
  const { t } = useI18n();
  const metadata = detail.metadata;
  const metaParts = [metadata.priority, metadata.assignee].filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-theme-border/10 bg-surface-highlight/15 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-text-primary/95">
              {metadata.title || metadata.name || detail.path}
            </h3>
            <div className="mt-1 truncate font-mono text-xs text-text-secondary/55">{detail.path}</div>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-xs text-text-secondary">
            <StatusDot tone={statusTone(metadata.status)} />
            {metadata.status || '-'}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-text-secondary">
          {metaParts.length > 0 && <span>{metaParts.join(' · ')}</span>}
          {metadata.completedAt && (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckIcon className="h-3 w-3" />
              {formatDate(metadata.completedAt)}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {TASK_DETAIL_TABS.map(tab => (
            <button
              key={tab.id}
              className={`rounded-lg px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors ${
                activeTab === tab.id ? 'bg-accent text-accent-foreground' : 'bg-surface-highlight/30 text-text-secondary/65 hover:bg-surface-highlight/45 hover:text-text-primary/95'
              }`}
              onClick={() => onTabChange(tab.id)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'source' ? (
        <SourceContent source={source} loading={sourceLoading} />
      ) : activeTab === 'prd' ? (
        <DocumentBlock label={t('trellis_prd')} document={detail.prd} onOpenSource={onSource} />
      ) : activeTab === 'design' ? (
        <DocumentBlock label={t('trellis_design')} document={detail.design} onOpenSource={onSource} />
      ) : activeTab === 'implement' ? (
        <DocumentBlock label={t('trellis_implement')} document={detail.implementation} onOpenSource={onSource} />
      ) : activeTab === 'research' ? (
        <Section title={t('trellis_research')}>
          {detail.research.length === 0 ? (
            <EmptyState label={t('trellis_no_items')} />
          ) : (
            <div className="space-y-1.5">
              {detail.research.map(entry => (
                <button
                  key={entry.path}
                  className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg bg-surface-highlight/15 px-3 py-2 text-left text-sm text-text-secondary/75 hover:bg-surface-highlight/30 hover:text-text-primary/95"
                  onClick={() => onSource(entry.path)}
                  title={entry.path}
                >
                  <span className="min-w-0 flex-1 truncate">{entry.title || entry.name}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-text-tertiary/50">
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                    {t('trellis_source_view')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Section>
      ) : (
        <div className="space-y-4">
          <Section title={t('trellis_readiness')}>
            <ReadinessStrip readiness={detail.readiness} />
          </Section>
          <Section title={t('trellis_warnings')}>
            <WarningList warnings={detail.warnings ?? []} compact />
          </Section>
          {metadata.description && (
            <Section title={t('trellis_summary')}>
              <div className="rounded-xl border border-theme-border/10 bg-surface-highlight/15 px-3 py-2 text-xs leading-relaxed text-text-secondary/75">
                {metadata.description}
              </div>
            </Section>
          )}
          <Section title={t('trellis_context')}>
            <div className="grid grid-cols-2 gap-3">
              <ManifestList title={t('trellis_implement_context')} items={detail.context_manifests.implement ?? []} />
              <ManifestList title={t('trellis_check_context')} items={detail.context_manifests.check ?? []} />
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

// === Specs ===

function SpecsTab({
  specEntries,
  specQuery,
  selectedSpecPath,
  specDoc,
  specLoading,
  specDetailTab,
  source,
  sourceLoading,
  onSpecQueryChange,
  onOpenSpec,
  onSpecTabChange,
  onSource,
}: {
  specEntries: SpecEntry[];
  specQuery: string;
  selectedSpecPath: string;
  specDoc: TrellisDocument | null;
  specLoading: boolean;
  specDetailTab: SpecDetailTab;
  source: TrellisSourceResponse | null;
  sourceLoading: boolean;
  onSpecQueryChange: (value: string) => void;
  onOpenSpec: (entry: SpecEntry) => void;
  onSpecTabChange: (tab: SpecDetailTab) => void;
  onSource: (path: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col overflow-hidden border-r border-theme-border/10">
        <div className="shrink-0 border-b border-theme-border/10 p-3">
          <input
            className="h-9 w-full rounded-lg border border-theme-border/10 bg-surface-highlight/20 px-3 text-sm text-text-primary/95 outline-none placeholder:text-text-secondary/45 focus:border-accent"
            value={specQuery}
            onChange={event => onSpecQueryChange(event.target.value)}
            placeholder={t('trellis_search')}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {specEntries.length === 0 && <EmptyState label={t('trellis_no_items')} />}
          <div className="space-y-2">
            {specEntries.map(entry => (
              <SpecRow key={entry.layer.path} entry={entry} selected={entry.layer.path === selectedSpecPath} onOpen={() => onOpenSpec(entry)} />
            ))}
          </div>
        </div>
      </aside>

      <main className="min-h-0 overflow-auto p-5">
        <div className="mx-auto max-w-[820px]">
          {specLoading ? (
            <div className="space-y-3">
              <div className="h-5 w-1/2 animate-pulse rounded bg-surface-highlight/40" />
              <SkeletonBlock lines={4} />
            </div>
          ) : !specDoc ? (
            <EmptyState label={t('trellis_no_selection')} />
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-theme-border/10 bg-surface-highlight/15 p-3">
                <div className="flex flex-wrap gap-1">
                  <button
                    className={`rounded-lg px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors ${
                      specDetailTab === 'structured' ? 'bg-accent text-accent-foreground' : 'bg-surface-highlight/30 text-text-secondary/65 hover:bg-surface-highlight/45 hover:text-text-primary/95'
                    }`}
                    onClick={() => onSpecTabChange('structured')}
                  >
                    {t('trellis_structured')}
                  </button>
                  <button
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors ${
                      specDetailTab === 'source' ? 'bg-accent text-accent-foreground' : 'bg-surface-highlight/30 text-text-secondary/65 hover:bg-surface-highlight/45 hover:text-text-primary/95'
                    }`}
                    onClick={() => onSource(specDoc.raw_path)}
                  >
                    <ExternalLinkIcon className="h-3 w-3" />
                    {t('trellis_source')}
                  </button>
                </div>
              </div>
              {specDetailTab === 'source' ? (
                <SourceContent source={source} loading={sourceLoading} />
              ) : (
                <DocumentBlock label={t('trellis_specs')} document={specDoc} onOpenSource={onSource} />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// === Workflow ===

function WorkflowTab({ summary }: { summary: TrellisSummaryResponse }) {
  const { t } = useI18n();
  const phases = summary.workflow?.phases ?? [];
  const states = summary.workflow?.states ?? [];

  return (
    <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-auto border-r border-theme-border/10 p-3">
        <div className="mb-2 px-1 text-[0.6875rem] font-semibold text-text-secondary/55">{t('trellis_workflow')}</div>
        <div className="space-y-1.5">
          {phases.map(phase => (
            <div key={phase.name} className="rounded-lg border border-theme-border/10 bg-surface-highlight/15 px-3 py-2">
              <div className="truncate text-xs font-semibold text-text-primary/95">{phase.name}</div>
              {phase.summary && <div className="mt-0.5 line-clamp-2 text-[0.6875rem] text-text-secondary/60">{phase.summary}</div>}
            </div>
          ))}
          {states.map(state => (
            <div key={state.name} className="rounded-lg border border-theme-border/10 bg-surface-highlight/15 px-3 py-2">
              <div className="truncate text-xs font-semibold text-text-primary/95">{state.name}</div>
              <div className="mt-1"><Pill tone="muted">{t('trellis_state')}</Pill></div>
            </div>
          ))}
          {phases.length === 0 && states.length === 0 && <EmptyState label={t('trellis_no_items')} />}
        </div>
      </aside>

      <main className="min-h-0 overflow-auto p-5">
        <div className="mx-auto max-w-[820px] space-y-4">
          <h3 className="text-sm font-bold text-text-primary/95">{summary.workflow?.title || t('trellis_workflow')}</h3>
          {phases.map(phase => (
            <Section key={phase.name} title={phase.name}>
              {phase.summary && <p className="text-xs leading-relaxed text-text-secondary/75">{phase.summary}</p>}
              {phase.states && phase.states.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {phase.states.map(state => <Pill key={state} tone="muted">{state}</Pill>)}
                </div>
              )}
            </Section>
          ))}
          {states.map((state: TrellisWorkflowState) => (
            <Section key={state.name} title={state.name}>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-highlight/30 p-3 text-[0.6875rem] leading-relaxed text-text-secondary/80">
                {state.content}
              </pre>
            </Section>
          ))}
          {phases.length === 0 && states.length === 0 && <EmptyState label={t('trellis_no_items')} />}
        </div>
      </main>
    </div>
  );
}

// === Warnings ===

function WarningsTab({ warnings }: { warnings: TrellisWarning[] }) {
  const { t } = useI18n();
  return (
    <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-auto border-r border-theme-border/10 p-3">
        <div className="mb-2 px-1 text-[0.6875rem] font-semibold text-text-secondary/55">{t('trellis_warnings')}</div>
        <WarningList warnings={warnings} compact />
      </aside>
      <main className="min-h-0 overflow-auto p-5">
        <div className="mx-auto max-w-[820px]">
          <h3 className="mb-3 text-sm font-bold text-text-primary/95">{t('trellis_warnings')}</h3>
          <WarningList warnings={warnings} />
        </div>
      </main>
    </div>
  );
}

// === Source ===

function SourceTab({ candidates, selectedSourcePath, source, loading, onOpenSource }: {
  candidates: SourceCandidate[];
  selectedSourcePath: string;
  source: TrellisSourceResponse | null;
  loading: boolean;
  onOpenSource: (candidate: SourceCandidate) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-auto border-r border-theme-border/10 p-3">
        <div className="space-y-2">
          {candidates.map(candidate => (
            <button
              key={candidate.path}
              className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                candidate.path === selectedSourcePath
                  ? 'border-accent/45 bg-accent/15 text-accent'
                  : 'border-theme-border/10 bg-surface-highlight/15 text-text-secondary/70 hover:bg-surface-highlight/30 hover:text-text-primary/95'
              }`}
              onClick={() => onOpenSource(candidate)}
              title={candidate.path}
            >
              <FileIcon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${candidate.path === selectedSourcePath ? 'text-accent' : 'text-text-tertiary/55'}`} />
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold">{candidate.label}</div>
                <div className="mt-0.5 truncate text-[0.6875rem] text-text-tertiary/60">{candidate.group}</div>
              </div>
            </button>
          ))}
          {candidates.length === 0 && <EmptyState label={t('trellis_select_source')} />}
        </div>
      </aside>

      <main className="min-h-0 overflow-auto p-5">
        <SourceContent source={source} loading={loading} />
      </main>
    </div>
  );
}

function SourceContent({ source, loading }: { source: TrellisSourceResponse | null; loading: boolean }) {
  const { t } = useI18n();
  if (loading) {
    return (
      <div className="mx-auto max-w-[820px]">
        <SkeletonBlock lines={6} />
      </div>
    );
  }
  if (!source) {
    return <EmptyState label={t('trellis_select_source')} />;
  }
  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[900px] flex-col space-y-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text-primary/95" title={source.path}>{source.path}</div>
          <div className="text-xs text-text-secondary/50">{formatSize(source.size)}</div>
        </div>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-xl border border-theme-border/10 bg-canvas/80 p-4 text-xs leading-5 text-text-secondary/80">
        <code>{source.content}</code>
      </pre>
    </div>
  );
}

// === Document ===

function DocumentBlock({ label, document, onOpenSource }: {
  label: string;
  document?: TrellisDocument;
  onOpenSource: (path: string) => void;
}) {
  const { t } = useI18n();
  if (!document) {
    return <EmptyState label={t('trellis_no_selection')} />;
  }

  return (
    <Section title={label}>
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text-primary/95" title={document.title}>{document.title}</div>
          <div className="truncate font-mono text-xs text-text-secondary/50" title={document.raw_path}>{document.raw_path}</div>
        </div>
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-theme-border/10 bg-surface-highlight/20 px-3 py-1.5 text-xs font-semibold text-text-secondary/70 hover:bg-surface-highlight/35 hover:text-text-primary/95"
          onClick={() => onOpenSource(document.raw_path)}
        >
          <ExternalLinkIcon className="h-3.5 w-3.5" />
          {t('trellis_source_view')}
        </button>
      </div>
      {document.links && document.links.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {document.links.slice(0, 10).map((link: TrellisLink) => (
            <Pill key={`${link.label}-${link.path}`} tone="muted">{link.label}</Pill>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {document.sections.length > 0
          ? document.sections.map((section, index) => <DocumentSection key={`${section.title}-${index}`} section={section} />)
          : <EmptyState label={t('trellis_no_items')} />}
      </div>
      {document.warnings && document.warnings.length > 0 && <WarningList warnings={document.warnings} />}
    </Section>
  );
}

function DocumentSection({ section, depth = 0 }: { section: TrellisSection; depth?: number }) {
  const tableRows = section.items?.filter(item => item.kind === 'table_row' && item.cells && item.cells.length > 0) || [];
  const otherItems = section.items?.filter(item => item.kind !== 'table_row') || [];

  return (
    <div className={depth > 0 ? 'border-l border-theme-border/10 pl-3' : ''}>
      {section.title && (
        <div className={`${depth === 0 ? 'text-sm' : 'text-xs'} font-semibold text-text-primary/90`}>
          {section.title}
        </div>
      )}
      {section.raw && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-secondary/75">{section.raw}</p>}

      {tableRows.length > 0 && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-theme-border/10">
          <table className="min-w-full text-left text-xs">
            <tbody>
              {tableRows.map((row, rowIndex) => (
                <tr key={itemKey(row, rowIndex)} className={rowIndex === 0 ? 'bg-surface-highlight/40 font-semibold text-text-primary/95' : 'text-text-secondary/75'}>
                  {row.cells?.map((cell, cellIndex) => (
                    <td key={`${rowIndex}-${cellIndex}`} className="border-b border-theme-border/10 px-3 py-1.5 align-top last:border-r-0">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {otherItems.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {otherItems.map((item, index) => {
            if (item.kind === 'check') {
              return (
                <label key={itemKey(item, index)} className="flex items-start gap-2 text-sm text-text-secondary/75">
                  <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${item.checked ? 'border-accent bg-accent text-accent-foreground' : 'border-theme-border/20'}`}>
                    {item.checked && <CheckIcon className="h-3 w-3" />}
                  </span>
                  <span className={item.checked ? 'text-text-secondary/60 line-through' : ''}>{item.text}</span>
                </label>
              );
            }
            if (item.kind === 'code') {
              return (
                <pre key={itemKey(item, index)} className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-highlight/30 p-2 text-xs text-text-primary/90">
                  {item.text}
                </pre>
              );
            }
            if (item.kind === 'list') {
              return (
                <div key={itemKey(item, index)} className="flex items-start gap-2 text-sm text-text-secondary/75">
                  <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-text-secondary/60" />
                  <span>{item.text}</span>
                </div>
              );
            }
            return (
              <p key={itemKey(item, index)} className="text-sm leading-relaxed text-text-secondary/75">{item.text}</p>
            );
          })}
        </div>
      )}

      {section.children && section.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {section.children.map((child, index) => <DocumentSection key={`${child.title}-${index}`} section={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

// === Rows ===

function TaskRow({ task, selected, onOpen }: {
  task: TrellisTaskSummary;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-accent/45 bg-accent/15 text-accent'
          : 'border-theme-border/10 bg-surface-highlight/20 text-text-secondary/75 hover:bg-surface-highlight/35 hover:text-text-primary/95'
      }`}
      onClick={onOpen}
      title={task.path}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold" title={task.title}>{task.title}</div>
          <div className="mt-0.5 truncate font-mono text-xs text-text-tertiary/55">{task.path}</div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[0.6875rem] text-text-secondary">
          <StatusDot tone={statusTone(task.status)} />
          {task.status || '-'}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <ProgressBar done={task.acceptance_done} total={task.acceptance_total} />
        <DocBadges hasPrd={task.has_prd} hasDesign={task.has_design} hasImpl={task.has_implement} />
      </div>
    </button>
  );
}

function SpecRow({ entry, selected, onOpen }: {
  entry: SpecEntry;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-accent/45 bg-accent/15 text-accent'
          : 'border-theme-border/10 bg-surface-highlight/20 text-text-secondary/75 hover:bg-surface-highlight/35 hover:text-text-primary/95'
      }`}
      onClick={onOpen}
      title={entry.layer.path}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold" title={entry.layer.title}>{entry.layer.title}</div>
          <div className="mt-0.5 truncate text-xs text-text-tertiary/55">{entry.packageName} / {entry.layer.name}</div>
        </div>
        <div className="shrink-0 text-right text-[0.6875rem] text-text-tertiary/55">
          <div>{entry.layer.checklist_count}</div>
          <div>{entry.layer.guideline_count}</div>
        </div>
      </div>
    </button>
  );
}

// === Shared primitives ===

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-theme-border/10 pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-xs font-bold uppercase text-text-secondary/55">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function MetricGrid({ metrics }: { metrics: { label: string; value: number; tone?: 'good' | 'warn' }[] }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {metrics.map(metric => (
        <div
          key={metric.label}
          className={`rounded-xl border p-3 ${
            metric.tone === 'warn'
              ? 'border-warning/30 bg-warning/10'
              : metric.tone === 'good'
                ? 'border-success/30 bg-success/10'
                : 'border-theme-border/10 bg-surface-highlight/15'
          }`}
        >
          <div className="text-2xl font-bold text-text-primary/95">{metric.value}</div>
          <div className="mt-1 text-xs text-text-secondary/55">{metric.label}</div>
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const segments = 5;
  const filled = total > 0 ? Math.round((done / total) * segments) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: segments }).map((_, index) => (
          <span
            key={index}
            className={`h-1.5 w-1.5 rounded-sm ${index < filled ? 'bg-accent' : 'bg-theme-border/50'}`}
          />
        ))}
      </div>
      <span className="font-mono text-[0.625rem] text-text-secondary/60">{progressText(done, total)}</span>
    </div>
  );
}

function DocBadges({ hasPrd, hasDesign, hasImpl }: { hasPrd: boolean; hasDesign: boolean; hasImpl: boolean }) {
  const { t } = useI18n();
  const docs: { label: string; present: boolean }[] = [
    { label: t('trellis_prd'), present: hasPrd },
    { label: t('trellis_design'), present: hasDesign },
    { label: t('trellis_implement'), present: hasImpl },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.625rem]">
      {docs.map(doc => (
        <span
          key={doc.label}
          className={`inline-flex items-center gap-0.5 ${doc.present ? 'text-success' : 'text-text-secondary/40'}`}
        >
          <CheckIcon className="h-3 w-3" />
          {doc.label}
        </span>
      ))}
    </div>
  );
}

function StatusDot({ tone }: { tone: 'good' | 'warn' | 'muted' | 'default' }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${
        tone === 'good' ? 'bg-success'
          : tone === 'warn' ? 'bg-warning'
            : tone === 'default' ? 'bg-accent'
              : 'bg-text-secondary/50'
      }`}
    />
  );
}

function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'muted' }) {
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 text-[0.625rem] font-semibold ${
        tone === 'muted' ? 'bg-surface-highlight/45 text-text-secondary/65' : 'bg-accent/15 text-accent'
      }`}
    >
      {children}
    </span>
  );
}

function ReadinessStrip({ readiness }: { readiness: TrellisTaskReadiness }) {
  const { t } = useI18n();
  const rows = readinessRows(readiness);
  const isYesNo = (value: string) => value === 'yes' || value === 'no';
  const displayValue = (value: string) => (isYesNo(value) ? (value === 'yes' ? t('trellis_yes') : t('trellis_no')) : value);
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-theme-border/10 bg-surface-highlight/15 px-3 py-2.5 text-xs">
      {rows.map(row => (
        <div key={row.label} className="flex items-center justify-between gap-2">
          <span className="text-text-secondary/60">{t(row.label as 'trellis_prd')}</span>
          <span className={`inline-flex items-center gap-1 font-mono text-[0.6875rem] ${row.ok ? 'text-success' : 'text-text-secondary/60'}`}>
            {isYesNo(row.value) && <CheckIcon className="h-3 w-3" />}
            {displayValue(row.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ManifestList({ title, items }: { title: string; items: TrellisManifestItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-text-secondary/60">{title}</div>
      <div className="divide-y divide-theme-border/10 rounded-lg border border-theme-border/10">
        {items.map((item, index) => (
          <div key={`${item.file}-${index}`} className="px-3 py-1.5 text-xs">
            <div className="truncate font-mono text-text-primary/85" title={item.file}>{item.file}</div>
            {item.reason && <div className="mt-0.5 text-text-secondary/55">{item.reason}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function WarningList({ warnings, compact = false }: { warnings: TrellisWarning[]; compact?: boolean }) {
  const { t } = useI18n();
  if (warnings.length === 0) return <EmptyState label={t('trellis_no_warnings')} />;
  return (
    <div className="space-y-1.5">
      {warnings.map((warning, index) => (
        <div
          key={`${warning.code}-${warning.path || 'root'}-${index}`}
          className={`rounded-lg border px-3 py-2 text-xs ${warning.severity === 'error' ? 'border-error/20 bg-error/10' : 'border-warning/20 bg-warning/10'}`}
        >
          <div className="flex items-center gap-2">
            <Pill tone="muted">{warning.code}</Pill>
            {warning.path && <span className="min-w-0 flex-1 truncate font-mono text-[0.625rem] text-text-secondary/60" title={warning.path}>{warning.path}</span>}
          </div>
          {!compact && <div className="mt-1.5 leading-relaxed text-text-primary/80">{warning.message}</div>}
        </div>
      ))}
    </div>
  );
}

function SkeletonBlock({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className || ''}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="h-3.5 animate-pulse rounded bg-surface-highlight/40"
          style={{ width: `${[100, 75, 90, 60, 85, 70][index % 6]}%` }}
        />
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-theme-border/10 bg-surface-highlight/10 px-3 py-4 text-center text-xs text-text-secondary/55">{label}</div>;
}

function CenteredState({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-text-secondary/60">
      {children}
    </div>
  );
}

function taskMatchesQuery(task: TrellisTaskSummary, query: string, archiveMonth = ''): boolean {
  if (!query) return true;
  const haystack = `${task.title} ${task.id} ${task.path} ${task.status} ${task.priority || ''} ${archiveMonth}`.toLowerCase();
  return haystack.includes(query);
}

function buildSourceCandidates(
  summary: TrellisSummaryResponse | null,
  detail: TrellisTaskDetailResponse | null,
  specDoc: TrellisDocument | null,
  workflowLabel: string,
  taskJsonLabel: string,
): SourceCandidate[] {
  const byPath = new Map<string, SourceCandidate>();
  const add = (candidate: SourceCandidate) => {
    if (!isLikelyTrellisSourcePath(candidate.path) || byPath.has(candidate.path)) return;
    byPath.set(candidate.path, candidate);
  };

  if (summary?.capabilities?.workflow) {
    add({ label: workflowLabel, path: 'workflow.md', group: 'workflow.md' });
  }
  for (const task of summary?.active_tasks ?? []) {
    add({ label: task.title, path: `${task.path}/task.json`, group: task.path });
  }
  for (const task of flattenArchivedTasks(summary?.archived_tasks)) {
    add({ label: task.title, path: `${task.path}/task.json`, group: task.path });
  }
  for (const entry of flattenSpecEntries(summary)) {
    add({ label: entry.layer.title, path: entry.layer.path, group: entry.packageName });
  }

  if (detail) {
    add({ label: taskJsonLabel, path: `${detail.path}/task.json`, group: detail.path });
    for (const document of [detail.prd, detail.design, detail.implementation]) {
      if (document) add({ label: document.title, path: document.raw_path, group: detail.path });
    }
    for (const entry of detail.research) {
      add({ label: entry.title || entry.name, path: entry.path, group: detail.path });
    }
  }

  if (specDoc) {
    add({ label: specDoc.title, path: specDoc.raw_path, group: specDoc.raw_path });
  }

  return Array.from(byPath.values());
}

function isLikelyTrellisSourcePath(path: string): boolean {
  const clean = path.trim();
  if (!clean || clean.startsWith('/') || clean.startsWith('../') || clean.includes('/../')) return false;
  const lower = clean.toLowerCase();
  if (clean === 'workflow.md') return true;
  if (lower.startsWith('workspace/')) return false;
  if (lower.startsWith('spec/')) return lower.endsWith('.md');
  if (lower.startsWith('tasks/')) return lower.endsWith('.md') || lower.endsWith('.json') || lower.endsWith('.jsonl');
  return false;
}
