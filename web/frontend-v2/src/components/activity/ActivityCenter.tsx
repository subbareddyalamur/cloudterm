import { useMemo } from 'react';
import { useActivityStore } from '@/stores/activity';
import { ActivityPill } from './ActivityPill';
import { ActivityPanel } from './ActivityPanel';

export function ActivityCenter() {
  const collapsed = useActivityStore((s) => s.collapsed);
  const items = useActivityStore((s) => s.items);
  const runningCount = useMemo(
    () => items.filter((i) => i.status === 'running').length,
    [items],
  );

  if (items.length === 0) return null;

  return (
    <div className="fixed right-6 bottom-6 z-50">
      {collapsed ? <ActivityPill count={runningCount} /> : <ActivityPanel />}
    </div>
  );
}

ActivityCenter.displayName = 'ActivityCenter';
