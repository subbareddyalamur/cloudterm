import { Handle, Position, type NodeProps } from '@xyflow/react';
import { PlatformIcon } from '@/components/primitives/PlatformIcon';
import type { TopoNode } from '@/lib/topology-types';
import type { Platform } from '@/lib/platform';
import { useTopologyContext } from '../TopologyContext';

export function InstanceNode({ data, selected }: NodeProps) {
  const node = data as unknown as TopoNode;
  const info = node.data;
  const { riskMode } = useTopologyContext();

  const state = typeof info['state'] === 'string' ? info['state'] : 'unknown';
  const isRunning = state === 'running';
  const instanceType = typeof info['instanceType'] === 'string' ? info['instanceType'] : '';
  const privateIp = typeof info['privateIp'] === 'string' ? info['privateIp'] : '';
  const rawPlatform = typeof info['platform'] === 'string' ? info['platform'] : 'linux';
  const platform = rawPlatform as Platform;
  const sgCount = Array.isArray(info['securityGroups']) ? (info['securityGroups'] as unknown[]).length : 0;
  const publicIp = typeof info['publicIp'] === 'string' ? info['publicIp'] : '';

  // Risk level: high if public IP present, low otherwise
  const hasPublicIp = publicIp.length > 0;
  const riskLevel = hasPublicIp ? 'high' : 'low';
  const riskColor = riskLevel === 'high' ? '#ef4444' : '#22c55e';
  const riskLabel = riskLevel === 'high' ? 'HIGH' : 'LOW';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '8px 10px',
        borderRadius: 'var(--radius)',
        border: selected
          ? '1.5px solid var(--accent)'
          : riskMode
            ? `2px solid ${riskColor}`
            : isRunning
              ? '1px solid rgba(61,214,140,0.3)'
              : '1px solid rgba(239,68,68,0.3)',
        background: selected
          ? 'rgba(124,92,255,0.06)'
          : isRunning
            ? 'rgba(61,214,140,0.03)'
            : 'rgba(239,68,68,0.03)',
        boxShadow: selected
          ? '0 0 0 3px rgba(124,92,255,0.14), 0 2px 8px rgba(0,0,0,0.3)'
          : '0 1px 3px rgba(0,0,0,0.25)',
        width: '100%',
        boxSizing: 'border-box' as const,
        transition: 'all 0.15s',
        cursor: 'pointer',
        userSelect: 'none' as const,
        position: 'relative' as const,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      {/* Risk badge — top-right corner when risk mode is active */}
      {riskMode && (
        <span
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            fontSize: '7px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            padding: '1px 4px',
            borderRadius: '3px',
            background: riskColor,
            color: '#fff',
            lineHeight: 1.4,
          }}
          title={hasPublicIp ? `Public IP: ${publicIp}` : 'Private instance'}
        >
          {riskLabel}
        </span>
      )}

      {/* Row 1: state dot + name + platform icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: isRunning ? 'var(--success)' : 'var(--danger)',
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
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
        <PlatformIcon platform={platform} size={12} />
      </div>

      {/* Row 2: instance ID */}
      <div
        style={{
          fontSize: '9px',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono, monospace)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={String(node.id)}
      >
        {node.id}
      </div>

      {/* Row 3: type badge + IP + SG count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {instanceType && (
          <span
            style={{
              fontSize: '9px',
              fontWeight: 600,
              color: 'var(--info)',
              background: 'rgba(96,165,250,0.12)',
              padding: '1px 5px',
              borderRadius: '3px',
              flexShrink: 0,
            }}
          >
            {instanceType}
          </span>
        )}
        {privateIp && (
          <span
            style={{
              fontSize: '9px',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono, monospace)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
            title={privateIp}
          >
            {privateIp}
          </span>
        )}
        {sgCount > 0 && (
          <span
            style={{
              fontSize: '9px',
              color: 'var(--warn)',
              background: 'rgba(245,158,11,0.1)',
              padding: '1px 4px',
              borderRadius: '3px',
              flexShrink: 0,
              marginLeft: 'auto',
            }}
            title={`${sgCount} security group${sgCount !== 1 ? 's' : ''}`}
          >
            {sgCount}sg
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

InstanceNode.displayName = 'InstanceNode';
