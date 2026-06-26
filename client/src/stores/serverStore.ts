import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ServerEntry {
  id: string;
  name: string;
  url: string; // full URL like "http://192.168.1.50:8080" — required (no same-origin in Tauri)
  token?: string;
  role?: 'admin' | 'guest';
  lastSessionId?: string;
}

interface ServerState {
  servers: ServerEntry[];
  activeServerId: string | null;

  getActiveServer: () => ServerEntry | null;
  getActiveToken: () => string | undefined;
  setActiveServer: (id: string) => void;
  addServer: (name: string, url: string) => string;
  removeServer: (id: string) => void;
  updateServer: (id: string, patch: Partial<Pick<ServerEntry, 'name' | 'url' | 'token' | 'role' | 'lastSessionId'>>) => void;
  setToken: (serverId: string, token: string, role?: 'admin' | 'guest') => void;
  clearToken: (serverId: string) => void;
}

let counter = Date.now();
const genId = () => 's_' + (counter++).toString(36);

export const useServerStore = create<ServerState>()(
  persist(
    (set, get) => ({
      // No default local server — Tauri client always connects to a remote backend.
      // User adds their first server via the connection screen on first launch.
      servers: [],
      activeServerId: null,

      getActiveServer: () => {
        const { servers, activeServerId } = get();
        if (!activeServerId) return null;
        return servers.find(s => s.id === activeServerId) || null;
      },

      getActiveToken: () => {
        const server = get().getActiveServer();
        return server?.token;
      },

      setActiveServer: (id) => set({ activeServerId: id }),

      addServer: (name, url) => {
        const id = genId();
        // Normalize: strip trailing slash
        const normalized = url.replace(/\/+$/, '');
        set(state => ({
          servers: [...state.servers, { id, name, url: normalized }],
          // Auto-select first server if none active
          activeServerId: state.activeServerId ?? id,
        }));
        return id;
      },

      removeServer: (id) => {
        set(state => {
          const servers = state.servers.filter(s => s.id !== id);
          const activeServerId = state.activeServerId === id
            ? (servers[0]?.id ?? null)
            : state.activeServerId;
          return { servers, activeServerId };
        });
      },

      updateServer: (id, patch) => {
        set(state => ({
          servers: state.servers.map(s => {
            if (s.id !== id) return s;
            const newUrl = patch.url !== undefined ? patch.url.replace(/\/+$/, '') : s.url;
            const urlChanged = patch.url !== undefined && newUrl !== s.url;
            return { ...s, ...patch, url: newUrl, ...(urlChanged ? { token: undefined, role: undefined, lastSessionId: undefined } : {}) };
          }),
        }));
      },

      setToken: (serverId, token, role) => {
        set(state => ({
          servers: state.servers.map(s =>
            s.id === serverId ? { ...s, token, role: role || s.role } : s
          ),
        }));
      },

      clearToken: (serverId) => {
        set(state => ({
          servers: state.servers.map(s =>
            s.id === serverId ? { ...s, token: undefined, role: undefined } : s
          ),
        }));
      },
    }),
    {
      name: 'winterm-servers',
      partialize: (state) => ({
        servers: state.servers,
        activeServerId: state.activeServerId,
      }),
    }
  )
);
