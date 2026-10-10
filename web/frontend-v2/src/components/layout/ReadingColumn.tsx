import { useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useLayoutStore } from '@/stores/layout';
import { useAIStore } from '@/stores/ai';
import { useInstancesStore } from '@/stores/instances';
import { useSessionsStore } from '@/stores/sessions';
import { AIChatPanel } from '@/components/ai/AIChatPanel';

interface SGRule {
  protocol: string;
  from_port: number;
  to_port: number;
  source: string;
}

interface SecurityGroupDetail {
  group_id: string;
  group_name: string;
  inbound_rules: SGRule[];
  outbound_rules: SGRule[];
}

interface InstanceDetails {
  instance_id: string;
  name: string;
  instance_type: string;
  platform: string;
  os?: string;
  state: string;
  aws_region: string;
  account_id: string;
  account_alias: string;
  availability_zone: string;
  vpc_id: string;
  subnet_id: string;
  private_ip: string;
  public_ip?: string;
  private_dns?: string;
  launch_time: string;
  key_name?: string;
  instance_profile?: string;
  ami_id?: string;
  architecture?: string;
  security_groups?: string[];
  security_group_details?: SecurityGroupDetail[];
  tags: Record<string, string>;
  block_devices?: Array<{ device_name: string; volume_id: string; volume_size: number; volume_type: string; encrypted: boolean }>;
  network_interfaces?: Array<{ interface_id: string; subnet_id: string; private_ip: string; status: string }>;
}

interface Metrics {
  cpuPercent: number;
  memPercent: number;
  diskPercent: number;
}

const SECTIONS = ['Instance', 'Network', 'Interfaces', 'Storage', 'Security groups', 'Tags', 'Metrics'] as const;
type Section = (typeof SECTIONS)[number];

function ruleLabel(r: SGRule): string {
  if (r.protocol === '-1') return 'All traffic';
  const proto = r.protocol || 'tcp';
  if (!r.to_port || r.from_port === r.to_port) return `${r.from_port}/${proto}`;
  return `${r.from_port}-${r.to_port}/${proto}`;
}

function Field({ k, v }: { k: string; v?: string | number | null }) {
  if (v === undefined || v === null || v === '') return null;
  return (
    <div className="flex gap-3 py-[3px] text-[12px]">
      <dt className="w-24 shrink-0 text-text-dim">{k}</dt>
      <dd className="font-mono text-[11px] text-text-pri break-all">
        <button
          type="button"
          className="text-left hover:text-accent"
          title="Copy"
          onClick={() => void navigator.clipboard?.writeText(String(v))}
        >
          {String(v)}
        </button>
      </dd>
    </div>
  );
}

function SectionBody({ section, d, metrics }: { section: Section; d: InstanceDetails; metrics: Metrics | null | 'error' }) {
  switch (section) {
    case 'Instance':
      return (
        <dl>
          <Field k="Name" v={d.name} />
          <Field k="Id" v={d.instance_id} />
          <Field k="Type" v={d.instance_type} />
          <Field k="State" v={d.state} />
          <Field k="OS" v={d.os ?? d.platform} />
          <Field k="Architecture" v={d.architecture} />
          <Field k="AMI" v={d.ami_id} />
          <Field k="IAM profile" v={d.instance_profile} />
          <Field k="Key pair" v={d.key_name} />
          <Field k="Launched" v={d.launch_time ? new Date(d.launch_time).toLocaleString() : undefined} />
          <Field k="Account" v={`${d.account_alias} · ${d.account_id}`} />
        </dl>
      );
    case 'Network':
      return (
        <dl>
          <Field k="Private IP" v={d.private_ip} />
          <Field k="Public IP" v={d.public_ip} />
          <Field k="Private DNS" v={d.private_dns} />
          <Field k="Subnet" v={d.subnet_id} />
          <Field k="VPC" v={d.vpc_id} />
          <Field k="AZ" v={d.availability_zone} />
          <Field k="Region" v={d.aws_region} />
        </dl>
      );
    case 'Interfaces':
      return d.network_interfaces?.length ? (
        <ul className="space-y-2">
          {d.network_interfaces.map((n) => (
            <li key={n.interface_id} className="text-[11px] font-mono">
              <div className="text-text-pri">{n.interface_id}</div>
              <div className="text-text-mut">{n.private_ip} · {n.subnet_id} · {n.status}</div>
            </li>
          ))}
        </ul>
      ) : <Empty>No interfaces reported.</Empty>;
    case 'Storage':
      return d.block_devices?.length ? (
        <ul className="space-y-2">
          {d.block_devices.map((v) => (
            <li key={v.volume_id} className="text-[11px] font-mono">
              <div className="text-text-pri">{v.device_name} · {v.volume_size} GiB {v.volume_type}</div>
              <div className="text-text-mut">{v.volume_id} · {v.encrypted ? 'encrypted' : 'not encrypted'}</div>
            </li>
          ))}
        </ul>
      ) : <Empty>No volumes reported.</Empty>;
    case 'Security groups':
      if (d.security_group_details?.length) {
        return (
          <div className="space-y-3">
            {d.security_group_details.map((sg) => (
              <div key={sg.group_id} className="text-[11px]">
                <div className="font-mono text-text-pri">{sg.group_id}</div>
                <div className="text-text-mut mb-1">{sg.group_name}</div>
                <div className="text-text-dim">Inbound</div>
                {sg.inbound_rules.length === 0 ? <div className="text-text-mut">None</div> : sg.inbound_rules.map((r, i) => (
                  <div key={`in-${i}`} className="flex justify-between gap-2 font-mono">
                    <span className="text-text-pri">{ruleLabel(r)}</span>
                    <span className="text-text-mut truncate">{r.source}</span>
                  </div>
                ))}
                <div className="text-text-dim mt-1">Outbound</div>
                {sg.outbound_rules.length === 0 ? <div className="text-text-mut">None</div> : sg.outbound_rules.map((r, i) => (
                  <div key={`out-${i}`} className="flex justify-between gap-2 font-mono">
                    <span className="text-text-pri">{ruleLabel(r)}</span>
                    <span className="text-text-mut truncate">{r.source}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      }
      return d.security_groups?.length
        ? <div className="font-mono text-[11px] text-text-pri space-y-1">{d.security_groups.map((g) => <div key={g}>{g}</div>)}</div>
        : <Empty>No security groups reported.</Empty>;
    case 'Tags': {
      const tags = Object.entries(d.tags ?? {}).sort(([a], [b]) => a.localeCompare(b));
      return tags.length ? <dl>{tags.map(([k, v]) => <Field key={k} k={k} v={v} />)}</dl> : <Empty>No tags.</Empty>;
    }
    case 'Metrics':
      if (metrics === 'error') return <Empty>CloudWatch metrics are not available for this instance.</Empty>;
      if (!metrics) return <Empty>Loading metrics…</Empty>;
      return (
        <div className="space-y-2">
          {([['CPU', metrics.cpuPercent], ['Memory', metrics.memPercent], ['Disk', metrics.diskPercent]] as const).map(([k, v]) => (
            <div key={k}>
              <div className="flex justify-between text-[11px]">
                <span className="text-text-mut">{k}</span>
                <span className="font-mono text-text-pri">{v}%</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden bg-border mt-1">
                <div className="h-full" style={{ width: `${Math.min(v, 100)}%`, background: v < 70 ? 'var(--success)' : v < 90 ? 'var(--warn)' : 'var(--danger)' }} />
              </div>
            </div>
          ))}
        </div>
      );
  }
}

function Empty({ children }: { children: string }) {
  return <p className="text-[12px] text-text-mut">{children}</p>;
}

function DetailsPane({ instanceId }: { instanceId: string }) {
  const closeDetails = useLayoutStore((s) => s.closeDetails);
  const fallbackName = useInstancesStore((s) => {
    for (const a of s.accounts) for (const r of a.regions) for (const g of r.groups) {
      const hit = g.instances.find((i) => i.instance_id === instanceId);
      if (hit) return hit.name;
    }
    return instanceId;
  });
  const [details, setDetails] = useState<InstanceDetails | null>(null);
  const [failed, setFailed] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null | 'error'>(null);
  const [open, setOpen] = useState<Section>('Network');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let stop = false;
    setDetails(null);
    setFailed(false);
    setMetrics(null);
    void api.get<InstanceDetails>(`/instance-details?id=${encodeURIComponent(instanceId)}`).then((r) => {
      if (stop) return;
      if (r.ok) setDetails(r.data);
      else setFailed(true);
    });
    void api.get<Metrics>(`/instance-metrics?instance_id=${encodeURIComponent(instanceId)}`).then((r) => {
      if (!stop) setMetrics(r.ok ? r.data : 'error');
    });
    return () => { stop = true; };
  }, [instanceId, reload]);

  return (
    <aside className="w-[300px] shrink-0 border-l border-border bg-surface flex flex-col min-h-0" aria-label="Instance details">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-border shrink-0">
        <span className="text-[10px] tracking-wider uppercase text-text-dim">Details</span>
        <span className="text-[12px] text-text-pri truncate flex-1">{details?.name ?? fallbackName}</span>
        <button type="button" onClick={() => setReload((n) => n + 1)} className="text-text-dim hover:text-text-pri" aria-label="Reload details">
          <RefreshCw size={12} />
        </button>
        <button type="button" onClick={closeDetails} className="text-text-dim hover:text-text-pri" aria-label="Close details">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!details && !failed && <p className="px-3 py-4 text-[12px] text-text-mut">Reading {fallbackName} from AWS…</p>}
        {failed && <p className="px-3 py-4 text-[12px] text-danger">AWS did not return details for this instance.</p>}
        {details && SECTIONS.map((section) => {
          const isOpen = open === section;
          return (
            <div key={section} className="border-b border-border-2">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(section)}
                className={`w-full flex items-center px-3 h-8 text-left text-[10px] tracking-wider uppercase ${isOpen ? 'text-text-pri' : 'text-text-dim hover:text-text-mut'}`}
              >
                {section}
              </button>
              {isOpen && <div className="px-3 pb-3"><SectionBody section={section} d={details} metrics={metrics} /></div>}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/**
 * The reading column beside the work column. It shows either instance details
 * or the AI assistant, never on top of the terminal.
 */
export function ReadingColumn() {
  const detailsInstanceId = useLayoutStore((s) => s.detailsInstanceId);
  const closeDetails = useLayoutStore((s) => s.closeDetails);
  const showDetails = useLayoutStore((s) => s.showDetails);
  const aiOpen = useAIStore((s) => s.open);
  const activeInstanceId = useSessionsStore((s) => s.sessions.find((x) => x.id === s.activeId)?.instanceId);

  useEffect(() => {
    if (aiOpen) closeDetails();
  }, [aiOpen, closeDetails]);

  useEffect(() => {
    const current = useLayoutStore.getState().detailsInstanceId;
    if (current && activeInstanceId && current !== activeInstanceId) showDetails(activeInstanceId);
  }, [activeInstanceId, showDetails]);

  if (aiOpen) return <AIChatPanel />;
  if (detailsInstanceId) return <DetailsPane key={detailsInstanceId} instanceId={detailsInstanceId} />;
  return null;
}
