import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { nanoid } from 'nanoid';

export type ActivityKind = 'transfer' | 'port-forward' | 'mp4';
export type ActivityStatus = 'running' | 'success' | 'error' | 'canceled';

export interface TransferActivity {
  kind: 'transfer';
  id: string;
  direction: 'upload' | 'download';
  filename: string;
  instanceId: string;
  instanceName: string;
  bytesTotal: number;
  bytesDone: number;
  speedBps: number;
  status: ActivityStatus;
  startedAt: number;
  etaSec?: number;
  error?: string;
}

export interface PortForwardActivity {
  kind: 'port-forward';
  id: string;
  instanceId: string;
  instanceName: string;
  localPort: number;
  remotePort: number;
  protocol: string;
  elapsedSec: number;
  status: ActivityStatus;
  startedAt: number;
  webBrowsable: boolean;
}

export interface MP4Activity {
  kind: 'mp4';
  id: string;
  castFilename: string;
  jobId: string;
  progressPct: number;
  status: ActivityStatus;
  startedAt: number;
}

export type Activity = TransferActivity | PortForwardActivity | MP4Activity;

export type ActivityPatch = Partial<
  Omit<TransferActivity, 'kind'> &
    Omit<PortForwardActivity, 'kind'> &
    Omit<MP4Activity, 'kind'>
>;

interface ActivityState {
  items: Activity[];
  collapsed: boolean;
  add: (item: Omit<Activity, 'id' | 'startedAt' | 'status'>) => string;
  update: (id: string, patch: ActivityPatch) => void;
  finish: (id: string, status: Exclude<ActivityStatus, 'running'>, error?: string) => void;
  dismiss: (id: string) => void;
  cancel: (id: string) => void;
  toggleCollapsed: () => void;
  setCollapsed: (c: boolean) => void;
  clearCompleted: () => void;
  getRunningCount: () => number;
}

export const useActivityStore = create<ActivityState>()(
  devtools(
    (set, get) => ({
      items: [],
      collapsed: true,
      add: (base) => {
        const id = nanoid();
        const item = { ...base, id, startedAt: Date.now(), status: 'running' as const } as Activity;
        set((s) => ({ items: [item, ...s.items], collapsed: false }));
        return id;
      },
      update: (id, patch) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? ({ ...i, ...patch } as Activity) : i)),
        })),
      finish: (id, status, error) => {
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? ({ ...i, status, ...(error ? { error } : {}) } as Activity) : i,
          ),
        }));
      },
      dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      cancel: (id) => {
        get().update(id, { status: 'canceled' });
      },
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (c) => set({ collapsed: c }),
      clearCompleted: () =>
        set((s) => ({ items: s.items.filter((i) => i.status === 'running') })),
      getRunningCount: () => get().items.filter((i) => i.status === 'running').length,
    }),
    { name: 'activity' },
  ),
);
