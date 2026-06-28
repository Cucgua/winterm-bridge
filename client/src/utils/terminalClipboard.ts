export interface ClipboardItemLike {
  readonly types: readonly string[];
  getType(type: string): Promise<Blob>;
}

export type TerminalClipboardPayload =
  | { kind: 'text'; text: string }
  | { kind: 'image'; blob: Blob };

export function stripSingleTrailingNewline(text: string): string {
  return text.replace(/\r?\n$/, '');
}

export async function readTerminalClipboardPayload(
  items: readonly ClipboardItemLike[],
  readText: () => Promise<string>,
): Promise<TerminalClipboardPayload | null> {
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'));
    if (imageType) {
      return { kind: 'image', blob: await item.getType(imageType) };
    }
  }

  const textItem = items.find((item) => item.types.includes('text/plain'));
  if (textItem) {
    const blob = await textItem.getType('text/plain');
    const text = stripSingleTrailingNewline(await blob.text());
    return text ? { kind: 'text', text } : null;
  }

  const fallbackText = stripSingleTrailingNewline(await readText());
  return fallbackText ? { kind: 'text', text: fallbackText } : null;
}

export function readPasteEventPayload(event: ClipboardEvent): TerminalClipboardPayload | null {
  const text = stripSingleTrailingNewline(event.clipboardData?.getData('text/plain') ?? '');
  if (text) {
    return { kind: 'text', text };
  }

  const items = Array.from(event.clipboardData?.items ?? []);
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        return { kind: 'image', blob: file };
      }
    }
  }

  return null;
}
