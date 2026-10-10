import { memo, type KeyboardEvent } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useInstancesStore } from '@/stores/instances';
import type { AccountNode } from '@/lib/types';
import { RegionGroup } from './RegionGroup';

export interface AccountGroupProps {
  account: AccountNode;
}

export const AccountGroup = memo(function AccountGroup({ account }: AccountGroupProps) {
  const isOpen = useInstancesStore((s) => !!s.expanded[`account:${account.account_id}`]);
  const toggle = useInstancesStore((s) => s.toggleExpand);

  const allInstances = account.regions.flatMap((r) => r.groups.flatMap((g) => g.instances));
  const runningCount = allInstances.filter((i) => i.state === 'running').length;

  const handleClick = () => toggle(`account:${account.account_id}`);
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(`account:${account.account_id}`);
    }
  };

  return (
    <div className="account-group border-b border-border last:border-b-0">
      <button
        type="button"
        className="w-full sticky top-0 z-10 bg-side flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-elev transition-colors"
        aria-expanded={isOpen}
        onClick={handleClick}
        onKeyDown={handleKey}
      >
        {isOpen ? (
          <ChevronDown size={12} className="text-text-dim shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-text-dim shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-text-pri truncate">
            {account.account_alias || account.profile}
          </div>
          <div className="font-mono text-[10px] text-text-dim truncate">{account.account_id}</div>
        </div>
        <span className="text-[10px] shrink-0 tabular-nums">
          <span className="text-success">{runningCount} on</span>
          <span className="text-text-dim"> · {allInstances.length}</span>
        </span>
      </button>
      {isOpen &&
        account.regions.map((r) => (
          <RegionGroup key={r.region} accountId={account.account_id} region={r} />
        ))}
    </div>
  );
});
