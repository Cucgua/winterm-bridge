import { readTerminalClipboardPayload, type ClipboardItemLike } from './terminalClipboard.js';

declare const process: { exitCode?: number };

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function run(): Promise<void> {
  const textItem: ClipboardItemLike = {
    types: ['text/plain'],
    getType: async (type) => {
      assertEqual(type, 'text/plain', 'text clipboard item should request text/plain');
      return new Blob(['hello terminal\n'], { type: 'text/plain' });
    },
  };

  const payload = await readTerminalClipboardPayload([textItem], async () => {
    throw new Error('readText fallback should not be used when text/plain item exists');
  });

  if (payload?.kind !== 'text') {
    throw new Error('text/plain clipboard should produce a text payload');
  }
  assertEqual(payload.text, 'hello terminal', 'text payload should strip one trailing newline');
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
