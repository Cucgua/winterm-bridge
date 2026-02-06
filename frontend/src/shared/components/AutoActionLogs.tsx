import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, WorkflowEvent, WorkflowEventType } from '../core/api';
import { useAIStore } from '../stores/aiStore';
import { useI18n } from '../i18n';

interface AutoActionLogsProps {
  sessionId?: string;
  compact?: boolean;
  onClose?: () => void;
}

function formatTime(tsMs: number): string {
  const d = new Date(tsMs);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(tsMs: number): string {
  const d = new Date(tsMs);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + formatTime(tsMs);
}

const getEventLabel = (event: WorkflowEvent): string => {
  switch (event.event_type) {
    case 'context_changed': return '📡 上下文变化';
    case 'state_analysis_start': return '🔍 开始分析状态...';
    case 'state_analyzed':
      // 如果没有 tag 但有 duration_ms，说明是"分析完成"事件
      if (!event.tag && event.duration_ms !== undefined) {
        return `✅ 分析完成 (${event.duration_ms}ms)`;
      }
      return event.tag ? `📋 状态: ${event.tag}${event.description ? ' - ' + event.description : ''}` : '🔄 状态分析中...';
    case 'analysis_failed': return `❌ AI分析失败${event.error ? ': ' + event.error : ''}`;
    case 'action_analysis_start': return '🤔 开始决策分析...';
    case 'action_analysis_end':
      return event.reasoning
        ? `💡 决策: ${event.reasoning}`
        : `💡 决策完成${event.duration_ms ? ` (${event.duration_ms}ms)` : ''}`;
    case 'action_queued':
      return event.reasoning
        ? `📥 待执行: ${event.reasoning}`
        : `📥 入队: ${getActionSigLabel(event.action_sig) || getActionKindLabel(event.action_kind)}`;
    case 'action_executed':
      // 优先显示 reasoning（如"同意安装依赖"），其次显示操作签名
      if (event.reasoning) {
        return `⚡ 执行: ${event.reasoning}`;
      }
      const sig = getActionSigLabel(event.action_sig);
      const kind = getActionKindLabel(event.action_kind);
      return `⚡ 执行: ${sig || kind || '自动操作'}`;
    case 'action_start':
      return event.reasoning
        ? `▶️ 开始: ${event.reasoning}`
        : `▶️ 开始: ${getActionSigLabel(event.action_sig) || '执行操作'}`;
    case 'action_end': return `⏹️ 结束: ${getActionSigLabel(event.action_sig) || '操作完成'}`;
    case 'action_success':
      // 成功时显示完整的操作说明
      if (event.reasoning) {
        return `✅ 成功: ${event.reasoning}`;
      }
      return `✅ 成功: ${getActionSigLabel(event.action_sig) || getActionKindLabel(event.action_kind) || '操作完成'}`;
    case 'action_failed': return `❌ 失败: ${getActionSigLabel(event.action_sig)} ${event.error || ''}`;
    case 'action_removed': return '🗑️ 动作已移除（上下文变化）';
    case 'action_skipped': return `⏭️ 跳过: ${getSkipReasonLabel(event.reason, event.tag)}${event.error ? ' - ' + event.error : ''}`;
    case 'idle': return '💤 休眠中';
    default: return event.event_type;
  }
};

const getActionKindLabel = (kind?: string): string => {
  switch (kind) {
    case 'auto_reply': return '自动应答';
    case 'notify': return '邮件通知';
    default: return kind || '';
  }
};

const getActionSigLabel = (sig?: string): string => {
  if (!sig) return '';
  // 将 action_sig 如 "enter+y" 翻译成更易读的格式
  return sig
    .replace(/enter/gi, '回车')
    .replace(/\+/g, ' → ')
    .replace(/up/gi, '↑')
    .replace(/down/gi, '↓')
    .replace(/left/gi, '←')
    .replace(/right/gi, '→');
};

const getSkipReasonLabel = (reason?: string, tag?: string): string => {
  switch (reason) {
    case 'tag_not_allowed': return tag ? `状态「${tag}」不触发自动执行` : '不触发自动执行';
    case 'validation_failed': return '动作验证未通过';
    case 'no_actions': return 'AI判断无需执行动作';
    case 'cooldown': return '冷却期内，跳过重复执行';
    default: return reason || '';
  }
};

// 日志筛选类别
type LogCategory = 'all' | 'state_detection' | 'auto_reply' | 'email_notify';

const LOG_CATEGORIES: { key: LogCategory; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'state_detection', label: '状态检测' },
  { key: 'auto_reply', label: '自动应答' },
  { key: 'email_notify', label: '邮件通知' },
];

// 事件类型到筛选类别的映射
const getEventCategory = (event: WorkflowEvent): LogCategory => {
  const { event_type, action_kind } = event;

  // 邮件通知：action_kind 为 notify 的事件
  if (action_kind === 'notify') {
    return 'email_notify';
  }

  // 状态检测类：上下文变化、状态分析相关
  if (
    event_type === 'context_changed' ||
    event_type === 'state_analysis_start' ||
    event_type === 'state_analyzed' ||
    event_type === 'analysis_failed'
  ) {
    return 'state_detection';
  }

  // 自动应答类：动作分析、执行相关（非邮件通知）
  if (
    event_type === 'action_analysis_start' ||
    event_type === 'action_analysis_end' ||
    event_type === 'action_queued' ||
    event_type === 'action_executed' ||
    event_type === 'action_start' ||
    event_type === 'action_end' ||
    event_type === 'action_success' ||
    event_type === 'action_failed' ||
    event_type === 'action_removed' ||
    event_type === 'action_skipped'
  ) {
    return 'auto_reply';
  }

  // 默认归类为状态检测
  return 'state_detection';
};

const getEventColor = (event: WorkflowEvent): string => {
  switch (event.event_type) {
    case 'context_changed': return 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30';
    case 'state_analysis_start': return 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30';
    case 'state_analyzed': return 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30';
    case 'analysis_failed': return 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30';
    case 'action_analysis_start': return 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/30';
    case 'action_analysis_end': return 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/30';
    case 'action_queued': return 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30';
    case 'action_executed': return 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30';
    case 'action_start': return 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30';
    case 'action_end': return 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30';
    case 'action_success': return 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30';
    case 'action_failed': return 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30';
    case 'action_removed': return 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30';
    case 'action_skipped': return 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30';
    case 'idle': return 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30';
    default: return 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30';
  }
};

const getEventIcon = (event: WorkflowEvent): string => {
  switch (event.event_type) {
    case 'context_changed': return '🔄';
    case 'state_analysis_start': return '🔍';
    case 'state_analyzed': return '📋';
    case 'analysis_failed': return '⚠️';
    case 'action_analysis_start': return '🤔';
    case 'action_analysis_end': return '💡';
    case 'action_queued': return '📥';
    case 'action_executed': return '⚡';
    case 'action_start': return '▶️';
    case 'action_end': return '⏹️';
    case 'action_success': return '✅';
    case 'action_failed': return '❌';
    case 'action_removed': return '🗑️';
    case 'action_skipped': return '⏭️';
    case 'idle': return '💤';
    default: return '•';
  }
};

// Get workflow status from event type
type WorkflowStatus = 'idle' | 'analyzing_state' | 'analyzing_action' | 'executing';

const getStatusFromEvent = (eventType: WorkflowEventType): WorkflowStatus => {
  switch (eventType) {
    case 'state_analysis_start':
      return 'analyzing_state';
    case 'action_analysis_start':
      return 'analyzing_action';
    case 'action_start':
    case 'action_executed':
      return 'executing';
    case 'idle':
    case 'action_end':
    case 'action_success':
    case 'action_failed':
    case 'state_analyzed':
    case 'action_analysis_end':
      return 'idle';
    default:
      return 'idle';
  }
};

const getStatusLabel = (status: WorkflowStatus): string => {
  switch (status) {
    case 'idle': return '休眠中';
    case 'analyzing_state': return '状态分析中';
    case 'analyzing_action': return '动作分析中';
    case 'executing': return '动作执行中';
  }
};

const getStatusColor = (status: WorkflowStatus): string => {
  switch (status) {
    case 'idle': return 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/40';
    case 'analyzing_state': return 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/40';
    case 'analyzing_action': return 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border-indigo-500/40';
    case 'executing': return 'bg-green-500/20 text-green-600 dark:text-green-300 border-green-500/40';
  }
};

const getStatusIcon = (status: WorkflowStatus): string => {
  switch (status) {
    case 'idle': return '💤';
    case 'analyzing_state': return '🔍';
    case 'analyzing_action': return '🤔';
    case 'executing': return '⚡';
  }
};

// Hook for workflow status with 500ms minimum display time
const useWorkflowStatus = (events: WorkflowEvent[]): WorkflowStatus => {
  const [displayedStatus, setDisplayedStatus] = useState<WorkflowStatus>('idle');
  const lastChangeRef = useRef<number>(0);
  const pendingStatusRef = useRef<WorkflowStatus | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const latestEvent = events[0]; // events are sorted by seq desc
    const newStatus = latestEvent ? getStatusFromEvent(latestEvent.event_type) : 'idle';

    const now = Date.now();
    const elapsed = now - lastChangeRef.current;
    const MIN_DISPLAY_MS = 500;

    if (elapsed >= MIN_DISPLAY_MS) {
      // Can update immediately
      setDisplayedStatus(newStatus);
      lastChangeRef.current = now;
      pendingStatusRef.current = null;
    } else {
      // Queue the update
      pendingStatusRef.current = newStatus;
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          if (pendingStatusRef.current !== null) {
            setDisplayedStatus(pendingStatusRef.current);
            lastChangeRef.current = Date.now();
            pendingStatusRef.current = null;
          }
          timerRef.current = null;
        }, MIN_DISPLAY_MS - elapsed);
      }
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [events]);

  return displayedStatus;
};

export const AutoActionLogs: React.FC<AutoActionLogsProps> = ({ sessionId, compact = false, onClose }) => {
  const { t } = useI18n();
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [showCount, setShowCount] = useState(compact ? 20 : 50);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<LogCategory>('all');

  // Real-time events from store - use precise selector for current session
  const realtimeEvents = useAIStore(
    React.useCallback((s) => sessionId ? (s.workflowEvents[sessionId] || []) : [], [sessionId])
  );
  const clearWorkflowEvents = useAIStore((s) => s.clearWorkflowEvents);

  // Merge and dedupe events, filter out idle events from list, apply category filter
  const allEvents = React.useMemo(() => {
    const combined = [...events, ...realtimeEvents];
    const seen = new Set<string>();
    return combined
      .filter(e => {
        if (seen.has(e.id)) return false;
        if (e.event_type === 'idle') return false; // Don't show idle in event list
        seen.add(e.id);
        // Apply category filter
        if (filter !== 'all' && getEventCategory(e) !== filter) return false;
        return true;
      })
      .sort((a, b) => b.seq - a.seq); // newest first (by sequence number)
  }, [events, realtimeEvents, filter]);

  // All events including idle for status calculation
  const allEventsWithIdle = React.useMemo(() => {
    const combined = [...events, ...realtimeEvents];
    const seen = new Set<string>();
    return combined
      .filter(e => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .sort((a, b) => b.seq - a.seq);
  }, [events, realtimeEvents]);

  // Workflow status with debounce (uses all events including idle)
  const workflowStatus = useWorkflowStatus(allEventsWithIdle);

  const displayed = allEvents.slice(0, showCount);

  const loadEvents = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const result = await api.getWorkflowEvents(sessionId, 100);
      setEvents(result.events || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleClear = () => {
    clearWorkflowEvents(sessionId);
    setEvents([]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header: 会话操作日志 + 刷新/清空按钮 */}
      <div className="flex items-center justify-between flex-shrink-0 mb-2">
        <span className="text-sm font-medium text-text-primary">
          {t('auto_logs_session_title') || '会话操作日志'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={loadEvents}
            disabled={loading}
            className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-highlight rounded transition-colors disabled:opacity-50"
            title={t('auto_logs_refresh') || '刷新'}
          >
            {loading ? (
              <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>
          <button
            onClick={handleClear}
            className="px-2 py-1 text-xs text-text-secondary hover:text-red-500 hover:bg-surface-highlight rounded transition-colors"
            title={t('auto_logs_clear') || '清空'}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-highlight rounded transition-colors"
              title={'关闭'}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Real-time Status Banner - 实时状态栏 */}
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border shadow-sm ${getStatusColor(workflowStatus)} transition-all duration-300 flex-shrink-0 mb-2`}>
        <span className="text-base">{getStatusIcon(workflowStatus)}</span>
        <div className="flex-1">
          <span className="text-sm font-medium">{getStatusLabel(workflowStatus)}</span>
          <span className="text-xs text-text-secondary/70 ml-2">当前状态</span>
        </div>
        {workflowStatus !== 'idle' && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-current rounded-full animate-pulse" />
            <span className="text-xs opacity-70">处理中</span>
          </span>
        )}
      </div>

      {/* Filter Buttons - 日志类型筛选 */}
      <div className="flex items-center gap-1 flex-shrink-0 mb-2 flex-wrap">
        {LOG_CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-2 py-1 text-xs rounded-md border transition-colors ${
              filter === key
                ? 'bg-accent/20 text-accent border-accent/40 font-medium'
                : 'bg-surface-highlight/50 text-text-secondary border-theme-border/50 hover:text-text-primary hover:border-theme-border'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Events Timeline */}
      {displayed.length === 0 ? (
        <div className="text-center text-sm text-text-secondary py-8">
          {t('workflow_events_empty') || '暂无工作流事件'}
        </div>
      ) : (
        <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
          {displayed.map((event) => (
            <div key={event.id} className="text-xs">
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expandedId === event.id}
                className={`flex items-start gap-2 px-2 py-1.5 rounded border cursor-pointer transition-colors overflow-hidden ${getEventColor(event)} hover:opacity-80`}
                onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedId(expandedId === event.id ? null : event.id);
                  }
                }}
              >
                <span className="flex-shrink-0 mt-0.5">{getEventIcon(event)}</span>
                <span className="text-text-secondary w-14 flex-shrink-0 mt-0.5">{formatTime(event.timestamp_ms)}</span>
                <span className="flex-1 min-w-0 line-clamp-2 break-all">{getEventLabel(event)}</span>
                <svg
                  className={`w-3 h-3 opacity-50 transition-transform flex-shrink-0 mt-0.5 ${expandedId === event.id ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Expanded Details */}
              {expandedId === event.id && (
                <div className="ml-6 mt-1 px-3 py-2 bg-surface-highlight/50 rounded text-text-secondary space-y-1 border-l-2 border-theme-border">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-text-secondary/70">事件类型:</span>
                      <span className="ml-1 text-purple-600 dark:text-purple-400">{event.event_type}</span>
                    </div>
                    <div>
                      <span className="text-text-secondary/70">时间戳:</span>
                      <span className="ml-1">{formatDate(event.timestamp_ms)}</span>
                    </div>
                  </div>

                  {event.tag && (
                    <div className="text-[11px]">
                      <span className="text-text-secondary/70">状态标签:</span>
                      <span className="ml-1 text-cyan-600 dark:text-cyan-400">{event.tag}</span>
                    </div>
                  )}

                  {event.description && (
                    <div className="text-[11px]">
                      <span className="text-text-secondary/70">描述:</span>
                      <span className="ml-1">{event.description}</span>
                    </div>
                  )}

                  {event.duration_ms !== undefined && (
                    <div className="text-[11px]">
                      <span className="text-text-secondary/70">耗时:</span>
                      <span className="ml-1 text-yellow-600 dark:text-yellow-400">{event.duration_ms}ms</span>
                    </div>
                  )}

                  {event.action_sig && (
                    <div className="text-[11px]">
                      <span className="text-text-secondary/70">动作签名:</span>
                      <span className="ml-1 font-mono text-orange-600 dark:text-orange-400">{event.action_sig}</span>
                    </div>
                  )}

                  {event.action_kind && (
                    <div className="text-[11px]">
                      <span className="text-text-secondary/70">动作类型:</span>
                      <span className="ml-1 text-cyan-600 dark:text-cyan-400">{event.action_kind}</span>
                    </div>
                  )}

                  {event.error && (
                    <div className="text-[11px] text-red-600 dark:text-red-400">
                      <span className="text-text-secondary/70">错误:</span>
                      <span className="ml-1">{event.error}</span>
                    </div>
                  )}

                  <div className="text-[10px] text-text-secondary/50 pt-1">
                    ID: {event.id}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {allEvents.length > showCount && (
        <button
          onClick={() => setShowCount(s => s + 20)}
          className="w-full text-xs text-text-secondary hover:text-text-primary py-1"
        >
          {t('auto_logs_show_more') || '显示更多'}
        </button>
      )}
    </div>
  );
};
