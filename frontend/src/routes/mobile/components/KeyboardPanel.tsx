interface KeyboardPanelProps {
  isOpen: boolean;
  onSendKey: (key: string) => void;
}

function PanelButton({
  label,
  onPress,
  wide = false,
}: {
  label: string;
  onPress: () => void;
  wide?: boolean;
}) {
  return (
    <button
      onClick={onPress}
      className={`text-gray-300 text-xs py-2 bg-gray-800 rounded active:bg-gray-700 min-h-[40px] transition-colors ${
        wide ? 'px-4' : 'px-2 min-w-[40px]'
      }`}
    >
      {label}
    </button>
  );
}

export function KeyboardPanel({ isOpen, onSendKey }: KeyboardPanelProps) {
  if (!isOpen) return null;

  const functionKeys = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'];
  const functionKeyCodes: Record<string, string> = {
    F1: '\x1bOP', F2: '\x1bOQ', F3: '\x1bOR', F4: '\x1bOS',
    F5: '\x1b[15~', F6: '\x1b[17~', F7: '\x1b[18~', F8: '\x1b[19~',
    F9: '\x1b[20~', F10: '\x1b[21~',
  };

  const specialKeys = [
    { label: 'HOME', code: '\x1b[H' },
    { label: 'END', code: '\x1b[F' },
    { label: 'PGUP', code: '\x1b[5~' },
    { label: 'PGDN', code: '\x1b[6~' },
    { label: 'INS', code: '\x1b[2~' },
    { label: 'DEL', code: '\x1b[3~' },
  ];

  return (
    <div className="bg-gray-900 border-t border-gray-800 p-2 space-y-2 animate-in slide-in-from-bottom duration-200">
      {/* Direction keys */}
      <div className="flex justify-center gap-1">
        <div className="grid grid-cols-3 gap-1">
          <div />
          <PanelButton label="↑" onPress={() => onSendKey('\x1b[A')} />
          <div />
          <PanelButton label="←" onPress={() => onSendKey('\x1b[D')} />
          <PanelButton label="↓" onPress={() => onSendKey('\x1b[B')} />
          <PanelButton label="→" onPress={() => onSendKey('\x1b[C')} />
        </div>
      </div>

      {/* Function keys */}
      <div className="flex flex-wrap justify-center gap-1">
        {functionKeys.map((key) => (
          <PanelButton
            key={key}
            label={key}
            onPress={() => onSendKey(functionKeyCodes[key])}
          />
        ))}
      </div>

      {/* Special keys */}
      <div className="flex flex-wrap justify-center gap-1">
        {specialKeys.map((key) => (
          <PanelButton
            key={key.label}
            label={key.label}
            onPress={() => onSendKey(key.code)}
            wide
          />
        ))}
      </div>
    </div>
  );
}
