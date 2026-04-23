import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import type { TopoNode } from '@/lib/topology-types';

export function PeerVPCNode({ data, selected }: NodeProps) {
  const node = data as unknown as TopoNode;
  const info = node.data;
  const cidr = typeof info['cidr'] === 'string' ? info['cidr'] : '';
  const peerAccountId = typeof info['peerAccountId'] === 'string' ? info['peerAccountId'] : '';
  const peerRegion = typeof info['peerRegion'] === 'string' ? info['peerRegion'] : '';
  const status = typeof info['status'] === 'string' ? info['status'] : '';
  const isActive = status === 'active';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        borderRadius: '10px',
        border: selected
          ? '2px dashed var(--accent)'
          : `2px dashed ${isActive ? 'rgba(250,204,21,0.5)' : 'rgba(239,68,68,0.4)'}`,
        background: selected
          ? 'rgba(124,92,255,0.04)'
          : isActive
            ? 'rgba(250,204,21,0.03)'
            : 'rgba(239,68,68,0.03)',
        position: 'relative',
      }}
    >
      <NodeResizer
        minWidth={260}
        minHeight={80}
        handleStyle={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(250,204,21,0.6)', border: '1px solid rgba(250,204,21,0.8)' }}
        lineStyle={{ border: '1px solid rgba(250,204,21,0.3)' }}
      />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px 8px',
          borderBottom: `1px solid ${isActive ? 'rgba(250,204,21,0.15)' : 'rgba(239,68,68,0.12)'}`,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: '8px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '2px 6px',
            borderRadius: '4px',
            background: isActive ? 'rgba(250,204,21,0.18)' : 'rgba(239,68,68,0.18)',
            color: isActive ? '#fde047' : '#f87171',
            flexShrink: 0,
          }}
        >
          Peer VPC
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text-pri)',
            wordBreak: 'break-all',
            flex: 1,
            minWidth: 0,
            lineHeight: 1.3,
          }}
        >
          {node.label}
        </span>
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
        {peerAccountId && (
          <span
            style={{
              fontSize: '9px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.07)',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono, monospace)',
              flexShrink: 0,
            }}
          >
            {peerAccountId}
          </span>
        )}
        {peerRegion && (
          <span
            style={{
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(167,139,250,0.18)',
              color: '#c4b5fd',
              flexShrink: 0,
            }}
          >
            {peerRegion}
          </span>
        )}
      </div>
    </div>
  );
}

PeerVPCNode.displayName = 'PeerVPCNode';
