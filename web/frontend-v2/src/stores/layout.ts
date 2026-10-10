import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useAIStore } from './ai';

/** Full-width places in the work column. `session` shows the active tab. */
export type DeskView = 'session' | 'fleet' | 'audit' | 'recordings' | 'snippets';

interface LayoutState {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  view: DeskView;
  /** Instance shown in the reading column. The AI assistant shares that column. */
  detailsInstanceId: string | null;
  setSidebarWidth: (px: number) => void;
  toggleSidebar: () => void;
  setView: (view: DeskView) => void;
  showDetails: (instanceId: string) => void;
  toggleDetails: (instanceId: string) => void;
  closeDetails: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      sidebarWidth: 300,
      sidebarCollapsed: false,
      view: 'session',
      detailsInstanceId: null,
      setSidebarWidth: (px: number) =>
        set({ sidebarWidth: Math.max(220, Math.min(440, px)) }),
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setView: (view) => set({ view }),
      showDetails: (instanceId) => {
        useAIStore.getState().setOpen(false);
        set({ detailsInstanceId: instanceId });
      },
      toggleDetails: (instanceId) => {
        const next = get().detailsInstanceId === instanceId ? null : instanceId;
        if (next) useAIStore.getState().setOpen(false);
        set({ detailsInstanceId: next });
      },
      closeDetails: () => set({ detailsInstanceId: null }),
    }),
    {
      name: 'ct-layout',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sidebarWidth: s.sidebarWidth, sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);
