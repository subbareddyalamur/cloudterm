import { X, Shield, Network, Server, Globe, ArrowLeftRight, GitMerge, Zap, Link, Table } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import { Badge } from '@/components/primitives/Badge';
import type { TopoNode, SGRuleInfo, SubnetInfo, TopologyInstance, NATGWInfo, IGWInfo, VPCInfo, RouteInfo } from '@/lib/topology-types';

export interface TopologySidePanelProps {
  node: TopoNode | null;
  onClose: () => void;
}

function isSGRuleArray(v: unknown): v is SGRuleInfo[] {
  return Array.isArray(v) && (v.length === 0 || typeof (v as SGRuleInfo[])[0] === 'object');
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[9px] font-bold uppercase tracking-widest text-text-dim mb-2 pb-1 border-b border-border">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <span className="text-[10px] text-text-dim shrink-0 min-w-[80px]">{label}</span>
      <span className={`text-[11px] text-text-pri text-right break-all ${mono ? 'font-mono' : ''}`}>
        {String(value)}
      </span>
    </div>
  );
}

function SGRulesTable({ rules, label }: { rules: SGRuleInfo[]; label: string }) {
  if (rules.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="text-[9px] font-semibold text-text-dim uppercase tracking-wide mb-1.5">{label}</div>
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-elev">
              <th className="text-left py-1.5 px-2 text-text-dim font-medium">Proto</th>
              <th className="text-left py-1.5 px-2 text-text-dim font-medium">Port</th>
              <th className="text-left py-1.5 px-2 text-text-dim font-medium">Source / Dest</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr
                key={i}
                className="border-t border-border/50 hover:bg-elev/40 transition-colors"
              >
                <td className="py-1.5 px-2 font-mono text-warn">{r.protocol === '-1' ? 'all' : r.protocol}</td>
                <td className="py-1.5 px-2 font-mono text-text-pri">
                  {r.fromPort === r.toPort
                    ? r.fromPort === 0 && r.toPort === 0
                      ? 'all'
                      : String(r.fromPort)
                    : `${r.fromPort}–${r.toPort}`}
                </td>
                <td className="py-1.5 px-2 text-text-dim truncate max-w-[120px]" title={r.source}>
                  {r.source}
                  {r.description && (
                    <span className="ml-1 text-text-dim/60">({r.description})</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InstancePanel({ node }: { node: TopoNode }) {
  const inst = node.data as unknown as TopologyInstance;
  const inbound = isSGRuleArray(node.data['inboundRules']) ? node.data['inboundRules'] : [];
  const outbound = isSGRuleArray(node.data['outboundRules']) ? node.data['outboundRules'] : [];
  const isRunning = inst.state === 'running';

  return (
    <>
      <Section title="Instance">
        <Row label="Name" value={inst.name} />
        <Row label="ID" value={inst.id} mono />
        <div className="flex items-start justify-between gap-2 py-1">
          <span className="text-[10px] text-text-dim shrink-0 min-w-[80px]">State</span>
          <Badge variant={isRunning ? 'success' : 'danger'} size="sm">
            {inst.state}
          </Badge>
        </div>
        <Row label="Type" value={inst.instanceType} />
        <Row label="Platform" value={inst.platform} />
      </Section>
      <Section title="Network">
        <Row label="Private IP" value={inst.privateIp} mono />
        {inst.publicIp && <Row label="Public IP" value={inst.publicIp} mono />}
        <Row label="Subnet" value={inst.subnetId} mono />
      </Section>
      {(inst.securityGroups ?? []).length > 0 && (
        <Section title="Security Groups">
          {(inst.securityGroups ?? []).map((sgId) => (
            <div
              key={sgId}
              className="flex items-center gap-1.5 py-1 text-[10px] text-text-dim font-mono"
            >
              <Shield size={10} className="text-warn shrink-0" />
              {sgId}
            </div>
          ))}
        </Section>
      )}
      {(inbound.length > 0 || outbound.length > 0) && (
        <Section title="Security Rules">
          <SGRulesTable rules={inbound} label="Inbound" />
          <SGRulesTable rules={outbound} label="Outbound" />
        </Section>
      )}
    </>
  );
}

function SubnetPanel({ node, allInstances }: { node: TopoNode; allInstances?: TopologyInstance[] }) {
  const subnet = node.data as unknown as SubnetInfo;
  const instanceCount = allInstances?.filter((i) => i.subnetId === subnet.id).length ?? 0;

  return (
    <>
      <Section title="Subnet">
        <Row label="ID" value={subnet.id} mono />
        <Row label="CIDR" value={subnet.cidr} mono />
        <Row label="AZ" value={subnet.az} />
        <div className="flex items-start justify-between gap-2 py-1">
          <span className="text-[10px] text-text-dim shrink-0 min-w-[80px]">Type</span>
          <Badge variant={subnet.isPublic ? 'success' : 'info'} size="sm">
            {subnet.isPublic ? 'Public' : 'Private'}
          </Badge>
        </div>
        <Row label="Available IPs" value={subnet.availableIps} />
        <Row label="Instances" value={instanceCount} />
      </Section>
      <Section title="Routing">
        {subnet.routeTableId && <Row label="Route Table" value={subnet.routeTableId} mono />}
        {subnet.networkAclId && <Row label="NACL" value={subnet.networkAclId} mono />}
      </Section>
    </>
  );
}

function VPCPanel({ node }: { node: TopoNode }) {
  const vpc = node.data as unknown as VPCInfo;
  return (
    <Section title="VPC">
      <Row label="ID" value={vpc.id} mono />
      <Row label="CIDR" value={vpc.cidr} mono />
      <Row label="Name" value={vpc.name} />
      <div className="flex items-start justify-between gap-2 py-1">
        <span className="text-[10px] text-text-dim shrink-0 min-w-[80px]">Default</span>
        <Badge variant={vpc.isDefault ? 'warn' : 'default'} size="sm">
          {vpc.isDefault ? 'Yes' : 'No'}
        </Badge>
      </div>
    </Section>
  );
}

function IGWPanel({ node }: { node: TopoNode }) {
  const igw = node.data as unknown as IGWInfo;
  return (
    <Section title="Internet Gateway">
      <Row label="ID" value={igw.id} mono />
      <Row label="Name" value={igw.name} />
    </Section>
  );
}

function NATPanel({ node }: { node: TopoNode }) {
  const nat = node.data as unknown as NATGWInfo;
  const isAvailable = nat.state === 'available';

  return (
    <>
      <Section title="NAT Gateway">
        <Row label="ID" value={nat.id} mono />
        <Row label="Name" value={nat.name} />
        <div className="flex items-start justify-between gap-2 py-1">
          <span className="text-[10px] text-text-dim shrink-0 min-w-[80px]">State</span>
          <Badge variant={isAvailable ? 'success' : 'danger'} size="sm">
            {nat.state}
          </Badge>
        </div>
      </Section>
      <Section title="Network">
        <Row label="Subnet" value={nat.subnetId} mono />
        {nat.publicIp && <Row label="Public IP" value={nat.publicIp} mono />}
      </Section>
    </>
  );
}

function SGPanel({ node }: { node: TopoNode }) {
  const inbound = isSGRuleArray(node.data['inboundRules']) ? node.data['inboundRules'] : [];
  const outbound = isSGRuleArray(node.data['outboundRules']) ? node.data['outboundRules'] : [];

  return (
    <>
      <Section title="Security Group">
        <Row label="ID" value={String(node.data['id'] ?? '')} mono />
        <Row label="Name" value={String(node.data['name'] ?? '')} />
        <Row label="Description" value={String(node.data['description'] ?? '')} />
      </Section>
      <Section title="Rules">
        <SGRulesTable rules={inbound} label="Inbound" />
        <SGRulesTable rules={outbound} label="Outbound" />
      </Section>
    </>
  );
}

const RT_TARGET_LABELS: Record<string, string> = {
  igw: 'IGW', nat: 'NAT GW', tgw: 'TGW', pcx: 'VPC Peering',
  vpce: 'Endpoint', vgw: 'VGW', local: 'local', instance: 'Instance',
};

function RouteTablePanel({ node }: { node: TopoNode }) {
  const d = node.data;
  const isMain = Boolean(d['isMain']);
  const subnetIds = Array.isArray(d['subnetIds']) ? (d['subnetIds'] as string[]) : [];
  const routes = Array.isArray(d['routes']) ? (d['routes'] as RouteInfo[]) : [];

  return (
    <>
      <Section title="Route Table">
        <Row label="ID" value={String(d['id'] ?? '')} mono />
        <Row label="Name" value={String(d['name'] ?? '')} />
        <div className="flex items-start justify-between gap-2 py-1">
          <span className="text-[10px] text-text-dim shrink-0 min-w-[80px]">Type</span>
          <Badge variant={isMain ? 'warn' : 'default'} size="sm">{isMain ? 'Main' : 'Custom'}</Badge>
        </div>
      </Section>
      {subnetIds.length > 0 && (
        <Section title="Associated Subnets">
          {subnetIds.map((id) => (
            <div key={id} className="py-0.5 text-[10px] text-text-dim font-mono break-all">{id}</div>
          ))}
        </Section>
      )}
      {routes.length > 0 && (
        <Section title="Routes">
          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-elev">
                  <th className="text-left py-1.5 px-2 text-text-dim font-medium">Destination</th>
                  <th className="text-left py-1.5 px-2 text-text-dim font-medium">Target</th>
                  <th className="text-left py-1.5 px-2 text-text-dim font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r, i) => (
                  <tr key={i} className="border-t border-border/50 hover:bg-elev/40">
                    <td className="py-1.5 px-2 font-mono text-text-pri break-all">{r.destination}</td>
                    <td className="py-1.5 px-2 font-mono text-text-dim break-all max-w-[100px]" title={r.target}>{r.target}</td>
                    <td className="py-1.5 px-2 text-text-dim">{RT_TARGET_LABELS[r.targetType] ?? r.targetType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </>
  );
}

function PeerVPCPanel({ node }: { node: TopoNode }) {
  const d = node.data;
  const status = String(d['status'] ?? '');
  const isActive = status === 'active';
  return (
    <>
      <Section title="Peered VPC">
        <Row label="VPC ID" value={String(d['vpcId'] ?? '')} mono />
        <Row label="CIDR" value={String(d['cidr'] ?? '')} mono />
        <Row label="Peering ID" value={String(d['peeringId'] ?? '')} mono />
        <div className="flex items-start justify-between gap-2 py-1">
          <span className="text-[10px] text-text-dim shrink-0 min-w-[80px]">Status</span>
          <Badge variant={isActive ? 'success' : 'danger'} size="sm">{status || '—'}</Badge>
        </div>
      </Section>
      {(d['peerAccountId'] || d['peerRegion']) && (
        <Section title="Cross-Account">
          {d['peerAccountId'] && <Row label="Account" value={String(d['peerAccountId'])} mono />}
          {d['peerRegion'] && <Row label="Region" value={String(d['peerRegion'])} />}
        </Section>
      )}
    </>
  );
}

function TGWPanel({ node }: { node: TopoNode }) {
  const d = node.data;
  const state = String(d['state'] ?? '');
  const isActive = state === 'available' || state === 'active';
  return (
    <Section title="Transit Gateway">
      <Row label="TGW ID" value={String(d['tgwId'] ?? '')} mono />
      <Row label="Attachment" value={String(d['attachmentId'] ?? '')} mono />
      <div className="flex items-start justify-between gap-2 py-1">
        <span className="text-[10px] text-text-dim shrink-0 min-w-[80px]">State</span>
        <Badge variant={isActive ? 'success' : 'danger'} size="sm">{state || '—'}</Badge>
      </div>
    </Section>
  );
}

function VPCEndpointPanel({ node }: { node: TopoNode }) {
  const d = node.data;
  const state = String(d['state'] ?? '');
  const isActive = state === 'available';
  return (
    <>
      <Section title="VPC Endpoint">
        <Row label="ID" value={String(d['endpointId'] ?? '')} mono />
        <Row label="Service" value={String(d['serviceName'] ?? '')} mono />
        <Row label="Type" value={String(d['type'] ?? '')} />
        <div className="flex items-start justify-between gap-2 py-1">
          <span className="text-[10px] text-text-dim shrink-0 min-w-[80px]">State</span>
          <Badge variant={isActive ? 'success' : 'danger'} size="sm">{state || '—'}</Badge>
        </div>
      </Section>
    </>
  );
}

const KIND_ICON: Record<string, React.ReactNode> = {
  instance: <Server size={12} />,
  subnet: <Network size={12} />,
  vpc: <Network size={12} />,
  igw: <Globe size={12} />,
  nat: <ArrowLeftRight size={12} />,
  sg: <Shield size={12} />,
  'peer-vpc': <GitMerge size={12} />,
  'tgw-peer': <GitMerge size={12} />,
  tgw: <Zap size={12} />,
  'vpc-endpoint': <Link size={12} />,
  'route-table': <Table size={12} />,
};

const KIND_BADGE_VARIANT: Record<string, 'info' | 'accent' | 'success' | 'warn' | 'default'> = {
  instance: 'info',
  vpc: 'accent',
  subnet: 'success',
  sg: 'warn',
  igw: 'warn',
  nat: 'info',
  'peer-vpc': 'warn',
  'tgw-peer': 'warn',
  tgw: 'accent',
  'vpc-endpoint': 'success',
  'route-table': 'default',
};

export function TopologySidePanel({ node, onClose }: TopologySidePanelProps) {
  if (!node) return null;

  return (
    <div className="flex flex-col h-full border-l border-border bg-surface w-[300px] shrink-0">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0 bg-elev/50">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={KIND_BADGE_VARIANT[node.kind] ?? 'default'} size="sm">
            <span className="flex items-center gap-1">
              {KIND_ICON[node.kind]}
              {node.kind.toUpperCase()}
            </span>
          </Badge>
          <span className="text-[11px] font-semibold text-text-pri truncate">{node.label}</span>
        </div>
        <Button
          variant="ghost"
          size="xs"
          icon={<X size={13} />}
          aria-label="Close panel"
          onClick={onClose}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {node.kind === 'instance' && <InstancePanel node={node} />}
        {node.kind === 'subnet' && <SubnetPanel node={node} />}
        {node.kind === 'vpc' && <VPCPanel node={node} />}
        {node.kind === 'igw' && <IGWPanel node={node} />}
        {node.kind === 'nat' && <NATPanel node={node} />}
        {node.kind === 'sg' && <SGPanel node={node} />}
        {(node.kind === 'peer-vpc' || node.kind === 'tgw-peer') && <PeerVPCPanel node={node} />}
        {node.kind === 'tgw' && <TGWPanel node={node} />}
        {node.kind === 'vpc-endpoint' && <VPCEndpointPanel node={node} />}
        {node.kind === 'route-table' && <RouteTablePanel node={node} />}
        {!['instance', 'subnet', 'vpc', 'igw', 'nat', 'sg', 'peer-vpc', 'tgw-peer', 'tgw', 'vpc-endpoint', 'route-table'].includes(node.kind) && (
          <Section title="Details">
            {Object.entries(node.data)
              .filter(([, v]) => v != null && v !== '')
              .map(([k, v]) => (
                <Row key={k} label={k} value={typeof v === 'object' ? JSON.stringify(v) : String(v)} />
              ))}
          </Section>
        )}
      </div>
    </div>
  );
}

TopologySidePanel.displayName = 'TopologySidePanel';
