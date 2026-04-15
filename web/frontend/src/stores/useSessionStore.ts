import { create } from "zustand";

export type SessionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "recording";

export interface Session {
  sessionId: string;
  instanceId: string;
  instanceName: string;
  status: SessionStatus;
  recording: boolean;
  suggestEnabled: boolean;
}

interface SessionState {
  sessions: Map<string, Session>;
  activeSessionId: string | null;
}

interface SessionActions {
  addSession: (session: Session) => void;
  removeSession: (sessionId: string) => void;
  switchSession: (sessionId: string) => void;
  setStatus: (sessionId: string, status: SessionStatus) => void;
  setRecording: (sessionId: string, recording: boolean) => void;
  setSuggestEnabled: (sessionId: string, enabled: boolean) => void;
}

export type SessionStore = SessionState & SessionActions;

export const useSessionStore = create<SessionStore>()((set, get) => ({
  sessions: new Map(),
  activeSessionId: null,

  addSession: (session) =>
    set((state) => {
      const next = new Map(state.sessions);
      next.set(session.sessionId, session);
      return { sessions: next, activeSessionId: session.sessionId };
    }),

  removeSession: (sessionId) =>
    set((state) => {
      const next = new Map(state.sessions);
      next.delete(sessionId);
      const remaining = [...next.keys()];
      const activeSessionId =
        state.activeSessionId === sessionId
          ? (remaining[remaining.length - 1] ?? null)
          : state.activeSessionId;
      return { sessions: next, activeSessionId };
    }),

  switchSession: (sessionId) => {
    if (get().sessions.has(sessionId)) {
      set({ activeSessionId: sessionId });
    }
  },

  setStatus: (sessionId, status) =>
    set((state) => {
      const session = state.sessions.get(sessionId);
      if (!session) return state;
      const next = new Map(state.sessions);
      next.set(sessionId, { ...session, status });
      return { sessions: next };
    }),

  setRecording: (sessionId, recording) =>
    set((state) => {
      const session = state.sessions.get(sessionId);
      if (!session) return state;
      const next = new Map(state.sessions);
      next.set(sessionId, {
        ...session,
        recording,
        status: recording ? "recording" : session.status === "recording" ? "connected" : session.status,
      });
      return { sessions: next };
    }),

  setSuggestEnabled: (sessionId, enabled) =>
    set((state) => {
      const session = state.sessions.get(sessionId);
      if (!session) return state;
      const next = new Map(state.sessions);
      next.set(sessionId, { ...session, suggestEnabled: enabled });
      return { sessions: next };
    }),
}));
