import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  Panel,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
  type Connection,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search, RefreshCw, Pencil, Shield, Tag, Download } from 'lucide-react';
import { TopologyContext } from './TopologyContext';
import { Input } from '@/components/primitives/Input';
import { Button } from '@/components/primitives/Button';
import { InstanceNode } from './nodes/InstanceNode';
import { VPCNode } from './nodes/VPCNode';
import { SubnetNode } from './nodes/SubnetNode';
import { IGWNode } from './nodes/IGWNode';
import { NATNode } from './nodes/NATNode';
import { PeerVPCNode } from './nodes/PeerVPCNode';
import { TGWNode } from './nodes/TGWNode';
import { VPCEndpointNode } from './nodes/VPCEndpointNode';
import { RouteTableNode } from './nodes/RouteTableNode';
import { FloatingEdge } from './nodes/FloatingEdge';
import type {
  VPCTopology,
  TopoNode,
  TopologyInstance,
  SubnetInfo,
  NATGWInfo,
  PeerVPCDetails,
} from '@/lib/topology-types';

const nodeTypes: NodeTypes = {
  instance: InstanceNode,
  vpc: VPCNode,
  subnet: SubnetNode,
  igw: IGWNode,
  nat: NATNode,
  'peer-vpc': PeerVPCNode,
  tgw: TGWNode,
  'vpc-endpoint': VPCEndpointNode,
  'route-table': RouteTableNode,
};

const edgeTypes: EdgeTypes = {
  floating: FloatingEdge,
};

const L = {
  INST_W: 200,
  INST_H: 96,
  INST_COLS_MAX: 2,   // 2 cols keeps subnets narrower and prevents horizontal cramping
  INST_GAP_X: 16,
  INST_GAP_Y: 16,
  SUBNET_HDR_H: 58,
  SUBNET_PAD: 20,
  SUBNET_GAP_X: 48,
  SUBNET_GAP_Y: 80,
  SUBNETS_PER_ROW: 3,
  VPC_HDR_H: 56,
  VPC_PAD_X: 48,
  VPC_PAD_TOP: 24,
  VPC_PAD_BOTTOM: 100,
  IGW_W: 200,
  IGW_H: 42,
  IGW_VPC_GAP: 40,
  NAT_W: 160,
  NAT_H: 38,
  NAT_BOTTOM_GAP: 16,
};

function calcSubnetDims(instCount: number, hasNat: boolean): { w: number; h: number } {
  const cols = Math.max(1, Math.min(instCount, L.INST_COLS_MAX));
  const rows = instCount === 0 ? 0 : Math.ceil(instCount / cols);

  const instAreaW = instCount > 0 ? cols * L.INST_W + (cols - 1) * L.INST_GAP_X : 0;
  const instAreaH = rows > 0 ? rows * L.INST_H + (rows - 1) * L.INST_GAP_Y : 0;
  const natReserved = hasNat ? L.NAT_H + L.NAT_BOTTOM_GAP : 0;

  const innerW = Math.max(hasNat ? L.NAT_W : 0, instAreaW);
  const innerH = natReserved + instAreaH;

  const w = Math.max(200, innerW + L.SUBNET_PAD * 2);
  const h = L.SUBNET_HDR_H + Math.max(40, innerH + L.SUBNET_PAD * 2);

  return { w, h };
}

function buildFlowGraph(topo: VPCTopology): { nodes: Node[]; edges: Edge[] } {
  if (!topo.vpc) return { nodes: [], edges: [] };
  const safeSubnets = topo.subnets ?? [];
  const safeInstances = topo.instances ?? [];
  const safeNatGateways = topo.natGateways ?? [];
  const safeIGWs = topo.internetGateways ?? [];
  const safeRouteTables = topo.routeTables ?? [];
  const safePeerings = topo.vpcPeerings ?? [];
  const safeTGWAttachments = topo.tgwAttachments ?? [];
  const safeEndpoints = topo.vpcEndpoints ?? [];
  const safePeerDetails = topo.peerVpcDetails ?? [];
  const peerDetailsByVPCId = new Map<string, PeerVPCDetails>();
  for (const pd of safePeerDetails) {
    peerDetailsByVPCId.set(pd.vpcId, pd);
  }

  // Access region via a cast since VPCTopology doesn't declare it but the
  // backend may include it; we never modify topology-types.ts.
  const topoRegion = (topo as VPCTopology & { region?: string }).region ?? '';

  const instancesBySubnet = new Map<string, TopologyInstance[]>();
  for (const inst of safeInstances) {
    const key = inst.subnetId || '__none__';
    const arr = instancesBySubnet.get(key) ?? [];
    arr.push(inst);
    instancesBySubnet.set(key, arr);
  }

  const natBySubnet = new Map<string, NATGWInfo>();
  for (const nat of safeNatGateways) {
    if (nat.subnetId) natBySubnet.set(nat.subnetId, nat);
  }

  const subnetAzByNat = new Map<string, string>();
  for (const nat of safeNatGateways) {
    const sub = safeSubnets.find((s) => s.id === nat.subnetId);
    if (sub) subnetAzByNat.set(nat.id, sub.az);
  }

  const subnetDims = new Map<string, { w: number; h: number }>();
  for (const subnet of safeSubnets) {
    const instCount = (instancesBySubnet.get(subnet.id) ?? []).length;
    const hasNat = natBySubnet.has(subnet.id);
    subnetDims.set(subnet.id, calcSubnetDims(instCount, hasNat));
  }

  const sortedSubnets: SubnetInfo[] = [...safeSubnets].sort((a, b) => {
    if (a.isPublic !== b.isPublic) return b.isPublic ? 1 : -1;
    return a.id.localeCompare(b.id);
  });

  const subnetRows: SubnetInfo[][] = [];
  for (let i = 0; i < sortedSubnets.length; i += L.SUBNETS_PER_ROW) {
    subnetRows.push(sortedSubnets.slice(i, i + L.SUBNETS_PER_ROW));
  }

  type RowLayout = { y: number; items: { id: string; x: number; w: number }[] };
  const rowLayouts: RowLayout[] = [];
  // RT and EP layout constants (defined early for pre-calculation)
  const RT_W = 260;
  const RT_ROW_H = 20;
  const RT_HDR_H = 54;
  const RT_ROW_GAP = 56;
  const RT_COL_GAP = 24;
  const EP_W = 200;
  const EP_H = 60;
  const EP_GAP = 16;
  const EP_SECTION_GAP = 48; // was 32

  const IGW_RESERVED_H = safeIGWs.length > 0 ? L.IGW_H + L.IGW_VPC_GAP : 0;
  let curY = L.VPC_HDR_H + L.VPC_PAD_TOP + IGW_RESERVED_H;
  let vpcContentW = 0;

  for (const row of subnetRows) {
    let curX = L.VPC_PAD_X;
    let rowH = 0;
    const items: { id: string; x: number; w: number }[] = [];

    for (const subnet of row) {
      const { w, h } = subnetDims.get(subnet.id)!;
      items.push({ id: subnet.id, x: curX, w });
      curX += w + L.SUBNET_GAP_X;
      rowH = Math.max(rowH, h);
    }

    const rowEndX = curX - L.SUBNET_GAP_X + L.VPC_PAD_X;
    vpcContentW = Math.max(vpcContentW, rowEndX);
    rowLayouts.push({ y: curY, items });
    curY += rowH + L.SUBNET_GAP_Y;
  }

  const vpcW = Math.max(400, vpcContentW);
  const vpcX = 0;
  const vpcY = 0;
  const subnetSectionBottom = subnetRows.length > 0
    ? curY - L.SUBNET_GAP_Y
    : L.VPC_HDR_H + L.VPC_PAD_TOP + IGW_RESERVED_H;

  // Pre-calculate RT positions (VPC-relative) so vpcH is known before pushing VPC node
  const seenRTsPre = new Set<string>();
  let rtPreCurX = L.VPC_PAD_X;
  let rtPreRowStartY = subnetSectionBottom + RT_ROW_GAP;
  let rtPreSectionMaxY = rtPreRowStartY;
  let rtPreRowMaxH = 0;
  const rtPrePositions = new Map<string, { x: number; y: number; h: number }>();
  for (const rt of safeRouteTables) {
    if (seenRTsPre.has(rt.id)) continue;
    seenRTsPre.add(rt.id);
    const nonLocalCount = (rt.routes ?? []).filter((r) => r.targetType !== 'local').length;
    const rtH = RT_HDR_H + Math.max(0, nonLocalCount) * RT_ROW_H + 10;
    if (rtPreCurX + RT_W > vpcW - L.VPC_PAD_X && rtPreCurX !== L.VPC_PAD_X) {
      rtPreRowStartY += rtPreRowMaxH + RT_ROW_GAP;
      rtPreCurX = L.VPC_PAD_X;
      rtPreRowMaxH = 0;
    }
    rtPrePositions.set(rt.id, { x: rtPreCurX, y: rtPreRowStartY, h: rtH });
    rtPreCurX += RT_W + RT_COL_GAP;
    rtPreRowMaxH = Math.max(rtPreRowMaxH, rtH);
    rtPreSectionMaxY = Math.max(rtPreSectionMaxY, rtPreRowStartY + rtH);
  }

  // Pre-calculate EP positions (VPC-relative)
  const epBaseY = safeRouteTables.length > 0
    ? rtPreSectionMaxY + EP_SECTION_GAP
    : subnetSectionBottom + RT_ROW_GAP;
  let epPreRowY = epBaseY;
  let epPreCurX = L.VPC_PAD_X;
  let epSectionMaxY = epBaseY;
  const epPrePositions = new Map<string, { x: number; y: number }>();
  for (const ep of safeEndpoints) {
    if (epPreCurX + EP_W > vpcW - L.VPC_PAD_X && epPreCurX !== L.VPC_PAD_X) {
      epPreRowY += EP_H + EP_GAP;
      epPreCurX = L.VPC_PAD_X;
    }
    epPrePositions.set(ep.id, { x: epPreCurX, y: epPreRowY });
    epPreCurX += EP_W + EP_GAP;
    epSectionMaxY = Math.max(epSectionMaxY, epPreRowY + EP_H);
  }

  let contentBottom = subnetSectionBottom;
  if (safeRouteTables.length > 0) contentBottom = rtPreSectionMaxY;
  if (safeEndpoints.length > 0) contentBottom = epSectionMaxY;
  const vpcH = contentBottom + L.VPC_PAD_BOTTOM;

  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];

  flowNodes.push({
    id: topo.vpc.id,
    type: 'vpc',
    position: { x: vpcX, y: vpcY },
    data: {
      id: topo.vpc.id,
      kind: 'vpc',
      label: topo.vpc.name || topo.vpc.id,
      data: {
        ...(topo.vpc as unknown as Record<string, unknown>),
        region: topoRegion,
      },
    } satisfies TopoNode,
    width: vpcW,
    height: vpcH,
    style: { width: vpcW, height: vpcH },
    selectable: true,
    draggable: true,
  });

  // IGW nodes — inside VPC at the top, centered
  const igwRowY = L.VPC_HDR_H + L.VPC_PAD_TOP;
  const totalIgwW = safeIGWs.length * L.IGW_W + (safeIGWs.length - 1) * 16;
  let igwCurX = (vpcW - totalIgwW) / 2;
  for (const igw of safeIGWs) {
    flowNodes.push({
      id: igw.id,
      type: 'igw',
      position: { x: igwCurX, y: igwRowY },
      data: {
        id: igw.id,
        kind: 'igw',
        label: igw.name || igw.id,
        data: igw as unknown as Record<string, unknown>,
      } satisfies TopoNode,
      parentId: topo.vpc.id,
      extent: 'parent' as const,
      width: L.IGW_W,
      height: L.IGW_H,
      style: { width: L.IGW_W, height: L.IGW_H },
      selectable: true,
      draggable: true,
    });
    igwCurX += L.IGW_W + 16;

    for (const subnet of safeSubnets.filter((s) => s.isPublic)) {
      flowEdges.push({
        id: `igw-${igw.id}-to-${subnet.id}`,
        source: igw.id,
        target: subnet.id,
        type: 'floating',
        style: { stroke: 'var(--warn)', strokeWidth: 1.5, opacity: 0.7 },
        markerEnd: { type: 'arrowclosed' as const, color: 'var(--warn)', width: 14, height: 14 },
      });
    }
  }

  for (let rowIdx = 0; rowIdx < subnetRows.length; rowIdx++) {
    const row = subnetRows[rowIdx];
    const layout = rowLayouts[rowIdx];

    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const subnet = row[colIdx];
      const { w, h } = subnetDims.get(subnet.id)!;
      const item = layout.items[colIdx];
      const nat = natBySubnet.get(subnet.id);

      flowNodes.push({
        id: subnet.id,
        type: 'subnet',
        position: { x: item.x, y: layout.y },
        data: {
          id: subnet.id,
          kind: 'subnet',
          label: subnet.name || subnet.id,
          data: subnet as unknown as Record<string, unknown>,
          parent: topo.vpc.id,
        } satisfies TopoNode,
        parentId: topo.vpc.id,
        extent: 'parent' as const,
        width: w,
        height: h,
        style: { width: w, minHeight: h },
        selectable: true,
        draggable: true,
      });

      if (nat) {
        flowNodes.push({
          id: nat.id,
          type: 'nat',
          position: { x: L.SUBNET_PAD, y: L.SUBNET_HDR_H + L.SUBNET_PAD },
          data: {
            id: nat.id,
            kind: 'nat',
            label: nat.name || nat.id,
            data: nat as unknown as Record<string, unknown>,
            parent: subnet.id,
          } satisfies TopoNode,
          parentId: subnet.id,
          extent: 'parent' as const,
          width: L.NAT_W,
          height: L.NAT_H,
          style: { width: L.NAT_W, height: L.NAT_H },
          selectable: true,
          draggable: true,
        });
      }

      const subnetInsts = instancesBySubnet.get(subnet.id) ?? [];
      const instCols = Math.max(1, Math.min(subnetInsts.length, L.INST_COLS_MAX));
      const natReserved = nat ? L.NAT_H + L.NAT_BOTTOM_GAP : 0;

      subnetInsts.forEach((inst, idx) => {
        const col = idx % instCols;
        const row2 = Math.floor(idx / instCols);
        const instX = L.SUBNET_PAD + col * (L.INST_W + L.INST_GAP_X);
        const instY = L.SUBNET_HDR_H + L.SUBNET_PAD + natReserved + row2 * (L.INST_H + L.INST_GAP_Y);

        flowNodes.push({
          id: inst.id,
          type: 'instance',
          position: { x: instX, y: instY },
          data: {
            id: inst.id,
            kind: 'instance',
            label: inst.name || inst.id,
            data: inst as unknown as Record<string, unknown>,
            parent: subnet.id,
          } satisfies TopoNode,
          parentId: subnet.id,
          extent: 'parent' as const,
          width: L.INST_W,
          height: L.INST_H,
          style: { width: L.INST_W, minHeight: L.INST_H },
          selectable: true,
          draggable: true,
        });
      });
    }
  }

  for (const nat of safeNatGateways) {
    const natAz = subnetAzByNat.get(nat.id) ?? '';
    const privateTargets = safeSubnets.filter((s) => {
      if (s.isPublic) return false;
      if (natAz && s.az && s.az !== natAz) return false;
      const rt = safeRouteTables.find((r) => (r.subnetIds ?? []).includes(s.id));
      if (rt) return (rt.routes ?? []).some((r) => r.target === nat.id || r.targetType === 'nat');
      return !natAz || s.az === natAz;
    });

    for (const target of privateTargets) {
      flowEdges.push({
        id: `nat-${nat.id}-to-${target.id}`,
        source: nat.id,
        target: target.id,
        type: 'floating',
        style: { stroke: 'var(--info)', strokeWidth: 1.5, strokeDasharray: '4 3', opacity: 0.6 },
        markerEnd: { type: 'arrowclosed' as const, color: 'var(--info)', width: 12, height: 12 },
      });
    }
  }

  // ─── Route Tables ─────────────────────────────────────────────────────────
  const seenRTs = new Set<string>();

  for (const rt of safeRouteTables) {
    if (seenRTs.has(rt.id)) continue;
    seenRTs.add(rt.id);

    const prePos = rtPrePositions.get(rt.id)!;
    const rtH = prePos.h;

    flowNodes.push({
      id: `rt-${rt.id}`,
      type: 'route-table',
      position: { x: prePos.x, y: prePos.y },
      data: {
        id: `rt-${rt.id}`,
        kind: 'route-table',
        label: rt.name || rt.id,
        data: {
          id: rt.id,
          name: rt.name,
          isMain: rt.isMain,
          subnetIds: rt.subnetIds,
          routes: rt.routes,
        },
      } satisfies TopoNode,
      parentId: topo.vpc.id,
      extent: 'parent' as const,
      width: RT_W,
      height: rtH,
      style: { width: RT_W, minHeight: rtH },
      selectable: true,
      draggable: true,
    });

    for (const subnetId of rt.subnetIds ?? []) {
      flowEdges.push({
        id: `rt-sub-${rt.id}-${subnetId}`,
        source: subnetId,
        target: `rt-${rt.id}`,
        type: 'floating',
        style: { stroke: 'rgba(156,163,175,0.4)', strokeWidth: 1, strokeDasharray: '3 3' },
        markerEnd: { type: 'arrowclosed' as const, color: '#9ca3af', width: 10, height: 10 },
      });
    }
    if (rt.isMain && (rt.subnetIds ?? []).length === 0) {
      flowEdges.push({
        id: `rt-main-vpc-${rt.id}`,
        source: topo.vpc.id,
        target: `rt-${rt.id}`,
        type: 'floating',
        label: 'main',
        labelStyle: { fontSize: '9px', fill: '#f59e0b' },
        labelBgStyle: { fill: 'rgba(0,0,0,0.55)', rx: 3 },
        style: { stroke: 'rgba(245,158,11,0.5)', strokeWidth: 1, strokeDasharray: '3 3' },
        markerEnd: { type: 'arrowclosed' as const, color: '#f59e0b', width: 10, height: 10 },
      });
    }

    const seenRTEdge = new Set<string>();
    for (const route of rt.routes ?? []) {
      if (route.targetType === 'local' || !route.target || route.target === 'local') continue;
      const edgeTarget = route.target;
      const edgeKey = `rt-${rt.id}-to-${edgeTarget}`;
      if (seenRTEdge.has(edgeKey)) continue;
      seenRTEdge.add(edgeKey);

      let resolvedTarget: string | null = null;
      if (route.targetType === 'igw') resolvedTarget = edgeTarget;
      else if (route.targetType === 'nat') resolvedTarget = edgeTarget;
      else if (route.targetType === 'tgw') resolvedTarget = `tgw-${edgeTarget}`;
      else if (route.targetType === 'pcx') resolvedTarget = `peer-vpc-${edgeTarget}`;
      else if (route.targetType === 'vpce') resolvedTarget = `ep-${edgeTarget}`;

      if (!resolvedTarget) continue;

      const rtColor: Record<string, string> = {
        igw: '#f59e0b', nat: '#60a5fa', tgw: '#c4b5fd', pcx: '#fde047', vpce: '#6ee7b7',
      };

      flowEdges.push({
        id: edgeKey,
        source: `rt-${rt.id}`,
        target: resolvedTarget,
        type: 'floating',
        label: route.destination,
        labelStyle: { fontSize: '8px', fill: rtColor[route.targetType] ?? '#9ca3af', fontFamily: 'monospace' },
        labelBgStyle: { fill: 'rgba(0,0,0,0.55)', rx: 2 },
        style: { stroke: rtColor[route.targetType] ?? 'rgba(156,163,175,0.4)', strokeWidth: 1.5, opacity: 0.7 },
        markerEnd: { type: 'arrowclosed' as const, color: rtColor[route.targetType] ?? '#9ca3af', width: 11, height: 11 },
      });
    }
  }

  // ─── VPC Peerings ─────────────────────────────────────────────────────────
  const PEER_VPC_MIN_W = 260;
  const PEER_VPC_FLAT_H = 80;
  const PEER_VPC_GAP = 120;

  const seenPeerVpcs = new Set<string>();
  let peerVpcCurY = vpcY;

  function buildPeerVPCSubgraph(
    peerNodeId: string,
    peerVpcId: string,
    peerLabel: string,
    peerCidr: string,
    status: string,
    peerAccountId: string,
    peerRegion: string,
    peeringId: string,
    details: PeerVPCDetails,
    baseX: number,
    baseY: number,
  ): number {
    const peerInstsBySubnet = new Map<string, TopologyInstance[]>();
    for (const inst of details.instances ?? []) {
      const key = inst.subnetId || '__none__';
      peerInstsBySubnet.set(key, [...(peerInstsBySubnet.get(key) ?? []), inst]);
    }
    const peerNatBySubnet = new Map<string, NATGWInfo>();
    for (const nat of details.natGateways ?? []) {
      if (nat.subnetId) peerNatBySubnet.set(nat.subnetId, nat);
    }

    const peerSubnetDims = new Map<string, { w: number; h: number }>();
    for (const s of details.subnets ?? []) {
      const ic = (peerInstsBySubnet.get(s.id) ?? []).length;
      const hn = peerNatBySubnet.has(s.id);
      peerSubnetDims.set(s.id, calcSubnetDims(ic, hn));
    }

    const PEER_COLS = 3;
    const peerSortedSubnets = [...(details.subnets ?? [])].sort((a, b) =>
      b.isPublic ? 1 : a.isPublic ? -1 : a.id.localeCompare(b.id),
    );
    const peerSubnetRows: SubnetInfo[][] = [];
    for (let i = 0; i < peerSortedSubnets.length; i += PEER_COLS) {
      peerSubnetRows.push(peerSortedSubnets.slice(i, i + PEER_COLS));
    }

    let peerContentW = 0;
    let innerCurY = L.VPC_HDR_H + L.VPC_PAD_TOP;

    type PeerRowLayout = { y: number; items: { id: string; x: number; w: number }[] };
    const peerRowLayouts: PeerRowLayout[] = [];

    for (const row of peerSubnetRows) {
      let curX = L.VPC_PAD_X;
      let rowH = 0;
      const items: { id: string; x: number; w: number }[] = [];
      for (const s of row) {
        const { w, h } = peerSubnetDims.get(s.id) ?? { w: 200, h: 120 };
        items.push({ id: s.id, x: curX, w });
        curX += w + L.SUBNET_GAP_X;
        rowH = Math.max(rowH, h);
      }
      const rowEndX = curX - L.SUBNET_GAP_X + L.VPC_PAD_X;
      peerContentW = Math.max(peerContentW, rowEndX);
      peerRowLayouts.push({ y: innerCurY, items });
      innerCurY += rowH + L.SUBNET_GAP_Y;
    }

    const peerVpcW = Math.max(PEER_VPC_MIN_W, peerContentW);
    const peerVpcH = peerSubnetRows.length > 0
      ? innerCurY - L.SUBNET_GAP_Y + L.VPC_PAD_BOTTOM
      : PEER_VPC_FLAT_H;

    flowNodes.push({
      id: peerNodeId,
      type: 'peer-vpc',
      position: { x: baseX, y: baseY },
      data: {
        id: peerNodeId,
        kind: 'peer-vpc',
        label: peerLabel,
        data: {
          vpcId: peerVpcId,
          cidr: peerCidr,
          peerAccountId: peerAccountId,
          peerRegion: peerRegion,
          status: status,
          peeringId: peeringId,
        },
      } satisfies TopoNode,
      width: peerVpcW,
      height: peerVpcH,
      style: { width: peerVpcW, height: peerVpcH },
      selectable: true,
      draggable: true,
    });

    for (let rowIdx = 0; rowIdx < peerSubnetRows.length; rowIdx++) {
      const row = peerSubnetRows[rowIdx];
      const layout = peerRowLayouts[rowIdx];
      for (let ci = 0; ci < row.length; ci++) {
        const s = row[ci];
        const { w, h } = peerSubnetDims.get(s.id) ?? { w: 200, h: 120 };
        const item = layout.items[ci];
        const nat = peerNatBySubnet.get(s.id);

        flowNodes.push({
          id: `p-${s.id}`,
          type: 'subnet',
          position: { x: item.x, y: layout.y },
          data: {
            id: `p-${s.id}`,
            kind: 'subnet',
            label: s.name || s.id,
            data: s as unknown as Record<string, unknown>,
            parent: peerNodeId,
          } satisfies TopoNode,
          parentId: peerNodeId,
          extent: 'parent' as const,
          width: w,
          height: h,
          style: { width: w, height: h },
          selectable: true,
          draggable: true,
        });

        if (nat) {
          flowNodes.push({
            id: `p-${nat.id}`,
            type: 'nat',
            position: { x: L.SUBNET_PAD, y: L.SUBNET_HDR_H + L.SUBNET_PAD },
            data: {
              id: `p-${nat.id}`,
              kind: 'nat',
              label: nat.name || nat.id,
              data: nat as unknown as Record<string, unknown>,
              parent: `p-${s.id}`,
            } satisfies TopoNode,
            parentId: `p-${s.id}`,
            extent: 'parent' as const,
            width: L.NAT_W,
            height: L.NAT_H,
            style: { width: L.NAT_W, height: L.NAT_H },
            selectable: true,
            draggable: true,
          });
        }

        const subnetInsts = peerInstsBySubnet.get(s.id) ?? [];
        const instCols = Math.max(1, Math.min(subnetInsts.length, L.INST_COLS_MAX));
        const natReserved = nat ? L.NAT_H + L.NAT_BOTTOM_GAP : 0;
        subnetInsts.forEach((inst, idx) => {
          const col = idx % instCols;
          const row2 = Math.floor(idx / instCols);
          const instX = L.SUBNET_PAD + col * (L.INST_W + L.INST_GAP_X);
          const instY = L.SUBNET_HDR_H + L.SUBNET_PAD + natReserved + row2 * (L.INST_H + L.INST_GAP_Y);
          flowNodes.push({
            id: `p-${inst.id}`,
            type: 'instance',
            position: { x: instX, y: instY },
            data: {
              id: `p-${inst.id}`,
              kind: 'instance',
              label: inst.name || inst.id,
              data: inst as unknown as Record<string, unknown>,
              parent: `p-${s.id}`,
            } satisfies TopoNode,
            parentId: `p-${s.id}`,
            extent: 'parent' as const,
            width: L.INST_W,
            height: L.INST_H,
            style: { width: L.INST_W, height: L.INST_H },
            selectable: true,
            draggable: true,
          });
        });
      }
    }

    return peerVpcH;
  }

  const PEER_VPC_X = vpcX - PEER_VPC_MIN_W - 240;

  safePeerings.forEach((p) => {
    const isRequester = p.requesterVpc === topo.vpc.id;
    const peerVpcId = isRequester ? p.accepterVpc : p.requesterVpc;
    const peerCidr = isRequester ? p.accepterCidr : p.requesterCidr;
    const peerLabel = p.peerVpcName || peerVpcId;
    const peerNodeId = `peer-vpc-${peerVpcId}`;

    if (!seenPeerVpcs.has(peerNodeId)) {
      seenPeerVpcs.add(peerNodeId);
      const details = peerDetailsByVPCId.get(peerVpcId);

      let addedH: number;
      if (details && (details.subnets.length > 0 || details.instances.length > 0)) {
        addedH = buildPeerVPCSubgraph(
          peerNodeId, peerVpcId, peerLabel, peerCidr,
          p.status, p.peerAccountId ?? '', p.peerRegion ?? '', p.id,
          details, PEER_VPC_X, peerVpcCurY,
        );
      } else {
        flowNodes.push({
          id: peerNodeId,
          type: 'peer-vpc',
          position: { x: PEER_VPC_X, y: peerVpcCurY },
          data: {
            id: peerNodeId,
            kind: 'peer-vpc',
            label: peerLabel,
            data: {
              vpcId: peerVpcId,
              cidr: peerCidr,
              peerAccountId: p.peerAccountId ?? '',
              peerRegion: p.peerRegion ?? '',
              status: p.status,
              peeringId: p.id,
            },
          } satisfies TopoNode,
          style: { width: PEER_VPC_MIN_W, height: PEER_VPC_FLAT_H },
          selectable: true,
          draggable: true,
        });
        addedH = PEER_VPC_FLAT_H;
      }
      peerVpcCurY += addedH + PEER_VPC_GAP;
    }

    flowEdges.push({
      id: `pcx-${p.id}`,
      source: peerNodeId,
      target: topo.vpc.id,
      type: 'floating',
      label: `PCX ${p.id.slice(0, 12)}`,
      labelStyle: { fontSize: '9px', fill: '#fde047', fontFamily: 'monospace' },
      labelBgStyle: { fill: 'rgba(0,0,0,0.6)', rx: 3 },
      style: {
        stroke: p.status === 'active' ? 'rgba(250,204,21,0.7)' : 'rgba(239,68,68,0.5)',
        strokeWidth: 1.5,
        strokeDasharray: p.status === 'active' ? undefined : '4 3',
      },
      markerEnd: { type: 'arrowclosed' as const, color: p.status === 'active' ? '#fde047' : '#f87171', width: 12, height: 12 },
    });
  });

  // ─── Transit Gateways ─────────────────────────────────────────────────────
  const TGW_X = vpcX + vpcW + 200; // was vpcX + vpcW + 120
  const TGW_W = 180;
  const TGW_H = 64;
  const TGW_PEER_W = 220;
  const TGW_PEER_H = 70;
  const TGW_PEER_GAP = 12;

  const seenTGWs = new Map<string, number>();
  let tgwBaseY = vpcY;

  for (const att of safeTGWAttachments) {
    const tgwNodeId = `tgw-${att.tgwId}`;

    if (!seenTGWs.has(tgwNodeId)) {
      seenTGWs.set(tgwNodeId, tgwBaseY);

      flowNodes.push({
        id: tgwNodeId,
        type: 'tgw',
        position: { x: TGW_X, y: tgwBaseY },
        data: {
          id: tgwNodeId,
          kind: 'tgw',
          label: att.tgwName || att.tgwId,
          data: {
            tgwId: att.tgwId,
            state: att.state,
            attachmentId: att.attachmentId,
          },
        } satisfies TopoNode,
        style: { width: TGW_W, height: TGW_H },
        selectable: true,
        draggable: true,
      });

      flowEdges.push({
        id: `tgw-attach-${att.attachmentId}`,
        source: topo.vpc.id,
        target: tgwNodeId,
        type: 'floating',
        label: 'TGW',
        labelStyle: { fontSize: '9px', fill: '#c4b5fd', fontFamily: 'monospace' },
        labelBgStyle: { fill: 'rgba(0,0,0,0.6)', rx: 3 },
        style: { stroke: 'rgba(167,139,250,0.7)', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed' as const, color: '#c4b5fd', width: 12, height: 12 },
      });

      const peers = att.peerAttachments ?? [];
      let peerOffsetY = tgwBaseY;
      let peerColumnH = 0;
      for (const peer of peers) {
        if (peer.resourceType !== 'vpc') continue;
        const peerNodeId = `tgw-peer-${peer.attachmentId}`;
        const peerX = TGW_X + TGW_W + 100; // was TGW_X + TGW_W + 60
        const peerDetails = peerDetailsByVPCId.get(peer.resourceId);
        const peerLabel = peer.resourceName || peer.resourceId;

        let thisH: number;
        if (peerDetails && (peerDetails.subnets.length > 0 || peerDetails.instances.length > 0)) {
          thisH = buildPeerVPCSubgraph(
            peerNodeId, peer.resourceId, peerLabel,
            peer.resourceCidr ?? '', peer.state, peer.accountId ?? '', '', '',
            peerDetails, peerX, peerOffsetY,
          );
        } else {
          flowNodes.push({
            id: peerNodeId,
            type: 'peer-vpc',
            position: { x: peerX, y: peerOffsetY },
            data: {
              id: peerNodeId,
              kind: 'tgw-peer',
              label: peerLabel,
              data: {
                vpcId: peer.resourceId,
                cidr: peer.resourceCidr ?? '',
                peerAccountId: peer.accountId ?? '',
                status: peer.state,
              },
            } satisfies TopoNode,
            style: { width: TGW_PEER_W, height: TGW_PEER_H },
            selectable: true,
            draggable: true,
          });
          thisH = TGW_PEER_H;
        }

        flowEdges.push({
          id: `tgw-peer-edge-${peer.attachmentId}`,
          source: tgwNodeId,
          target: peerNodeId,
          type: 'floating',
          style: {
            stroke: peer.state === 'available' ? 'rgba(167,139,250,0.55)' : 'rgba(239,68,68,0.4)',
            strokeWidth: 1.5,
            strokeDasharray: '5 3',
          },
          markerEnd: { type: 'arrowclosed' as const, color: '#c4b5fd', width: 11, height: 11 },
        });

        peerOffsetY += thisH + TGW_PEER_GAP;
        peerColumnH += thisH + TGW_PEER_GAP;
      }

      tgwBaseY += Math.max(TGW_H + 32, peerColumnH + 32);
    }
  }

  // ─── VPC Endpoints ────────────────────────────────────────────────────────
  for (const ep of safeEndpoints) {
    const epNodeId = `ep-${ep.id}`;
    const epPos = epPrePositions.get(ep.id)!;

    flowNodes.push({
      id: epNodeId,
      type: 'vpc-endpoint',
      position: { x: epPos.x, y: epPos.y },
      data: {
        id: epNodeId,
        kind: 'vpc-endpoint',
        label: ep.serviceName,
        data: {
          endpointId: ep.id,
          serviceName: ep.serviceName,
          type: ep.type,
          state: ep.state,
        },
      } satisfies TopoNode,
      parentId: topo.vpc.id,
      extent: 'parent' as const,
      width: EP_W,
      height: EP_H,
      style: { width: EP_W, minHeight: EP_H },
      selectable: true,
      draggable: true,
    });

    flowEdges.push({
      id: `ep-edge-${ep.id}`,
      source: topo.vpc.id,
      target: epNodeId,
      type: 'floating',
      label: ep.type,
      labelStyle: { fontSize: '9px', fill: ep.type === 'Interface' ? '#6ee7b7' : '#93c5fd', fontFamily: 'monospace' },
      labelBgStyle: { fill: 'rgba(0,0,0,0.6)', rx: 3 },
      style: {
        stroke: ep.state === 'available'
          ? (ep.type === 'Interface' ? 'rgba(52,211,153,0.6)' : 'rgba(96,165,250,0.6)')
          : 'rgba(239,68,68,0.4)',
        strokeWidth: 1.5,
        strokeDasharray: ep.state !== 'available' ? '4 3' : undefined,
      },
      markerEnd: {
        type: 'arrowclosed' as const,
        color: ep.type === 'Interface' ? '#6ee7b7' : '#93c5fd',
        width: 11,
        height: 11,
      },
    });
  }

  return { nodes: flowNodes, edges: flowEdges };
}

// ─── TopologyCanvas ────────────────────────────────────────────────────────

export interface TopologyCanvasProps {
  topology: VPCTopology;
  onSelectNode?: (node: TopoNode) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

function TopologyCanvasInner({ topology, onSelectNode, onRefresh, isRefreshing }: TopologyCanvasProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [riskMode, setRiskMode] = useState(false);
  const [swimlaneMode, setSwimlaneMode] = useState(false);
  const rfInstance = useReactFlow();

  const { nodes: rawNodes, edges: rawEdges } = useMemo(() => buildFlowGraph(topology), [topology]);

  const [nodes, setNodes, onNodesChange] = useNodesState(rawNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges);

  // Reset when topology changes
  useEffect(() => {
    setNodes(rawNodes);
    setEdges(rawEdges);
  }, [rawNodes, rawEdges, setNodes, setEdges]);

  const lowerQuery = searchQuery.toLowerCase().trim();

  // Apply search filter opacity via effect instead of overriding nodes entirely
  useEffect(() => {
    if (!lowerQuery) {
      setNodes((nds) => nds.map((n) => ({ ...n, style: { ...n.style, opacity: 1 } })));
      return;
    }
    setNodes((nds) =>
      nds.map((n) => {
        const tn = n.data as unknown as TopoNode;
        const match =
          tn.label.toLowerCase().includes(lowerQuery) ||
          tn.id.toLowerCase().includes(lowerQuery) ||
          tn.kind.toLowerCase().includes(lowerQuery);
        return { ...n, style: { ...n.style, opacity: match ? 1 : 0.2 } };
      }),
    );
  }, [lowerQuery, setNodes]);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: 'floating',
            style: { stroke: 'var(--accent)', strokeWidth: 2, strokeDasharray: '6 3' },
            markerEnd: { type: 'arrowclosed' as const, color: 'var(--accent)', width: 13, height: 13 },
            label: 'custom',
            labelStyle: { fontSize: '9px', fill: 'var(--accent)' },
            labelBgStyle: { fill: 'rgba(0,0,0,0.55)', rx: 3 },
            animated: false,
            data: { custom: true },
          },
          eds,
        ),
      ),
    [setEdges],
  );

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_evt, node) => {
      const topoNode = node.data as unknown as TopoNode;
      setSelectedNodeId(node.id);
      if (onSelectNode) onSelectNode(topoNode);
    },
    [onSelectNode],
  );

  // TODO: tag swimlanes — requires tag data in TopologyInstance
  const hasTags = false;

  const handleExportPng = useCallback(async () => {
    const el = document.getElementById('topology-flow-container');
    if (!el) return;
    try {
      // Experimental browser API — may not be available
      const canvas = await (el as unknown as { convertToCanvas?: () => Promise<HTMLCanvasElement> }).convertToCanvas?.();
      if (canvas) {
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `topology-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
        });
        return;
      }
    } catch {
      // fallthrough to JSON export
    }
    // Fallback: export as JSON diagram
    const rfObj = rfInstance.toObject();
    const blob = new Blob([JSON.stringify(rfObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topology-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rfInstance]);

  const totalInstances = topology.instances?.length ?? 0;
  const totalPeerings = topology.vpcPeerings?.length ?? 0;
  const totalTGWs = new Set((topology.tgwAttachments ?? []).map((a) => a.tgwId)).size;
  const totalEndpoints = topology.vpcEndpoints?.length ?? 0;
  const totalNodes = rawNodes.length;
  const totalEdges = rawEdges.length;

  return (
    <TopologyContext.Provider value={{ riskMode, swimlaneMode }}>
    <div className="relative w-full h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface shrink-0">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search resources…"
          leftIcon={<Search size={12} />}
          className="max-w-[220px]"
        />
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />}
            onClick={onRefresh}
            aria-label="Refresh topology"
          >
            Refresh
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={<Pencil size={13} />}
          onClick={() => setIsDrawMode((d) => !d)}
          aria-label={isDrawMode ? 'Exit edit mode' : 'Edit diagram'}
          title={isDrawMode ? 'Exit edit mode (click handles to draw lines)' : 'Edit mode: drag nodes, drag edges, draw custom lines'}
          className={isDrawMode ? 'text-accent bg-accent/10' : ''}
        >
          {isDrawMode ? 'Editing…' : 'Edit'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Shield size={13} />}
          onClick={() => setRiskMode((r) => !r)}
          aria-label={riskMode ? 'Disable risk overlay' : 'Enable risk heat map'}
          title="Security risk heat map overlay"
          className={riskMode ? 'text-[#ef4444] bg-[#ef4444]/10' : ''}
        >
          Risk
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Tag size={13} />}
          onClick={() => setSwimlaneMode((s) => !s)}
          aria-label={swimlaneMode ? 'Disable tag swimlanes' : 'Enable tag swimlanes'}
          title="Tag-based swimlane grouping"
          className={swimlaneMode ? 'text-accent bg-accent/10' : ''}
        >
          Tags
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Download size={13} />}
          onClick={() => { void handleExportPng(); }}
          aria-label="Export diagram"
          title="Export topology as PNG (or JSON fallback)"
        >
          Export
        </Button>
        <span className="text-[11px] text-text-dim ml-auto flex items-center gap-2 flex-wrap">
          <span>{totalInstances} instances</span>
          {totalPeerings > 0 && <span className="text-[#fde047]/80">{totalPeerings} peering{totalPeerings !== 1 ? 's' : ''}</span>}
          {totalTGWs > 0 && <span className="text-[#c4b5fd]/80">{totalTGWs} TGW{totalTGWs !== 1 ? 's' : ''}</span>}
          {totalEndpoints > 0 && <span className="text-[#6ee7b7]/80">{totalEndpoints} endpoint{totalEndpoints !== 1 ? 's' : ''}</span>}
          <span>{totalNodes} nodes · {totalEdges} edges</span>
        </span>
      </div>
      {isDrawMode && (
        <style>{`.react-flow__handle { opacity: 1 !important; width: 10px !important; height: 10px !important; background: var(--accent) !important; border: 2px solid var(--surface) !important; cursor: crosshair !important; } .react-flow__edge .react-flow__edge-path { cursor: pointer; } .react-flow__edgeupdater { cursor: crosshair; }`}</style>
      )}
      {swimlaneMode && !hasTags && (
        <div className="px-3 py-1.5 bg-surface border-b border-border text-[11px] text-text-dim flex items-center gap-1.5">
          <Tag size={11} className="shrink-0" />
          Tag data not available in topology response — swimlane grouping requires tag fields on instances.
        </div>
      )}
      <div
        id="topology-flow-container"
        className="flex-1 min-h-0"
        style={isDrawMode ? { outline: '2px solid var(--accent)', outlineOffset: '-2px' } : undefined}
      >
        <ReactFlow
          key={topology.vpc.id}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          fitViewOptions={{ padding: 0.10 }}
          minZoom={0.04}
          maxZoom={3}
          nodeOrigin={[0, 0]}
          selectNodesOnDrag={false}
          nodesDraggable={true}
          nodesConnectable={isDrawMode}
          edgesUpdatable={isDrawMode}
          connectOnClick={false}
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
          {isDrawMode && (
            <Panel position="top-center">
              <div style={{
                background: 'rgba(124,92,255,0.15)',
                border: '1px solid var(--accent)',
                borderRadius: '6px',
                padding: '4px 12px',
                fontSize: '11px',
                color: 'var(--accent)',
                fontWeight: 600,
              }}>
                Edit mode — drag nodes to reposition · hover a node edge to draw connections · drag edge endpoints to reconnect
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>
      {selectedNodeId && (
        <span className="sr-only" aria-live="polite">
          Selected: {selectedNodeId}
        </span>
      )}
    </div>
    </TopologyContext.Provider>
  );
}

// Wrap in ReactFlowProvider so useReactFlow() works inside TopologyCanvasInner
import { ReactFlowProvider } from '@xyflow/react';

export function TopologyCanvas(props: TopologyCanvasProps) {
  return (
    <ReactFlowProvider>
      <TopologyCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

TopologyCanvas.displayName = 'TopologyCanvas';
