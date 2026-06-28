import { useI18n } from '../i18n/i18nStore';
import { getStatusDotColor, getStatusTextColor, hasAiTagColor } from '../utils/statusColor';
import { CloseIcon } from './ToolIcons';

export interface SessionAttentionToast {
  id: string;
  sessionId: string;
  title: string;
  tag: string;
  description: string;
  timestamp: number;
}

interface Props {
  items: SessionAttentionToast[];
  onOpenSession: (sessionId: string) => void;
  onDismiss: (id: string) => void;
}

export function SessionAttentionToasts({ items, onOpenSession, onDismiss }: Props) {
  const { t } = useI18n();

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed left-5 top-[84px] z-40 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map(item => {
        const tagTone = hasAiTagColor(item.tag)
          ? getStatusTextColor({ kind: 'ai', tag: item.tag })
          : 'text-text-secondary';
        const dotTone = hasAiTagColor(item.tag)
          ? getStatusDotColor({ kind: 'ai', tag: item.tag })
          : 'bg-text-secondary';

        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            className="pointer-events-auto rounded-2xl border border-theme-border/10 bg-surface-elevated p-3 text-left shadow-2xl outline-none transition-colors hover:border-theme-border/20 hover:bg-surface-highlight focus:border-accent/80"
            onClick={() => onOpenSession(item.sessionId)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenSession(item.sessionId);
              }
            }}
          >
            <div className="flex items-start gap-3">
              <span className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${dotTone}`} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-bold text-text-primary/95" title={item.title}>
                    {item.title}
                  </span>
                  <span className={`flex-shrink-0 rounded-md bg-surface-highlight/45 px-1.5 py-0.5 text-[11px] font-semibold ${tagTone}`}>
                    {item.tag}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary/70" title={item.description}>
                  {item.description || t('notification_session_attention')}
                </p>
                <p className="mt-2 text-[11px] font-semibold text-accent/90">
                  {t('notification_open_session')}
                </p>
              </div>
              <button
                type="button"
                title={t('notification_dismiss')}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-text-tertiary/45 transition-colors hover:bg-surface-highlight/55 hover:text-text-primary/95"
                onClick={event => {
                  event.stopPropagation();
                  onDismiss(item.id);
                }}
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
