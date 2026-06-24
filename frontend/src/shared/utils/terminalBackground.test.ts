import {
  DEFAULT_TERMINAL_BACKGROUND,
  getEffectiveTerminalBackground,
  normalizeTerminalBackground,
} from './terminalBackground';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function run() {
  assertDeepEqual(
    normalizeTerminalBackground({ ...DEFAULT_TERMINAL_BACKGROUND }),
    DEFAULT_TERMINAL_BACKGROUND,
    'keeps default background unchanged',
  );

  assertDeepEqual(
    normalizeTerminalBackground({
      enabled: true,
      imageUrl: '   https://example.com/bg.png   ',
      opacity: 1.4,
      overlayOpacity: -0.2,
    }),
    {
      enabled: true,
      imageUrl: 'https://example.com/bg.png',
      opacity: 1,
      overlayOpacity: 0,
    },
    'trims URL and clamps numeric settings',
  );

  assertEqual(
    getEffectiveTerminalBackground({
      enabled: true,
      imageUrl: '',
      opacity: 0.8,
      overlayOpacity: 0.5,
    }),
    null,
    'requires image URL',
  );

  assertEqual(
    getEffectiveTerminalBackground({
      enabled: false,
      imageUrl: 'https://example.com/bg.png',
      opacity: 0.8,
      overlayOpacity: 0.5,
    }),
    null,
    'requires enabled flag',
  );
}

run();
