import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { useFleetVPCs, type FleetVPC } from '@/hooks/useFleetVPCs';

// ─── VPC Card Node ─────────────────────────────────────────────────────────

interface VpcCardData {
  vpc: FleetVPC;
}

function VpcCardNode({ data }: NodeProps) {
  const { vpc } = data as unknown as VpcCardData;

  const handleDoubleClick = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('ct:fleet-map-open-vpc', {
        detail: { vpcId: vpc.vpcId, accountId: vpc.accountId, region: vpc.region },
      }),
    );
  }, [vpc.vpcId, vpc.accountId, vpc.region]);

  return (
    <div
      onDoubleClick={handleDoubleClick}
      style={{
        width: '200px',
        height: '100px',
        boxSizing: 'border-box' as const,
        borderRadius: '6px',
        border: '1px solid rgba(96,165,250,0.3)',
        background: 'rgba(96,165,250,0.04)',
        padding: '8px 10px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '4px',
        userSelect: 'none' as const,
      }}
      title="Double-click to open topology"
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

      {/* VPC name + region badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text-pri)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' as const,
            flex: 1,
            minWidth: 0,
          }}
          title={vpc.vpcName}
        >
          {vpc.vpcName}
        </span>
        <span
          style={{
            fontSize: '8px',
            fontWeight: 600,
            padding: '1px 4px',
            borderRadius: '3px',
            background: 'rgba(167,139,250,0.2)',
            color: '#c4b5fd',
            flexShrink: 0,
          }}
        >
          {vpc.region}
        </span>
      </div>

      {/* Account name */}
      <div
        style={{
          fontSize: '9px',
          color: 'var(--text-dim)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
        }}
        title={vpc.accountName}
      >
        {vpc.accountName}
      </div>

      {/* Bottom row: instance count + CIDR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: 'auto' }}>
        <span
          style={{
            fontSize: '9px',
            fontWeight: 600,
            padding: '1px 6px',
            borderRadius: '10px',
            background: 'rgba(96,165,250,0.15)',
            color: '#93c5fd',
            flexShrink: 0,
          }}
        >
          {vpc.instanceCount} instance{vpc.instanceCount !== 1 ? 's' : ''}
        </span>
        {vpc.cidr && (
          <span
            style={{
              fontSize: '9px',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono, monospace)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
            }}
          >
            {vpc.cidr}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

VpcCardNode.displayName = 'VpcCardNode';

// ─── Account Group Node ─────────────────────────────────────────────────────

function AccountGroupNode({ data }: NodeProps) {
  const label = (data as Record<string, unknown>)['label'] as string;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box' as const,
        borderRadius: '8px',
        border: '1px solid rgba(245,158,11,0.25)',
        background: 'rgba(245,158,11,0.03)',
      }}
    >
      <div
        style={{
          padding: '6px 12px',
          fontSize: '10px',
          fontWeight: 700,
          color: 'rgba(245,158,11,0.8)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase' as const,
        }}
      >
        {label}
      </div>
    </div>
  );
}

AccountGroupNode.displayName = 'AccountGroupNode';

const nodeTypes: NodeTypes = {
  'vpc-card': VpcCardNode,
  'account-group': AccountGroupNode,
};

// ─── Layout with dagre ─────────────────────────────────────────────────────

const VPC_W = 200;
const VPC_H = 100;
const GROUP_PAD = 40;
const GROUP_HDR = 32;
const VPC_GAP_Y = 24;
const GROUP_GAP_X = 80;

function buildFleetGraph(vpcs: FleetVPC[]): { nodes: Node[]; edges: Edge[] } {
  if (vpcs.length === 0) return { nodes: [], edges: [] };

  // Group VPCs by account
  const byAccount = new Map<string, FleetVPC[]>();
  for (const vpc of vpcs) {
    const arr = byAccount.get(vpc.accountId) ?? [];
    arr.push(vpc);
    byAccount.set(vpc.accountId, arr);
  }

  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];

  // Use dagre for top-level account group layout
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', ranksep: GROUP_GAP_X, nodesep: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const accountGroups: { id: string; accountId: string; accountName: string; vpcs: FleetVPC[]; w: number; h: number }[] = [];

  for (const [accountId, accountVpcs] of byAccount) {
    const groupId = `account-${accountId}`;
    const accountName = accountVpcs[0]?.accountName ?? accountId;
    const groupH = GROUP_HDR + accountVpcs.length * (VPC_H + VPC_GAP_Y) - VPC_GAP_Y + GROUP_PAD * 2;
    const groupW = VPC_W + GROUP_PAD * 2;
    g.setNode(groupId, { width: groupW, height: groupH });
    accountGroups.push({ id: groupId, accountId, accountName, vpcs: accountVpcs, w: groupW, h: groupH });
  }

  dagre.layout(g);

  for (const group of accountGroups) {
    const pos = g.node(group.id);

    flowNodes.push({
      id: group.id,
      type: 'account-group',
      position: { x: pos.x - group.w / 2, y: pos.y - group.h / 2 },
      data: { label: group.accountName },
      width: group.w,
      height: group.h,
      style: { width: group.w, height: group.h },
      selectable: false,
      draggable: true,
    });

    group.vpcs.forEach((vpc, idx) => {
      const vpcNodeId = `vpccard-${vpc.accountId}-${vpc.vpcId}`;
      const relX = GROUP_PAD;
      const relY = GROUP_HDR + GROUP_PAD + idx * (VPC_H + VPC_GAP_Y);

      flowNodes.push({
        id: vpcNodeId,
        type: 'vpc-card',
        position: { x: relX, y: relY },
        data: { vpc },
        parentId: group.id,
        extent: 'parent' as const,
        width: VPC_W,
        height: VPC_H,
        style: { width: VPC_W, height: VPC_H },
        selectable: true,
        draggable: true,
      });
    });
  }

  // Add placeholder edges between account groups if multiple accounts
  const groupIds = accountGroups.map((g) => g.id);
  for (let i = 0; i < groupIds.length - 1; i++) {
    const srcGroup = groupIds[i];
    const tgtGroup = groupIds[i + 1];
    if (srcGroup && tgtGroup) {
      flowEdges.push({
        id: `acct-edge-${i}`,
        source: srcGroup,
        target: tgtGroup,
        type: 'smoothstep',
        style: { stroke: 'rgba(96,165,250,0.2)', strokeWidth: 1, strokeDasharray: '4 3' },
      });
    }
  }

  return { nodes: flowNodes, edges: flowEdges };
}

// ─── FleetMapView ────────────────────────────────────────────────────────────

export function FleetMapView() {
  const { vpcs } = useFleetVPCs();

  const { nodes: rawNodes, edges: rawEdges } = useMemo(() => buildFleetGraph(vpcs), [vpcs]);
  const [nodes, , onNodesChange] = useNodesState(rawNodes);
  const [edges, , onEdgesChange] = useEdgesState(rawEdges);

  // Handle open-vpc events — show a toast-style alert for now
  const handleNodeDoubleClick = useCallback(() => {
    // ct:fleet-map-open-vpc is dispatched by VpcCardNode's onDoubleClick
    // The handler is registered below
  }, []);

  if (vpcs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-dim text-sm">
        No instances found. Run a scan to populate the fleet map.
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDoubleClick={handleNodeDoubleClick}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.05}
        maxZoom={3}
        nodeOrigin={[0, 0]}
        selectNodesOnDrag={false}
        nodesDraggable={true}
        nodesConnectable={false}
        attributionPosition="bottom-right"
        proOptions={{ hideAttribution: false }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255,255,255,0.06)"
        />
        <Controls
          showInteractive={false}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
          }}
        />
      </ReactFlow>
    </div>
  );
}

FleetMapView.displayName = 'FleetMapView';
