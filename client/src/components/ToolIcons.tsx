import { type ReactNode } from 'react';

/**
 * Shared SVG line-icon set for the terminal tool panels.
 *
 * Why this exists: the redesigned Files / AI / Trellis / IDE panels and the
 * SaveProject dialog all need the same small set of consistent line icons
 * (refresh, folder, file, close, save, copy, delete, ...). Previously each
 * panel inlined its own emoji (📁 ✕ ↻ ×) or bespoke SVG. Centralising them
 * here keeps the visual language uniform and matches the SessionSelectPage /
 * SettingsDialog art direction (pure stroke icons, no fill, 2px weight).
 *
 * Usage: `<RefreshIcon className="h-4 w-4" />` — color inherits `currentColor`.
 */

type IconProps = { className?: string };

function Svg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// === Navigation / actions ===

export function RefreshIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0011.5 2.7M19 9A7 7 0 007.5 6.3" />
    </Svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </Svg>
  );
}

export function SaveIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h9l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v5h7V3M8 21v-7h8v7" />
    </Svg>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15V5a2 2 0 012-2h8" />
    </Svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5h6v2m-5 3v6m4-6v6M8 7l1 12h6l1-12" />
    </Svg>
  );
}

export function ChevronUpIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </Svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </Svg>
  );
}

export function ExternalLinkIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-9 9M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5" />
    </Svg>
  );
}

// === File / folder types ===

export function FolderIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </Svg>
  );
}

export function FolderOpenIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v1H3V7z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h19l-3 7a2 2 0 01-2 1H5a2 2 0 01-2-2v-6z" />
    </Svg>
  );
}

export function FileIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
    </Svg>
  );
}

export function FileCodeIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 13l-2 2 2 2m4-4l2 2-2 2" />
    </Svg>
  );
}

// === Tool identity icons (used in panel avatar + toolbar) ===

export function FilesToolIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </Svg>
  );
}

export function AIToolIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
    </Svg>
  );
}

export function TrellisToolIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h4v4H7zM13 13h4v4h-4zM11 9h3a1 1 0 011 1v3M9 11v3a1 1 0 001 1h3" />
    </Svg>
  );
}

export function IDEToolIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v12H4V6zm4 4h4m-4 4h8m4-4h.01" />
    </Svg>
  );
}

export function SaveProjectIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h7v7H4V6zm9 5h7v7h-7v-7zM8 15h3v3H8v-3zm7-9h3v3h-3V6z" />
    </Svg>
  );
}

// === Status / event glyphs (replace EVENT_META characters) ===

export function CheckIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </Svg>
  );
}

export function CrossIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </Svg>
  );
}

export function PlayIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v14l11-7L8 5z" />
    </Svg>
  );
}

export function StopIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </Svg>
  );
}

export function DiamondIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4l8 8-8 8-8-8 8-8z" />
    </Svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
    </Svg>
  );
}

export function WarningIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l9 16H3l9-16z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v5m0 3h.01" />
    </Svg>
  );
}

export function InfoIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v5m0-8h.01" />
    </Svg>
  );
}

/** Split-pane layout icon (a rectangle divided into two columns). */
export function SplitIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14" />
    </Svg>
  );
}

export function TerminalIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 9l3 2.5L7 14M13 14h4" />
    </Svg>
  );
}
