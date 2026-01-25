import React from 'react';
import { useKeyboardStore, ModifierKey, KeyState } from '../../../shared/stores/keyboardStore';
import { clsx } from 'clsx';

interface ModifierButtonProps {
  label: string;
  modKey: ModifierKey;
  state: KeyState;
  onClick: () => void;
}

const ModifierButton: React.FC<ModifierButtonProps> = ({ label, state, onClick }) => {
  const getAriaLabel = () => {
    switch (state) {
      case 'latched':
        return `${label} (Active)`;
      case 'locked':
        return `${label} (Locked)`;
      default:
        return label;
    }
  };

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      aria-label={getAriaLabel()}
      aria-pressed={state !== 'idle'}
      className={clsx(
        'flex-1 px-2 py-3 text-sm font-mono font-bold transition-colors select-none min-h-[44px]',
        state === 'idle' && 'bg-gray-800 text-gray-400 active:bg-gray-700',
        state === 'latched' && 'bg-green-700 text-white',
        state === 'locked' && 'bg-green-600 text-white border-b-2 border-white'
      )}
    >
      {label}
    </button>
  );
};

interface ActionButtonProps {
  label: string;
  onClick: () => void;
}

const ActionButton: React.FC<ActionButtonProps> = ({ label, onClick }) => (
  <button
    onClick={(e) => {
      e.preventDefault();
      onClick();
    }}
    className="flex-1 px-2 py-3 text-sm font-mono font-bold bg-gray-800 text-gray-300 active:bg-gray-700 border-l border-gray-700 min-h-[44px]"
  >
    {label}
  </button>
);

// 分隔线组件
const Separator: React.FC = () => (
  <div className="w-px h-6 bg-gray-600 mx-1 self-center" />
);

interface VirtualKeyboardAccessoryProps {
  onSendKey: (key: string) => void;
  onScrollPage?: (direction: 'up' | 'down') => void;
}

export const VirtualKeyboardAccessory: React.FC<VirtualKeyboardAccessoryProps> = ({
  onSendKey,
  onScrollPage,
}) => {
  const { modifiers, toggleModifier } = useKeyboardStore();

  return (
    <div className="flex w-full overflow-x-auto bg-gray-900 border-t border-gray-700 pb-safe shrink-0">
      <ModifierButton
        label="CTRL"
        modKey="ctrl"
        state={modifiers.ctrl}
        onClick={() => toggleModifier('ctrl')}
      />
      <ModifierButton
        label="ALT"
        modKey="alt"
        state={modifiers.alt}
        onClick={() => toggleModifier('alt')}
      />
      <ModifierButton
        label="SHIFT"
        modKey="shift"
        state={modifiers.shift}
        onClick={() => toggleModifier('shift')}
      />
      <Separator />
      <ActionButton label="TAB" onClick={() => onSendKey('\t')} />
      <ActionButton label="ESC" onClick={() => onSendKey('\x1b')} />
      <Separator />
      <ActionButton label="▲" onClick={() => onSendKey('\x1b[A')} />
      <ActionButton label="▼" onClick={() => onSendKey('\x1b[B')} />
      <Separator />
      <ActionButton label="PgUp" onClick={() => onScrollPage?.('up')} />
      <ActionButton label="PgDn" onClick={() => onScrollPage?.('down')} />
    </div>
  );
};
