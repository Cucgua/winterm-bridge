import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import {
  api,
  TrellisArchivedTaskGroup,
  TrellisDocument,
  TrellisManifestItem,
  TrellisSection,
  TrellisSectionItem,
  TrellisSourceResponse,
  TrellisSpecLayer,
  TrellisSummaryResponse,
  TrellisTaskDetailResponse,
  TrellisTaskReadiness,
  TrellisTaskSummary,
  TrellisWarning,
} from '../core/api';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n';

interface TrellisPanelProps {
  sessionId?: string;
  isOpen: boolean;
  onClose: () => void;
}

type TrellisSectionId = 'overview' | 'tasks' | 'specs' | 'workflow' | 'warnings';
type TaskDetailTab = 'summary' | 'prd' | 'design' | 'implement' | 'research' | 'source';
type SpecDetailTab = 'structured' | 'source';

interface TaskWithArchive {
  task: TrellisTaskSummary;
  archiveMonth?: string;
}

interface SpecLayerWithPackage extends TrellisSpecLayer {
  packageName: string;
}

const NAV_ITEMS: { id: TrellisSectionId; label: TranslationKey }[] = [
  { id: 'overview', label: 'trellis_overview' },
  { id: 'tasks', label: 'trellis_tasks' },
  { id: 'specs', label: 'trellis_specs' },
  { id: 'workflow', label: 'trellis_workflow' },
  { id: 'warnings', label: 'trellis_warnings' },
];

const TASK_DETAIL_TABS: { id: TaskDetailTab; label: TranslationKey }[] = [
  { id: 'summary', label: 'trellis_summary' },
  { id: 'prd', label: 'trellis_prd' },
  { id: 'design', label: 'trellis_design' },
  { id: 'implement', label: 'trellis_implement' },
  { id: 'research', label: 'trellis_research' },
  { id: 'source', label: 'trellis_source' },
];

// Shared class strings — keep inputs, selects, and tabs consistent across sections.
const inputClass =
  'w-full rounded border border-theme-border bg-surface-highlight/50 px-2 py-1.5 text-xs text-text-primary placeholder-text-secondary/60 focus:border-accent focus:outline-none';
const selectClass =
  'min-w-0 rounded border border-theme-border bg-surface-highlight/50 px-1.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none';
const tabBase = 'rounded px-2 py-1 text-[11px] transition-colors';
const tabActive = 'bg-accent/20 text-accent';
const tabInactive =
  'bg-surface-highlight/45 text-text-secondary hover:bg-surface-highlight hover:text-text-primary';
const rowBaseClass =
  'w-full border-b border-theme-border/35 px-3 py-2.5 text-left transition-colors last:border-b-0';
const rowActiveClass = 'bg-accent/10';
const rowHoverClass = 'hover:bg-surface-highlight/35';

function basename(path?: string): string {
  if (!path) return '';
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.slice(normalized.lastIndexOf('/') + 1) || normalized;
}

function progressText(done: number, total: number): string {
  return total > 0 ? `${done}/${total}` : '0/0';
}

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function normalizeFilter(value: string): string {
  return value.trim().toLowerCase();
}

function itemKey(item: TrellisSectionItem, index: number): string {
  return `${item.kind || 'item'}-${index}-${item.text || item.cells?.join('|') || ''}`;
}

function documentWarnings(doc?: TrellisDocument): TrellisWarning[] {
  return doc?.warnings || [];
}

function taskResearchEntries(taskDetail: TrellisTaskDetailResponse): NonNullable<TrellisTaskDetailResponse['research']> {
  return taskDetail.research || [];
}

function countArchivedTasks(groups?: TrellisArchivedTaskGroup[]): number {
  return (groups || []).reduce((count, group) => count + group.tasks.length, 0);
}

function taskMatchesQuery(task: TrellisTaskSummary, query: string, archiveMonth = ''): boolean {
  if (!query) return true;
  const haystack = `${task.title} ${task.id} ${task.path} ${task.status} ${task.priority || ''} ${archiveMonth}`.toLowerCase();
  return haystack.includes(query);
}

function statusTone(status?: string): 'default' | 'good' | 'warn' | 'muted' {
  if (status === 'completed') return 'good';
  if (status === 'blocked') return 'warn';
  if (!status) return 'muted';
  return 'default';
}

function readinessRows(readiness: TrellisTaskReadiness): { label: TranslationKey; value: string; ok: boolean }[] {
  return [
    { label: 'trellis_prd', value: readiness.has_prd ? 'yes' : 'no', ok: readiness.has_prd },
    { label: 'trellis_design', value: readiness.has_design ? 'yes' : 'no', ok: readiness.has_design },
    { label: 'trellis_implement', value: readiness.has_implement ? 'yes' : 'no', ok: readiness.has_implement },
    { label: 'trellis_research', value: String(readiness.research_count), ok: readiness.has_research },
    { label: 'trellis_related_files', value: String(readiness.related_files_count), ok: readiness.related_files_count > 0 },
    {
      label: 'trellis_acceptance',
      value: progressText(readiness.acceptance_done, readiness.acceptance_total),
      ok: readiness.acceptance_total === 0 || readiness.acceptance_done === readiness.acceptance_total,
    },
    { label: 'trellis_implement_context', value: String(readiness.implement_context_count), ok: readiness.implement_context_count > 0 },
    { label: 'trellis_check_context', value: String(readiness.check_context_count), ok: readiness.check_context_count > 0 },
  ];
}

function Pill({ children, tone = 'default' }: { children: string; tone?: 'default' | 'good' | 'warn' | 'muted' }) {
  return (
    <span
      className={clsx(
        'inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-[10px]',
        tone === 'default' && 'bg-accent/15 text-accent',
        tone === 'good' && 'bg-green-500/15 text-green-300',
        tone === 'warn' && 'bg-yellow-500/15 text-yellow-300',
        tone === 'muted' && 'bg-surface-highlight/60 text-text-secondary',
      )}
    >
      {children}
    </span>
  );
}

function StatusDot({ tone }: { tone: 'good' | 'warn' | 'muted' | 'default' }) {
  return (
    <span
      className={clsx(
        'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
        tone === 'good' && 'bg-success',
        tone === 'warn' && 'bg-warning',
        tone === 'default' && 'bg-accent',
        tone === 'muted' && 'bg-text-secondary/50',
      )}
    />
  );
}

// Compact progress bar rendered as 5 segments — keeps row density without a Pill.
function ProgressBar({ done, total }: { done: number; total: number }) {
  const segments = 5;
  const filled = total > 0 ? Math.round((done / total) * segments) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: segments }).map((_, index) => (
          <span
            key={index}
            className={clsx('h-1.5 w-1.5 rounded-sm', index < filled ? 'bg-accent' : 'bg-theme-border/50')}
          />
        ))}
      </div>
      <span className="font-mono text-[10px] text-text-secondary">{progressText(done, total)}</span>
    </div>
  );
}

// PRD/Design/Implement presence shown as labelled checks instead of Pills.
function DocBadges({ hasPrd, hasDesign, hasImpl }: { hasPrd: boolean; hasDesign: boolean; hasImpl: boolean }) {
  const { t } = useI18n();
  const docs: { label: string; present: boolean }[] = [
    { label: t('trellis_prd'), present: hasPrd },
    { label: t('trellis_design'), present: hasDesign },
    { label: t('trellis_implement'), present: hasImpl },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px]">
      {docs.map((doc) => (
        <span
          key={doc.label}
          className={clsx('inline-flex items-center gap-0.5', doc.present ? 'text-success' : 'text-text-secondary/40')}
        >
          <span aria-hidden>{doc.present ? '✓' : '✗'}</span>
          {doc.label}
        </span>
      ))}
    </div>
  );
}

function Skeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={clsx('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="h-3.5 animate-pulse rounded bg-surface-highlight/50"
          style={{ width: `${[100, 75, 90, 60][index % 4]}%` }}
        />
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-theme-border/50 px-3 py-6 text-center text-xs text-text-secondary">
      <svg className="h-5 w-5 text-text-secondary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <span>{label}</span>
    </div>
  );
}

function StatTile({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'good' | 'warn' }) {
  return (
    <div
      className={clsx(
        'border border-theme-border/50 bg-surface-highlight/15 px-3 py-2',
        tone === 'good' && 'border-green-500/30 bg-green-500/10',
        tone === 'warn' && 'border-yellow-500/30 bg-yellow-500/10',
      )}
    >
      <div className="truncate text-[10px] uppercase text-text-secondary">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function WarningList({ warnings, compact = false }: { warnings: TrellisWarning[]; compact?: boolean }) {
  const { t } = useI18n();
  if (warnings.length === 0) {
    return <EmptyState label={t('trellis_no_warnings')} />;
  }

  return (
    <div className="divide-y divide-theme-border/40 border border-theme-border/40">
      {warnings.map((warning, index) => (
        <div
          key={`${warning.code}-${warning.path || 'root'}-${index}`}
          className={clsx(
            'px-3 py-2 text-xs',
            warning.severity === 'error' ? 'bg-error/10' : 'bg-yellow-500/10',
          )}
        >
          <div className="flex items-center gap-2">
            <Pill tone={warning.severity === 'error' ? 'warn' : 'muted'}>{warning.code}</Pill>
            {warning.path && <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-text-secondary">{warning.path}</span>}
          </div>
          {!compact && <div className="mt-1.5 leading-relaxed text-text-primary/90">{warning.message}</div>}
        </div>
      ))}
    </div>
  );
}

function ReadinessStrip({ readiness }: { readiness: TrellisTaskReadiness }) {
  const { t } = useI18n();
  const rows = readinessRows(readiness);
  const isYesNo = (value: string) => value === 'yes' || value === 'no';
  const displayValue = (value: string) => (isYesNo(value) ? (value === 'yes' ? t('trellis_yes') : t('trellis_no')) : value);
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded border border-theme-border/40 bg-surface-highlight/15 px-3 py-2.5 text-xs">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-2">
          <span className="text-text-secondary">{t(row.label)}</span>
          <span className={clsx('inline-flex items-center gap-1 font-mono text-[11px]', row.ok ? 'text-success' : 'text-text-secondary/60')}>
            {isYesNo(row.value) && <span aria-hidden>{row.ok ? '✓' : '✗'}</span>}
            {displayValue(row.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionRenderer({ section }: { section: TrellisSection }) {
  const rows = section.items?.filter((item) => item.kind === 'table_row' && item.cells && item.cells.length > 0) || [];
  const nonTableItems = section.items?.filter((item) => item.kind !== 'table_row') || [];

  return (
    <section className="border-t border-theme-border/40 pt-3 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="min-w-0 truncate text-sm font-semibold text-text-primary">{section.title}</h4>
        <Pill tone="muted">{section.kind}</Pill>
      </div>

      {rows.length > 0 && (
        <div className="mb-3 overflow-x-auto border border-theme-border/40">
          <table className="min-w-full text-left text-xs">
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={itemKey(row, rowIndex)} className={rowIndex === 0 ? 'bg-surface-highlight/45 text-text-primary' : 'text-text-secondary'}>
                  {row.cells?.map((cell, cellIndex) => (
                    <td key={`${rowIndex}-${cellIndex}`} className="border-b border-theme-border/30 px-2 py-1.5 align-top last:border-r-0">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nonTableItems.length > 0 && (
        <div className="space-y-1.5">
          {nonTableItems.map((item, index) => {
            if (item.kind === 'check') {
              return (
                <label key={itemKey(item, index)} className="flex items-start gap-2 text-xs text-text-secondary">
                  <input type="checkbox" checked={Boolean(item.checked)} readOnly className="mt-0.5" />
                  <span className={item.checked ? 'line-through text-text-secondary/70' : ''}>{item.text}</span>
                </label>
              );
            }
            if (item.kind === 'code') {
              return (
                <pre key={itemKey(item, index)} className="max-h-52 overflow-auto rounded bg-surface-highlight/40 p-2 text-[11px] text-text-primary">
                  {item.text}
                </pre>
              );
            }
            if (item.kind === 'list') {
              return (
                <div key={itemKey(item, index)} className="flex items-start gap-2 text-xs text-text-secondary">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-secondary/70" />
                  <span>{item.text}</span>
                </div>
              );
            }
            return (
              <p key={itemKey(item, index)} className="text-xs leading-relaxed text-text-secondary">
                {item.text}
              </p>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DocumentRenderer({ document, onSource }: { document?: TrellisDocument; onSource: (path: string) => void }) {
  const { t } = useI18n();
  if (!document) {
    return <EmptyState label={t('trellis_no_selection')} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-theme-border/40 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-text-primary">{document.title}</h3>
            <div className="mt-1 truncate font-mono text-[11px] text-text-secondary">{document.raw_path}</div>
          </div>
          <button
            onClick={() => onSource(document.raw_path)}
            className="shrink-0 rounded bg-surface-highlight/60 px-2 py-1 text-[10px] text-text-secondary hover:bg-surface-highlight hover:text-text-primary"
          >
            {t('trellis_source_view')}
          </button>
        </div>
        {document.links && document.links.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {document.links.slice(0, 10).map((link) => (
              <Pill key={`${link.label}-${link.path}`} tone="muted">{link.label}</Pill>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {documentWarnings(document).length > 0 && (
          <div className="mb-3">
            <WarningList warnings={documentWarnings(document)} />
          </div>
        )}
        {document.sections.length === 0 ? (
          <EmptyState label={t('trellis_no_items')} />
        ) : (
          <div className="space-y-4">
            {document.sections.map((section, index) => (
              <SectionRenderer key={`${section.title}-${section.level}-${index}`} section={section} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceRenderer({ sourceView, loading }: { sourceView: TrellisSourceResponse | null; loading: boolean }) {
  const { t } = useI18n();
  if (loading) {
    return (
      <div className="min-h-0 flex-1 p-4">
        <Skeleton lines={4} />
      </div>
    );
  }
  if (!sourceView) {
    return <EmptyState label={t('trellis_no_selection')} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-theme-border/40 px-4 py-3">
        <div className="truncate text-xs font-semibold text-text-primary">{sourceView.path}</div>
        <div className="mt-0.5 text-[10px] text-text-secondary">{sourceView.size} B</div>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-none bg-surface-highlight/40 p-4 text-[11px] leading-relaxed text-text-primary">
        {sourceView.content}
      </pre>
    </div>
  );
}

function TaskRow({
  task,
  archiveMonth,
  active,
  onOpen,
}: {
  task: TrellisTaskSummary;
  archiveMonth?: string;
  active: boolean;
  onOpen: (task: TrellisTaskSummary) => void;
}) {
  const metaParts = [task.priority, task.assignee, archiveMonth].filter(Boolean);
  return (
    <button
      onClick={() => onOpen(task)}
      className={clsx(rowBaseClass, active ? rowActiveClass : rowHoverClass)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-text-primary">{task.title || task.id}</div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-text-secondary">{task.path}</div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[10px] text-text-secondary">
          <StatusDot tone={statusTone(task.status)} />
          {task.status || '-'}
        </span>
      </div>
      {metaParts.length > 0 && (
        <div className="mt-1.5 truncate text-[10px] text-text-secondary">{metaParts.join(' · ')}</div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <ProgressBar done={task.acceptance_done} total={task.acceptance_total} />
        <DocBadges hasPrd={task.has_prd} hasDesign={task.has_design} hasImpl={task.has_implement} />
      </div>
    </button>
  );
}

function SpecRow({
  layer,
  active,
  onOpen,
}: {
  layer: SpecLayerWithPackage;
  active: boolean;
  onOpen: (layer: SpecLayerWithPackage) => void;
}) {
  return (
    <button
      onClick={() => onOpen(layer)}
      className={clsx(rowBaseClass, active ? rowActiveClass : rowHoverClass)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-text-primary">{layer.title || layer.name}</div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-text-secondary">{layer.path}</div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[10px] text-text-secondary">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          {String(layer.checklist_count)}
        </span>
      </div>
      <div className="mt-1 truncate text-[10px] text-text-secondary">{[layer.packageName, layer.name].join(' · ')}</div>
    </button>
  );
}

function ManifestList({ title, items }: { title: string; items?: TrellisManifestItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="border-t border-theme-border/40 pt-3">
      <h4 className="mb-2 text-sm font-semibold text-text-primary">{title}</h4>
      <div className="divide-y divide-theme-border/30 border border-theme-border/40">
        {items.map((item, index) => (
          <div key={`${item.file}-${index}`} className="px-3 py-2 text-xs">
            <div className="truncate font-mono text-text-primary">{item.file}</div>
            {item.reason && <div className="mt-0.5 text-text-secondary">{item.reason}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Sidebar({
  activeSection,
  onChange,
  summary,
}: {
  activeSection: TrellisSectionId;
  onChange: (section: TrellisSectionId) => void;
  summary: TrellisSummaryResponse | null;
}) {
  const { t } = useI18n();
  const counts: Record<TrellisSectionId, number | undefined> = {
    overview: undefined,
    tasks: (summary?.active_tasks || []).length + countArchivedTasks(summary?.archived_tasks),
    specs: summary?.specs?.packages?.reduce((count, pkg) => count + pkg.layers.length, 0),
    workflow: (summary?.workflow?.phases || []).length + (summary?.workflow?.states || []).length,
    warnings: (summary?.warnings || []).length,
  };

  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-theme-border/50 bg-surface/95 p-2 md:w-44 md:flex-col md:overflow-visible md:border-b-0 md:border-r">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={clsx(
            'flex min-w-fit items-center justify-between gap-2 rounded px-2.5 py-2 text-left text-xs transition-colors',
            activeSection === item.id
              ? 'bg-accent/15 text-accent'
              : 'text-text-secondary hover:bg-surface-highlight/50 hover:text-text-primary',
          )}
        >
          <span>{t(item.label)}</span>
          {typeof counts[item.id] === 'number' && <Pill tone={item.id === 'warnings' && counts[item.id] ? 'warn' : 'muted'}>{String(counts[item.id])}</Pill>}
        </button>
      ))}
    </nav>
  );
}

function ListPane({ children }: { children: ReactNode }) {
  return (
    <aside className="flex min-h-[220px] shrink-0 flex-col overflow-hidden border-b border-theme-border/50 bg-surface/70 lg:w-[340px] lg:border-b-0 lg:border-r">
      {children}
    </aside>
  );
}

function DetailPane({ children }: { children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface">
      {children}
    </section>
  );
}

function OverviewList({
  summary,
  onOpenTask,
  onOpenSpec,
}: {
  summary: TrellisSummaryResponse;
  onOpenTask: (task: TrellisTaskSummary) => void;
  onOpenSpec: (layer: SpecLayerWithPackage) => void;
}) {
  const { t } = useI18n();
  const firstSpecs: SpecLayerWithPackage[] = [];
  for (const pkg of summary.specs?.packages || []) {
    for (const layer of pkg.layers) {
      firstSpecs.push({ ...layer, packageName: pkg.name });
    }
  }

  return (
    <>
      <div className="border-b border-theme-border/40 px-3 py-2">
        <div className="text-xs font-semibold uppercase text-text-secondary">{t('trellis_quick_open')}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-semibold text-text-secondary">{t('trellis_active_tasks')}</div>
        <div className="border-y border-theme-border/35">
          {(summary.active_tasks || []).slice(0, 5).map((task) => (
            <TaskRow key={task.path} task={task} active={false} onOpen={onOpenTask} />
          ))}
          {(summary.active_tasks || []).length === 0 && <div className="px-3 py-2 text-xs text-text-secondary">{t('trellis_no_items')}</div>}
        </div>

        <div className="px-3 py-2 text-[11px] font-semibold text-text-secondary">{t('trellis_specs')}</div>
        <div className="border-y border-theme-border/35">
          {firstSpecs.slice(0, 6).map((layer) => (
            <SpecRow key={layer.path} layer={layer} active={false} onOpen={onOpenSpec} />
          ))}
          {firstSpecs.length === 0 && <div className="px-3 py-2 text-xs text-text-secondary">{t('trellis_no_items')}</div>}
        </div>
      </div>
    </>
  );
}

function OverviewDetail({ summary }: { summary: TrellisSummaryResponse }) {
  const { t } = useI18n();
  const warningCount = summary.warnings?.length || 0;
  const specCount = summary.specs?.packages?.reduce((count, pkg) => count + pkg.layers.length, 0) || 0;
  const activeTask = summary.active_tasks?.[0];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <StatTile label={t('trellis_specs')} value={specCount} />
        <StatTile label={t('trellis_active_tasks')} value={summary.active_tasks?.length || 0} />
        <StatTile label={t('trellis_archived_tasks')} value={countArchivedTasks(summary.archived_tasks)} />
        <StatTile label={t('trellis_warnings')} value={warningCount} tone={warningCount > 0 ? 'warn' : 'good'} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-text-primary">{t('trellis_active_tasks')}</h3>
          {activeTask ? (
            <div className="rounded border border-theme-border/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-text-primary">{activeTask.title || activeTask.id}</div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-text-secondary">{activeTask.path}</div>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-[10px] text-text-secondary">
                  <StatusDot tone={statusTone(activeTask.status)} />
                  {activeTask.status || '-'}
                </span>
              </div>
              <div className="mt-2.5">
                <ProgressBar done={activeTask.acceptance_done} total={activeTask.acceptance_total} />
              </div>
            </div>
          ) : (
            <EmptyState label={t('trellis_no_items')} />
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-text-primary">{t('trellis_workspace')}</h3>
          {!summary.workspace?.exists ? (
            <EmptyState label={t('trellis_no_items')} />
          ) : (
            <div className="divide-y divide-theme-border/35 rounded border border-theme-border/40">
              {summary.workspace.developers.map((developer) => (
                <div key={developer.name} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span className="min-w-0 truncate text-text-primary">{developer.name}</span>
                  <div className="flex shrink-0 items-center gap-2 text-[10px] text-text-secondary">
                    <span className={clsx('inline-flex items-center gap-0.5', developer.has_index ? 'text-success' : 'text-warning')}>
                      <span aria-hidden>{developer.has_index ? '✓' : '✗'}</span>
                      index
                    </span>
                    <span>{`${developer.journal_count} ${t('trellis_journals')}`}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mt-4">
        <h3 className="mb-2 text-sm font-semibold text-text-primary">{t('trellis_warnings')}</h3>
        <WarningList warnings={summary.warnings || []} compact />
      </section>
    </div>
  );
}

function TaskListPane({
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
}) {
  const { t } = useI18n();

  return (
    <>
      <div className="space-y-2 border-b border-theme-border/40 p-3">
        <input
          value={taskQuery}
          onChange={(event) => onTaskQueryChange(event.target.value)}
          placeholder={t('trellis_search')}
          className={inputClass}
        />
        <div className="grid grid-cols-3 gap-1.5">
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)} className={selectClass}>
            <option value="">{t('trellis_status')}</option>
            {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select value={priorityFilter} onChange={(event) => onPriorityFilterChange(event.target.value)} className={selectClass}>
            <option value="">{t('trellis_priority')}</option>
            {priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </select>
          <select value={archiveFilter} onChange={(event) => onArchiveFilterChange(event.target.value)} className={selectClass}>
            <option value="">{t('trellis_archive_month')}</option>
            {archiveOptions.map((month) => <option key={month} value={month}>{month}</option>)}
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!archiveFilter && (
          <>
            <div className="px-3 py-2 text-[11px] font-semibold text-text-secondary">{t('trellis_active_tasks')}</div>
            <div className="border-y border-theme-border/35">
              {filteredActiveTasks.map((task) => (
                <TaskRow key={task.path} task={task} active={selectedTaskPath === task.path} onOpen={onOpenTask} />
              ))}
              {filteredActiveTasks.length === 0 && <div className="px-3 py-2 text-xs text-text-secondary">{t('trellis_no_items')}</div>}
            </div>
          </>
        )}

        <div className="px-3 py-2 text-[11px] font-semibold text-text-secondary">{t('trellis_archived_tasks')}</div>
        <div className="border-y border-theme-border/35">
          {filteredArchiveGroups.length === 0 && <div className="px-3 py-2 text-xs text-text-secondary">{t('trellis_no_items')}</div>}
          {filteredArchiveGroups.map((group) => (
            <div key={group.archive_month}>
              <div className="border-b border-theme-border/30 bg-surface-highlight/25 px-3 py-1.5 text-[10px] font-semibold text-text-secondary">
                {group.archive_month}
              </div>
              {group.tasks.map((task) => (
                <TaskRow key={task.path} task={task} archiveMonth={group.archive_month} active={selectedTaskPath === task.path} onOpen={onOpenTask} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function TaskDetailPane({
  taskDetail,
  taskLoading,
  activeTab,
  sourceView,
  sourceLoading,
  onTabChange,
  onSource,
}: {
  taskDetail: TrellisTaskDetailResponse | null;
  taskLoading: boolean;
  activeTab: TaskDetailTab;
  sourceView: TrellisSourceResponse | null;
  sourceLoading: boolean;
  onTabChange: (tab: TaskDetailTab) => void;
  onSource: (path: string) => void;
}) {
  const { t } = useI18n();
  const selectedTaskResearch = taskDetail ? taskResearchEntries(taskDetail) : [];

  if (taskLoading) {
    return (
      <div className="min-h-0 flex-1 p-4">
        <div className="mb-4 h-5 w-2/3 animate-pulse rounded bg-surface-highlight/50" />
        <div className="mb-4 h-3 w-1/2 animate-pulse rounded bg-surface-highlight/50" />
        <Skeleton lines={4} />
      </div>
    );
  }
  if (!taskDetail) {
    return <EmptyState label={t('trellis_no_selection')} />;
  }

  const metaParts = [taskDetail.metadata.priority, taskDetail.metadata.assignee].filter(Boolean);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-theme-border/40 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {taskDetail.metadata.title || taskDetail.metadata.name || taskDetail.metadata.id}
            </h3>
            <div className="mt-1 truncate font-mono text-[11px] text-text-secondary">{taskDetail.path}</div>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-[10px] text-text-secondary">
            <StatusDot tone={statusTone(taskDetail.metadata.status)} />
            {taskDetail.metadata.status || '-'}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-text-secondary">
          {metaParts.length > 0 && <span>{metaParts.join(' · ')}</span>}
          {taskDetail.metadata.completedAt && (
            <span className="inline-flex items-center gap-0.5 text-success">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {formatDate(taskDetail.metadata.completedAt)}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {TASK_DETAIL_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={clsx(tabBase, activeTab === tab.id ? tabActive : tabInactive)}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'source' ? (
        <SourceRenderer sourceView={sourceView} loading={sourceLoading} />
      ) : activeTab === 'prd' ? (
        <DocumentRenderer document={taskDetail.prd} onSource={onSource} />
      ) : activeTab === 'design' ? (
        <DocumentRenderer document={taskDetail.design} onSource={onSource} />
      ) : activeTab === 'implement' ? (
        <DocumentRenderer document={taskDetail.implementation} onSource={onSource} />
      ) : activeTab === 'research' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {selectedTaskResearch.length === 0 ? (
            <EmptyState label={t('trellis_no_items')} />
          ) : (
            <div className="divide-y divide-theme-border/35 border border-theme-border/40">
              {selectedTaskResearch.map((entry) => (
                <button key={entry.path} onClick={() => onSource(entry.path)} className="block w-full px-3 py-2 text-left text-xs hover:bg-surface-highlight/35">
                  <div className="truncate text-text-primary">{entry.title || entry.name}</div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-text-secondary">{entry.path}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <section>
              <h4 className="mb-2 text-sm font-semibold text-text-primary">{t('trellis_readiness')}</h4>
              <ReadinessStrip readiness={taskDetail.readiness} />
            </section>
            <section>
              <h4 className="mb-2 text-sm font-semibold text-text-primary">{t('trellis_warnings')}</h4>
              <WarningList warnings={taskDetail.warnings || []} compact />
            </section>
            {taskDetail.metadata.description && (
              <section>
                <h4 className="mb-2 text-sm font-semibold text-text-primary">{t('trellis_summary')}</h4>
                <div className="border border-theme-border/40 px-3 py-2 text-xs leading-relaxed text-text-secondary">
                  {taskDetail.metadata.description}
                </div>
              </section>
            )}
            <ManifestList title={t('trellis_implement_context')} items={taskDetail.context_manifests?.implement} />
            <ManifestList title={t('trellis_check_context')} items={taskDetail.context_manifests?.check} />
          </div>
        </div>
      )}
    </div>
  );
}

function SpecListPane({
  specLayers,
  selectedSpecPath,
  specQuery,
  onSpecQueryChange,
  onOpenSpec,
}: {
  specLayers: SpecLayerWithPackage[];
  selectedSpecPath: string;
  specQuery: string;
  onSpecQueryChange: (value: string) => void;
  onOpenSpec: (layer: SpecLayerWithPackage) => void;
}) {
  const { t } = useI18n();
  const grouped = specLayers.reduce<Record<string, SpecLayerWithPackage[]>>((result, layer) => {
    const existing = result[layer.packageName] || [];
    result[layer.packageName] = [...existing, layer];
    return result;
  }, {});

  return (
    <>
      <div className="border-b border-theme-border/40 p-3">
        <input
          value={specQuery}
          onChange={(event) => onSpecQueryChange(event.target.value)}
          placeholder={t('trellis_search')}
          className={inputClass}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {Object.entries(grouped).length === 0 && <div className="px-3 py-2 text-xs text-text-secondary">{t('trellis_no_items')}</div>}
        {Object.entries(grouped).map(([packageName, layers]) => (
          <div key={packageName}>
            <div className="border-b border-theme-border/30 bg-surface-highlight/25 px-3 py-1.5 text-[10px] font-semibold text-text-secondary">
              {packageName}
            </div>
            <div className="border-b border-theme-border/35">
              {layers.map((layer) => (
                <SpecRow key={layer.path} layer={layer} active={selectedSpecPath === layer.path} onOpen={onOpenSpec} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SpecDetailPane({
  specDocument,
  specLoading,
  specDetailTab,
  sourceView,
  sourceLoading,
  onTabChange,
  onSource,
}: {
  specDocument: TrellisDocument | null;
  specLoading: boolean;
  specDetailTab: SpecDetailTab;
  sourceView: TrellisSourceResponse | null;
  sourceLoading: boolean;
  onTabChange: (tab: SpecDetailTab) => void;
  onSource: (path: string) => void;
}) {
  const { t } = useI18n();

  if (specLoading) {
    return (
      <div className="min-h-0 flex-1 p-4">
        <div className="mb-4 h-5 w-1/2 animate-pulse rounded bg-surface-highlight/50" />
        <Skeleton lines={4} />
      </div>
    );
  }
  if (!specDocument) {
    return <EmptyState label={t('trellis_no_selection')} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-theme-border/40 px-4 py-3">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => onTabChange('structured')}
            className={clsx(tabBase, specDetailTab === 'structured' ? tabActive : tabInactive)}
          >
            {t('trellis_structured')}
          </button>
          <button
            onClick={() => onSource(specDocument.raw_path)}
            className={clsx(tabBase, specDetailTab === 'source' ? tabActive : tabInactive)}
          >
            {t('trellis_source')}
          </button>
        </div>
      </div>
      {specDetailTab === 'source' ? (
        <SourceRenderer sourceView={sourceView} loading={sourceLoading} />
      ) : (
        <DocumentRenderer document={specDocument} onSource={onSource} />
      )}
    </div>
  );
}

function WorkflowListPane({ summary }: { summary: TrellisSummaryResponse }) {
  const { t } = useI18n();
  return (
    <>
      <div className="border-b border-theme-border/40 px-3 py-2">
        <div className="text-xs font-semibold uppercase text-text-secondary">{t('trellis_workflow')}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {(summary.workflow?.phases || []).map((phase) => (
          <div key={phase.name} className="border-b border-theme-border/35 px-3 py-2">
            <div className="truncate text-xs font-semibold text-text-primary">{phase.name}</div>
            {phase.summary && <div className="mt-1 line-clamp-2 text-[11px] text-text-secondary">{phase.summary}</div>}
          </div>
        ))}
        {(summary.workflow?.states || []).map((state) => (
          <div key={state.name} className="border-b border-theme-border/35 px-3 py-2">
            <div className="truncate text-xs font-semibold text-text-primary">{state.name}</div>
            <Pill tone="muted">{t('trellis_state')}</Pill>
          </div>
        ))}
      </div>
    </>
  );
}

function WorkflowDetail({ summary }: { summary: TrellisSummaryResponse }) {
  const { t } = useI18n();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text-primary">{summary.workflow?.title || t('trellis_workflow')}</h3>
      </div>
      <div className="space-y-4">
        {(summary.workflow?.phases || []).map((phase) => (
          <section key={phase.name} className="border-t border-theme-border/40 pt-3 first:border-t-0 first:pt-0">
            <div className="text-sm font-semibold text-text-primary">{phase.name}</div>
            {phase.summary && <div className="mt-1 text-xs leading-relaxed text-text-secondary">{phase.summary}</div>}
            {phase.states && phase.states.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {phase.states.map((state) => <Pill key={state} tone="muted">{state}</Pill>)}
              </div>
            )}
          </section>
        ))}
        {(summary.workflow?.states || []).map((state) => (
          <section key={state.name} className="border-t border-theme-border/40 pt-3">
            <div className="text-xs font-semibold text-text-primary">{state.name}</div>
            <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded bg-surface-highlight/40 p-2 text-[11px] text-text-secondary">
              {state.content}
            </pre>
          </section>
        ))}
      </div>
    </div>
  );
}

export function TrellisPanel({ sessionId, isOpen, onClose }: TrellisPanelProps) {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<TrellisSectionId>('overview');
  const [summary, setSummary] = useState<TrellisSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [taskQuery, setTaskQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [archiveFilter, setArchiveFilter] = useState('');
  const [selectedTaskPath, setSelectedTaskPath] = useState('');
  const [taskDetail, setTaskDetail] = useState<TrellisTaskDetailResponse | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskDetailTab, setTaskDetailTab] = useState<TaskDetailTab>('summary');

  const [specQuery, setSpecQuery] = useState('');
  const [selectedSpecPath, setSelectedSpecPath] = useState('');
  const [specDocument, setSpecDocument] = useState<TrellisDocument | null>(null);
  const [specLoading, setSpecLoading] = useState(false);
  const [specDetailTab, setSpecDetailTab] = useState<SpecDetailTab>('structured');

  const [sourceView, setSourceView] = useState<TrellisSourceResponse | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId || !isOpen) return;
    setLoading(true);
    setError('');
    try {
      const nextSummary = await api.getSessionTrellisSummary(sessionId);
      setSummary(nextSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('trellis_error_generic'));
    } finally {
      setLoading(false);
    }
  }, [sessionId, isOpen, t]);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen, refresh]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveSection('overview');
    setSummary(null);
    setError('');
    setSelectedTaskPath('');
    setTaskDetail(null);
    setTaskDetailTab('summary');
    setSelectedSpecPath('');
    setSpecDocument(null);
    setSpecDetailTab('structured');
    setSourceView(null);
  }, [sessionId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const allTasks = useMemo<TaskWithArchive[]>(() => {
    if (!summary) return [];
    const active = (summary.active_tasks || []).map((task) => ({ task }));
    const archived = (summary.archived_tasks || []).flatMap((group) =>
      group.tasks.map((task) => ({ task, archiveMonth: group.archive_month })),
    );
    return [...active, ...archived];
  }, [summary]);

  const statusOptions = useMemo(() => Array.from(new Set(allTasks.map((item) => item.task.status).filter(Boolean))).sort(), [allTasks]);
  const priorityOptions = useMemo(() => Array.from(new Set(allTasks.map((item) => item.task.priority || '').filter(Boolean))).sort(), [allTasks]);
  const archiveOptions = useMemo(() => (summary?.archived_tasks || []).map((group) => group.archive_month), [summary]);

  const filteredActiveTasks = useMemo(() => {
    const query = normalizeFilter(taskQuery);
    return (summary?.active_tasks || []).filter((task) =>
      taskMatchesQuery(task, query)
      && (!statusFilter || task.status === statusFilter)
      && (!priorityFilter || task.priority === priorityFilter)
      && !archiveFilter,
    );
  }, [summary, taskQuery, statusFilter, priorityFilter, archiveFilter]);

  const filteredArchiveGroups = useMemo<TrellisArchivedTaskGroup[]>(() => {
    const query = normalizeFilter(taskQuery);
    return (summary?.archived_tasks || [])
      .filter((group) => !archiveFilter || group.archive_month === archiveFilter)
      .map((group) => ({
        archive_month: group.archive_month,
        tasks: group.tasks.filter((task) =>
          taskMatchesQuery(task, query, group.archive_month)
          && (!statusFilter || task.status === statusFilter)
          && (!priorityFilter || task.priority === priorityFilter),
        ),
      }))
      .filter((group) => group.tasks.length > 0);
  }, [summary, taskQuery, statusFilter, priorityFilter, archiveFilter]);

  const specLayers = useMemo<SpecLayerWithPackage[]>(() => {
    const layers: SpecLayerWithPackage[] = [];
    for (const pkg of summary?.specs?.packages || []) {
      for (const layer of pkg.layers) {
        layers.push({ ...layer, packageName: pkg.name });
      }
    }
    const query = normalizeFilter(specQuery);
    return layers.filter((layer) => {
      const haystack = `${layer.packageName} ${layer.name} ${layer.title} ${layer.path}`.toLowerCase();
      return !query || haystack.includes(query);
    });
  }, [summary, specQuery]);

  const openTask = useCallback(async (task: TrellisTaskSummary) => {
    if (!sessionId) return;
    setActiveSection('tasks');
    setSelectedTaskPath(task.path);
    setTaskDetail(null);
    setTaskDetailTab('summary');
    setSourceView(null);
    setTaskLoading(true);
    try {
      const detail = await api.getSessionTrellisTask(sessionId, task.path);
      setTaskDetail(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('trellis_error_generic'));
    } finally {
      setTaskLoading(false);
    }
  }, [sessionId, t]);

  const openSpec = useCallback(async (layer: TrellisSpecLayer) => {
    if (!sessionId) return;
    setActiveSection('specs');
    setSelectedSpecPath(layer.path);
    setSpecDocument(null);
    setSpecDetailTab('structured');
    setSourceView(null);
    setSpecLoading(true);
    try {
      const doc = await api.getSessionTrellisSpec(sessionId, layer.path);
      setSpecDocument(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('trellis_error_generic'));
    } finally {
      setSpecLoading(false);
    }
  }, [sessionId, t]);

  const openTaskSource = useCallback(async (path: string) => {
    if (!sessionId) return;
    setSourceView(null);
    setSourceLoading(true);
    setTaskDetailTab('source');
    try {
      const source = await api.getSessionTrellisSource(sessionId, path);
      setSourceView(source);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('trellis_error_generic'));
    } finally {
      setSourceLoading(false);
    }
  }, [sessionId, t]);

  const openSpecSource = useCallback(async (path: string) => {
    if (!sessionId) return;
    setSourceView(null);
    setSourceLoading(true);
    setSpecDetailTab('source');
    try {
      const source = await api.getSessionTrellisSource(sessionId, path);
      setSourceView(source);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('trellis_error_generic'));
    } finally {
      setSourceLoading(false);
    }
  }, [sessionId, t]);

  if (!isOpen || !sessionId) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('trellis_title')}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex h-[min(88vh,900px)] w-[min(1280px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-theme-border/70 bg-surface shadow-2xl">
        <div className="shrink-0 border-b border-theme-border/50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-text-primary">{t('trellis_title')}</span>
                <Pill tone="muted">{t('trellis_read_only')}</Pill>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-text-secondary">
                {summary?.available ? basename(summary.project_root) : summary?.current_path || t('trellis_no_project')}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => void refresh()}
                className="rounded bg-surface-highlight/50 px-2 py-1 text-xs text-text-secondary hover:bg-surface-highlight hover:text-text-primary"
              >
                {t('trellis_refresh')}
              </button>
              <button
                onClick={onClose}
                className="rounded bg-surface-highlight/50 px-2 py-1 text-xs text-text-secondary hover:bg-surface-highlight hover:text-text-primary"
                title={t('cancel')}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <Skeleton lines={4} className="w-full max-w-sm" />
          </div>
        ) : error ? (
          <div className="m-4 flex items-center justify-between gap-3 border border-error/40 bg-error/10 px-3 py-2.5 text-xs text-error">
            <span className="min-w-0">{error}</span>
            <button
              onClick={() => void refresh()}
              className="shrink-0 rounded border border-error/40 px-2 py-1 text-[11px] text-error hover:bg-error/15"
            >
              {t('trellis_retry')}
            </button>
          </div>
        ) : summary && !summary.available ? (
          <div className="m-4 border border-theme-border/40 bg-surface-highlight/20 p-3 text-xs text-text-secondary">
            <div className="font-semibold text-text-primary">{t('trellis_no_project')}</div>
            <div className="mt-1 truncate">{summary.current_path}</div>
          </div>
        ) : summary?.available ? (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <Sidebar activeSection={activeSection} onChange={setActiveSection} summary={summary} />
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              {activeSection === 'overview' && (
                <>
                  <ListPane>
                    <OverviewList summary={summary} onOpenTask={(task) => void openTask(task)} onOpenSpec={(layer) => void openSpec(layer)} />
                  </ListPane>
                  <DetailPane>
                    <OverviewDetail summary={summary} />
                  </DetailPane>
                </>
              )}

              {activeSection === 'tasks' && (
                <>
                  <ListPane>
                    <TaskListPane
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
                      onOpenTask={(task) => void openTask(task)}
                    />
                  </ListPane>
                  <DetailPane>
                    <TaskDetailPane
                      taskDetail={taskDetail}
                      taskLoading={taskLoading}
                      activeTab={taskDetailTab}
                      sourceView={sourceView}
                      sourceLoading={sourceLoading}
                      onTabChange={setTaskDetailTab}
                      onSource={(path) => void openTaskSource(path)}
                    />
                  </DetailPane>
                </>
              )}

              {activeSection === 'specs' && (
                <>
                  <ListPane>
                    <SpecListPane
                      specLayers={specLayers}
                      selectedSpecPath={selectedSpecPath}
                      specQuery={specQuery}
                      onSpecQueryChange={setSpecQuery}
                      onOpenSpec={(layer) => void openSpec(layer)}
                    />
                  </ListPane>
                  <DetailPane>
                    <SpecDetailPane
                      specDocument={specDocument}
                      specLoading={specLoading}
                      specDetailTab={specDetailTab}
                      sourceView={sourceView}
                      sourceLoading={sourceLoading}
                      onTabChange={setSpecDetailTab}
                      onSource={(path) => void openSpecSource(path)}
                    />
                  </DetailPane>
                </>
              )}

              {activeSection === 'workflow' && (
                <>
                  <ListPane>
                    <WorkflowListPane summary={summary} />
                  </ListPane>
                  <DetailPane>
                    <WorkflowDetail summary={summary} />
                  </DetailPane>
                </>
              )}

              {activeSection === 'warnings' && (
                <>
                  <ListPane>
                    <div className="border-b border-theme-border/40 px-3 py-2">
                      <div className="text-xs font-semibold uppercase text-text-secondary">{t('trellis_warnings')}</div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <WarningList warnings={summary.warnings || []} compact />
                    </div>
                  </ListPane>
                  <DetailPane>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      <WarningList warnings={summary.warnings || []} />
                    </div>
                  </DetailPane>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
