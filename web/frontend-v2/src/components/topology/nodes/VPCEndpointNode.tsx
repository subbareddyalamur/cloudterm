import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TopoNode } from '@/lib/topology-types';

function shortServiceName(serviceName: string): string {
  const parts = serviceName.split('.');
  return parts[parts.length - 1] ?? serviceName;
}

export function VPCEndpointNode({ data, selected }: NodeProps) {
  const node = data as unknown as TopoNode;
  const info = node.data;
  const serviceName = typeof info['serviceName'] === 'string' ? info['serviceName'] : '';
  const epType = typeof info['type'] === 'string' ? info['type'] : '';
  const state = typeof info['state'] === 'string' ? info['state'] : '';
  const isActive = state === 'available';

  const isInterface = epType === 'Interface';
  const borderColor = isActive
    ? (isInterface ? 'rgba(52,211,153,0.5)' : 'rgba(96,165,250,0.5)')
    : 'rgba(239,68,68,0.4)';
  const bgColor = isActive
    ? (isInterface ? 'rgba(52,211,153,0.05)' : 'rgba(96,165,250,0.05)')
    : 'rgba(239,68,68,0.04)';
  const accentColor = isInterface ? '#6ee7b7' : '#93c5fd';
  const accentBg = isInterface ? 'rgba(52,211,153,0.14)' : 'rgba(96,165,250,0.14)';

  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: '8px',
        border: selected ? '2px solid var(--accent)' : `1.5px solid ${borderColor}`,
        background: selected ? 'rgba(124,92,255,0.08)' : bgColor,
        boxShadow: selected ? '0 0 0 3px rgba(124,92,255,0.12)' : '0 1px 4px rgba(0,0,0,0.18)',
        width: '100%',
        boxSizing: 'border-box' as const,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '4px',
        cursor: 'pointer',
        userSelect: 'none' as const,
      }}
    >
      <Handle type="target" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      {/* Row 1: type badge + short service name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            fontSize: '8px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '2px 5px',
            borderRadius: '3px',
            background: accentBg,
            color: accentColor,
            flexShrink: 0,
          }}
        >
          {epType || 'Endpoint'}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-pri)',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
            lineHeight: 1.3,
            flex: 1,
            minWidth: 0,
          }}
        >
          {shortServiceName(serviceName)}
        </span>
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: isActive ? 'var(--success)' : 'var(--danger)',
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
      </div>

      {/* Row 2: full service name (dimmed) */}
      {serviceName && (
        <div
          style={{
            fontSize: '9px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono, monospace)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={serviceName}
        >
          {serviceName}
        </div>
      )}
    </div>
  );
}

VPCEndpointNode.displayName = 'VPCEndpointNode';
