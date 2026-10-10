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
        <span>Scanning your AWS accounts…</span>
      </div>
    );
  }
  if (!filter) {
    return (
      <div className="p-4 text-center text-text-dim text-[12px] space-y-2">
        <p>Add an account to see this fleet.</p>
        <button
          type="button"
          className="text-text-pri underline"
          onClick={() => window.dispatchEvent(new CustomEvent('ct:open-settings', { detail: { tab: 'accounts' } }))}
        >
          Add an account
        </button>
      </div>
    );
  }
  return (
    <div className="p-4 text-center text-text-dim text-[12px]">
      No matching instances
    </div>
  );
}

export function Sidebar() {
  const fetching = useInstancesStore((s) => s.loading);
  const scanning = useInstancesStore((s) => s.scanning);
  const loading = fetching || scanning;
  const filter = useInstancesStore((s) => s.filter);
  const accounts = useInstancesStore((s) => s.accounts);
  const setFilter = useInstancesStore((s) => s.setFilter);
  const collapseAll = useInstancesStore((s) => s.collapseAll);
  const expandAll = useInstancesStore((s) => s.expandAll);
  const fetchInstances = useInstancesStore((s) => s.fetchInstances);
  const [allExpanded, setAllExpanded] = useState(false);

  const watchScans = useInstancesStore((s) => s.watchScans);
  useEffect(() => {
    void fetchInstances();
    return watchScans();
  }, [fetchInstances, watchScans]);

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
      className="h-full flex flex-col bg-side overflow-hidden"
      aria-label="Fleet"
      role="tree"
    >
      <div className="px-2 pt-2 pb-2 border-b border-border space-y-1.5">
        <Input
          leftIcon={<Search size={11} />}
          placeholder="Filter by name, id, IP, account, region"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full text-[12px] min-w-0"
          aria-label="Filter instances"
        />
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[11px] text-text-dim">
            {loading && accounts.length === 0 ? 'Scanning…' : `${accounts.length} account${accounts.length === 1 ? '' : 's'}`}
          </span>
          <button
            type="button"
            onClick={toggleExpandCollapse}
            className="inline-flex items-center gap-1 text-[11px] text-text-mut hover:text-text-pri transition-colors"
          >
            {allExpanded ? <ChevronsDownUp size={12} /> : <ChevronsUpDown size={12} />}
            {allExpanded ? 'Collapse all' : 'Expand all'}
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
