import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Globe } from 'lucide-react';
import type { TopoNode } from '@/lib/topology-types';

export function IGWNode({ data, selected }: NodeProps) {
  const node = data as unknown as TopoNode;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        borderRadius: '999px',
        border: selected
          ? '2px solid var(--warn)'
          : '1.5px solid rgba(245,158,11,0.45)',
        background: selected
          ? 'rgba(245,158,11,0.12)'
          : 'rgba(245,158,11,0.07)',
        boxShadow: selected
          ? '0 0 0 3px rgba(245,158,11,0.18), 0 2px 8px rgba(0,0,0,0.3)'
          : '0 1px 4px rgba(0,0,0,0.2)',
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--warn)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        userSelect: 'none',
      }}
    >
      <Globe size={13} style={{ flexShrink: 0 }} />
      <span style={{ wordBreak: 'break-all', lineHeight: 1.3 }}>
        {node.label || 'Internet Gateway'}
      </span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
    </div>
  );
}

IGWNode.displayName = 'IGWNode';
