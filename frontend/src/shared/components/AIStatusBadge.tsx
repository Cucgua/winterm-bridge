import React from 'react';
import { useAIStore } from '../stores/aiStore';

interface AIStatusBadgeProps {
  sessionId: string;
}

// Map tag to color and icon
const TAG_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  '完毕': { bg: 'bg-green-500/20', text: 'text-green-400', icon: '✓' },
  '进行': { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: '⟳' },
  '需输入': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: '⌨' },
  '需选择': { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: '?' },
  '错误': { bg: 'bg-red-500/20', text: 'text-red-400', icon: '✗' },
  '等待': { bg: 'bg-purple-500/20', text: 'text-purple-400', icon: '◌' },
};

const DEFAULT_STYLE = { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: '●' };

// Export for use in collapsed sidebar dot colors
const TAG_DOT_COLORS: Record<string, string> = {
  '完毕': 'bg-green-400',
  '进行': 'bg-blue-400',
  '需输入': 'bg-yellow-400',
  '需选择': 'bg-orange-400',
  '错误': 'bg-red-400',
  '等待': 'bg-purple-400',
};

export function getTagDotColor(tag: string): string {
  return TAG_DOT_COLORS[tag] || 'bg-gray-400';
}

export const AIStatusBadge: React.FC<AIStatusBadgeProps> = ({ sessionId }) => {
  const summary = useAIStore((state) => state.summaries[sessionId]);

  if (!summary) return null;

  const style = TAG_STYLES[summary.tag] || DEFAULT_STYLE;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${style.bg} border border-current/10 transition-all`}>
      <span className={`text-sm ${style.text}`}>{style.icon}</span>
      <span className={`text-xs font-medium ${style.text}`}>{summary.tag}</span>
      <span className="text-xs text-gray-400 max-w-[200px] truncate">{summary.description}</span>
    </div>
  );
};

// Compact inline indicator for sidebar
interface AIStatusIndicatorProps {
  sessionId: string;
}

export const AIStatusIndicator: React.FC<AIStatusIndicatorProps> = ({ sessionId }) => {
  const summary = useAIStore((state) => state.summaries[sessionId]);

  if (!summary) return null;

  const style = TAG_STYLES[summary.tag] || DEFAULT_STYLE;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${style.bg} ${style.text}`}
      title={`${summary.tag}: ${summary.description}`}
    >
      <span>{style.icon}</span>
      <span className="font-medium">{summary.tag}</span>
    </span>
  );
};

// Simplified tag-only component for session picker (inline with session name)
interface AIStatusTagProps {
  tag: string;
  description?: string;
}

export const AIStatusTag: React.FC<AIStatusTagProps> = ({ tag, description }) => {
  const style = TAG_STYLES[tag] || DEFAULT_STYLE;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${style.bg} ${style.text}`}
      title={description}
    >
      <span>{style.icon}</span>
      <span className="font-medium">{tag}</span>
    </span>
  );
};

// Full status display for terminal header
interface AIStatusDisplayProps {
  sessionId: string;
  className?: string;
}

export const AIStatusDisplay: React.FC<AIStatusDisplayProps> = ({ sessionId, className = '' }) => {
  const summary = useAIStore((state) => state.summaries[sessionId]);

  if (!summary) return null;

  const style = TAG_STYLES[summary.tag] || DEFAULT_STYLE;
  const timeAgo = formatTimeAgo(summary.timestamp);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${style.bg}`}>
        <span className={`text-sm ${style.text}`}>{style.icon}</span>
        <span className={`text-xs font-semibold ${style.text}`}>{summary.tag}</span>
      </div>
      <span className="text-xs text-gray-400 flex-1 truncate">{summary.description}</span>
      <span className="text-xs text-gray-500">{timeAgo}</span>
    </div>
  );
};

function formatTimeAgo(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
