import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_TERMINAL_BACKGROUND,
  TerminalBackgroundSettings,
  normalizeTerminalBackground,
} from '../utils/terminalBackground';
import { ThemePreference, normalizeThemePreference } from '../utils/themeRegistry';

export type DisplayMode = 'fit' | 'fixed';
export type ThemeOption = ThemePreference;

export interface FixedTerminalSize {
  cols: number;
  rows: number;
}

export interface Settings {
  autoReconnect: boolean;
  lastSessionId: string | null;
  defaultWorkingDirectory: string;
  fontSize: number;
  displayMode: DisplayMode;
  fixedTerminalSize: FixedTerminalSize;
  zoomLevel: number;
  theme: ThemeOption;
  terminalBackground: TerminalBackgroundSettings;
  /** Width in px of the right-side terminal overlay drawer (Files / AI). */
  sidePanelWidth: number;
  /** Width in px of the wide terminal document overlay (Trellis). */
  trellisPanelWidth: number;
  /** Legacy dock collapse preference retained for local-storage compatibility. */
  sidePanelCollapsed: boolean;
}

interface SettingsState extends Settings {
  setAutoReconnect: (value: boolean) => void;
  setLastSessionId: (id: string | null) => void;
  setDefaultWorkingDirectory: (path: string) => void;
  setFontSize: (size: number) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setFixedTerminalSize: (size: FixedTerminalSize) => void;
  setZoomLevel: (level: number) => void;
  resetZoom: () => void;
  setTheme: (theme: ThemeOption) => void;
  setTerminalBackground: (settings: TerminalBackgroundSettings) => void;
  setSidePanelWidth: (width: number) => void;
  setTrellisPanelWidth: (width: number) => void;
  setSidePanelCollapsed: (collapsed: boolean) => void;
  reset: () => void;
}

/** Terminal overlay drawer width bounds — kept here so the store and component agree. */
export const SIDE_PANEL_MIN_WIDTH = 240;
export const SIDE_PANEL_MAX_WIDTH = 560;
export const SIDE_PANEL_DEFAULT_WIDTH = 320;
export const TRELLIS_PANEL_MIN_WIDTH = 760;
export const TRELLIS_PANEL_MAX_WIDTH = 1280;
export const TRELLIS_PANEL_DEFAULT_WIDTH = 980;

function clampSidePanelWidth(width: number): number {
  return Math.max(SIDE_PANEL_MIN_WIDTH, Math.min(SIDE_PANEL_MAX_WIDTH, Math.round(width)));
}

function clampTrellisPanelWidth(width: number): number {
  return Math.max(TRELLIS_PANEL_MIN_WIDTH, Math.min(TRELLIS_PANEL_MAX_WIDTH, Math.round(width)));
}

const DEFAULT_SETTINGS: Settings = {
  autoReconnect: true,
  lastSessionId: null,
  defaultWorkingDirectory: '~',
  fontSize: 16,
  displayMode: 'fit',
  fixedTerminalSize: { cols: 100, rows: 30 },
  zoomLevel: 1.0,
  theme: 'midnight',
  terminalBackground: DEFAULT_TERMINAL_BACKGROUND,
  sidePanelWidth: SIDE_PANEL_DEFAULT_WIDTH,
  trellisPanelWidth: TRELLIS_PANEL_DEFAULT_WIDTH,
  sidePanelCollapsed: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setAutoReconnect: (value) => set({ autoReconnect: value }),
      setLastSessionId: (id) => set({ lastSessionId: id }),
      setDefaultWorkingDirectory: (path) => set({ defaultWorkingDirectory: path }),
      setFontSize: (size) => set({ fontSize: size }),
      setDisplayMode: (mode) => set({ displayMode: mode }),
      setFixedTerminalSize: (size) => set({ fixedTerminalSize: size }),
      setZoomLevel: (level) => set({ zoomLevel: Math.max(0.5, Math.min(2.0, level)) }),
      resetZoom: () => set({ zoomLevel: 1.0 }),
      setTheme: (theme) => set({ theme }),
      setTerminalBackground: (settings) => set({ terminalBackground: normalizeTerminalBackground(settings) }),
      setSidePanelWidth: (width) => set({ sidePanelWidth: clampSidePanelWidth(width) }),
      setTrellisPanelWidth: (width) => set({ trellisPanelWidth: clampTrellisPanelWidth(width) }),
      setSidePanelCollapsed: (collapsed) => set({ sidePanelCollapsed: collapsed }),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'winterm-settings',
      merge: (persisted, current) => {
        const persistedState = (persisted ?? {}) as Partial<Settings>;
        return {
          ...current,
          ...persistedState,
          theme: normalizeThemePreference(persistedState.theme),
          terminalBackground: normalizeTerminalBackground({
            ...DEFAULT_TERMINAL_BACKGROUND,
            ...persistedState.terminalBackground,
          }),
          sidePanelWidth: clampSidePanelWidth(persistedState.sidePanelWidth ?? current.sidePanelWidth),
          trellisPanelWidth: clampTrellisPanelWidth(persistedState.trellisPanelWidth ?? current.trellisPanelWidth),
        };
      },
      partialize: (state) => ({
        autoReconnect: state.autoReconnect,
        lastSessionId: state.lastSessionId,
        defaultWorkingDirectory: state.defaultWorkingDirectory,
        fontSize: state.fontSize,
        displayMode: state.displayMode,
        fixedTerminalSize: state.fixedTerminalSize,
        zoomLevel: state.zoomLevel,
        theme: state.theme,
        terminalBackground: state.terminalBackground,
        sidePanelWidth: state.sidePanelWidth,
        trellisPanelWidth: state.trellisPanelWidth,
        sidePanelCollapsed: state.sidePanelCollapsed,
      }),
    }
  )
);
