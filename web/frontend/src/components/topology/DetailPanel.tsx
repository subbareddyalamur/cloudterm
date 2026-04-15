import { X } from "lucide-react";
import type { Node } from "@xyflow/react";
import type { VPCTopology } from "@/types";
import { AwsIcon, type ResourceType } from "./aws-icons";
import type { ResourceNodeData, SubnetGroupData } from "./nodes";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DetailPanelProps {
  node: Node | null;
  topology: VPCTopology | null;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex justify-between gap-2 py-1 border-b border-border/50 last:border-0">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <span className="text-[11px] text-right break-all">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {title}
      </h4>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail content per resource type
// ---------------------------------------------------------------------------

function ResourceDetail({ data, topology }: { data: ResourceNodeData; topology: VPCTopology }) {
  const rt = data.resourceType;

  switch (rt) {
    case "instance": {
      const inst = topology.instances.find(
        (i) => i.id === data.metadata?.id || i.name === data.label,
      );
      if (!inst) return <Row label="ID" value={data.label} />;
      return (
        <>
          <Row label="Instance ID" value={inst.id} />
          <Row label="Type" value={inst.instanceType} />
          <Row label="State" value={inst.state} />
          <Row label="Private IP" value={inst.privateIp} />
          <Row label="Public IP" value={inst.publicIp || "None"} />
          <Row label="Platform" value={inst.platform || "linux"} />
          <Row
            label="Security Groups"
            value={inst.securityGroups
              .map((sg) => {
                const obj = topology.securityGroups.find((s) => s.id === sg);
                return obj?.name || sg;
              })
              .join(", ")}
          />
        </>
      );
    }

    case "securityGroup": {
      const sg = topology.securityGroups.find((s) => s.name === data.label || s.id === data.label);
      if (!sg) return <Row label="Name" value={data.label} />;
      return (
        <>
          <Row label="ID" value={sg.id} />
          <Row label="Name" value={sg.name} />
          <Row label="Description" value={sg.description} />
          <Section title={`Inbound Rules (${sg.inboundRules.length})`}>
            {sg.inboundRules.slice(0, 8).map((r, i) => (
              <Row
                key={i}
                label={`${r.protocol} ${r.fromPort}-${r.toPort}`}
                value={r.source}
              />
            ))}
          </Section>
          <Section title={`Outbound Rules (${sg.outboundRules.length})`}>
            {sg.outboundRules.slice(0, 8).map((r, i) => (
              <Row
                key={i}
                label={`${r.protocol} ${r.fromPort}-${r.toPort}`}
                value={r.source}
              />
            ))}
          </Section>
        </>
      );
    }

    case "nacl": {
      const nacl = topology.networkAcls.find(
        (n) => n.id === data.label || (n.isDefault && data.label === "Default NACL"),
      );
      if (!nacl) return <Row label="NACL" value={data.label} />;
      return (
        <>
          <Row label="ID" value={nacl.id} />
          <Row label="Default" value={nacl.isDefault ? "Yes" : "No"} />
          <Section title={`Rules (${nacl.rules.length})`}>
            {nacl.rules.slice(0, 10).map((r, i) => (
              <Row
                key={i}
                label={`#${r.ruleNumber} ${r.direction}`}
                value={`${r.action} ${r.cidrBlock} ${r.protocol} ${r.fromPort}-${r.toPort}`}
              />
            ))}
          </Section>
        </>
      );
    }

    case "routeTable": {
      const rt2 = topology.routeTables.find(
        (r) => r.name === data.label || (r.isMain && data.label === "Main RT") || r.id === data.label,
      );
      if (!rt2) return <Row label="Route Table" value={data.label} />;
      return (
        <>
          <Row label="ID" value={rt2.id} />
          <Row label="Name" value={rt2.name} />
          <Row label="Main" value={rt2.isMain ? "Yes" : "No"} />
          <Section title={`Routes (${rt2.routes.length})`}>
            {rt2.routes.map((r, i) => (
              <Row key={i} label={r.destination} value={`${r.target} (${r.state})`} />
            ))}
          </Section>
        </>
      );
    }

    case "igw": {
      const igw = topology.internetGateways.find((g) => g.name === data.label || g.id === data.sublabel);
      return (
        <>
          <Row label="ID" value={igw?.id ?? data.sublabel} />
          <Row label="Name" value={igw?.name ?? data.label} />
        </>
      );
    }

    case "natGateway": {
      const nat = topology.natGateways.find((n) => n.name === data.label || n.id === data.sublabel);
      if (!nat) return <Row label="NAT" value={data.label} />;
      return (
        <>
          <Row label="ID" value={nat.id} />
          <Row label="Public IP" value={nat.publicIp} />
          <Row label="State" value={nat.state} />
        </>
      );
    }

    case "tgwAttachment": {
      const tgw = topology.tgwAttachments.find((t) => t.tgwName === data.label || t.tgwId === data.sublabel);
      if (!tgw) return <Row label="TGW" value={data.label} />;
      return (
        <>
          <Row label="Attachment ID" value={tgw.attachmentId} />
          <Row label="TGW ID" value={tgw.tgwId} />
          <Row label="TGW Name" value={tgw.tgwName} />
          <Row label="Resource Type" value={tgw.resourceType} />
          <Row label="State" value={tgw.state} />
          {tgw.subnetIds && <Row label="Subnets" value={tgw.subnetIds.join(", ")} />}
        </>
      );
    }

    case "vpcPeering": {
      const peer = topology.vpcPeerings.find(
        (p) => p.peerVpcName === data.label || p.id.endsWith(data.label.slice(-8)),
      );
      if (!peer) return <Row label="Peering" value={data.label} />;
      return (
        <>
          <Row label="Connection ID" value={peer.id} />
          <Row label="Status" value={peer.status} />
          <Row label="Requester VPC" value={peer.requesterVpc} />
          <Row label="Requester CIDR" value={peer.requesterCidr} />
          <Row label="Accepter VPC" value={peer.accepterVpc} />
          <Row label="Accepter CIDR" value={peer.accepterCidr} />
          <Row label="Peer Account" value={peer.peerAccountId || "same"} />
          <Row label="Peer Region" value={peer.peerRegion || "same"} />
        </>
      );
    }

    case "vpcEndpoint": {
      const ep = topology.vpcEndpoints.find(
        (e) => e.serviceName.endsWith(data.label) || e.id === data.sublabel,
      );
      if (!ep) return <Row label="Endpoint" value={data.label} />;
      return (
        <>
          <Row label="ID" value={ep.id} />
          <Row label="Service" value={ep.serviceName} />
          <Row label="Type" value={ep.type} />
          <Row label="State" value={ep.state} />
        </>
      );
    }

    case "loadBalancer": {
      const lb = topology.loadBalancers.find((l) => l.name === data.label);
      if (!lb) return <Row label="LB" value={data.label} />;
      return (
        <>
          <Row label="Name" value={lb.name} />
          <Row label="Type" value={lb.type} />
          <Row label="Scheme" value={lb.scheme} />
          <Row label="DNS" value={lb.dnsName} />
          <Section title="Listeners">
            {lb.listeners.map((l, i) => (
              <Row key={i} label={`Listener ${i + 1}`} value={`${l.protocol}:${l.port}`} />
            ))}
          </Section>
          <Section title="Targets">
            {lb.targets.map((t, i) => (
              <Row key={i} label={t.targetId} value={`:${t.port} (${t.healthState})`} />
            ))}
          </Section>
        </>
      );
    }

    case "elasticIp": {
      const eips = topology.elasticIps ?? [];
      return (
        <Section title={`Elastic IPs (${eips.length})`}>
          {eips.map((eip) => (
            <div key={eip.allocationId} className="mb-2">
              <Row label="Public IP" value={eip.publicIp} />
              <Row label="Allocation" value={eip.allocationId} />
              <Row label="Instance" value={eip.instanceId} />
              <Row label="Name" value={eip.name} />
            </div>
          ))}
        </Section>
      );
    }

    case "dhcpOptions": {
      const dh = topology.dhcpOptions;
      if (!dh) return null;
      return (
        <>
          <Row label="Options ID" value={dh.id} />
          <Row label="Domain" value={dh.domainName} />
          <Row label="DNS Servers" value={dh.domainServers?.join(", ")} />
          <Row label="NTP Servers" value={dh.ntpServers?.join(", ")} />
        </>
      );
    }

    case "flowLog": {
      const fls = topology.flowLogs ?? [];
      return (
        <Section title={`Flow Logs (${fls.length})`}>
          {fls.map((fl) => (
            <div key={fl.id} className="mb-2">
              <Row label="ID" value={fl.id} />
              <Row label="Status" value={fl.status} />
              <Row label="Traffic" value={fl.trafficType} />
              <Row label="Destination" value={fl.logDestination} />
            </div>
          ))}
        </Section>
      );
    }

    case "prefixList": {
      const pls = topology.prefixLists ?? [];
      return (
        <Section title={`Prefix Lists (${pls.length})`}>
          {pls.map((pl) => (
            <div key={pl.id} className="mb-2">
              <Row label="ID" value={pl.id} />
              <Row label="Name" value={pl.name} />
              <Row label="Max Entries" value={pl.maxEntries} />
              {pl.cidrs && <Row label="CIDRs" value={pl.cidrs.slice(0, 5).join(", ")} />}
            </div>
          ))}
        </Section>
      );
    }

    default:
      return <Row label="Resource" value={data.label} />;
  }
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function DetailPanel({ node, topology, onClose }: DetailPanelProps) {
  if (!node || !topology) return null;

  const isResource = node.type === "resource";
  const isSubnet = node.type === "subnetGroup";
  const data = node.data as ResourceNodeData | SubnetGroupData;

  let title = "label" in data ? (data.label as string) : "Details";
  let icon: ResourceType | undefined;

  if (isResource) {
    const rd = data as ResourceNodeData;
    icon = rd.resourceType;
    title = rd.label;
  } else if (isSubnet) {
    icon = "subnet";
    title = (data as SubnetGroupData).label;
  }

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-card border-l border-border shadow-lg overflow-y-auto z-50">
      <div className="sticky top-0 bg-card border-b border-border px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && <AwsIcon type={icon} size={18} />}
          <h3 className="text-sm font-semibold truncate max-w-[200px]">{title}</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-3 py-2">
        {isResource && (
          <ResourceDetail data={data as ResourceNodeData} topology={topology} />
        )}
        {isSubnet && (() => {
          const sd = data as SubnetGroupData;
          const subnet = topology.subnets.find((s) => s.name === sd.label || s.id === sd.label);
          if (!subnet) return <Row label="Subnet" value={sd.label} />;
          return (
            <>
              <Row label="Subnet ID" value={subnet.id} />
              <Row label="CIDR" value={subnet.cidr} />
              <Row label="AZ" value={subnet.az} />
              <Row label="Type" value={subnet.isPublic ? "Public" : "Private"} />
              <Row label="Available IPs" value={subnet.availableIps} />
              <Row label="Route Table" value={subnet.routeTableId} />
              <Row label="NACL" value={subnet.networkAclId} />
            </>
          );
        })()}
      </div>
    </div>
  );
}
