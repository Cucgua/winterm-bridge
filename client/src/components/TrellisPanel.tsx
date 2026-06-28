import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  api,
  type TrellisArchivedTaskGroup,
  type TrellisDocument,
  type TrellisSection,
  type TrellisSectionItem,
  type TrellisSourceResponse,
  type TrellisSpecLayer,
  type TrellisSummaryResponse,
  type TrellisTaskDetailResponse,
  type TrellisTaskReadiness,
  type TrellisTaskSummary,
  type TrellisWarning,
} from '../core/api';
import { useI18n } from '../i18n/i18nStore';

interface Props {
  sessionId: string;
  onClose: () => void;
}

type TrellisTab = 'overview' | 'tasks' | 'specs' | 'source';

interface SourceCandidate {
  label: string;
  path: string;
  group: string;
}

interface SpecEntry {
  packageName: string;
  layer: TrellisSpecLayer;
}

const TAB_KEYS: { id: TrellisTab; labelKey: 'trellis_overview' | 'trellis_tasks' | 'trellis_specs' | 'trellis_source' }[] = [
  { id: 'overview', labelKey: 'trellis_overview' },
  { id: 'tasks', labelKey: 'trellis_tasks' },
  { id: 'specs', labelKey: 'trellis_specs' },
  { id: 'source', labelKey: 'trellis_source' },
];

export function TrellisPanel({ sessionId, onClose }: Props) {
  const { t } = useI18n();
  const language = useI18n(state => state.language);
  const [summary, setSummary] = useState<TrellisSummaryResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TrellisTab>('overview');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [selectedTaskPath, setSelectedTaskPath] = useState('');
  const [taskDetail, setTaskDetail] = useState<TrellisTaskDetailResponse | null>(null);
  const [selectedSpecPath, setSelectedSpecPath] = useState('');
  const [specDoc, setSpecDoc] = useState<TrellisDocument | null>(null);
  const [selectedSourcePath, setSelectedSourcePath] = useState('');
  const [source, setSource] = useState<TrellisSourceResponse | null>(null);

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
    setQuery('');
    setDetailError('');
    setSelectedTaskPath('');
    setTaskDetail(null);
    setSelectedSpecPath('');
    setSpecDoc(null);
    setSelectedSourcePath('');
    setSource(null);
    loadSummary();
  }, [loadSummary]);

  const taskEntries = useMemo(() => {
    const active = summary?.active_tasks ?? [];
    const archived = flattenArchivedTasks(summary?.archived_tasks);
    const all = [...active, ...archived];
    const term = normalize(query);
    if (!term) return all;
    return all.filter(task => normalize(`${task.title} ${task.id} ${task.status} ${task.priority ?? ''} ${task.assignee ?? ''} ${task.path}`).includes(term));
  }, [summary, query]);

  const specEntries = useMemo(() => {
    const entries = flattenSpecEntries(summary);
    const term = normalize(query);
    if (!term) return entries;
    return entries.filter(entry => normalize(`${entry.packageName} ${entry.layer.title} ${entry.layer.name} ${entry.layer.path}`).includes(term));
  }, [summary, query]);

  const sourceCandidates = useMemo(
    () => buildSourceCandidates(summary, taskDetail, specDoc, t('trellis_workflow'), t('trellis_task_json')),
    [summary, taskDetail, specDoc, t, language],
  );

  const openTask = async (task: TrellisTaskSummary) => {
    setActiveTab('tasks');
    setSelectedTaskPath(task.path);
    setDetailLoading(true);
    setDetailError('');
    try {
      const detail = await api.getSessionTrellisTask(sessionId, task.path);
      setTaskDetail(detail);
    } catch (taskError) {
      setDetailError(taskError instanceof Error ? taskError.message : t('trellis_error_generic'));
    } finally {
      setDetailLoading(false);
    }
  };

  const openSpec = async (entry: SpecEntry) => {
    setActiveTab('specs');
    setSelectedSpecPath(entry.layer.path);
    setDetailLoading(true);
    setDetailError('');
    try {
      const document = await api.getSessionTrellisSpec(sessionId, entry.layer.path);
      setSpecDoc(document);
    } catch (specError) {
      setDetailError(specError instanceof Error ? specError.message : t('trellis_error_generic'));
    } finally {
      setDetailLoading(false);
    }
  };

  const openSource = async (candidate: SourceCandidate) => {
    setActiveTab('source');
    setSelectedSourcePath(candidate.path);
    setSourceLoading(true);
    setDetailError('');
    try {
      const response = await api.getSessionTrellisSource(sessionId, candidate.path);
      setSource(response);
    } catch (sourceError) {
      setDetailError(sourceError instanceof Error ? sourceError.message : t('trellis_error_generic'));
    } finally {
      setSourceLoading(false);
    }
  };

  const renderContent = () => {
    if (loading) {
      return <CenteredState>{t('trellis_loading')}</CenteredState>;
    }

    if (error) {
      return (
        <CenteredState>
          <span className="text-error">{error}</span>
          <button className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground" onClick={loadSummary}>
            {t('trellis_retry')}
          </button>
        </CenteredState>
      );
    }

    if (!summary?.available) {
      return (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-theme-border/10 bg-surface-highlight/25 text-text-secondary/70">
            <TrellisIcon />
          </div>
          <h3 className="text-base font-bold text-text-primary/95">{t('trellis_no_project')}</h3>
          {summary?.current_path && (
            <p className="mt-2 max-w-full truncate text-xs text-text-secondary/55" title={summary.current_path}>
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
          tasks={taskEntries}
          selectedTaskPath={selectedTaskPath}
          detail={taskDetail}
          loading={detailLoading}
          error={detailError}
          onOpenTask={openTask}
          onOpenSource={openSource}
        />
      );
    }

    if (activeTab === 'specs') {
      return (
        <SpecsTab
          specs={specEntries}
          selectedSpecPath={selectedSpecPath}
          document={specDoc}
          loading={detailLoading}
          error={detailError}
          onOpenSpec={openSpec}
          onOpenSource={openSource}
        />
      );
    }

    return (
      <SourceTab
        candidates={sourceCandidates}
        selectedSourcePath={selectedSourcePath}
        source={source}
        loading={sourceLoading}
        error={detailError}
        onOpenSource={openSource}
      />
    );
  };

  return (
    <div className="flex h-full flex-col bg-surface text-text-primary/95">
      <div className="flex shrink-0 items-center justify-between border-b border-theme-border/10 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-text-primary/95">{t('trellis_title')}</h2>
            <span className="rounded-md border border-theme-border/10 bg-surface-highlight/25 px-1.5 py-0.5 text-[11px] font-semibold text-text-secondary/65">
              {t('trellis_read_only')}
            </span>
          </div>
          {summary?.project_root && (
            <p className="mt-1 max-w-[760px] truncate text-xs text-text-secondary/50" title={summary.project_root}>
              {summary.project_root}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs text-text-secondary/60 hover:text-text-primary/95" onClick={loadSummary} title={t('trellis_refresh')}>
            <RefreshIcon />
          </button>
          <button className="text-xs text-text-secondary/60 hover:text-text-primary/95" onClick={onClose} title={t('settings_close')}>
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b border-theme-border/10 px-3 py-2">
        {TAB_KEYS.map(tab => (
          <button
            key={tab.id}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
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

      {(activeTab === 'tasks' || activeTab === 'specs') && summary?.available && (
        <div className="shrink-0 border-b border-theme-border/10 px-3 py-2">
          <input
            className="h-9 w-full rounded-xl border border-theme-border/10 bg-surface-highlight/20 px-3 text-sm text-text-primary/95 outline-none placeholder:text-text-secondary/45 focus:border-accent"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('trellis_search')}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}

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

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] gap-4 overflow-auto p-5">
      <main className="min-w-0 space-y-5">
        <MetricGrid
          metrics={[
            { label: t('trellis_active_tasks'), value: activeTasks.length },
            { label: t('trellis_archived_tasks'), value: archivedCount },
            { label: t('trellis_specs'), value: specEntries.length },
            { label: t('trellis_warnings'), value: warnings.length },
          ]}
        />

        <Section title={t('trellis_workspace')}>
          <KeyValue label={t('trellis_current_path')} value={summary.current_path} />
          <KeyValue label={t('trellis_project_root')} value={summary.project_root} />
          <KeyValue label={t('trellis_trellis_root')} value={summary.trellis_root} />
        </Section>

        {summary.workflow && (
          <Section title={summary.workflow.title || t('trellis_workflow')}>
            <div className="grid grid-cols-2 gap-2">
              {(summary.workflow.phases ?? []).slice(0, 8).map(phase => (
                <div key={phase.name} className="rounded-xl bg-surface-highlight/15 px-3 py-2">
                  <div className="text-sm font-semibold text-text-primary/95">{phase.name}</div>
                  {phase.summary && <div className="mt-0.5 text-xs text-text-secondary/60">{phase.summary}</div>}
                  {phase.states && phase.states.length > 0 && (
                    <div className="mt-1 truncate text-xs text-text-tertiary/60" title={phase.states.join(', ')}>
                      {phase.states.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title={t('trellis_warnings')}>
          <WarningList warnings={warnings} />
        </Section>
      </main>

      <aside className="min-w-0 space-y-5 border-l border-theme-border/10 pl-4">
        <Section title={t('trellis_capabilities')}>
          <div className="grid grid-cols-1 gap-2">
            <BooleanPill label={t('trellis_workflow')} value={summary.capabilities?.workflow} />
            <BooleanPill label={t('trellis_specs')} value={summary.capabilities?.spec} />
            <BooleanPill label={t('trellis_tasks')} value={summary.capabilities?.tasks} />
            <BooleanPill label={t('trellis_workspace')} value={summary.capabilities?.workspace} />
          </div>
        </Section>

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

function TasksTab({ tasks, selectedTaskPath, detail, loading, error, onOpenTask, onOpenSource }: {
  tasks: TrellisTaskSummary[];
  selectedTaskPath: string;
  detail: TrellisTaskDetailResponse | null;
  loading: boolean;
  error: string;
  onOpenTask: (task: TrellisTaskSummary) => void;
  onOpenSource: (candidate: SourceCandidate) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-auto border-r border-theme-border/10 p-3">
        <div className="space-y-2">
          {tasks.map(task => (
            <TaskRow key={task.path} task={task} selected={task.path === selectedTaskPath} onOpen={() => onOpenTask(task)} />
          ))}
          {tasks.length === 0 && <EmptyState label={t('trellis_no_items')} />}
        </div>
      </aside>

      <main className="min-h-0 overflow-auto p-5">
        <div className="mx-auto max-w-[820px]">
          {loading && <CenteredState compact>{t('trellis_loading')}</CenteredState>}
          {error && <InlineError message={error} />}
          {!loading && !error && !detail && <EmptyState label={t('trellis_no_selection')} />}
          {!loading && !error && detail && (
            <TaskDetail detail={detail} onOpenSource={onOpenSource} />
          )}
        </div>
      </main>
    </div>
  );
}

function SpecsTab({ specs, selectedSpecPath, document, loading, error, onOpenSpec, onOpenSource }: {
  specs: SpecEntry[];
  selectedSpecPath: string;
  document: TrellisDocument | null;
  loading: boolean;
  error: string;
  onOpenSpec: (entry: SpecEntry) => void;
  onOpenSource: (candidate: SourceCandidate) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-auto border-r border-theme-border/10 p-3">
        <div className="space-y-2">
          {specs.map(entry => (
            <SpecRow key={entry.layer.path} entry={entry} selected={entry.layer.path === selectedSpecPath} onOpen={() => onOpenSpec(entry)} />
          ))}
          {specs.length === 0 && <EmptyState label={t('trellis_no_items')} />}
        </div>
      </aside>

      <main className="min-h-0 overflow-auto p-5">
        <div className="mx-auto max-w-[820px]">
          {loading && <CenteredState compact>{t('trellis_loading')}</CenteredState>}
          {error && <InlineError message={error} />}
          {!loading && !error && !document && <EmptyState label={t('trellis_no_selection')} />}
          {!loading && !error && document && (
            <DocumentBlock
              label={document.title || t('trellis_specs')}
              document={document}
              onOpenSource={onOpenSource}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function SourceTab({ candidates, selectedSourcePath, source, loading, error, onOpenSource }: {
  candidates: SourceCandidate[];
  selectedSourcePath: string;
  source: TrellisSourceResponse | null;
  loading: boolean;
  error: string;
  onOpenSource: (candidate: SourceCandidate) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-auto border-r border-theme-border/10 p-3">
        <div className="space-y-2">
          {candidates.map(candidate => (
            <button
              key={candidate.path}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                candidate.path === selectedSourcePath
                  ? 'border-accent/45 bg-accent/15 text-accent'
                  : 'border-theme-border/10 bg-surface-highlight/15 text-text-secondary/70 hover:bg-surface-highlight/30 hover:text-text-primary/95'
              }`}
              onClick={() => onOpenSource(candidate)}
              title={candidate.path}
            >
              <div className="truncate text-xs font-semibold">{candidate.label}</div>
              <div className="mt-0.5 truncate text-[11px] text-text-tertiary/60">{candidate.group}</div>
            </button>
          ))}
          {candidates.length === 0 && <EmptyState label={t('trellis_select_source')} />}
        </div>
      </aside>

      <main className="min-h-0 overflow-auto p-5">
        {loading && <CenteredState compact>{t('trellis_loading')}</CenteredState>}
        {error && <InlineError message={error} />}
        {!loading && !error && !source && <EmptyState label={t('trellis_select_source')} />}
        {!loading && !error && source && (
          <div className="flex h-full min-h-0 flex-col space-y-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-text-primary/95" title={source.path}>{source.path}</div>
                <div className="text-xs text-text-secondary/50">{formatSize(source.size)}</div>
              </div>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto rounded-xl border border-theme-border/10 bg-canvas/80 p-4 text-xs leading-5 text-text-secondary/80">
              <code>{source.content}</code>
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}

function TaskDetail({ detail, onOpenSource }: {
  detail: TrellisTaskDetailResponse;
  onOpenSource: (candidate: SourceCandidate) => void;
}) {
  const { t } = useI18n();
  const metadata = detail.metadata;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-5">
        <Section title={metadata.title || metadata.name || detail.path}>
          <KeyValue label={t('trellis_status')} value={metadata.status} />
          <KeyValue label={t('trellis_priority')} value={metadata.priority} />
          <KeyValue label={t('trellis_package')} value={metadata.package} />
          <KeyValue label={t('trellis_assignee')} value={metadata.assignee} />
          {metadata.description && <p className="mt-2 text-sm leading-6 text-text-secondary/70">{metadata.description}</p>}
          <button
            className="mt-3 rounded-lg border border-theme-border/10 bg-surface-highlight/20 px-2 py-1 text-xs font-semibold text-text-secondary/70 hover:bg-surface-highlight/35 hover:text-text-primary/95"
            onClick={() => onOpenSource({ label: t('trellis_task_json'), path: `${detail.path}/task.json`, group: t('trellis_tasks') })}
          >
            {t('trellis_open_source')}
          </button>
        </Section>

        <Section title={t('trellis_readiness')}>
          <ReadinessGrid readiness={detail.readiness} />
        </Section>
      </div>

      {detail.prd && <DocumentBlock label={t('trellis_prd')} document={detail.prd} onOpenSource={onOpenSource} />}
      {detail.design && <DocumentBlock label={t('trellis_design')} document={detail.design} onOpenSource={onOpenSource} />}
      {detail.implementation && <DocumentBlock label={t('trellis_implement')} document={detail.implementation} onOpenSource={onOpenSource} />}

      {detail.research.length > 0 && (
        <Section title={t('trellis_research')}>
          <div className="space-y-1.5">
            {detail.research.map(entry => (
              <button
                key={entry.path}
                className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg bg-surface-highlight/15 px-3 py-2 text-left text-sm text-text-secondary/75 hover:bg-surface-highlight/30 hover:text-text-primary/95"
                onClick={() => onOpenSource({ label: entry.title || entry.name, path: entry.path, group: t('trellis_research') })}
                title={entry.path}
              >
                <span className="min-w-0 flex-1 truncate">{entry.title || entry.name}</span>
                <span className="text-xs text-text-tertiary/50">{t('trellis_source_view')}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title={t('trellis_context')}>
        <div className="grid grid-cols-2 gap-4">
          <ManifestList title={t('trellis_implement_context')} items={detail.context_manifests.implement ?? []} />
          <ManifestList title={t('trellis_check_context')} items={detail.context_manifests.check ?? []} />
        </div>
      </Section>

      {detail.warnings && detail.warnings.length > 0 && (
        <Section title={t('trellis_warnings')}>
          <WarningList warnings={detail.warnings} />
        </Section>
      )}
    </div>
  );
}

function DocumentBlock({ label, document, onOpenSource }: {
  label: string;
  document: TrellisDocument;
  onOpenSource: (candidate: SourceCandidate) => void;
}) {
  const { t } = useI18n();

  return (
    <Section title={label}>
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text-primary/95" title={document.title}>{document.title}</div>
          <div className="truncate text-xs text-text-secondary/50" title={document.raw_path}>{document.raw_path}</div>
        </div>
        <button
          className="shrink-0 rounded-lg border border-theme-border/10 bg-surface-highlight/20 px-2 py-1 text-xs font-semibold text-text-secondary/70 hover:bg-surface-highlight/35 hover:text-text-primary/95"
          onClick={() => onOpenSource({ label, path: document.raw_path, group: t('trellis_documents') })}
        >
          {t('trellis_source_view')}
        </button>
      </div>
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
  return (
    <div className={depth > 0 ? 'border-l border-theme-border/10 pl-3' : ''}>
      {section.title && (
        <div className={`${depth === 0 ? 'text-sm' : 'text-xs'} font-semibold text-text-primary/90`}>
          {section.title}
        </div>
      )}
      {section.raw && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-secondary/75">{section.raw}</p>}
      {section.items && section.items.length > 0 && (
        <div className="mt-1 space-y-1">
          {section.items.map((item, index) => <DocumentItem key={index} item={item} />)}
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

function DocumentItem({ item }: { item: TrellisSectionItem }) {
  if (item.cells && item.cells.length > 0) {
    return (
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-highlight/15 px-2 py-1 text-sm text-text-secondary/75">
        {item.cells.map((cell, index) => <span key={`${cell}-${index}`} className="min-w-0 truncate" title={cell}>{cell}</span>)}
      </div>
    );
  }

  return (
    <div className="flex gap-2 text-sm leading-6 text-text-secondary/75">
      <span className="mt-0.5 text-text-tertiary/55">{item.checked === undefined ? '-' : item.checked ? '[x]' : '[ ]'}</span>
      <span className="min-w-0 flex-1 break-words">{item.text || item.kind || ''}</span>
    </div>
  );
}

function TaskRow({ task, selected, onOpen }: {
  task: TrellisTaskSummary;
  selected: boolean;
  onOpen: () => void;
}) {
  const { t } = useI18n();

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
          <div className="mt-0.5 truncate text-xs text-text-tertiary/55">{task.path}</div>
        </div>
        <span className="rounded-md bg-surface-highlight/25 px-1.5 py-0.5 text-[11px] font-semibold text-text-secondary/65">
          {task.status || t('trellis_status')}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary/60">
        {task.priority && <span>{t('trellis_priority')}: {task.priority}</span>}
        <span>{t('trellis_acceptance')}: {task.acceptance_done}/{task.acceptance_total}</span>
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
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold" title={entry.layer.title}>{entry.layer.title}</div>
          <div className="mt-0.5 truncate text-xs text-text-tertiary/55">{entry.packageName} / {entry.layer.name}</div>
        </div>
        <div className="shrink-0 text-right text-[11px] text-text-tertiary/55">
          <div>{entry.layer.checklist_count}</div>
          <div>{entry.layer.guideline_count}</div>
        </div>
      </div>
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-theme-border/10 pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-xs font-bold uppercase text-text-secondary/55">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function MetricGrid({ metrics }: { metrics: { label: string; value: number }[] }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {metrics.map(metric => (
        <div key={metric.label} className="rounded-xl border border-theme-border/10 bg-surface-highlight/15 p-3">
          <div className="text-2xl font-bold text-text-primary/95">{metric.value}</div>
          <div className="mt-1 text-xs text-text-secondary/55">{metric.label}</div>
        </div>
      ))}
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 text-xs">
      <span className="text-text-secondary/55">{label}</span>
      <span className="min-w-0 truncate text-text-primary/85" title={value}>{value}</span>
    </div>
  );
}

function BooleanPill({ label, value }: { label: string; value?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface-highlight/20 px-3 py-2 text-xs">
      <span className="text-text-secondary/70">{label}</span>
      <span className={value ? 'text-success' : 'text-text-tertiary/55'}>{value ? t('trellis_yes') : t('trellis_no')}</span>
    </div>
  );
}

function ReadinessGrid({ readiness }: { readiness: TrellisTaskReadiness }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-2">
      <ReadinessPill label={t('trellis_prd')} value={readiness.has_prd} />
      <ReadinessPill label={t('trellis_design')} value={readiness.has_design} />
      <ReadinessPill label={t('trellis_implement')} value={readiness.has_implement} />
      <ReadinessPill label={t('trellis_research')} value={readiness.has_research} suffix={String(readiness.research_count)} />
      <ReadinessPill label={t('trellis_acceptance')} value={readiness.acceptance_total > 0 && readiness.acceptance_done === readiness.acceptance_total} suffix={`${readiness.acceptance_done}/${readiness.acceptance_total}`} />
      <ReadinessPill label={t('trellis_related_files')} value={readiness.related_files_count > 0} suffix={String(readiness.related_files_count)} />
      <ReadinessPill label={t('trellis_implement_context')} value={readiness.implement_context_count > 0} suffix={String(readiness.implement_context_count)} />
      <ReadinessPill label={t('trellis_check_context')} value={readiness.check_context_count > 0} suffix={String(readiness.check_context_count)} />
    </div>
  );
}

function ReadinessPill({ label, value, suffix }: { label: string; value: boolean; suffix?: string }) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl bg-surface-highlight/20 px-3 py-2 text-xs">
      <div className="truncate text-text-secondary/60">{label}</div>
      <div className={value ? 'text-success' : 'text-text-tertiary/55'}>{suffix ?? (value ? t('trellis_yes') : t('trellis_no'))}</div>
    </div>
  );
}

function ManifestList({ title, items }: { title: string; items: { file: string; reason: string; type?: string }[] }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-text-secondary/60">{title}</div>
      {items.length === 0 && <div className="text-xs text-text-tertiary/50">{t('trellis_no_items')}</div>}
      {items.length > 0 && (
        <div className="space-y-1">
          {items.map(item => (
            <div key={`${item.file}-${item.reason}`} className="rounded-lg bg-surface-highlight/15 px-2 py-1.5">
              <div className="truncate text-xs font-semibold text-text-primary/85" title={item.file}>{item.file}</div>
              <div className="mt-0.5 text-xs text-text-secondary/55">{item.reason}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WarningList({ warnings }: { warnings: TrellisWarning[] }) {
  const { t } = useI18n();
  if (warnings.length === 0) return <EmptyState label={t('trellis_no_warnings')} />;

  return (
    <div className="space-y-1.5">
      {warnings.map((warning, index) => (
        <div key={`${warning.path ?? warning.code}-${index}`} className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs">
          <div className="font-semibold text-warning">{warning.severity}: {warning.code}</div>
          {warning.path && <div className="mt-0.5 truncate text-text-secondary/60" title={warning.path}>{warning.path}</div>}
          <div className="mt-1 text-text-primary/80">{warning.message}</div>
        </div>
      ))}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return <div className="rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-xs text-error">{message}</div>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-xl border border-theme-border/10 bg-surface-highlight/10 px-3 py-4 text-center text-xs text-text-secondary/55">{label}</div>;
}

function CenteredState({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-sm text-text-secondary/60 ${compact ? 'py-8' : 'h-full p-6'}`}>
      {children}
    </div>
  );
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

function countArchivedTasks(groups?: TrellisArchivedTaskGroup[]): number {
  return flattenArchivedTasks(groups).length;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function TrellisIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h4v4H7zM13 13h4v4h-4zM11 9h3a1 1 0 011 1v3M9 11v3a1 1 0 001 1h3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0011.5 2.7M19 9A7 7 0 007.5 6.3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
