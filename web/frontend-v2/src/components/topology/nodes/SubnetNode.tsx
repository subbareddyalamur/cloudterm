import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import type { TopoNode } from '@/lib/topology-types';
import { useTopologyContext } from '../TopologyContext';

function calcIpUtilization(cidr: string, availableIps: number): { total: number; used: number; pct: number } | null {
  const parts = cidr.split('/');
  if (parts.length !== 2) return null;
  const prefix = parseInt(parts[1] ?? '0', 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  const total = Math.pow(2, 32 - prefix) - 5;
  if (total <= 0) return null;
  const used = Math.max(0, total - availableIps);
  const pct = (used / total) * 100;
  return { total, used, pct };
}

export function SubnetNode({ data, selected }: NodeProps) {
  const node = data as unknown as TopoNode;
  const info = node.data;
  const { riskMode } = useTopologyContext();

  const cidr = typeof info['cidr'] === 'string' ? info['cidr'] : '';
  const az = typeof info['az'] === 'string' ? info['az'] : '';
  const isPublic = Boolean(info['isPublic']);
  const availableIps = typeof info['availableIps'] === 'number' ? info['availableIps'] : -1;

  // Risk: medium for public subnet, low for private
  const riskLevel = isPublic ? 'medium' : 'low';
  const riskColor = riskLevel === 'medium' ? '#f97316' : '#22c55e';
  const riskLabel = riskLevel === 'medium' ? 'MED' : 'LOW';

  const borderColor = selected
    ? 'var(--accent)'
    : riskMode
      ? riskColor
      : isPublic
        ? 'rgba(61,214,140,0.38)'
        : 'rgba(96,165,250,0.32)';

  const bgColor = selected
    ? 'rgba(124,92,255,0.05)'
    : isPublic
      ? 'rgba(61,214,140,0.04)'
      : 'rgba(96,165,250,0.04)';

  const typeColor = isPublic ? 'var(--success)' : 'var(--info)';
  const typeBg = isPublic ? 'rgba(61,214,140,0.15)' : 'rgba(96,165,250,0.15)';
  const dividerColor = isPublic ? 'rgba(61,214,140,0.15)' : 'rgba(96,165,250,0.12)';

  // IP utilization bar
  const ipUtil = cidr && availableIps >= 0 ? calcIpUtilization(cidr, availableIps) : null;
  const barFillColor = ipUtil
    ? ipUtil.pct >= 90
      ? '#ef4444'
      : ipUtil.pct >= 70
        ? '#f97316'
        : '#22c55e'
    : '#22c55e';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box' as const,
        borderRadius: '6px',
        border: riskMode ? `2px solid ${borderColor}` : `1.5px solid ${borderColor}`,
        background: bgColor,
        transition: 'border-color 0.15s, background 0.15s',
        position: 'relative' as const,
      }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={100}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(156,163,175,0.5)', border: '1px solid rgba(156,163,175,0.7)' }}
        lineStyle={{ border: '1px solid rgba(156,163,175,0.25)' }}
      />
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      {/* Two-line header: badge+name on row 1; CIDR+AZ on row 2 */}
      <div
        style={{
          padding: '8px 12px 7px',
          borderBottom: `1px solid ${dividerColor}`,
          position: 'relative' as const,
        }}
      >
        {/* Risk badge — top-right corner */}
        {riskMode && (
          <span
            style={{
              position: 'absolute',
              top: '4px',
              right: '6px',
              fontSize: '7px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              padding: '1px 4px',
              borderRadius: '3px',
              background: riskColor,
              color: '#fff',
              lineHeight: 1.4,
            }}
          >
            {riskLabel}
          </span>
        )}

        {/* Row 1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span
            style={{
              fontSize: '8px',
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase' as const,
              padding: '1px 5px',
              borderRadius: '3px',
              background: typeBg,
              color: typeColor,
              flexShrink: 0,
            }}
          >
            {isPublic ? 'Public' : 'Private'}
          </span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--text-pri)',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              lineHeight: 1.3,
              flex: 1,
              minWidth: 0,
            }}
          >
            {node.label}
          </span>
        </div>
        {/* Row 2 */}
        {(cidr || az) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '3px',
            }}
          >
            {cidr && (
              <span
                style={{
                  fontSize: '9px',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font-mono, monospace)',
                  flexShrink: 0,
                }}
              >
                {cidr}
              </span>
            )}
            {az && (
              <span
                style={{
                  fontSize: '9px',
                  color: 'var(--text-dim)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {az}
              </span>
            )}
          </div>
        )}

        {/* IP utilization bar — at the bottom of the header area */}
        {ipUtil && (
          <div
            style={{
              marginTop: '5px',
              height: '4px',
              borderRadius: '2px',
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}
            title={`${ipUtil.used}/${ipUtil.total} IPs used (${Math.round(ipUtil.pct)}%)`}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, ipUtil.pct)}%`,
                background: barFillColor,
                borderRadius: '2px',
                transition: 'width 0.3s',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

SubnetNode.displayName = 'SubnetNode';
