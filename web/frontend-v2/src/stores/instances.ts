import { create } from 'zustand';
import { persist, createJSONStorage, devtools } from 'zustand/middleware';
import { apiGet } from '@/lib/api';
import type { EC2Instance, AccountNode, InstanceTree } from '@/lib/types';
import { expandAccountsWithMatches } from '@/lib/filter';

export type { EC2Instance as Instance, AccountNode as Account };
export type { InstanceState } from '@/lib/types';

interface InstancesState {
  accounts: AccountNode[];
  loading: boolean;
  scanning: boolean;
  lastScanAt: number | null;
  filter: string;
  expanded: Record<string, boolean>;
  favorites: string[];
  selectedId: string | null;

  setFilter: (q: string) => void;
  toggleExpand: (key: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
  toggleFavorite: (id: string) => void;
  setSelected: (id: string | null) => void;
  fetchInstances: () => Promise<void>;
  triggerScan: () => Promise<void>;
}

export const useInstancesStore = create<InstancesState>()(
  devtools(
    persist(
      (set, get) => ({
        accounts: [],
        loading: false,
        scanning: false,
        lastScanAt: null,
        filter: '',
        expanded: {},
        favorites: [],
        selectedId: null,

        setFilter: (q) => {
          set({ filter: q });
          if (q.trim()) {
            const newExpanded = expandAccountsWithMatches(get().accounts, q);
            set((s) => ({ expanded: { ...s.expanded, ...newExpanded } }));
          }
        },

        toggleExpand: (key) =>
          set((s) => ({ expanded: { ...s.expanded, [key]: !s.expanded[key] } })),

        collapseAll: () => set({ expanded: {} }),

        expandAll: () => {
          const all: Record<string, boolean> = {};
          for (const a of get().accounts) {
            all[`account:${a.account_id}`] = true;
            for (const r of a.regions) {
              all[`region:${a.account_id}:${r.region}`] = true;
              for (const g of r.groups) {
                const label = [g.tag1, g.tag2].filter(Boolean).join(' / ');
                if (label) {
                  all[`tag:${a.account_id}:${r.region}:${label}`] = true;
                }
              }
            }
          }
          set({ expanded: all });
        },

        toggleFavorite: (id) =>
          set((s) => ({
            favorites: s.favorites.includes(id)
              ? s.favorites.filter((x) => x !== id)
              : [...s.favorites, id],
          })),

        setSelected: (id) => set({ selectedId: id }),

        fetchInstances: async () => {
          set({ loading: true });
          const res = await apiGet<InstanceTree>('/instances');
          if (res.ok) {
            set({
              accounts: res.value.accounts ?? [],
              lastScanAt: Date.now(),
              loading: false,
            });
          } else {
            set({ loading: false });
          }
        },

        triggerScan: async () => {
          if (get().scanning) return;
          set({ scanning: true });
          await apiGet('/scan-instances?force=true');
          const poll = async () => {
            const statusRes = await apiGet<{ status: string }>('/scan-status');
            if (statusRes.ok && statusRes.value.status === 'scanning') {
              setTimeout(() => void poll(), 1500);
            } else {
              await get().fetchInstances();
              set({ scanning: false });
            }
          };
          setTimeout(() => void poll(), 1500);
        },
      }),
      {
        name: 'ct-instances',
        storage: createJSONStorage(() => localStorage),
        partialize: (s) => ({ favorites: s.favorites, expanded: s.expanded }),
      },
    ),
    { name: 'instances' },
  ),
);
