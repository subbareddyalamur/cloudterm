import { useEffect, useState } from 'react';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { PlatformPie } from './PlatformPie';
import { api } from '@/lib/api';

interface AccountBreakdown {
  account_id: string;
  account_alias: string;
  running: number;
  stopped: number;
  total: number;
  platforms?: Record<string, number>;
}

interface FleetSummary {
  total: number;
  running: number;
  stopped: number;
  platforms: Record<string, number>;
  accounts: AccountBreakdown[];
}

interface PlatformSlice {
  name: string;
  count: number;
  color: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  linux: 'var(--success)',
  'amazon-linux': 'var(--warn)',
  ubuntu: '#e95420',
  rhel: 'var(--danger)',
  suse: 'var(--accent-2)',
  windows: 'var(--info)',
};

const DEFAULT_SUMMARY: FleetSummary = {
  total: 0, running: 0, stopped: 0, platforms: {}, accounts: [],
};

interface FullFleetViewProps {
  onExposureScan?: () => void;
}

export function FullFleetView({ onExposureScan }: FullFleetViewProps) {
  const [summary, setSummary] = useState<FleetSummary>(DEFAULT_SUMMARY);

  useEffect(() => {
    api.get<FleetSummary>('/fleet-summary').then((r) => {
      if (r.ok) setSummary(r.data);
    }).catch(() => {});
  }, []);

  const platformSlices: PlatformSlice[] = Object.entries(summary.platforms ?? {}).map(
    ([name, count]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      count,
      color: PLATFORM_COLORS[name.toLowerCase()] ?? 'var(--text-dim)',
    }),
  ).sort((a, b) => b.count - a.count);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-text-pri">Full Fleet View</h2>
        <button
          type="button"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-danger/15 text-danger hover:bg-danger/25 transition-colors"
          onClick={onExposureScan}
        >
          <AlertTriangle size={11} />
          Exposure scan
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-surface rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border text-[11px] font-semibold text-text-dim uppercase tracking-wide">
            Account Breakdown
          </div>
          {summary.accounts.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-text-dim">No account data</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-2 text-left font-medium">Account</th>
                  <th className="px-4 py-2 text-right font-medium">Running</th>
                  <th className="px-4 py-2 text-right font-medium">Stopped</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summary.accounts.map((a) => (
                  <tr key={a.account_id} className="hover:bg-elev/50 transition-colors">
                    <td className="px-4 py-2.5 text-text-pri">{a.account_alias}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-success font-medium">{a.running}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-danger font-medium">{a.stopped}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-text-mut">{a.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-surface rounded-lg border border-border p-4 flex flex-col items-center gap-3">
          <div className="text-[11px] font-semibold text-text-dim uppercase tracking-wide self-start">Platform Mix</div>
          <PlatformPie platforms={platformSlices} />
          <div className="space-y-1.5 w-full">
            {platformSlices.map((p) => (
              <div key={p.name} className="flex items-center gap-2 text-[11px]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                <span className="text-text-mut flex-1">{p.name}</span>
                <span className="text-text-pri font-medium">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <TrendingUp size={13} className="text-accent" />
          <span className="text-[12px] font-semibold text-text-pri">Fleet Summary</span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          {[
            { label: 'Total Instances', value: summary.total, accent: 'text-text-pri' },
            { label: 'Running', value: summary.running, accent: 'text-success' },
            { label: 'Stopped', value: summary.stopped, accent: 'text-danger' },
          ].map((tile) => (
            <div key={tile.label} className="px-6 py-4 text-center">
              <div className={`text-3xl font-bold ${tile.accent}`}>{tile.value}</div>
              <div className="text-[11px] text-text-dim mt-1">{tile.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
