import { Zap } from 'lucide-react';
import { useActivityStore } from '@/stores/activity';

export interface ActivityPillProps {
  count: number;
}

export function ActivityPill({ count }: ActivityPillProps) {
  const setCollapsed = useActivityStore((s) => s.setCollapsed);

  return (
    <button
      type="button"
      onClick={() => setCollapsed(false)}
      className="flex items-center gap-2 h-9 px-3.5 rounded-lg bg-surface border border-border shadow-lg text-text-pri hover:bg-elev transition-colors"
      aria-label={`Activity center: ${count} active`}
    >
      <Zap size={14} className="text-accent shrink-0" />
      <span className="text-[12px] font-medium">
        {count > 0 ? (
          <>
            <span className="text-accent font-semibold">{count}</span>
            {' active'}
          </>
        ) : (
          'Activity'
        )}
      </span>
      <span className="text-[11px] text-text-dim" aria-hidden="true">↑</span>
    </button>
  );
}

ActivityPill.displayName = 'ActivityPill';
