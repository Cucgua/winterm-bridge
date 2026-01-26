import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Settings {
  autoReconnect: boolean;
  lastSessionId: string | null;
  defaultWorkingDirectory: string;
  fontSize: number;
}

interface SettingsState extends Settings {
  setAutoReconnect: (value: boolean) => void;
  setLastSessionId: (id: string | null) => void;
  setDefaultWorkingDirectory: (path: string) => void;
  setFontSize: (size: number) => void;
  reset: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  autoReconnect: true,
  lastSessionId: null,
  defaultWorkingDirectory: '~',
  fontSize: 16,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setAutoReconnect: (value) => set({ autoReconnect: value }),
      setLastSessionId: (id) => set({ lastSessionId: id }),
      setDefaultWorkingDirectory: (path) => set({ defaultWorkingDirectory: path }),
      setFontSize: (size) => set({ fontSize: size }),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'winterm-settings',
      partialize: (state) => ({
        autoReconnect: state.autoReconnect,
        lastSessionId: state.lastSessionId,
        defaultWorkingDirectory: state.defaultWorkingDirectory,
        fontSize: state.fontSize,
      }),
    }
  )
);
