import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ServerEntry {
  id: string;
  name: string;
  url: string; // empty string = same origin (local server)
  token?: string;
  role?: 'admin' | 'guest';
  lastSessionId?: string;
}

const LOCAL_SERVER: ServerEntry = {
  id: 'local',
  name: '本机',
  url: '',
};

interface ServerState {
  servers: ServerEntry[];
  activeServerId: string;

  getActiveServer: () => ServerEntry;
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
      servers: [{ ...LOCAL_SERVER }],
      activeServerId: 'local',

      getActiveServer: () => {
        const { servers, activeServerId } = get();
        return servers.find(s => s.id === activeServerId) || servers[0];
      },

      getActiveToken: () => {
        return get().getActiveServer().token;
      },

      setActiveServer: (id) => set({ activeServerId: id }),

      addServer: (name, url) => {
        const id = genId();
        // Normalize: strip trailing slash
        const normalized = url.replace(/\/+$/, '');
        set(state => ({
          servers: [...state.servers, { id, name, url: normalized }],
        }));
        return id;
      },

      removeServer: (id) => {
        if (id === 'local') return; // cannot remove local
        set(state => ({
          servers: state.servers.filter(s => s.id !== id),
          activeServerId: state.activeServerId === id ? 'local' : state.activeServerId,
        }));
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
      // Migrate: ensure local server always exists
      merge: (persisted, current) => {
        const p = persisted as Partial<ServerState>;
        const servers = p.servers || current.servers;
        if (!servers.find(s => s.id === 'local')) {
          servers.unshift({ ...LOCAL_SERVER });
        }
        return { ...current, ...p, servers };
      },
    }
  )
);
