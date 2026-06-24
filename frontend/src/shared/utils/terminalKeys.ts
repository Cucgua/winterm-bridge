interface TerminalShortcutEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export function mapBrowserReservedTerminalShortcut(event: TerminalShortcutEvent, isMac: boolean): string | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }

  if (event.key === 'ArrowLeft') {
    return isMac ? '\x1bb' : '\x1b[1;5D';
  }
  if (event.key === 'ArrowRight') {
    return isMac ? '\x1bf' : '\x1b[1;5C';
  }
  return null;
}
