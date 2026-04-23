import { Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';

interface MetricsData {
  cpuPercent: number;
  memPercent: number;
  diskPercent: number;
}

interface QuickMetricsSectionProps {
  instanceId: string;
}

function gaugeColor(pct: number): string {
  if (pct < 70) return 'var(--success)';
  if (pct < 90) return 'var(--warn)';
  return 'var(--danger)';
}

function GaugeBar({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  const color = gaugeColor(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-[11px]">
        <span className="text-text-mut">{label}</span>
        {loading ? (
          <span className="text-text-dim">—</span>
        ) : (
          <span className="font-medium" style={{ color }}>{value}%</span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-elev overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: loading ? '0%' : `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function QuickMetricsSection({ instanceId }: QuickMetricsSectionProps) {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<MetricsData>(`/instance-metrics?instance_id=${instanceId}`).then((r) => {
      if (r.ok) setMetrics(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [instanceId]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Activity size={13} className="text-accent" />
        <span className="text-[11px] font-semibold text-text-dim uppercase tracking-wide">Quick Metrics</span>
      </div>
      <div className="space-y-3">
        <GaugeBar label="CPU" value={metrics?.cpuPercent ?? 0} loading={loading} />
        <GaugeBar label="Memory" value={metrics?.memPercent ?? 0} loading={loading} />
        <GaugeBar label="Disk" value={metrics?.diskPercent ?? 0} loading={loading} />
      </div>
    </div>
  );
}
