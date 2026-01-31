import { create } from 'zustand';

export interface AISummary {
  sessionId: string;
  tag: string;
  description: string;
  timestamp: number;
}

interface AIState {
  summaries: Record<string, AISummary>;
  aiEnabled: boolean;
  setAiEnabled: (enabled: boolean) => void;
  setSummary: (sessionId: string, summary: Omit<AISummary, 'sessionId'>) => void;
  clearSummary: (sessionId: string) => void;
  clearAll: () => void;
}

export const useAIStore = create<AIState>((set) => ({
  summaries: {},
  aiEnabled: false,

  setAiEnabled: (enabled) => set({ aiEnabled: enabled }),

  setSummary: (sessionId, summary) =>
    set((state) => ({
      summaries: {
        ...state.summaries,
        [sessionId]: { ...summary, sessionId },
      },
    })),

  clearSummary: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.summaries;
      return { summaries: rest };
    }),

  clearAll: () => set({ summaries: {} }),
}));
