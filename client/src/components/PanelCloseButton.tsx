import { CloseIcon } from './ToolIcons';
import { useI18n } from '../i18n/i18nStore';

/**
 * Shared close button used in the header of every overlay panel drawer
 * (Files/AI/Trellis/IDE). Ensures a consistent, always-reachable way to close
 * the drawer even if the toolbar toggle that opened it becomes obscured.
 */
export function PanelCloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      title={t('close')}
      onClick={onClose}
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-theme-border/10 bg-surface-highlight/25 text-text-secondary/70 transition-colors hover:bg-error/15 hover:text-error"
    >
      <CloseIcon className="h-4 w-4" />
    </button>
  );
}
