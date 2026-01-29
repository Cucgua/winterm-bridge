interface KeyboardPanelProps {
  isOpen: boolean;
  onSendKey: (key: string) => void;
}

function PanelButton({
  label,
  onPress,
  wide = false,
  highlight = false,
}: {
  label: string;
  onPress: () => void;
  wide?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onPress}
      className={`text-xs py-2 rounded active:bg-gray-700 min-h-[40px] transition-colors ${
        wide ? 'px-3' : 'px-2 min-w-[40px]'
      } ${highlight ? 'bg-gray-700 text-yellow-400' : 'bg-gray-800 text-gray-300'}`}
    >
      {label}
    </button>
  );
}

export function KeyboardPanel({ isOpen, onSendKey }: KeyboardPanelProps) {
  if (!isOpen) return null;

  // Ctrl combinations (send control character)
  const ctrlKeys = [
    { label: '^C', code: '\x03', desc: 'Interrupt' },
    { label: '^D', code: '\x04', desc: 'EOF' },
    { label: '^Z', code: '\x1a', desc: 'Suspend' },
    { label: '^L', code: '\x0c', desc: 'Clear' },
    { label: '^A', code: '\x01', desc: 'Home' },
    { label: '^E', code: '\x05', desc: 'End' },
    { label: '^U', code: '\x15', desc: 'Kill line' },
    { label: '^K', code: '\x0b', desc: 'Kill to end' },
    { label: '^W', code: '\x17', desc: 'Kill word' },
    { label: '^R', code: '\x12', desc: 'Search' },
    { label: '^P', code: '\x10', desc: 'Prev' },
    { label: '^N', code: '\x0e', desc: 'Next' },
  ];

  const functionKeys = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
  const functionKeyCodes: Record<string, string> = {
    F1: '\x1bOP', F2: '\x1bOQ', F3: '\x1bOR', F4: '\x1bOS',
    F5: '\x1b[15~', F6: '\x1b[17~', F7: '\x1b[18~', F8: '\x1b[19~',
    F9: '\x1b[20~', F10: '\x1b[21~', F11: '\x1b[23~', F12: '\x1b[24~',
  };

  const navKeys = [
    { label: 'HOME', code: '\x1b[H' },
    { label: 'END', code: '\x1b[F' },
    { label: 'PGUP', code: '\x1b[5~' },
    { label: 'PGDN', code: '\x1b[6~' },
    { label: 'INS', code: '\x1b[2~' },
    { label: 'DEL', code: '\x1b[3~' },
  ];

  return (
    <div className="bg-gray-900 border-t border-gray-800 p-2 space-y-3 animate-in slide-in-from-bottom duration-200">
      {/* Ctrl combinations - most used */}
      <div>
        <div className="text-gray-500 text-xs mb-1 px-1">Ctrl 组合键</div>
        <div className="flex flex-wrap gap-1">
          {ctrlKeys.map((key) => (
            <PanelButton
              key={key.label}
              label={key.label}
              onPress={() => onSendKey(key.code)}
              highlight
            />
          ))}
        </div>
      </div>

      {/* Direction keys */}
      <div>
        <div className="text-gray-500 text-xs mb-1 px-1">方向键</div>
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
      </div>

      {/* Navigation keys */}
      <div>
        <div className="text-gray-500 text-xs mb-1 px-1">导航键</div>
        <div className="flex flex-wrap gap-1">
          {navKeys.map((key) => (
            <PanelButton
              key={key.label}
              label={key.label}
              onPress={() => onSendKey(key.code)}
              wide
            />
          ))}
        </div>
      </div>

      {/* Function keys */}
      <div>
        <div className="text-gray-500 text-xs mb-1 px-1">功能键</div>
        <div className="flex flex-wrap gap-1">
          {functionKeys.map((key) => (
            <PanelButton
              key={key}
              label={key}
              onPress={() => onSendKey(functionKeyCodes[key])}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
