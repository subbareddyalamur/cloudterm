import { create } from 'zustand';

interface PaletteState {
  open: boolean;
  query: string;
  setOpen: (open: boolean) => void;
  setQuery: (q: string) => void;
  toggle: () => void;
}

export const usePaletteStore = create<PaletteState>()((set, get) => ({
  open: false,
  query: '',
  setOpen: (open) => set({ open, query: open ? get().query : '' }),
  setQuery: (q) => set({ query: q }),
  toggle: () => {
    const next = !get().open;
    set({ open: next, query: next ? get().query : '' });
  },
}));
