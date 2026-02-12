import { create } from 'zustand';
import { api, IDEConfig, IDEProjectContext } from '../core/api';

interface IDEState {
  config: IDEConfig | null;
  isConnected: boolean;
  projects: IDEProjectContext[];
  matchedIndex: number;      // >= 0 only when path/name truly matched
  fallbackIndex: number;     // always >= 0 for default display
  selectedIndex: number;     // user manual selection
  hasChange: boolean;
  lastFunctionSig: string;
  lastActiveFile: string;

  setConfig(config: IDEConfig | null): void;
  setSelectedIndex(index: number): void;
  acknowledgeChange(): void;
  resetForSession(): void;
  fetchContext(sessionPath?: string, sessionTitle?: string): Promise<void>;
}

export const useIDEStore = create<IDEState>((set, get) => ({
  config: null,
  isConnected: false,
  projects: [],
  matchedIndex: -1,
  fallbackIndex: -1,
  selectedIndex: -1,
  hasChange: false,
  lastFunctionSig: '',
  lastActiveFile: '',

  setConfig: (config) => set({ config }),

  setSelectedIndex: (index) => set({ selectedIndex: index }),

  acknowledgeChange: () => set({ hasChange: false }),

  resetForSession: () => set({
    selectedIndex: -1,
    hasChange: false,
    lastFunctionSig: '',
    lastActiveFile: '',
  }),

  fetchContext: async (sessionPath?: string, sessionTitle?: string) => {
    try {
      const data = await api.getIDEContext(sessionPath, sessionTitle);
      const state = get();

      // Only detect changes on the matched project (not fallback)
      let newFunctionSig = '';
      let newActiveFile = '';

      if (data.matchedIndex >= 0 && data.matchedIndex < data.projects.length) {
        const proj = data.projects[data.matchedIndex];
        if (proj.currentFunction) {
          newFunctionSig = proj.currentFunction.signature;
        }
        const active = proj.openFiles?.find(f => f.isActive);
        if (active) {
          newActiveFile = active.path;
        }
      }

      // Only flag change when matched project exists and we had previous data
      let hasChange = state.hasChange;
      if (data.matchedIndex >= 0 && (state.lastFunctionSig !== '' || state.lastActiveFile !== '')) {
        if (
          (newFunctionSig !== state.lastFunctionSig) ||
          (newActiveFile !== state.lastActiveFile)
        ) {
          hasChange = true;
        }
      }

      // Determine display index: user selection > matched > fallback
      const prevDisplay = state.matchedIndex >= 0 ? state.matchedIndex : state.fallbackIndex;
      const newDisplay = data.matchedIndex >= 0 ? data.matchedIndex : data.fallbackIndex;
      const selectedIndex = state.selectedIndex === -1 || state.selectedIndex === prevDisplay
        ? newDisplay
        : state.selectedIndex;

      set({
        isConnected: true,
        projects: data.projects,
        matchedIndex: data.matchedIndex,
        fallbackIndex: data.fallbackIndex,
        selectedIndex,
        hasChange,
        lastFunctionSig: newFunctionSig,
        lastActiveFile: newActiveFile,
      });
    } catch {
      set({
        isConnected: false,
        projects: [],
        matchedIndex: -1,
        fallbackIndex: -1,
      });
    }
  },
}));
