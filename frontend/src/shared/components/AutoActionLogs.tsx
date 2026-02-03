import React, { useState, useEffect, useCallback } from 'react';
import { api, WorkflowEvent } from '../core/api';
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
    case 'context_changed': return '上下文变化';
    case 'state_analyzed': return `状态: ${event.tag || '未知'} - ${event.description || ''}`;
    case 'action_queued': return `入队: ${getActionKindLabel(event.action_kind)}`;
    case 'action_executed': return `执行: ${getActionKindLabel(event.action_kind)}`;
    case 'action_start': return `开始: ${getActionSigLabel(event.action_sig)}`;
    case 'action_end': return `结束: ${getActionSigLabel(event.action_sig)}`;
    case 'action_success': return `成功: ${getActionSigLabel(event.action_sig)}`;
    case 'action_failed': return `失败: ${getActionSigLabel(event.action_sig)} ${event.error || ''}`;
    case 'action_removed': return '动作已移除（上下文变化）';
    case 'action_skipped': return `跳过: ${getSkipReasonLabel(event.reason)}${event.error ? ' - ' + event.error : ''}`;
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

const getSkipReasonLabel = (reason?: string): string => {
  switch (reason) {
    case 'tag_not_allowed': return '标签不在允许列表';
    case 'validation_failed': return '验证未通过';
    case 'no_actions': return '无需执行动作';
    case 'cooldown': return '冷却期内';
    default: return reason || '';
  }
};

const getEventColor = (event: WorkflowEvent): string => {
  switch (event.event_type) {
    case 'context_changed': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'state_analyzed': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'action_queued': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'action_executed': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'action_start': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    case 'action_end': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    case 'action_success': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'action_failed': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'action_removed': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    case 'action_skipped': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    default: return 'bg-gray-700/50 text-gray-400 border-gray-600/30';
  }
};

const getEventIcon = (event: WorkflowEvent): string => {
  switch (event.event_type) {
    case 'context_changed': return '🔄';
    case 'state_analyzed': return '📋';
    case 'action_queued': return '📥';
    case 'action_executed': return '⚡';
    case 'action_start': return '▶️';
    case 'action_end': return '⏹️';
    case 'action_success': return '✅';
    case 'action_failed': return '❌';
    case 'action_removed': return '🗑️';
    case 'action_skipped': return '⏭️';
    default: return '•';
  }
};

export const AutoActionLogs: React.FC<AutoActionLogsProps> = ({ sessionId, compact = false, onClose }) => {
  const { t } = useI18n();
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [showCount, setShowCount] = useState(compact ? 20 : 50);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Real-time events from store
  const storeEvents = useAIStore((s) => s.workflowEvents);
  const clearWorkflowEvents = useAIStore((s) => s.clearWorkflowEvents);

  // Combine store events with loaded events
  const realtimeEvents = sessionId
    ? (storeEvents[sessionId] || [])
    : Object.values(storeEvents).flat();

  // Merge and dedupe events
  const allEvents = React.useMemo(() => {
    const combined = [...events, ...realtimeEvents];
    const seen = new Set<string>();
    return combined
      .filter(e => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .sort((a, b) => b.seq - a.seq); // newest first (by sequence number)
  }, [events, realtimeEvents]);

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
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">
          {t('workflow_events_title') || '工作流事件'}
          {allEvents.length > 0 && <span className="ml-2 text-gray-500">({allEvents.length})</span>}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={loadEvents}
            disabled={loading}
            className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
          >
            {loading ? '...' : (t('auto_logs_refresh') || '刷新')}
          </button>
          <button
            onClick={handleClear}
            className="px-2 py-1 text-xs text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
          >
            {t('auto_logs_clear') || '清除'}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Events Timeline */}
      {displayed.length === 0 ? (
        <div className="text-center text-sm text-gray-500 py-8">
          {t('workflow_events_empty') || '暂无工作流事件'}
        </div>
      ) : (
        <div className={`space-y-1 overflow-y-auto ${compact ? 'max-h-[400px]' : 'max-h-[500px]'}`}>
          {displayed.map((event) => (
            <div key={event.id} className="text-xs">
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expandedId === event.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-colors ${getEventColor(event)} hover:opacity-80`}
                onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedId(expandedId === event.id ? null : event.id);
                  }
                }}
              >
                <span className="flex-shrink-0">{getEventIcon(event)}</span>
                <span className="text-gray-500 w-16 flex-shrink-0">{formatTime(event.timestamp_ms)}</span>
                <span className="flex-1 truncate">{getEventLabel(event)}</span>
                <svg
                  className={`w-3 h-3 opacity-50 transition-transform ${expandedId === event.id ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Expanded Details */}
              {expandedId === event.id && (
                <div className="ml-6 mt-1 px-3 py-2 bg-gray-800/50 rounded text-gray-400 space-y-1 border-l-2 border-gray-700">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-gray-500">事件类型:</span>
                      <span className="ml-1 text-purple-400">{event.event_type}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">时间戳:</span>
                      <span className="ml-1">{formatDate(event.timestamp_ms)}</span>
                    </div>
                  </div>

                  {event.tag && (
                    <div className="text-[11px]">
                      <span className="text-gray-500">状态标签:</span>
                      <span className="ml-1 text-cyan-400">{event.tag}</span>
                    </div>
                  )}

                  {event.description && (
                    <div className="text-[11px]">
                      <span className="text-gray-500">描述:</span>
                      <span className="ml-1">{event.description}</span>
                    </div>
                  )}

                  {event.duration_ms !== undefined && (
                    <div className="text-[11px]">
                      <span className="text-gray-500">耗时:</span>
                      <span className="ml-1 text-yellow-400">{event.duration_ms}ms</span>
                    </div>
                  )}

                  {event.action_sig && (
                    <div className="text-[11px]">
                      <span className="text-gray-500">动作签名:</span>
                      <span className="ml-1 font-mono text-orange-400">{event.action_sig}</span>
                    </div>
                  )}

                  {event.action_kind && (
                    <div className="text-[11px]">
                      <span className="text-gray-500">动作类型:</span>
                      <span className="ml-1 text-cyan-400">{event.action_kind}</span>
                    </div>
                  )}

                  {event.error && (
                    <div className="text-[11px] text-red-400">
                      <span className="text-gray-500">错误:</span>
                      <span className="ml-1">{event.error}</span>
                    </div>
                  )}

                  <div className="text-[10px] text-gray-600 pt-1">
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
          className="w-full text-xs text-gray-500 hover:text-gray-300 py-1"
        >
          {t('auto_logs_show_more') || '显示更多'}
        </button>
      )}
    </div>
  );
};
