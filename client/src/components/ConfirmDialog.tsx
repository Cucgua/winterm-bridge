import { CloseIcon } from './ToolIcons';

export interface ConfirmDialogRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
}

interface Props extends ConfirmDialogRequest {
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onCancel,
}: Props) {
  const isDanger = tone === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/75 p-4 backdrop-blur-sm"
      onClick={event => {
        event.stopPropagation();
        onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-theme-border/10 bg-surface-elevated p-6 shadow-2xl"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="text-base font-bold text-text-primary/95">
              {title}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-text-secondary/70">
              {message}
            </p>
          </div>
          <button
            type="button"
            title={cancelLabel}
            onClick={onCancel}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-text-tertiary/50 transition-colors hover:bg-surface-highlight/55 hover:text-text-primary/95"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="h-10 rounded-xl border border-theme-border/10 bg-surface-highlight/25 px-4 text-sm font-semibold text-text-secondary/75 transition-colors hover:bg-surface-highlight/45 hover:text-text-primary/95"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`h-10 rounded-xl px-4 text-sm font-semibold transition-opacity hover:opacity-90 ${
              isDanger
                ? 'bg-error text-accent-foreground'
                : 'bg-accent text-accent-foreground'
            }`}
            onClick={() => {
              onCancel();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
