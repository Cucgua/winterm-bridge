export type ThemeId = 'midnight' | 'graphite' | 'forest' | 'light';
export type ThemePreference = ThemeId | 'system';

export interface ThemeDefinition {
  id: ThemeId;
  label: {
    en: string;
    zh: string;
  };
  mode: 'dark' | 'light';
  cssVariables: Record<string, string>;
  terminal: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selectionBackground: string;
    selectionForeground: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

const sharedStatusVariables = {
  '--c-success': '52 199 89',
  '--c-warning': '255 159 10',
  '--c-error': '255 69 58',
};

export const THEME_DEFINITIONS: Record<ThemeId, ThemeDefinition> = {
  midnight: {
    id: 'midnight',
    label: { en: 'Midnight', zh: '午夜' },
    mode: 'dark',
    cssVariables: {
      '--c-canvas': '8 13 29',
      '--c-surface': '15 22 40',
      '--c-surface-highlight': '32 40 65',
      '--c-surface-elevated': '26 33 53',
      '--c-sidebar': '16 23 41',
      '--c-border': '255 255 255',
      '--c-text-primary': '255 255 255',
      '--c-text-secondary': '255 255 255',
      '--c-text-tertiary': '255 255 255',
      '--c-accent': '41 211 133',
      '--c-accent-foreground': '255 255 255',
      '--term-bg': '8 13 29',
      '--term-fg': '229 236 255',
      '--scrollbar-thumb': '255 255 255',
      '--scrollbar-thumb-hover': '255 255 255',
      ...sharedStatusVariables,
    },
    terminal: {
      background: '#080d1d',
      foreground: '#e5ecff',
      cursor: '#29d385',
      cursorAccent: '#080d1d',
      selectionBackground: 'rgba(41, 211, 133, 0.28)',
      selectionForeground: '#f8fafc',
      black: '#111827',
      red: '#fb7185',
      green: '#34d399',
      yellow: '#fbbf24',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: '#e5e7eb',
      brightBlack: '#64748b',
      brightRed: '#fda4af',
      brightGreen: '#86efac',
      brightYellow: '#fde68a',
      brightBlue: '#93c5fd',
      brightMagenta: '#d8b4fe',
      brightCyan: '#67e8f9',
      brightWhite: '#ffffff',
    },
  },
  graphite: {
    id: 'graphite',
    label: { en: 'Graphite', zh: '石墨' },
    mode: 'dark',
    cssVariables: {
      '--c-canvas': '18 19 23',
      '--c-surface': '28 30 36',
      '--c-surface-highlight': '47 50 59',
      '--c-surface-elevated': '36 39 48',
      '--c-sidebar': '23 25 31',
      '--c-border': '255 255 255',
      '--c-text-primary': '255 255 255',
      '--c-text-secondary': '255 255 255',
      '--c-text-tertiary': '255 255 255',
      '--c-accent': '125 141 255',
      '--c-accent-foreground': '255 255 255',
      '--term-bg': '18 19 23',
      '--term-fg': '236 239 244',
      '--scrollbar-thumb': '255 255 255',
      '--scrollbar-thumb-hover': '255 255 255',
      ...sharedStatusVariables,
    },
    terminal: {
      background: '#121317',
      foreground: '#eceff4',
      cursor: '#7d8dff',
      cursorAccent: '#121317',
      selectionBackground: 'rgba(125, 141, 255, 0.28)',
      selectionForeground: '#ffffff',
      black: '#181a20',
      red: '#f87171',
      green: '#4ade80',
      yellow: '#facc15',
      blue: '#93c5fd',
      magenta: '#c4b5fd',
      cyan: '#67e8f9',
      white: '#e5e7eb',
      brightBlack: '#6b7280',
      brightRed: '#fca5a5',
      brightGreen: '#86efac',
      brightYellow: '#fde68a',
      brightBlue: '#bfdbfe',
      brightMagenta: '#ddd6fe',
      brightCyan: '#a5f3fc',
      brightWhite: '#ffffff',
    },
  },
  forest: {
    id: 'forest',
    label: { en: 'Forest', zh: '森林' },
    mode: 'dark',
    cssVariables: {
      '--c-canvas': '8 20 20',
      '--c-surface': '15 35 34',
      '--c-surface-highlight': '31 62 59',
      '--c-surface-elevated': '23 48 48',
      '--c-sidebar': '12 28 30',
      '--c-border': '232 255 248',
      '--c-text-primary': '240 253 250',
      '--c-text-secondary': '240 253 250',
      '--c-text-tertiary': '240 253 250',
      '--c-accent': '45 212 191',
      '--c-accent-foreground': '8 20 20',
      '--term-bg': '8 20 20',
      '--term-fg': '214 255 246',
      '--scrollbar-thumb': '232 255 248',
      '--scrollbar-thumb-hover': '232 255 248',
      ...sharedStatusVariables,
    },
    terminal: {
      background: '#081414',
      foreground: '#d6fff6',
      cursor: '#2dd4bf',
      cursorAccent: '#081414',
      selectionBackground: 'rgba(45, 212, 191, 0.28)',
      selectionForeground: '#f8fafc',
      black: '#0f2626',
      red: '#fb7185',
      green: '#5eead4',
      yellow: '#fde68a',
      blue: '#7dd3fc',
      magenta: '#c4b5fd',
      cyan: '#67e8f9',
      white: '#ccfbf1',
      brightBlack: '#5f7774',
      brightRed: '#fda4af',
      brightGreen: '#99f6e4',
      brightYellow: '#fef3c7',
      brightBlue: '#bae6fd',
      brightMagenta: '#ddd6fe',
      brightCyan: '#a5f3fc',
      brightWhite: '#ffffff',
    },
  },
  light: {
    id: 'light',
    label: { en: 'Light', zh: '浅色' },
    mode: 'light',
    cssVariables: {
      '--c-canvas': '242 244 248',
      '--c-surface': '255 255 255',
      '--c-surface-highlight': '230 234 242',
      '--c-surface-elevated': '249 250 252',
      '--c-sidebar': '236 239 245',
      '--c-border': '15 23 42',
      '--c-text-primary': '15 23 42',
      '--c-text-secondary': '15 23 42',
      '--c-text-tertiary': '15 23 42',
      '--c-accent': '37 99 235',
      '--c-accent-foreground': '255 255 255',
      '--c-success': '22 163 74',
      '--c-warning': '202 138 4',
      '--c-error': '220 38 38',
      '--term-bg': '30 30 46',
      '--term-fg': '205 214 244',
      '--scrollbar-thumb': '15 23 42',
      '--scrollbar-thumb-hover': '15 23 42',
    },
    terminal: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#89b4fa',
      cursorAccent: '#1e1e2e',
      selectionBackground: 'rgba(137, 180, 250, 0.3)',
      selectionForeground: '#cdd6f4',
      black: '#45475a',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#cba6f7',
      cyan: '#94e2d5',
      white: '#bac2de',
      brightBlack: '#585b70',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#cba6f7',
      brightCyan: '#94e2d5',
      brightWhite: '#a6adc8',
    },
  },
};

export const THEME_IDS = Object.keys(THEME_DEFINITIONS) as ThemeId[];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || (typeof value === 'string' && value in THEME_DEFINITIONS);
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  if (isThemePreference(value)) return value;
  if (value === 'dark') return 'midnight';
  if (value === 'light') return 'light';
  return 'midnight';
}

export function resolveThemePreference(preference: ThemePreference, systemPrefersDark: boolean): ThemeId {
  if (preference === 'system') {
    return systemPrefersDark ? 'midnight' : 'light';
  }
  return preference;
}
