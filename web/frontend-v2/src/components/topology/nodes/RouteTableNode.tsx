import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TopoNode, RouteInfo } from '@/lib/topology-types';

const TARGET_TYPE_COLOR: Record<string, string> = {
  igw:      '#f59e0b',
  nat:      '#60a5fa',
  pcx:      '#fde047',
  tgw:      '#c4b5fd',
  vpce:     '#6ee7b7',
  vgw:      '#fb923c',
  local:    '#6b7280',
  instance: '#38bdf8',
};

const TARGET_TYPE_LABEL: Record<string, string> = {
  igw: 'IGW', nat: 'NAT', pcx: 'PCX', tgw: 'TGW',
  vpce: 'VPCE', vgw: 'VGW', local: 'local', instance: 'EC2',
};

function routeColor(r: RouteInfo): string {
  return TARGET_TYPE_COLOR[r.targetType] ?? '#6b7280';
}

function shortTarget(target: string): string {
  if (target.length <= 24) return target;
  // Keep prefix (igw-, nat-, tgw-, etc.) + last 8 chars
  const dash = target.indexOf('-');
  if (dash > 0 && dash < 6) return `${target.slice(0, dash + 5)}…${target.slice(-6)}`;
  return `${target.slice(0, 12)}…${target.slice(-6)}`;
}

export function RouteTableNode({ data, selected }: NodeProps) {
  const node = data as unknown as TopoNode;
  const routes = Array.isArray(node.data['routes']) ? (node.data['routes'] as RouteInfo[]) : [];
  const isMain = Boolean(node.data['isMain']);
  const subnetCount = Array.isArray(node.data['subnetIds'])
    ? (node.data['subnetIds'] as unknown[]).length
    : 0;

  const nonLocal = routes.filter((r) => r.targetType !== 'local');

  return (
    <div
      style={{
        borderRadius: '8px',
        border: selected
          ? '1.5px solid var(--accent)'
          : isMain
            ? '1px solid rgba(245,158,11,0.35)'
            : '1px solid rgba(156,163,175,0.3)',
        background: selected
          ? 'rgba(124,92,255,0.06)'
          : isMain
            ? 'rgba(245,158,11,0.03)'
            : 'rgba(255,255,255,0.025)',
        boxShadow: selected ? '0 0 0 3px rgba(124,92,255,0.12)' : '0 1px 4px rgba(0,0,0,0.18)',
        overflow: 'hidden',
        cursor: 'pointer',
        userSelect: 'none',
        width: '100%',
        boxSizing: 'border-box' as const,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '7px',
          padding: '8px 12px 7px',
          borderBottom: nonLocal.length > 0
            ? '1px solid rgba(156,163,175,0.12)'
            : 'none',
        }}
      >
        <span
          style={{
            fontSize: '7px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '2px 5px',
            borderRadius: '3px',
            background: isMain ? 'rgba(245,158,11,0.18)' : 'rgba(156,163,175,0.14)',
            color: isMain ? '#f59e0b' : '#9ca3af',
            flexShrink: 0,
            marginTop: '2px',
          }}
        >
          {isMain ? 'Main RT' : 'RT'}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--text-pri)',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              lineHeight: 1.3,
            }}
          >
            {node.label}
          </div>
          {subnetCount > 0 && (
            <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '2px' }}>
              {subnetCount} subnet{subnetCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Route rows */}
      {nonLocal.length > 0 && (
        <div style={{ padding: '5px 0 6px' }}>
          {nonLocal.map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '2px 12px',
              }}
            >
              {/* Target type badge */}
              <span
                style={{
                  fontSize: '8px',
                  fontWeight: 700,
                  padding: '1px 4px',
                  borderRadius: '3px',
                  background: `${routeColor(r)}22`,
                  color: routeColor(r),
                  flexShrink: 0,
                  letterSpacing: '0.04em',
                }}
              >
                {TARGET_TYPE_LABEL[r.targetType] ?? r.targetType}
              </span>
              {/* Destination CIDR */}
              <span
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--text-dim)',
                  flexShrink: 0,
                  minWidth: 0,
                }}
              >
                {r.destination}
              </span>
              {/* Target ID */}
              <span
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: routeColor(r),
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'right' as const,
                  opacity: 0.8,
                }}
                title={r.target}
              >
                {shortTarget(r.target)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

RouteTableNode.displayName = 'RouteTableNode';
