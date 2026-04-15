import { create } from "zustand";

export interface ContextMenuState {
  x: number;
  y: number;
  instanceId: string;
  instanceName: string;
  platform: string;
}

interface UIState {
  sidebarOpen: boolean;
  activeModal: string | null;
  transferManagerVisible: boolean;
  aiChatOpen: boolean;
  portForwardOpen: boolean;
  contextMenu: ContextMenuState | null;
}

interface UIActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openModal: (name: string) => void;
  closeModal: () => void;
  setTransferManagerVisible: (visible: boolean) => void;
  toggleAIChat: () => void;
  setAIChatOpen: (open: boolean) => void;
  setPortForwardOpen: (open: boolean) => void;
  showContextMenu: (menu: ContextMenuState) => void;
  hideContextMenu: () => void;
}

export type UIStore = UIState & UIActions;

export const useUIStore = create<UIStore>()((set) => ({
  sidebarOpen: true,
  activeModal: null,
  transferManagerVisible: false,
  aiChatOpen: false,
  portForwardOpen: false,
  contextMenu: null,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  openModal: (name) => set({ activeModal: name }),
  closeModal: () => set({ activeModal: null }),

  setTransferManagerVisible: (visible) => set({ transferManagerVisible: visible }),

  toggleAIChat: () => set((s) => ({ aiChatOpen: !s.aiChatOpen })),
  setAIChatOpen: (open) => set({ aiChatOpen: open }),

  setPortForwardOpen: (open) => set({ portForwardOpen: open }),

  showContextMenu: (menu) => set({ contextMenu: menu }),
  hideContextMenu: () => set({ contextMenu: null }),
}));
