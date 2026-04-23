import { useMemo } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useActivityStore, type Activity } from '@/stores/activity';
import { TransferItem } from './TransferItem';
import { PortForwardItem } from './PortForwardItem';
import { MP4Item } from './MP4Item';

const VISIBLE_LIMIT = 5;

function ActivityItemRenderer({ activity }: { activity: Activity }) {
  switch (activity.kind) {
    case 'transfer':
      return <TransferItem activity={activity} />;
    case 'port-forward':
      return <PortForwardItem activity={activity} />;
case 'mp4':
      return <MP4Item activity={activity} />;
  }
}

export function ActivityPanel() {
  const setCollapsed = useActivityStore((s) => s.setCollapsed);
  const clearCompleted = useActivityStore((s) => s.clearCompleted);
  const items = useActivityStore((s) => s.items);

  const runningCount = useMemo(() => items.filter((i) => i.status === 'running').length, [items]);
  const extraCount = useMemo(() => Math.max(0, items.length - VISIBLE_LIMIT), [items]);

  return (
    <div
      className="bg-surface border border-border rounded-lg shadow-2xl overflow-hidden"
      style={{ width: 360, maxHeight: 440 }}
      role="region"
      aria-label="Activity center"
    >
      <div className="flex items-center justify-between px-3 h-9 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-text-pri">Activity</span>
          {runningCount > 0 && (
            <span className="text-[10px] font-semibold bg-accent/15 text-accent px-1.5 py-0.5 rounded">
              {runningCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="text-text-dim hover:text-text-pri p-1 rounded transition-colors"
            aria-label="Minimize activity panel"
          >
            <ChevronDown size={13} />
          </button>
          <button
            type="button"
            onClick={() => clearCompleted()}
            className="text-text-dim hover:text-text-pri p-1 rounded transition-colors"
            aria-label="Clear completed activities"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div
        className="scrollbar-none flex flex-col divide-y divide-border"
        style={{ maxHeight: 384, overflowY: 'auto' }}
        aria-live="polite"
        aria-label="Active tasks"
      >
        {items.slice(0, VISIBLE_LIMIT).map((item) => (
          <ActivityItemRenderer key={item.id} activity={item} />
        ))}
        {extraCount > 0 && (
          <div className="px-4 py-2 text-[11px] text-text-dim text-center">
            ↓ {extraCount} more
          </div>
        )}
      </div>
    </div>
  );
}

ActivityPanel.displayName = 'ActivityPanel';
