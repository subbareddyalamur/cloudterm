import { useEffect, useState, useCallback } from 'react';
import { Video, ChevronUp, ChevronDown } from 'lucide-react';
import { RecordingRow } from './RecordingRow';
import type { Recording } from './RecordingRow';
import { api } from '@/lib/api';

type FilterType = 'all' | 'ssh' | 'rdp';
type SortKey = 'name' | 'size' | 'mod_time';
type SortDir = 'asc' | 'desc';

interface RecordingsListProps {
  onPlay: (r: Recording) => void;
}

const FILTER_LABELS: Array<{ value: FilterType; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'ssh', label: 'SSH' },
  { value: 'rdp', label: 'RDP' },
];

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="opacity-30"><ChevronDown size={10} /></span>;
  return sortDir === 'asc' ? <ChevronUp size={10} className="text-accent" /> : <ChevronDown size={10} className="text-accent" />;
}

export function RecordingsList({ onPlay }: RecordingsListProps) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortKey, setSortKey] = useState<SortKey>('mod_time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const fetchRecordings = useCallback(async () => {
    setLoading(true);
    const result = await api.get<Recording[]>('/recordings');
    if (result.ok) setRecordings(result.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchRecordings();
  }, [fetchRecordings]);

  const handleDelete = useCallback(async (name: string) => {
    const result = await api.delete<void>(`/recordings/${encodeURIComponent(name)}`);
    if (result.ok) {
      await fetchRecordings();
    }
  }, [fetchRecordings]);

  const handleSort = (col: SortKey) => {
    if (col === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col);
      setSortDir('desc');
    }
  };

  const filtered = recordings
    .filter((r) => filter === 'all' || r.type === filter)
    .sort((a, b) => {
      const cmp =
        sortKey === 'name'
          ? a.name.localeCompare(b.name)
          : sortKey === 'size'
            ? a.size - b.size
            : new Date(a.mod_time).getTime() - new Date(b.mod_time).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Video size={14} className="text-accent" />
        <span className="text-[13px] font-semibold text-text-pri">Session Recordings</span>
        <div className="ml-auto flex gap-1">
          {FILTER_LABELS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors ${
                filter === f.value
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-elev text-text-dim hover:text-text-pri border border-transparent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-text-dim text-[12px]">Loading recordings…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-text-dim text-[12px]">
          {recordings.length === 0 ? 'No recordings yet' : `No ${filter} recordings`}
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-elev/50">
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-text-dim">
                <th className="px-4 py-2 text-left font-medium">Protocol</th>
                <th className="px-4 py-2 text-left font-medium">
                  <button type="button" className="flex items-center gap-1 hover:text-text-pri" onClick={() => handleSort('name')}>
                    Filename <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  <button type="button" className="flex items-center gap-1 hover:text-text-pri" onClick={() => handleSort('size')}>
                    Size <SortIcon col="size" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  <button type="button" className="flex items-center gap-1 hover:text-text-pri" onClick={() => handleSort('mod_time')}>
                    Date <SortIcon col="mod_time" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <RecordingRow
                  key={r.name}
                  recording={r}
                  onPlay={onPlay}
                  onDelete={(name) => void handleDelete(name)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
