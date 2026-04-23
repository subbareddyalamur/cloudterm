import { useState, useMemo } from 'react';
import { AlertTriangle, AlertCircle, Info, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import { Badge } from '@/components/primitives/Badge';
import { useToastStore } from '@/stores/toast';
import { useTopologyExposure } from '@/hooks/useTopology';
import type { ExposedPort } from '@/lib/topology-types';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'all';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function severityBadgeVariant(s: string): 'danger' | 'warn' | 'info' | 'default' {
  if (s === 'critical' || s === 'high') return 'danger';
  if (s === 'medium') return 'warn';
  if (s === 'low') return 'info';
  return 'default';
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'critical') return <AlertCircle size={14} className="text-danger" />;
  if (severity === 'high') return <AlertTriangle size={14} className="text-danger" />;
  if (severity === 'medium') return <AlertTriangle size={14} className="text-warn" />;
  return <Info size={14} className="text-info" />;
}

interface ExposedPortRowProps {
  port: ExposedPort;
  onFix: (sgId: string) => void;
}

function ExposedPortRow({ port, onFix }: ExposedPortRowProps) {
  return (
    <tr className="border-b border-border/50 hover:bg-elev/50 group">
      <td className="py-2 pr-2">
        <div className="flex items-center gap-1.5">
          <SeverityIcon severity={port.severity} />
          <Badge variant={severityBadgeVariant(port.severity)} size="sm">
            {port.severity}
          </Badge>
        </div>
      </td>
      <td className="py-2 pr-2 text-[11px] font-mono text-text-pri">{port.sgId}</td>
      <td className="py-2 pr-2 text-[11px] font-mono text-text-pri">
        {port.protocol === '-1' ? 'all' : port.protocol}/{port.port}
      </td>
      <td className="py-2 pr-2 text-[11px] text-text-dim truncate max-w-[120px]">{port.source}</td>
      <td className="py-2 pr-2 text-[11px] text-text-dim truncate max-w-[100px]">{port.name}</td>
      <td className="py-2">
        <Button
          variant="ghost"
          size="xs"
          icon={<ExternalLink size={11} />}
          aria-label={`Fix security group ${port.sgId}`}
          onClick={() => onFix(port.sgId)}
          className="opacity-0 group-hover:opacity-100"
        >
          Fix
        </Button>
      </td>
    </tr>
  );
}

export interface ExposureScanProps {
  instanceId: string;
}

export function ExposureScan({ instanceId }: ExposureScanProps) {
  const push = useToastStore((s) => s.push);
  const [severityFilter, setSeverityFilter] = useState<Severity>('all');

  const { data, isLoading, error } = useTopologyExposure(instanceId);

  const sortedPorts = useMemo(() => {
    if (!data?.exposedPorts) return [];
    return [...data.exposedPorts].sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
    );
  }, [data]);

  const filteredPorts = useMemo(() => {
    if (severityFilter === 'all') return sortedPorts;
    return sortedPorts.filter((p) => p.severity === severityFilter);
  }, [sortedPorts, severityFilter]);

  const handleFix = (sgId: string) => {
    push({
      variant: 'info',
      title: 'Edit security group rules in AWS Console',
      description: `Security group: ${sgId}`,
    });
  };

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of sortedPorts) {
      counts[p.severity] = (counts[p.severity] ?? 0) + 1;
    }
    return counts;
  }, [sortedPorts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-text-dim">
        <Loader2 size={20} className="animate-spin text-accent" />
        <span className="text-sm">Scanning exposure…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-danger">
        <AlertCircle size={24} />
        <span className="text-sm">{error instanceof Error ? error.message : 'Scan failed'}</span>
      </div>
    );
  }

  if (!data || sortedPorts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-text-dim">
        <Info size={24} />
        <span className="text-sm">No internet-exposed ports detected</span>
      </div>
    );
  }

  const FILTERS: Severity[] = ['all', 'critical', 'high', 'medium', 'low'];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${
              severityFilter === f
                ? 'bg-accent text-white'
                : 'bg-elev text-text-dim hover:text-text-pri'
            }`}
            onClick={() => setSeverityFilter(f)}
          >
            {f === 'all' ? `All (${sortedPorts.length})` : `${f} (${severityCounts[f] ?? 0})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-4 py-2">
        {filteredPorts.length === 0 ? (
          <p className="text-[12px] text-text-dim mt-4">No {severityFilter} severity issues found.</p>
        ) : (
          <table className="w-full text-left" aria-label="Exposed ports">
            <thead>
              <tr className="text-text-dim text-[10px] uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-2">Severity</th>
                <th className="py-2 pr-2">SG ID</th>
                <th className="py-2 pr-2">Port/Proto</th>
                <th className="py-2 pr-2">CIDR</th>
                <th className="py-2 pr-2">Instance</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {filteredPorts.map((port, idx) => (
                <ExposedPortRow
                  key={`${port.sgId}-${port.port}-${port.protocol}-${idx}`}
                  port={port}
                  onFix={handleFix}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

ExposureScan.displayName = 'ExposureScan';
