import { create } from "zustand";

export type TransferType = "upload" | "download";
export type TransferStatus = "active" | "complete" | "error";

export interface Transfer {
  id: number;
  type: TransferType;
  name: string;
  progress: number;
  message: string;
  status: TransferStatus;
  /** Whether this is an express (S3) transfer. */
  express: boolean;
}

interface TransferState {
  transfers: Map<number, Transfer>;
  nextId: number;
  collapsed: boolean;
}

interface TransferActions {
  add: (type: TransferType, name: string, express?: boolean) => number;
  update: (id: number, progress: number, message: string, status?: TransferStatus) => void;
  remove: (id: number) => void;
  clearCompleted: () => void;
  toggleCollapsed: () => void;
}

export type TransferStore = TransferState & TransferActions;

const AUTO_DISMISS_MS = 3_000;

export const useTransferStore = create<TransferStore>()((set, get) => ({
  transfers: new Map(),
  nextId: 1,
  collapsed: false,

  add: (type, name, express = false) => {
    const id = get().nextId;
    const transfer: Transfer = {
      id,
      type,
      name: express ? `⚡ ${name}` : name,
      progress: 0,
      message: "Starting…",
      status: "active",
      express,
    };
    set((s) => {
      const next = new Map(s.transfers);
      next.set(id, transfer);
      return { transfers: next, nextId: s.nextId + 1 };
    });
    return id;
  },

  update: (id, progress, message, status = "active") => {
    set((s) => {
      const t = s.transfers.get(id);
      if (!t) return s;
      const next = new Map(s.transfers);
      next.set(id, { ...t, progress, message, status });
      return { transfers: next };
    });

    if (status === "complete") {
      setTimeout(() => get().remove(id), AUTO_DISMISS_MS);
    }
  },

  remove: (id) => {
    set((s) => {
      const next = new Map(s.transfers);
      next.delete(id);
      return { transfers: next };
    });
  },

  clearCompleted: () => {
    set((s) => {
      const next = new Map(s.transfers);
      for (const [id, t] of next) {
        if (t.status === "complete" || t.status === "error") next.delete(id);
      }
      return { transfers: next };
    });
  },

  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
}));
