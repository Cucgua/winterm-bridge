import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ReactNode } from 'react';

type WindowAction = 'minimize' | 'maximize' | 'close';

async function runWindowAction(action: WindowAction) {
  const appWindow = getCurrentWindow();

  if (action === 'minimize') {
    return appWindow.minimize();
  }

  if (action === 'maximize') {
    return appWindow.toggleMaximize();
  }

  return appWindow.close();
}

function WindowButton({ title, action, danger, children }: {
  title: string;
  action: WindowAction;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-text-secondary/55 transition-colors ${
        danger
          ? 'hover:border-error/30 hover:bg-error/15 hover:text-error'
          : 'hover:border-white/10 hover:bg-white/[0.08] hover:text-text-primary/95'
      }`}
      title={title}
      onClick={() => { void runWindowAction(action).catch(() => undefined); }}
    >
      {children}
    </button>
  );
}

export function WindowDragRegion({ className = '' }: { className?: string }) {
  return (
    <div
      data-tauri-drag-region
      className={`min-w-6 flex-1 self-stretch ${className}`}
      onDoubleClick={() => { void runWindowAction('maximize').catch(() => undefined); }}
    />
  );
}

export function WindowControls() {
  return (
    <div className="flex flex-shrink-0 items-center gap-1">
      <WindowButton title="Minimize window" action="minimize">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18h12" />
        </svg>
      </WindowButton>
      <WindowButton title="Maximize window" action="maximize">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
      </WindowButton>
      <WindowButton title="Close window" action="close" danger>
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </WindowButton>
    </div>
  );
}
