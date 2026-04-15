import { useCallback, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { instanceMetrics } from "@/lib/api";
import type { InstanceMetrics as Metrics } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuickMetricsProps {
  instanceId: string;
}

interface GaugeProps {
  label: string;
  pct: number;
  detail: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gaugeColor(pct: number): string {
  if (pct > 90) return "bg-red-500";
  if (pct > 70) return "bg-orange-400";
  return "bg-emerald-500";
}

function gaugeTextColor(pct: number): string {
  if (pct > 90) return "text-red-400";
  if (pct > 70) return "text-orange-400";
  return "text-emerald-400";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Gauge({ label, pct, detail }: GaugeProps) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={gaugeTextColor(clamped)}>{clamped.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${gaugeColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-1">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="h-2 rounded-full bg-muted" />
          <div className="h-2 w-28 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuickMetrics
// ---------------------------------------------------------------------------

export function QuickMetrics({ instanceId }: QuickMetricsProps) {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const m = await instanceMetrics(instanceId);
      setData(m);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  // Not yet loaded — show button
  if (!data && !loading && !error) {
    return (
      <Button size="sm" variant="outline" className="w-full" onClick={load}>
        <Activity className="mr-1.5 size-3.5" />
        Load Metrics
      </Button>
    );
  }

  // Loading
  if (loading && !data) return <Skeleton />;

  // Error
  if (error) {
    return (
      <div className="space-y-2 text-center">
        <p className="text-xs text-red-400">{error}</p>
        <Button size="sm" variant="outline" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const cpuPct = data.cpu_count > 0 ? (data.cpu_load / data.cpu_count) * 100 : 0;

  return (
    <div className="space-y-3">
      <Gauge
        label="CPU Load"
        pct={cpuPct}
        detail={`${data.cpu_load.toFixed(2)} / ${data.cpu_count} cores`}
      />
      <Gauge
        label="Memory"
        pct={data.mem_used_pct}
        detail={`${data.mem_used_mb} / ${data.mem_total_mb} MB`}
      />
      <Gauge
        label="Disk (/)"
        pct={data.disk_used_pct}
        detail={`${data.disk_used_gb.toFixed(1)} / ${data.disk_total_gb.toFixed(1)} GB`}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Uptime: {data.uptime || "N/A"}</span>
        <button
          className="hover:text-foreground disabled:opacity-50"
          title="Refresh Metrics"
          disabled={loading}
          onClick={load}
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Activity className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
