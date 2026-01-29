import { useState } from 'react';
import { KeyboardPanel } from './KeyboardPanel';

interface KeyboardBarProps {
  onSendKey: (key: string) => void;
  isInputActive: boolean;
  onInputToggle: () => void;
}

function KeyButton({
  label,
  onClick,
  className = '',
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-gray-300 text-xs px-2 py-2 bg-gray-800 rounded active:bg-gray-700 min-w-[40px] min-h-[44px] transition-colors ${className}`}
    >
      {label}
    </button>
  );
}

export function KeyboardBar({ onSendKey, isInputActive, onInputToggle }: KeyboardBarProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const handleKey = (key: string) => {
    onSendKey(key);
  };

  return (
    <>
      {/* Expanded panel */}
      <KeyboardPanel
        isOpen={isPanelOpen}
        onSendKey={handleKey}
      />

      {/* Main bar */}
      <div
        className="flex items-center justify-around bg-gray-900 shrink-0 px-1 py-1 gap-1"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* INPUT button */}
        <button
          onClick={onInputToggle}
          className={`text-xs px-2 py-2 rounded min-w-[44px] min-h-[44px] transition-colors ${
            isInputActive
              ? 'bg-green-600 text-white'
              : 'bg-gray-800 text-gray-300 active:bg-gray-700'
          }`}
        >
          INPUT
        </button>

        {/* Essential quick keys */}
        <KeyButton label="ESC" onClick={() => handleKey('\x1b')} />
        <KeyButton label="TAB" onClick={() => handleKey('\t')} />
        <KeyButton label="↑" onClick={() => handleKey('\x1b[A')} />
        <KeyButton label="↓" onClick={() => handleKey('\x1b[B')} />
        <KeyButton label="⏎" onClick={() => handleKey('\r')} />

        {/* Expand button */}
        <button
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          className="text-gray-300 text-xs px-2 py-2 bg-gray-800 rounded active:bg-gray-700 min-w-[40px] min-h-[44px] transition-colors"
        >
          {isPanelOpen ? '▼' : '•••'}
        </button>
      </div>
    </>
  );
}
