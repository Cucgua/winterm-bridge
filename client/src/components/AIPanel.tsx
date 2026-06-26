import { useEffect, useState, useMemo } from 'react';
import { api } from '../core/api';
import { useAIStore } from '../stores/aiStore';
import { WorkflowEvent, WorkflowEventType } from '../core/api';

interface Props {
  sessionId: string;
  onClose: () => void;
}

/** Event type → icon + color + label */
const EVENT_META: Record<string, { icon: string; color: string; label: string }> = {
  context_changed: { icon: '🔄', color: 'text-text-secondary', label: 'Context Changed' },
  state_analysis_start: { icon: '🔍', color: 'text-accent', label: 'Analyzing State' },
  state_analyzed: { icon: '✓', color: 'text-success', label: 'State Analyzed' },
  analysis_failed: { icon: '✗', color: 'text-error', label: 'Analysis Failed' },
  action_analysis_start: { icon: '🧠', color: 'text-accent', label: 'Analyzing Action' },
  action_analysis_end: { icon: '🧠', color: 'text-accent', label: 'Action Analyzed' },
  action_queued: { icon: '⏳', color: 'text-warning', label: 'Action Queued' },
  action_executed: { icon: '▶', color: 'text-accent', label: 'Executing' },
  action_start: { icon: '▶', color: 'text-accent', label: 'Action Start' },
  action_end: { icon: '■', color: 'text-text-secondary', label: 'Action End' },
  action_success: { icon: '✓', color: 'text-success', label: 'Action Success' },
  action_failed: { icon: '✗', color: 'text-error', label: 'Action Failed' },
  action_removed: { icon: '✕', color: 'text-text-secondary', label: 'Action Removed' },
  action_skipped: { icon: '⊘', color: 'text-warning', label: 'Action Skipped' },
  idle: { icon: '💤', color: 'text-text-secondary', label: 'Idle' },
};

type FilterCategory = 'all' | 'state' | 'auto_reply' | 'notify';

export function AIPanel({ sessionId, onClose }: Props) {
  const [fetchedEvents, setFetchedEvents] = useState<WorkflowEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Realtime events from store (pushed via WebSocket)
  const realtimeEvents = useAIStore(s => s.workflowEvents[sessionId] || []);
  const summary = useAIStore(s => s.summaries[sessionId]);
  const clearWorkflowEvents = useAIStore(s => s.clearWorkflowEvents);

  // Fetch historical events
  const loadEvents = async () => {
    try {
      const { events } = await api.getWorkflowEvents(sessionId, 100);
      setFetchedEvents(events);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [sessionId]);

  // Merge fetched + realtime, dedupe by id, sort by seq desc
  const allEvents = useMemo(() => {
    const merged = [...fetchedEvents];
    const ids = new Set(fetchedEvents.map(e => e.id));
    for (const e of realtimeEvents) {
      if (!ids.has(e.id)) {
        merged.push(e);
        ids.add(e.id);
      }
    }
    return merged
      .filter(e => e.event_type !== 'idle')
      .sort((a, b) => b.seq - a.seq)
      .slice(0, 100);
  }, [fetchedEvents, realtimeEvents]);

  // Apply filter
  const filteredEvents = useMemo(() => {
    if (filter === 'all') return allEvents;
    return allEvents.filter(e => {
      if (filter === 'state') return e.event_type.includes('state') || e.event_type.includes('analysis');
      if (filter === 'auto_reply') return e.action_kind === 'auto_reply' || (e.event_type.includes('action') && e.action_kind !== 'notify');
      if (filter === 'notify') return e.action_kind === 'notify';
      return true;
    });
  }, [allEvents, filter]);

  return (
    <div className="h-full flex flex-col bg-surface border-l border-theme-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-text-primary">AI Monitor</h2>
          {summary && (
            <span className="text-xs text-text-secondary">
              {summary.tag} · {summary.description}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs text-text-secondary hover:text-text-primary" onClick={loadEvents} title="Refresh">↻</button>
          <button
            className="text-xs text-text-secondary hover:text-text-primary"
            onClick={() => { clearWorkflowEvents(sessionId); setFetchedEvents([]); }}
            title="Clear"
          >
            Clear
          </button>
          <button className="text-text-secondary hover:text-text-primary" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-theme-border shrink-0">
        {([
          ['all', 'All'],
          ['state', 'State'],
          ['auto_reply', 'Auto'],
          ['notify', 'Notify'],
        ] as [FilterCategory, string][]).map(([key, label]) => (
          <button
            key={key}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              filter === key
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-highlight'
            }`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Event timeline */}
      <div className="flex-1 overflow-auto p-3 space-y-1">
        {loading && <p className="text-sm text-text-secondary text-center py-4">Loading...</p>}
        {!loading && filteredEvents.length === 0 && (
          <p className="text-sm text-text-secondary text-center py-4">No events</p>
        )}
        {filteredEvents.map(e => {
          const meta = EVENT_META[e.event_type] || { icon: '•', color: 'text-text-secondary', label: e.event_type };
          const isExpanded = expandedId === e.id;
          const time = new Date(e.timestamp_ms).toLocaleTimeString();
          return (
            <div
              key={e.id}
              className="p-2 rounded-lg hover:bg-surface-highlight cursor-pointer transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : e.id)}
            >
              <div className="flex items-start gap-2">
                <span className="text-sm shrink-0">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                    <span className="text-xs text-text-secondary">{time}</span>
                    {e.duration_ms !== undefined && e.duration_ms > 0 && (
                      <span className="text-xs text-text-secondary">{e.duration_ms}ms</span>
                    )}
                  </div>
                  {(e.tag || e.description) && (
                    <div className="text-xs text-text-secondary truncate mt-0.5">
                      {e.tag && <span className="text-warning">{e.tag} </span>}
                      {e.description}
                    </div>
                  )}
                  {isExpanded && (
                    <div className="mt-1.5 space-y-0.5 text-xs text-text-secondary">
                      <div>type: <span className="text-text-primary font-mono">{e.event_type}</span></div>
                      {e.action_sig && <div>action: <span className="text-text-primary font-mono">{e.action_sig}</span></div>}
                      {e.action_kind && <div>kind: <span className="text-text-primary">{e.action_kind}</span></div>}
                      {e.reason && <div>reason: <span className="text-warning">{e.reason}</span></div>}
                      {e.error && <div>error: <span className="text-error">{e.error}</span></div>}
                      {e.reasoning && <div>summary: <span className="text-text-primary">{e.reasoning}</span></div>}
                      {e.success !== undefined && <div>success: <span className={e.success ? 'text-success' : 'text-error'}>{String(e.success)}</span></div>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
