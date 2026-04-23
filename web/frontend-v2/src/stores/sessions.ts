import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { nanoid } from 'nanoid';

export type SessionType = 'ssh' | 'rdp' | 'topology' | 'cost' | 'fleet-map' | 'diagram';
export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface Session {
  id: string;
  type: SessionType;
  instanceId: string;
  instanceName: string;
  env?: string;
  status: SessionStatus;
  createdAt: number;
}

interface SessionsState {
  sessions: Session[];
  activeId: string | null;
  openSession: (s: Omit<Session, 'createdAt'>) => void;
  closeSession: (id: string) => void;
  closeOthers: (keepId: string) => void;
  closeRight: (fromId: string) => void;
  duplicate: (id: string) => void;
  reorder: (fromId: string, toId: string) => void;
  setActive: (id: string | null) => void;
  updateStatus: (id: string, status: SessionStatus) => void;
}

export const useSessionsStore = create<SessionsState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeId: null,
      openSession: (s) =>
        set((state) => {
          if (state.sessions.some((x) => x.id === s.id)) return { activeId: s.id };
          return {
            sessions: [...state.sessions, { ...s, createdAt: Date.now() }],
            activeId: s.id,
          };
        }),
      closeSession: (id) =>
        set((state) => {
          const sessions = state.sessions.filter((x) => x.id !== id);
          const activeId =
            state.activeId === id
              ? (sessions[sessions.length - 1]?.id ?? null)
              : state.activeId;
          return { sessions, activeId };
        }),
      closeOthers: (keepId) =>
        set((state) => ({
          sessions: state.sessions.filter((x) => x.id === keepId),
          activeId: keepId,
        })),
      closeRight: (fromId) =>
        set((state) => {
          const i = state.sessions.findIndex((x) => x.id === fromId);
          return { sessions: state.sessions.slice(0, i + 1) };
        }),
      duplicate: (id) => {
        const src = get().sessions.find((x) => x.id === id);
        if (!src) return;
        get().openSession({ ...src, id: `${src.instanceId}-${nanoid(6)}` });
      },
      reorder: (fromId, toId) =>
        set((state) => {
          const from = state.sessions.findIndex((x) => x.id === fromId);
          const to = state.sessions.findIndex((x) => x.id === toId);
          if (from === -1 || to === -1) return state;
          const next = [...state.sessions];
          const [moved] = next.splice(from, 1);
          if (moved) next.splice(to, 0, moved);
          return { sessions: next };
        }),
      setActive: (id) => set({ activeId: id }),
      updateStatus: (id, status) =>
        set((state) => ({
          sessions: state.sessions.map((s) => (s.id === id ? { ...s, status } : s)),
        })),
    }),
    { name: 'ct-sessions', storage: createJSONStorage(() => sessionStorage) },
  ),
);
