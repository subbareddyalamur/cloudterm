import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface LayoutState {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  setSidebarWidth: (px: number) => void;
  toggleSidebar: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarWidth: 300,
      sidebarCollapsed: false,
      setSidebarWidth: (px: number) =>
        set({ sidebarWidth: Math.max(220, Math.min(440, px)) }),
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'ct-layout', storage: createJSONStorage(() => localStorage) },
  ),
);
