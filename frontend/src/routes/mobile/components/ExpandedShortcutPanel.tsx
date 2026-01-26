import React from 'react';
import { clsx } from 'clsx';

interface ShortcutKey {
  label: string;
  sequence: string;
  description?: string;
}

interface ShortcutGroup {
  title: string;
  keys: ShortcutKey[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Direction Keys',
    keys: [
      { label: '←', sequence: '\x1b[D', description: 'Left' },
      { label: '↑', sequence: '\x1b[A', description: 'Up' },
      { label: '↓', sequence: '\x1b[B', description: 'Down' },
      { label: '→', sequence: '\x1b[C', description: 'Right' },
    ],
  },
  {
    title: 'Common Shortcuts',
    keys: [
      { label: 'Ctrl+C', sequence: '\x03', description: 'Interrupt' },
      { label: 'Ctrl+D', sequence: '\x04', description: 'EOF' },
      { label: 'Ctrl+Z', sequence: '\x1a', description: 'Suspend' },
      { label: 'Ctrl+L', sequence: '\x0c', description: 'Clear' },
      { label: 'Ctrl+R', sequence: '\x12', description: 'Search' },
      { label: 'Ctrl+A', sequence: '\x01', description: 'Start' },
      { label: 'Ctrl+E', sequence: '\x05', description: 'End' },
      { label: 'Ctrl+U', sequence: '\x15', description: 'Clear line' },
    ],
  },
  {
    title: 'Function Keys',
    keys: [
      { label: 'F1', sequence: '\x1bOP' },
      { label: 'F2', sequence: '\x1bOQ' },
      { label: 'F3', sequence: '\x1bOR' },
      { label: 'F4', sequence: '\x1bOS' },
      { label: 'F5', sequence: '\x1b[15~' },
      { label: 'F6', sequence: '\x1b[17~' },
      { label: 'F7', sequence: '\x1b[18~' },
      { label: 'F8', sequence: '\x1b[19~' },
      { label: 'F9', sequence: '\x1b[20~' },
      { label: 'F10', sequence: '\x1b[21~' },
      { label: 'F11', sequence: '\x1b[23~' },
      { label: 'F12', sequence: '\x1b[24~' },
    ],
  },
  {
    title: 'Special Keys',
    keys: [
      { label: 'Home', sequence: '\x1b[H', description: 'Home' },
      { label: 'End', sequence: '\x1b[F', description: 'End' },
      { label: 'PgUp', sequence: '\x1b[5~', description: 'Page Up' },
      { label: 'PgDn', sequence: '\x1b[6~', description: 'Page Down' },
      { label: 'Ins', sequence: '\x1b[2~', description: 'Insert' },
      { label: 'Del', sequence: '\x1b[3~', description: 'Delete' },
    ],
  },
];

interface ExpandedShortcutPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSendKey: (key: string) => void;
}

export const ExpandedShortcutPanel: React.FC<ExpandedShortcutPanelProps> = ({
  isOpen,
  onClose,
  onSendKey,
}) => {
  const handleKeyPress = (sequence: string) => {
    onSendKey(sequence);
    // Optional: provide haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 bg-black/50 z-40',
          'transition-opacity duration-200',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={clsx(
          'fixed left-0 right-0 bottom-0 z-50',
          'bg-gray-900 border-t border-gray-700',
          'rounded-t-2xl',
          'max-h-[60vh] overflow-y-auto',
          'transition-transform duration-200 ease-out',
          isOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none'  // 关闭时禁用事件拦截
        )}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
          <h2 className="text-sm font-bold text-gray-300">Extended Keys</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Shortcut Groups */}
        <div className="p-4 space-y-4 pb-safe">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                {group.title}
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {group.keys.map((key) => (
                  <button
                    key={key.label}
                    onClick={() => handleKeyPress(key.sequence)}
                    className={clsx(
                      'px-2 py-3 rounded-lg',
                      'bg-gray-800 hover:bg-gray-700 active:bg-green-600',
                      'text-gray-300 active:text-white',
                      'text-xs font-mono font-bold',
                      'transition-colors duration-100',
                      'min-h-[44px]',
                      'select-none'
                    )}
                    title={key.description}
                    aria-label={key.description || key.label}
                  >
                    {key.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
