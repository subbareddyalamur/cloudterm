import { useState, useCallback, useEffect, useMemo } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Dialog } from '@/components/primitives/Dialog';
import { Input } from '@/components/primitives/Input';
import { Badge } from '@/components/primitives/Badge';
import { api } from '@/lib/api';

export interface AuditLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AuditEntry {
  timestamp: string;
  action: string;
  instance_id: string;
  instance_name: string;
  session_id: string;
  details: string;
}

const ACTION_VARIANTS: Record<string, 'success' | 'danger' | 'warn' | 'info' | 'default'> = {
  ssh_start: 'success',
  ssh_stop: 'default',
  rdp_start: 'info',
  rdp_stop: 'default',
  upload: 'info',
  download: 'info',
  broadcast: 'warn',
  port_forward_start: 'info',
  port_forward_stop: 'default',
  clone: 'warn',
};

function actionVariant(action: string): 'success' | 'danger' | 'warn' | 'info' | 'default' {
  return ACTION_VARIANTS[action.toLowerCase()] ?? 'default';
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AuditLogModal({ open, onOpenChange }: AuditLogModalProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    const res = await api.get<AuditEntry[]>('/audit-log');
    if (res.ok) {
      setEntries(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) void fetchLog();
  }, [open, fetchLog]);

  const uniqueActions = useMemo(
    () => [...new Set(entries.map((e) => e.action))].sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    let list = entries;
    if (actionFilter) list = list.filter((e) => e.action === actionFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.instance_name.toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q) ||
          e.details.toLowerCase().includes(q) ||
          e.session_id.toLowerCase().includes(q),
      );
    }
    return list;
  }, [entries, actionFilter, search]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Session History & Audit Log"
      size="xl"
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            leftIcon={<Search size={11} />}
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-[12px] flex-1"
          />
          <select
            className="bg-elev border border-border rounded text-[12px] text-text-pri h-7 px-2 focus:outline-none focus:border-accent"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label="Filter by action"
          >
            <option value="">All actions</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button
            type="button"
            className="text-text-dim hover:text-text-pri transition-colors p-1 rounded"
            onClick={() => void fetchLog()}
            aria-label="Refresh audit log"
            title="Refresh"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-text-dim text-[12px]">Loading…</div>
        ) : (
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-elev">
                  <th className="text-left px-3 py-2 font-medium text-text-dim w-36">Time</th>
                  <th className="text-left px-3 py-2 font-medium text-text-dim w-28">Action</th>
                  <th className="text-left px-3 py-2 font-medium text-text-dim">Instance</th>
                  <th className="text-left px-3 py-2 font-medium text-text-dim hidden md:table-cell">Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-text-dim">No entries</td>
                  </tr>
                )}
                {filtered.map((entry, i) => {
                  const key = `${entry.timestamp}-${i}`;
                  const isExpanded = expanded === key;
                  return (
                    <tr
                      key={key}
                      className={`border-b border-border last:border-0 cursor-pointer ${isExpanded ? 'bg-elev' : 'hover:bg-elev'} transition-colors focus-within:outline focus-within:outline-1 focus-within:outline-accent`}
                      onClick={() => setExpanded(isExpanded ? null : key)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isExpanded ? null : key); } }}
                      tabIndex={0}
                      role="button"
                      aria-expanded={isExpanded}
                      aria-label={`${entry.action} on ${entry.instance_name || entry.instance_id}`}
                    >
                      <td className="px-3 py-2 text-text-dim whitespace-nowrap">
                        {formatTimestamp(entry.timestamp)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={actionVariant(entry.action)} size="sm">
                          {entry.action}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-text-pri max-w-[160px] truncate">
                        {entry.instance_name || entry.instance_id || '—'}
                      </td>
                      <td className="px-3 py-2 text-text-dim hidden md:table-cell max-w-[240px]">
                        {isExpanded ? (
                          <pre className="whitespace-pre-wrap font-mono text-[11px]">{entry.details}</pre>
                        ) : (
                          <span className="truncate block">{entry.details}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-text-dim">
          Showing {filtered.length} of {entries.length} entries
        </p>
      </div>
    </Dialog>
  );
}

AuditLogModal.displayName = 'AuditLogModal';
