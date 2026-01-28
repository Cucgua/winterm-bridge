import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DisplayMode = 'fit' | 'fixed';

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
  reset: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  autoReconnect: true,
  lastSessionId: null,
  defaultWorkingDirectory: '~',
  fontSize: 16,
  displayMode: 'fit',
  fixedTerminalSize: { cols: 100, rows: 30 },
  zoomLevel: 1.0,
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
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'winterm-settings',
      partialize: (state) => ({
        autoReconnect: state.autoReconnect,
        lastSessionId: state.lastSessionId,
        defaultWorkingDirectory: state.defaultWorkingDirectory,
        fontSize: state.fontSize,
        displayMode: state.displayMode,
        fixedTerminalSize: state.fixedTerminalSize,
        zoomLevel: state.zoomLevel,
      }),
    }
  )
);
