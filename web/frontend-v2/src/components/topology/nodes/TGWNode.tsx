import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TopoNode } from '@/lib/topology-types';

export function TGWNode({ data, selected }: NodeProps) {
  const node = data as unknown as TopoNode;
  const info = node.data;
  const tgwId = typeof info['tgwId'] === 'string' ? info['tgwId'] : '';
  const state = typeof info['state'] === 'string' ? info['state'] : '';
  const isActive = state === 'available' || state === 'active';

  return (
    <div
      style={{
        padding: '8px 14px',
        borderRadius: '8px',
        border: selected
          ? '2px solid var(--accent)'
          : `1.5px solid ${isActive ? 'rgba(167,139,250,0.6)' : 'rgba(239,68,68,0.4)'}`,
        background: selected
          ? 'rgba(124,92,255,0.12)'
          : isActive
            ? 'rgba(167,139,250,0.08)'
            : 'rgba(239,68,68,0.06)',
        minWidth: 160,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            fontSize: '8px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '2px 5px',
            borderRadius: '3px',
            background: isActive ? 'rgba(167,139,250,0.2)' : 'rgba(239,68,68,0.2)',
            color: isActive ? '#c4b5fd' : '#f87171',
            flexShrink: 0,
          }}
        >
          TGW
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-pri)',
            wordBreak: 'break-all',
            lineHeight: 1.3,
          }}
        >
          {node.label}
        </span>
      </div>
      {tgwId && (
        <span
          style={{
            fontSize: '9px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {tgwId}
        </span>
      )}
    </div>
  );
}

TGWNode.displayName = 'TGWNode';
