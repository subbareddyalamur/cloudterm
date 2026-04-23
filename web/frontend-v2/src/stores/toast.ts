import { create } from 'zustand';
import { nanoid } from 'nanoid';

export type ToastVariant = 'info' | 'success' | 'warn' | 'danger' | 'progress';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastLink {
  label: string;
  href: string;
}

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  progress?: number;
  duration?: number | null;
  action?: ToastAction;
  link?: ToastLink;
  onDismiss?: () => void;
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'createdAt'>) => string;
  update: (id: string, patch: Partial<Toast>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = nanoid();
    const toast: Toast = {
      ...t,
      id,
      createdAt: Date.now(),
      duration: t.duration !== undefined ? t.duration : 4000,
    };
    set((s) => ({ toasts: [toast, ...s.toasts] }));
    if (toast.duration && toast.duration > 0) {
      setTimeout(() => get().dismiss(id), toast.duration);
    }
    return id;
  },
  update: (id, patch) =>
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? ({ ...t, ...patch } as Toast) : t)),
    })),
  dismiss: (id) => {
    const toast = get().toasts.find((t) => t.id === id);
    toast?.onDismiss?.();
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  clear: () => set({ toasts: [] }),
}));
