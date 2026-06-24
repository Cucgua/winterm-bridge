import { mapBrowserReservedTerminalShortcut } from './terminalKeys';

function assertEqual(actual: string | null, expected: string | null) {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function run() {
  assertEqual(
    mapBrowserReservedTerminalShortcut({ key: 'ArrowLeft', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, false),
    '\x1b[1;5D',
  );
  assertEqual(
    mapBrowserReservedTerminalShortcut({ key: 'ArrowRight', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, false),
    '\x1b[1;5C',
  );
  assertEqual(
    mapBrowserReservedTerminalShortcut({ key: 'ArrowLeft', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, true),
    '\x1bb',
  );
  assertEqual(
    mapBrowserReservedTerminalShortcut({ key: 'ArrowRight', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, true),
    '\x1bf',
  );
  assertEqual(
    mapBrowserReservedTerminalShortcut({ key: 'ArrowLeft', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }, false),
    null,
  );
  assertEqual(
    mapBrowserReservedTerminalShortcut({ key: 'ArrowUp', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, false),
    null,
  );
}

run();
