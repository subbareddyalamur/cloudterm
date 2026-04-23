import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Server, Play, Square, Globe, Cpu } from 'lucide-react';
import { StatTile } from './StatTile';
import { AccountsBreakdown } from './AccountsBreakdown';
import { Button } from '@/components/primitives';
import { PlatformIcon } from '@/components/primitives/PlatformIcon';
import type { Platform } from '@/lib/platform';
import { api } from '@/lib/api';

interface PlatformMix {
  linux?: number;
  rhel?: number;
  ubuntu?: number;
  windows?: number;
  suse?: number;
  [key: string]: number | undefined;
}

export interface AccountRow {
  account_id: string;
  account_alias: string;
  profile?: string;
  total: number;
  running: number;
  stopped: number;
  platforms?: PlatformMix;
}

interface FleetSummary {
  total: number;
  running: number;
  stopped: number;
  platforms: PlatformMix;
  accounts: AccountRow[];
  scan_duration?: string;
}

const FALLBACK: FleetSummary = {
  total: 0, running: 0, stopped: 0, platforms: {}, accounts: [],
};

const PLATFORM_COLORS: Record<string, string> = {
  rhel: '#ee0000', windows: '#0078d4', linux: '#f0c040', ubuntu: '#e95420', suse: '#73ba25',
  'amazon-linux': '#ff9900', debian: '#a80030', centos: '#262577', fedora: '#294172',
};

export function FleetDashboard() {
  const [summary, setSummary] = useState<FleetSummary>(FALLBACK);
  const [instanceTypes, setInstanceTypes] = useState<Array<{ type: string; count: number }>>([]);
  const [regions, setRegions] = useState<Array<{ region: string; count: number }>>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [sumResult, instResult] = await Promise.all([
      api.get<Partial<FleetSummary>>('/fleet-summary'),
      api.get<{ accounts: Array<{ regions: Array<{ region: string; groups: Array<{ instances: Array<{ instance_type: string; state: string }> }> }> }> }>('/instances'),
    ]);
    if (sumResult.ok && sumResult.data) {
      const d = sumResult.data;
      setSummary({
        ...FALLBACK,
        ...d,
        accounts: Array.isArray(d.accounts) ? d.accounts : [],
        platforms: d.platforms ?? {},
      });
    }
    if (instResult.ok) {
      const typeCounts: Record<string, number> = {};
      const regionCounts: Record<string, number> = {};
      for (const a of instResult.data.accounts ?? []) {
        for (const r of a.regions ?? []) {
          let regionTotal = 0;
          for (const g of r.groups ?? []) {
            for (const i of g.instances ?? []) {
              const t = i.instance_type || 'unknown';
              typeCounts[t] = (typeCounts[t] ?? 0) + 1;
              regionTotal++;
            }
          }
          regionCounts[r.region] = (regionCounts[r.region] ?? 0) + regionTotal;
        }
      }
      setInstanceTypes(
        Object.entries(typeCounts).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      );
      setRegions(
        Object.entries(regionCounts).map(([region, count]) => ({ region, count })).sort((a, b) => b.count - a.count),
      );
    }
    setLoading(false);
  };

  useEffect(() => { void fetchData(); }, []);

  const linuxCount = useMemo(() => {
    const p = summary.platforms ?? {};
    return (p.linux ?? 0) + (p.rhel ?? 0) + (p.ubuntu ?? 0) + (p.suse ?? 0);
  }, [summary.platforms]);
  const windowsCount = summary.platforms?.windows ?? 0;

  const platformEntries = useMemo(() =>
    Object.entries(summary.platforms ?? {})
      .filter(([, v]) => typeof v === 'number' && v > 0)
      .map(([name, count]) => ({ name, count: count as number }))
      .sort((a, b) => b.count - a.count),
  [summary.platforms]);

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[16px] font-semibold text-text-pri">Fleet Dashboard</h1>
          <p className="text-[11px] text-text-dim mt-0.5">
            {summary.accounts.length} account{summary.accounts.length === 1 ? '' : 's'}
            {summary.scan_duration ? ` · scanned in ${summary.scan_duration}` : ''}
            {' · '}{regions.length} region{regions.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
          onClick={() => void fetchData()}
          disabled={loading}
          aria-label="Refresh"
        >
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile
          label="Running"
          value={summary.total === 0 ? '—' : String(summary.running)}
          delta={summary.total > 0 ? `${Math.round((summary.running / summary.total) * 100)}% of fleet` : undefined}
          accent="success"
          icon={<Play size={14} />}
        />
        <StatTile
          label="Stopped"
          value={summary.total === 0 ? '—' : String(summary.stopped)}
          delta={summary.total > 0 ? `${Math.round((summary.stopped / summary.total) * 100)}% of fleet` : undefined}
          accent="danger"
          icon={<Square size={14} />}
        />
        <StatTile
          label="Total"
          value={summary.total === 0 ? '—' : String(summary.total)}
          delta={summary.total > 0 ? `${linuxCount} Linux · ${windowsCount} Windows` : undefined}
          accent="info"
          icon={<Server size={14} />}
        />
      </div>

      <AccountsBreakdown accounts={summary.accounts} />

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <Server size={13} className="text-text-dim" />
            <span className="text-[12px] font-semibold text-text-pri">Platform Distribution</span>
          </div>
          {platformEntries.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-text-dim">No data</div>
          ) : (
            <div className="p-4 space-y-2">
              {platformEntries.map((p) => {
                const pct = summary.total > 0 ? (p.count / summary.total) * 100 : 0;
                return (
                  <div key={p.name} className="flex items-center gap-3 text-[12px]">
                    <span className="w-20 flex items-center gap-1.5 text-text-pri font-semibold uppercase">
                      <PlatformIcon platform={p.name as Platform} size={14} />
                      {p.name}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: PLATFORM_COLORS[p.name] ?? 'var(--text-dim)' }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono tabular-nums text-text-pri font-medium">{p.count}</span>
                    <span className="w-10 text-right text-text-dim">{pct < 1 && pct > 0 ? pct.toFixed(1) : pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <Globe size={13} className="text-text-dim" />
            <span className="text-[12px] font-semibold text-text-pri">Region Distribution</span>
          </div>
          {regions.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-text-dim">No data</div>
          ) : (
            <div className="p-4 space-y-2">
              {regions.map((r) => {
                const pct = summary.total > 0 ? (r.count / summary.total) * 100 : 0;
                return (
                  <div key={r.region} className="flex items-center gap-3 text-[12px]">
                    <span className="w-24 font-mono text-text-pri font-medium truncate">{r.region}</span>
                    <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right font-mono tabular-nums text-text-pri font-medium">{r.count}</span>
                    <span className="w-10 text-right text-text-dim">{pct < 1 && pct > 0 ? pct.toFixed(1) : pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <Cpu size={13} className="text-text-dim" />
          <span className="text-[12px] font-semibold text-text-pri">Top Instance Types</span>
          <span className="text-[10px] text-text-dim ml-auto">{instanceTypes.length} types shown</span>
        </div>
        {instanceTypes.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-text-dim">No data</div>
        ) : (
          <div className="grid grid-cols-2 divide-x divide-border">
            {[instanceTypes.slice(0, 5), instanceTypes.slice(5, 10)].map((col, ci) => (
              <div key={ci} className="divide-y divide-border">
                {col.map((t) => (
                  <div key={t.type} className="flex items-center justify-between px-4 py-2 hover:bg-elev/50 transition-colors">
                    <span className="text-[12px] font-mono text-text-pri">{t.type}</span>
                    <span className="text-[12px] font-mono tabular-nums text-text-mut">{t.count}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
