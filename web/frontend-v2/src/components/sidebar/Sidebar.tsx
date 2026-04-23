import { useEffect, useMemo, useState } from 'react';
import { Search, Loader, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useInstancesStore } from '@/stores/instances';
import { getFilteredAccounts } from '@/lib/filter';
import { Input } from '@/components/primitives/Input';
import { FavoritesPanel } from './FavoritesPanel';
import { AccountGroup } from './AccountGroup';
import { InstanceContextMenu } from './InstanceContextMenu';

function EmptyState({ filter, loading }: { filter: string; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-text-dim text-[12px]">
        <Loader size={16} className="animate-spin" />
        <span>Scanning fleet…</span>
      </div>
    );
  }
  return (
    <div className="p-4 text-center text-text-dim text-[12px]">
      {filter ? 'No matching instances' : 'No instances found'}
    </div>
  );
}

export function Sidebar() {
  const loading = useInstancesStore((s) => s.loading);
  const filter = useInstancesStore((s) => s.filter);
  const accounts = useInstancesStore((s) => s.accounts);
  const setFilter = useInstancesStore((s) => s.setFilter);
  const collapseAll = useInstancesStore((s) => s.collapseAll);
  const expandAll = useInstancesStore((s) => s.expandAll);
  const fetchInstances = useInstancesStore((s) => s.fetchInstances);
  const [allExpanded, setAllExpanded] = useState(false);

  useEffect(() => {
    void fetchInstances();
  }, [fetchInstances]);

  const filtered = useMemo(() => getFilteredAccounts(accounts, filter), [accounts, filter]);
  const isEmpty = filtered.length === 0;

  const toggleExpandCollapse = () => {
    if (allExpanded) {
      collapseAll();
    } else {
      expandAll();
    }
    setAllExpanded(!allExpanded);
  };

  return (
    <div
      className="h-full flex flex-col bg-surface overflow-hidden"
      aria-label="Instance sidebar"
      role="tree"
    >
      <div className="px-2 pt-2 pb-1.5 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Input
            leftIcon={<Search size={11} />}
            placeholder="Filter instances…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 text-[12px] min-w-0"
            aria-label="Filter instances"
          />
          <button
            type="button"
            onClick={toggleExpandCollapse}
            className="text-text-dim hover:text-text-pri transition-colors shrink-0 p-0.5"
            title={allExpanded ? 'Collapse all' : 'Expand all'}
            aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
          >
            {allExpanded ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <EmptyState filter={filter} loading={loading} />
        ) : (
          <>
            <FavoritesPanel />
            {filtered.map((a) => (
              <AccountGroup key={a.account_id} account={a} />
            ))}
          </>
        )}
      </div>

      <InstanceContextMenu />
    </div>
  );
}
