import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ArrowLeftRight } from 'lucide-react';
import type { TopoNode } from '@/lib/topology-types';

export function NATNode({ data, selected }: NodeProps) {
  const node = data as unknown as TopoNode;
  const state = typeof node.data['state'] === 'string' ? node.data['state'] : 'available';
  const isAvailable = state === 'available';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '999px',
        border: selected
          ? '2px solid var(--info)'
          : '1.5px solid rgba(96,165,250,0.4)',
        background: selected
          ? 'rgba(96,165,250,0.12)'
          : 'rgba(96,165,250,0.07)',
        boxShadow: selected
          ? '0 0 0 3px rgba(96,165,250,0.18)'
          : '0 1px 3px rgba(0,0,0,0.2)',
        fontSize: '10px',
        fontWeight: 600,
        color: 'var(--info)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        userSelect: 'none',
      }}
    >
      <ArrowLeftRight size={11} style={{ flexShrink: 0 }} />
      <span style={{ wordBreak: 'break-all', lineHeight: 1.3 }}>
        {node.label || 'NAT Gateway'}
      </span>
      <span
        style={{
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          background: isAvailable ? 'var(--success)' : 'var(--danger)',
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
    </div>
  );
}

NATNode.displayName = 'NATNode';
