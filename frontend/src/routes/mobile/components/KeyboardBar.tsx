import { useState } from 'react';
import { useKeyboardStore, KeyState } from '../../../shared/stores/keyboardStore';
import { KeyboardPanel } from './KeyboardPanel';

interface KeyboardBarProps {
  onSendKey: (key: string) => void;
  isInputActive: boolean;
  onInputToggle: () => void;
}

function ModifierButton({
  label,
  state,
  onClick,
}: {
  label: string;
  state: KeyState;
  onClick: () => void;
}) {
  const stateStyles = {
    idle: 'bg-gray-800',
    latched: 'bg-gray-800 ring-2 ring-blue-500',
    locked: 'bg-blue-600',
  };

  return (
    <button
      onClick={onClick}
      className={`text-gray-300 text-xs px-2 py-2 rounded active:bg-gray-700 min-w-[44px] min-h-[44px] transition-all duration-150 ${stateStyles[state]}`}
    >
      {label}
    </button>
  );
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
      className={`text-gray-300 text-xs px-2 py-2 bg-gray-800 rounded active:bg-gray-700 min-w-[44px] min-h-[44px] transition-colors ${className}`}
    >
      {label}
    </button>
  );
}

export function KeyboardBar({ onSendKey, isInputActive, onInputToggle }: KeyboardBarProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const { modifiers, toggleModifier } = useKeyboardStore();

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
        className="flex items-center justify-around bg-gray-900 shrink-0 px-1 py-1"
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
          {isInputActive ? 'HIDE' : 'INPUT'}
        </button>

        {/* Modifier keys */}
        <ModifierButton
          label="CTRL"
          state={modifiers.ctrl}
          onClick={() => toggleModifier('ctrl')}
        />
        <ModifierButton
          label="ALT"
          state={modifiers.alt}
          onClick={() => toggleModifier('alt')}
        />

        {/* Quick keys */}
        <KeyButton label="ESC" onClick={() => handleKey('\x1b')} />
        <KeyButton label="TAB" onClick={() => handleKey('\t')} />
        <KeyButton label="↑" onClick={() => handleKey('\x1b[A')} />
        <KeyButton label="↓" onClick={() => handleKey('\x1b[B')} />

        {/* Expand button */}
        <button
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          className="text-gray-300 text-xs px-2 py-2 bg-gray-800 rounded active:bg-gray-700 min-w-[44px] min-h-[44px] transition-colors"
        >
          {isPanelOpen ? '▲' : '▼'}
        </button>
      </div>
    </>
  );
}
