/**
 * Transform VPCTopology API data into React Flow nodes and edges.
 * Layout: AZ groups → subnet groups → resource nodes, with external
 * resources (IGW, TGW, peering, endpoints) positioned on the sides.
 */

import type { Node, Edge } from "@xyflow/react";
import type {
  VPCTopology,
  SubnetInfo,
  TopologyInstance,
  NATGWInfo,
  TopologyLBInfo,
  VPCEndpointInfo,
} from "@/types";
import type { ResourceNodeData, AZGroupData, SubnetGroupData } from "./nodes";
import type { ResourceType } from "./aws-icons";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const AZ_GAP = 40;
const SUBNET_GAP = 30;
const NODE_W = 170;
const NODE_H = 50;
const NODE_GAP = 16;
const SUBNET_PAD_X = 20;
const SUBNET_PAD_TOP = 40;
const SUBNET_PAD_BOTTOM = 16;
const AZ_PAD_X = 20;
const AZ_PAD_TOP = 30;
const AZ_PAD_BOTTOM = 16;
const EXTERNAL_X_LEFT = 0; // left column for IGW, etc.
const AZ_START_X = 300; // AZ column starts here

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resourceNode(
  id: string,
  type: ResourceType,
  label: string,
  sublabel: string,
  x: number,
  y: number,
  parentId?: string,
  extras?: Partial<ResourceNodeData>,
): Node<ResourceNodeData> {
  const node: Node<ResourceNodeData> = {
    id,
    type: "resource",
    position: { x, y },
    data: { resourceType: type, label, sublabel, ...extras },
  };
  if (parentId) {
    node.parentId = parentId;
    node.extent = "parent";
  }
  return node;
}

// ---------------------------------------------------------------------------
// Main transformer
// ---------------------------------------------------------------------------

export interface TransformResult {
  nodes: Node[];
  edges: Edge[];
}

export function transformTopology(topo: VPCTopology): TransformResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Group subnets by AZ
  const azMap = new Map<string, SubnetInfo[]>();
  for (const s of topo.subnets) {
    const list = azMap.get(s.az) || [];
    list.push(s);
    azMap.set(s.az, list);
  }

  // Map instances by subnet
  const instancesBySubnet = new Map<string, TopologyInstance[]>();
  for (const inst of topo.instances) {
    const list = instancesBySubnet.get(inst.subnetId) || [];
    list.push(inst);
    instancesBySubnet.set(inst.subnetId, list);
  }

  // Map NATs by subnet
  const natsBySubnet = new Map<string, NATGWInfo[]>();
  for (const nat of topo.natGateways) {
    const list = natsBySubnet.get(nat.subnetId) || [];
    list.push(nat);
    natsBySubnet.set(nat.subnetId, list);
  }

  // Map LBs by subnet
  const lbsBySubnet = new Map<string, TopologyLBInfo[]>();
  for (const lb of topo.loadBalancers) {
    for (const sid of lb.subnetIds) {
      const list = lbsBySubnet.get(sid) || [];
      list.push(lb);
      lbsBySubnet.set(sid, list);
    }
  }

  // Map endpoints by subnet
  const endpointsBySubnet = new Map<string, VPCEndpointInfo[]>();
  for (const ep of topo.vpcEndpoints) {
    for (const sid of ep.subnetIds ?? []) {
      const list = endpointsBySubnet.get(sid) || [];
      list.push(ep);
      endpointsBySubnet.set(sid, list);
    }
  }

  // ---------------------------------------------------------------------------
  // Build AZ → Subnet → Resource hierarchy
  // ---------------------------------------------------------------------------

  let azY = 0;
  const azEntries = [...azMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [az, subnets] of azEntries) {
    const azId = `az-${az}`;
    let subnetY = AZ_PAD_TOP;
    let maxSubnetW = 0;

    for (const subnet of subnets) {
      const subnetId = `subnet-${subnet.id}`;
      const children: TopologyInstance[] = instancesBySubnet.get(subnet.id) ?? [];
      const nats: NATGWInfo[] = natsBySubnet.get(subnet.id) ?? [];
      const lbs: TopologyLBInfo[] = lbsBySubnet.get(subnet.id) ?? [];
      const eps: VPCEndpointInfo[] = endpointsBySubnet.get(subnet.id) ?? [];
      const allChildren = [
        ...children.map((c) => ({ kind: "instance" as const, data: c })),
        ...nats.map((n) => ({ kind: "natGateway" as const, data: n })),
        ...lbs.map((l) => ({ kind: "loadBalancer" as const, data: l })),
        ...eps.map((e) => ({ kind: "vpcEndpoint" as const, data: e })),
      ];

      // Place child nodes inside subnet
      let childY = SUBNET_PAD_TOP;
      for (const child of allChildren) {
        let nodeId: string;
        let nodeLabel: string;
        let nodeSub: string;
        let nodeType: ResourceType;
        let extras: Partial<ResourceNodeData> = {};

        switch (child.kind) {
          case "instance": {
            const inst = child.data as TopologyInstance;
            nodeId = `inst-${inst.id}`;
            nodeLabel = inst.name || inst.id;
            nodeSub = inst.privateIp || inst.instanceType;
            nodeType = "instance";
            extras = { state: inst.state };
            // Edge: instance → SGs
            for (const sg of inst.securityGroups) {
              edges.push({
                id: `e-${nodeId}-sg-${sg}`,
                source: nodeId,
                target: `sg-${sg}`,
                type: "smoothstep",
                animated: false,
                style: { stroke: "#DD344C", strokeWidth: 1, opacity: 0.4 },
              });
            }
            break;
          }
          case "natGateway": {
            const nat = child.data as NATGWInfo;
            nodeId = `nat-${nat.id}`;
            nodeLabel = nat.name || "NAT Gateway";
            nodeSub = nat.publicIp || nat.state;
            nodeType = "natGateway";
            extras = { state: nat.state };
            break;
          }
          case "loadBalancer": {
            const lb = child.data as TopologyLBInfo;
            nodeId = `lb-${lb.arn}`;
            nodeLabel = lb.name;
            nodeSub = lb.type;
            nodeType = "loadBalancer";
            // Edge: LB → target instances
            for (const t of lb.targets) {
              edges.push({
                id: `e-${nodeId}-${t.targetId}`,
                source: nodeId,
                target: `inst-${t.targetId}`,
                type: "smoothstep",
                animated: true,
                style: { stroke: "#8C4FFF", strokeWidth: 1.5 },
                label: `:${t.port}`,
              });
            }
            break;
          }
          case "vpcEndpoint": {
            const ep = child.data as VPCEndpointInfo;
            nodeId = `ep-${ep.id}`;
            nodeLabel = ep.serviceName.split(".").pop() || ep.id;
            nodeSub = ep.type;
            nodeType = "vpcEndpoint";
            extras = { state: ep.state };
            break;
          }
        }

        nodes.push(
          resourceNode(nodeId!, nodeType!, nodeLabel!, nodeSub!, SUBNET_PAD_X, childY, subnetId, extras),
        );
        childY += NODE_H + NODE_GAP;
      }

      const subnetH = Math.max(80, childY + SUBNET_PAD_BOTTOM);
      const subnetW = NODE_W + SUBNET_PAD_X * 2 + 20;

      // Subnet group node
      nodes.push({
        id: subnetId,
        type: "subnetGroup",
        position: { x: AZ_PAD_X, y: subnetY },
        parentId: azId,
        extent: "parent",
        data: {
          label: subnet.name || subnet.id,
          sublabel: subnet.cidr,
          isPublic: subnet.isPublic,
        } satisfies SubnetGroupData,
        style: { width: subnetW, height: subnetH },
      });

      // Edge: subnet → route table
      if (subnet.routeTableId) {
        edges.push({
          id: `e-${subnetId}-rt-${subnet.routeTableId}`,
          source: subnetId,
          target: `rt-${subnet.routeTableId}`,
          type: "smoothstep",
          style: { stroke: "#248814", strokeWidth: 1, opacity: 0.3 },
        });
      }
      // Edge: subnet → NACL
      if (subnet.networkAclId) {
        edges.push({
          id: `e-${subnetId}-nacl-${subnet.networkAclId}`,
          source: subnetId,
          target: `nacl-${subnet.networkAclId}`,
          type: "smoothstep",
          style: { stroke: "#DD344C", strokeWidth: 1, opacity: 0.3 },
        });
      }

      maxSubnetW = Math.max(maxSubnetW, subnetW);
      subnetY += subnetH + SUBNET_GAP;
    }

    const azH = Math.max(120, subnetY + AZ_PAD_BOTTOM);
    const azW = maxSubnetW + AZ_PAD_X * 2 + 20;

    // AZ group node
    nodes.push({
      id: azId,
      type: "azGroup",
      position: { x: AZ_START_X, y: azY },
      data: { label: az } satisfies AZGroupData,
      style: { width: azW, height: azH },
    });

    azY += azH + AZ_GAP;
  }

  // ---------------------------------------------------------------------------
  // External / sidebar resources
  // ---------------------------------------------------------------------------

  let leftY = 0;
  let rightY = 0;
  const rightX = AZ_START_X + 600;

  // Internet Gateways (left side)
  for (const igw of topo.internetGateways) {
    const id = `igw-${igw.id}`;
    nodes.push(resourceNode(id, "igw", igw.name || "IGW", igw.id, EXTERNAL_X_LEFT, leftY));
    leftY += NODE_H + NODE_GAP;
  }

  // TGW Attachments (left side)
  for (const tgw of topo.tgwAttachments) {
    const id = `tgw-${tgw.attachmentId}`;
    nodes.push(
      resourceNode(id, "tgwAttachment", tgw.tgwName || "TGW", tgw.tgwId, EXTERNAL_X_LEFT, leftY, undefined, {
        state: tgw.state,
      }),
    );
    leftY += NODE_H + NODE_GAP;
  }

  // VPC Peerings (left side)
  for (const peer of topo.vpcPeerings) {
    const id = `peer-${peer.id}`;
    const label = peer.peerVpcName || `Peering ${peer.id.slice(-8)}`;
    nodes.push(
      resourceNode(id, "vpcPeering", label, peer.accepterCidr, EXTERNAL_X_LEFT, leftY, undefined, {
        state: peer.status,
      }),
    );
    leftY += NODE_H + NODE_GAP;
  }

  // Security Groups (right side)
  for (const sg of topo.securityGroups) {
    const id = `sg-${sg.id}`;
    nodes.push(resourceNode(id, "securityGroup", sg.name || sg.id, sg.description || "", rightX, rightY));
    rightY += NODE_H + NODE_GAP;
  }

  // NACLs (right side)
  for (const nacl of topo.networkAcls) {
    const id = `nacl-${nacl.id}`;
    const label = nacl.isDefault ? "Default NACL" : nacl.id;
    nodes.push(resourceNode(id, "nacl", label, `${nacl.rules.length} rules`, rightX, rightY));
    rightY += NODE_H + NODE_GAP;
  }

  // Route Tables (right side)
  for (const rt of topo.routeTables) {
    const id = `rt-${rt.id}`;
    const label = rt.name || (rt.isMain ? "Main RT" : rt.id);
    nodes.push(resourceNode(id, "routeTable", label, `${rt.routes.length} routes`, rightX, rightY));
    rightY += NODE_H + NODE_GAP;

    // Edges from RT → IGW / NAT via routes
    for (const route of rt.routes) {
      if (route.target.startsWith("igw-")) {
        edges.push({
          id: `e-${id}-${route.target}`,
          source: id,
          target: `igw-${route.target}`,
          type: "smoothstep",
          style: { stroke: "#248814", strokeWidth: 1, opacity: 0.3 },
        });
      }
    }
  }

  // DHCP Options, Flow Logs, Prefix Lists, Elastic IPs as badges at bottom-right
  let badgeY = rightY + 30;

  if (topo.dhcpOptions) {
    const dh = topo.dhcpOptions;
    nodes.push(
      resourceNode("dhcp-" + dh.id, "dhcpOptions", "DHCP Options", dh.domainName || dh.id, rightX, badgeY),
    );
    badgeY += NODE_H + NODE_GAP;
  }

  if (topo.flowLogs?.length) {
    nodes.push(
      resourceNode("flowlogs", "flowLog", `Flow Logs (${topo.flowLogs.length})`, "", rightX, badgeY),
    );
    badgeY += NODE_H + NODE_GAP;
  }

  if (topo.elasticIps?.length) {
    nodes.push(
      resourceNode("eips", "elasticIp", `Elastic IPs (${topo.elasticIps.length})`, "", rightX, badgeY),
    );
    badgeY += NODE_H + NODE_GAP;
  }

  if (topo.prefixLists?.length) {
    nodes.push(
      resourceNode(
        "prefixlists",
        "prefixList",
        `Prefix Lists (${topo.prefixLists.length})`,
        "",
        rightX,
        badgeY,
      ),
    );
  }

  return { nodes, edges };
}
