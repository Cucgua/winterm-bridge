import { create } from 'zustand';
import { AutoConfig, WorkflowEvent } from '../core/api';

export interface AISummary {
  sessionId: string;
  tag: string;
  description: string;
  timestamp: number;
}

export interface AutoAction {
  session_id: string;
  session_name: string;
  tag: string;
  description: string;
  actions: { type: string; value: string }[];
  confidence: number;
  timestamp: number;
  success: boolean;
}

interface AIState {
  summaries: Record<string, AISummary>;
  aiEnabled: boolean;
  autoConfig: AutoConfig;
  autoActions: AutoAction[];
  workflowEvents: Record<string, WorkflowEvent[]>;
  setAiEnabled: (enabled: boolean) => void;
  setSummary: (sessionId: string, summary: Omit<AISummary, 'sessionId'>) => void;
  clearSummary: (sessionId: string) => void;
  clearAll: () => void;
  setAutoConfig: (config: AutoConfig) => void;
  addAutoAction: (action: AutoAction) => void;
  addWorkflowEvent: (event: WorkflowEvent) => void;
  clearWorkflowEvents: (sessionId?: string) => void;
}

const defaultAutoConfig: AutoConfig = {
  model: '',
  context_lines: 150,
  confidence_min: 0.7,
  cooldown_ms: 3000,
  goal: '',
  allow_tags: ['需确认', '需选择'],
  deny_keywords: ['rm', 'delete', 'format', 'sudo'],
};

export const useAIStore = create<AIState>((set) => ({
  summaries: {},
  aiEnabled: false,
  autoConfig: defaultAutoConfig,
  autoActions: [],
  workflowEvents: {},

  setAiEnabled: (enabled) => set({ aiEnabled: enabled }),

  setSummary: (sessionId, summary) =>
    set((state) => {
      const prev = state.summaries[sessionId];
      // Content deduplication: if tag and description are the same, don't update (preserve old timestamp)
      if (prev && prev.tag === summary.tag && prev.description === summary.description) {
        return state;
      }
      return {
        summaries: {
          ...state.summaries,
          [sessionId]: { ...summary, sessionId },
        },
      };
    }),

  clearSummary: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.summaries;
      return { summaries: rest };
    }),

  clearAll: () => set({ summaries: {}, workflowEvents: {} }),

  setAutoConfig: (config) => set({ autoConfig: config }),

  addAutoAction: (action) =>
    set((state) => ({
      autoActions: [...state.autoActions.slice(-99), action],
    })),

  addWorkflowEvent: (event) =>
    set((state) => {
      // Skip idle events - they are high-frequency noise that would fill the buffer
      // and push out meaningful events. Idle events are only used for real-time status display.
      if (event.event_type === 'idle') {
        return state;
      }
      const sessionEvents = state.workflowEvents[event.session_id] || [];
      // Keep last 100 events per session (excluding idle events)
      const newEvents = [...sessionEvents, event].slice(-100);
      return {
        workflowEvents: {
          ...state.workflowEvents,
          [event.session_id]: newEvents,
        },
      };
    }),

  clearWorkflowEvents: (sessionId) =>
    set((state) => {
      if (sessionId) {
        const { [sessionId]: _, ...rest } = state.workflowEvents;
        return { workflowEvents: rest };
      }
      return { workflowEvents: {} };
    }),
}));
