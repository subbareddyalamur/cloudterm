import { create } from "zustand";
import type {
  InstanceTree,
  EC2Instance,
  FleetStats,
  ScanStatus,
} from "../types";

const FAV_STORAGE_KEY = "cloudterm_favorites";

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAV_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFavorites(ordered: string[]) {
  try {
    localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(ordered));
  } catch {
    // localStorage may be unavailable
  }
}

interface InstanceState {
  instanceTree: InstanceTree | null;
  flatInstances: EC2Instance[];
  favorites: Set<string>;
  favoriteOrder: string[];
  scanStatus: ScanStatus | null;
  filterText: string;
  fleetStats: FleetStats;
}

interface InstanceActions {
  setInstances: (tree: InstanceTree, flat: EC2Instance[]) => void;
  setScanStatus: (status: ScanStatus | null) => void;
  toggleFavorite: (instanceId: string) => void;
  setFavorites: (ids: string[]) => void;
  reorderFavorites: (fromIndex: number, toIndex: number) => void;
  setFilter: (text: string) => void;
  setFleetStats: (stats: FleetStats) => void;
}

export type InstanceStore = InstanceState & InstanceActions;

const emptyStats: FleetStats = {
  total: 0,
  running: 0,
  stopped: 0,
  windows: 0,
  rhel: 0,
  accounts: 0,
};

const initialFavs = loadFavorites();

export const useInstanceStore = create<InstanceStore>()((set) => ({
  instanceTree: null,
  flatInstances: [],
  favorites: new Set<string>(initialFavs),
  favoriteOrder: initialFavs,
  scanStatus: null,
  filterText: "",
  fleetStats: emptyStats,

  setInstances: (tree, flat) => set({ instanceTree: tree, flatInstances: flat }),

  setScanStatus: (status) => set({ scanStatus: status }),

  toggleFavorite: (instanceId) =>
    set((state) => {
      const next = new Set(state.favorites);
      let order = [...state.favoriteOrder];
      if (next.has(instanceId)) {
        next.delete(instanceId);
        order = order.filter((id) => id !== instanceId);
      } else {
        next.add(instanceId);
        order.push(instanceId);
      }
      saveFavorites(order);
      return { favorites: next, favoriteOrder: order };
    }),

  setFavorites: (ids) => {
    saveFavorites(ids);
    set({ favorites: new Set(ids), favoriteOrder: ids });
  },

  reorderFavorites: (fromIndex, toIndex) =>
    set((state) => {
      const order = [...state.favoriteOrder];
      const [moved] = order.splice(fromIndex, 1);
      order.splice(toIndex, 0, moved);
      saveFavorites(order);
      return { favoriteOrder: order };
    }),

  setFilter: (text) => set({ filterText: text }),

  setFleetStats: (stats) => set({ fleetStats: stats }),
}));
