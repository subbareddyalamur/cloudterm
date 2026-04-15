import { useCallback, useEffect, useState } from "react";
import {
  Copy,
  CheckCheck,
  Server,
  Network,
  HardDrive,
  Shield,
  Tags,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { instanceDetails } from "@/lib/api";
import type {
  EC2Instance,
  EC2InstanceDetails,
  BlockDeviceInfo,
  NetworkIfaceInfo,
  SecurityGroupInfo,
  SGRule,
} from "@/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InstanceDetailsProps {
  instance: EC2Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateBadgeVariant(state: string) {
  if (state === "running") return "default" as const;
  if (state === "stopped") return "destructive" as const;
  return "secondary" as const;
}

function formatPort(protocol: string, from: number, to: number): string {
  if (protocol === "-1") return "All traffic";
  const p =
    protocol === "6"
      ? "TCP"
      : protocol === "17"
        ? "UDP"
        : protocol === "1"
          ? "ICMP"
          : protocol.toUpperCase();
  if (from === to) return `${p}:${from}`;
  if (from === 0 && to === 65535) return `${p}:All`;
  return `${p}:${from}-${to}`;
}

/** Tiny copy-to-clipboard button. */
function CopyBtn({ value }: { value: string | undefined }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);

  if (!value) return null;
  return (
    <button
      onClick={copy}
      className="ml-1 inline-flex shrink-0 items-center text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied ? (
        <CheckCheck className="size-3" />
      ) : (
        <Copy className="size-3" />
      )}
    </button>
  );
}

/** Label-value row used across sections. */
function Row({
  label,
  value,
  copyable,
}: {
  label: string;
  value: React.ReactNode;
  copyable?: string;
}) {
  return (
    <div className="flex items-baseline gap-2 py-1 text-sm">
      <span className="shrink-0 w-36 text-muted-foreground text-xs">
        {label}
      </span>
      <span className="text-foreground break-all">
        {value ?? "—"}
        {copyable && <CopyBtn value={copyable} />}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Instance Info
// ---------------------------------------------------------------------------

function InfoSection({ d }: { d: EC2InstanceDetails }) {
  return (
    <div className="grid gap-x-6 sm:grid-cols-2">
      <Row label="Name" value={d.name} />
      <Row label="Instance ID" value={d.instance_id} copyable={d.instance_id} />
      <Row
        label="State"
        value={<Badge variant={stateBadgeVariant(d.state)}>{d.state}</Badge>}
      />
      <Row label="Instance Type" value={d.instance_type} />
      <Row label="Platform / OS" value={`${d.platform} / ${d.os}`} />
      <Row label="Architecture" value={d.architecture} />
      <Row label="AMI ID" value={d.ami_id} copyable={d.ami_id} />
      <Row label="Key Pair" value={d.key_name} />
      <Row label="IAM Profile" value={d.instance_profile} />
      <Row label="Launch Time" value={d.launch_time} />
      <Row label="Virtualization" value={d.virtualization_type} />
      <Row label="Hypervisor" value={d.hypervisor} />
      <Row label="EBS Optimized" value={d.ebs_optimized ? "Yes" : "No"} />
      <Row label="ENA Support" value={d.ena_support ? "Yes" : "No"} />
      <Row label="Monitoring" value={d.monitoring} />
      <Row
        label="Source/Dest Check"
        value={d.source_dest_check ? "Yes" : "No"}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Network
// ---------------------------------------------------------------------------

function NetworkSection({ d }: { d: EC2InstanceDetails }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-x-6 sm:grid-cols-2">
        <Row label="VPC ID" value={d.vpc_id} copyable={d.vpc_id} />
        <Row label="Subnet ID" value={d.subnet_id} copyable={d.subnet_id} />
        <Row label="Availability Zone" value={d.availability_zone} />
        <Row label="Tenancy" value={d.tenancy} />
        <Row label="Private IP" value={d.private_ip} copyable={d.private_ip} />
        <Row label="Public IP" value={d.public_ip} copyable={d.public_ip} />
        <Row label="Private DNS" value={d.private_dns} copyable={d.private_dns} />
        <Row label="Public DNS" value={d.public_dns} copyable={d.public_dns} />
        <Row label="Account ID" value={d.account_id} copyable={d.account_id} />
        <Row label="Region" value={d.aws_region} />
      </div>

      {d.network_interfaces && d.network_interfaces.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Network Interfaces
          </h4>
          <div className="space-y-3">
            {d.network_interfaces.map((ni: NetworkIfaceInfo) => (
              <div
                key={ni.interface_id}
                className="rounded-md border p-3 grid gap-x-6 sm:grid-cols-2 text-sm"
              >
                <Row label="ENI ID" value={ni.interface_id} copyable={ni.interface_id} />
                <Row label="Subnet" value={ni.subnet_id} copyable={ni.subnet_id} />
                <Row label="Private IP" value={ni.private_ip} copyable={ni.private_ip} />
                <Row label="Public IP" value={ni.public_ip} copyable={ni.public_ip} />
                <Row label="MAC" value={ni.mac_address} />
                <Row label="Status" value={ni.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Storage
// ---------------------------------------------------------------------------

function StorageSection({ devices }: { devices: BlockDeviceInfo[] }) {
  if (!devices.length) {
    return <p className="text-sm text-muted-foreground">No block devices.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
            <th className="py-2 pr-3">Device</th>
            <th className="py-2 pr-3">Volume ID</th>
            <th className="py-2 pr-3">Size</th>
            <th className="py-2 pr-3">Type</th>
            <th className="py-2 pr-3">IOPS</th>
            <th className="py-2 pr-3">Encrypted</th>
            <th className="py-2">Delete on Term.</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((vol) => (
            <tr key={vol.volume_id} className="border-b last:border-0">
              <td className="py-2 pr-3">{vol.device_name}</td>
              <td className="py-2 pr-3">
                <span className="inline-flex items-center gap-1">
                  {vol.volume_id}
                  <CopyBtn value={vol.volume_id} />
                </span>
              </td>
              <td className="py-2 pr-3">{vol.volume_size} GB</td>
              <td className="py-2 pr-3">{vol.volume_type}</td>
              <td className="py-2 pr-3">{vol.iops ?? "—"}</td>
              <td className="py-2 pr-3">{vol.encrypted ? "Yes" : "No"}</td>
              <td className="py-2">{vol.delete_on_termination ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Security Groups
// ---------------------------------------------------------------------------

function RulesTable({ rules, label }: { rules: SGRule[]; label: string }) {
  return (
    <div className="flex-1 min-w-0">
      <h5 className="text-xs font-semibold text-muted-foreground mb-1">
        {label}
      </h5>
      {rules.length === 0 ? (
        <p className="text-xs text-muted-foreground">None</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground uppercase tracking-wide">
              <th className="py-1 pr-2">Port/Protocol</th>
              <th className="py-1 pr-2">Source</th>
              <th className="py-1">Description</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-1 pr-2 whitespace-nowrap">
                  {formatPort(r.protocol, r.from_port, r.to_port)}
                </td>
                <td className="py-1 pr-2 break-all">{r.source}</td>
                <td className="py-1 text-muted-foreground">{r.description || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SecurityGroupsSection({ groups }: { groups: SecurityGroupInfo[] }) {
  if (!groups.length) {
    return <p className="text-sm text-muted-foreground">No security groups.</p>;
  }
  return (
    <div className="space-y-4">
      {groups.map((sg) => (
        <div key={sg.group_id} className="rounded-md border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{sg.group_name}</span>
            <span className="text-xs text-muted-foreground">
              {sg.group_id}
              <CopyBtn value={sg.group_id} />
            </span>
          </div>
          {sg.description && (
            <p className="text-xs text-muted-foreground">{sg.description}</p>
          )}
          <div className="flex gap-4 flex-col sm:flex-row">
            <RulesTable rules={sg.inbound_rules ?? []} label="Inbound Rules" />
            <RulesTable rules={sg.outbound_rules ?? []} label="Outbound Rules" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Tags
// ---------------------------------------------------------------------------

function TagsSection({ tags }: { tags: Record<string, string> }) {
  const entries = Object.entries(tags).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) {
    return <p className="text-sm text-muted-foreground">No tags.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
          <th className="py-2 pr-3">Key</th>
          <th className="py-2">Value</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="border-b last:border-0">
            <td className="py-1.5 pr-3 font-medium">{k}</td>
            <td className="py-1.5 break-all">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      <span className="text-sm">Loading instance details…</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function InstanceDetails({
  instance,
  open,
  onOpenChange,
}: InstanceDetailsProps) {
  const [details, setDetails] = useState<EC2InstanceDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !instance) {
      setDetails(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    instanceDetails(instance.instance_id)
      .then(setDetails)
      .catch((err) => setError(err.message ?? "Failed to load details"))
      .finally(() => setLoading(false));
  }, [open, instance]);

  const d = details;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Server className="size-5" />
            {instance?.name || instance?.instance_id || "Instance Details"}
            {d && (
              <Badge variant={stateBadgeVariant(d.state)} className="ml-2">
                {d.state}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && <Skeleton />}

        {error && !d && (
          <div className="px-6 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        )}

        {d && (
          <Tabs defaultValue="info" className="flex-1 min-h-0 px-6 pb-6">
            <TabsList>
              <TabsTrigger value="info" className="gap-1">
                <Server className="size-3.5" /> Info
              </TabsTrigger>
              <TabsTrigger value="network" className="gap-1">
                <Network className="size-3.5" /> Network
              </TabsTrigger>
              <TabsTrigger value="storage" className="gap-1">
                <HardDrive className="size-3.5" /> Storage
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-1">
                <Shield className="size-3.5" /> Security
              </TabsTrigger>
              <TabsTrigger value="tags" className="gap-1">
                <Tags className="size-3.5" /> Tags
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="mt-3 max-h-[60vh]">
              <TabsContent value="info">
                <InfoSection d={d} />
              </TabsContent>

              <TabsContent value="network">
                <NetworkSection d={d} />
              </TabsContent>

              <TabsContent value="storage">
                <StorageSection devices={d.block_devices ?? []} />
              </TabsContent>

              <TabsContent value="security">
                <SecurityGroupsSection
                  groups={d.security_group_details ?? []}
                />
              </TabsContent>

              <TabsContent value="tags">
                <TagsSection tags={d.tags ?? {}} />
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
