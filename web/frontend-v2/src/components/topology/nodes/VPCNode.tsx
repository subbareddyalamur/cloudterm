import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import type { TopoNode } from '@/lib/topology-types';

export function VPCNode({ data, selected }: NodeProps) {
  const node = data as unknown as TopoNode;
  const info = node.data;
  const cidr = typeof info['cidr'] === 'string' ? info['cidr'] : '';
  const isDefault = Boolean(info['isDefault']);
  const region = typeof info['region'] === 'string' ? info['region'] : '';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        borderRadius: '10px',
        border: selected
          ? '2px dashed var(--accent)'
          : '2px dashed rgba(96,165,250,0.35)',
        background: selected
          ? 'rgba(124,92,255,0.04)'
          : 'rgba(96,165,250,0.025)',
        position: 'relative',
      }}
    >
      <NodeResizer
        minWidth={300}
        minHeight={200}
        handleStyle={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(96,165,250,0.6)', border: '1px solid rgba(96,165,250,0.8)' }}
        lineStyle={{ border: '1px solid rgba(96,165,250,0.3)' }}
      />
      <Handle type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right} style={{ opacity: 0 }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px 8px',
          borderBottom: '1px solid rgba(96,165,250,0.15)',
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
            background: 'rgba(96,165,250,0.18)',
            color: 'var(--info)',
            flexShrink: 0,
          }}
        >
          VPC
        </span>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--text-pri)',
            wordBreak: 'break-all',
            lineHeight: 1.3,
          }}
        >
          {node.label}
        </span>
        {cidr && (
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono, monospace)',
              flexShrink: 0,
            }}
          >
            {cidr}
          </span>
        )}
        {region && (
          <span
            style={{
              background: 'rgba(167,139,250,0.18)',
              color: '#c4b5fd',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: '4px',
              flexShrink: 0,
            }}
          >
            {region}
          </span>
        )}
        {isDefault && (
          <span
            style={{
              fontSize: '9px',
              color: 'var(--text-dim)',
              background: 'rgba(255,255,255,0.06)',
              padding: '1px 5px',
              borderRadius: '3px',
              flexShrink: 0,
            }}
          >
            default
          </span>
        )}
      </div>
    </div>
  );
}

VPCNode.displayName = 'VPCNode';
