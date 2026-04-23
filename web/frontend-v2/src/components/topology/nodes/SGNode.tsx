import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Shield } from 'lucide-react';
import type { TopoNode } from '@/lib/topology-types';

export function SGNode({ data, selected }: NodeProps) {
  const node = data as unknown as TopoNode;
  const info = node.data;
  const inboundCount = Array.isArray(info['inboundRules']) ? info['inboundRules'].length : 0;
  const outboundCount = Array.isArray(info['outboundRules']) ? info['outboundRules'].length : 0;

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px]
        bg-surface text-text-pri min-w-[130px]
        ${selected ? 'border-accent shadow-[0_0_0_2px_var(--accent)]' : 'border-border'}
        transition-colors
      `}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Shield size={13} className="text-warn shrink-0" />
      <div className="min-w-0">
        <div className="font-medium truncate">{node.label}</div>
        <div className="text-[10px] text-text-dim">
          {inboundCount}↓ {outboundCount}↑ rules
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

SGNode.displayName = 'SGNode';
