import { useEffect, useState } from 'react';
import { Server, Loader2, X, Terminal, RefreshCw } from 'lucide-react';
import { Badge, Button } from '@/components/primitives';
import { api } from '@/lib/api';


interface SGRule {
  protocol: string;
  from_port: number;
  to_port: number;
  source: string;
  description?: string;
}

interface SecurityGroupDetail {
  group_id: string;
  group_name: string;
  description: string;
  inbound_rules: SGRule[];
  outbound_rules: SGRule[];
}

interface BlockDevice {
  device_name: string;
  volume_id: string;
  volume_size: number;
  volume_type: string;
  iops?: number;
  encrypted: boolean;
  kms_key_id?: string;
  delete_on_termination?: boolean;
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
  public_dns?: string;
  launch_time: string;
  key_name?: string;
  instance_profile?: string;
  tenancy?: string;
  ami_id?: string;
  architecture?: string;
  ebs_optimized?: boolean;
  monitoring?: string;
  security_groups?: string[];
  security_group_details?: SecurityGroupDetail[];
  tags: Record<string, string>;
  block_devices?: BlockDevice[];
  network_interfaces?: Array<{
    interface_id: string;
    subnet_id: string;
    private_ip: string;
    mac_address: string;
    status: string;
  }>;
}

interface MetricsData {
  cpuPercent: number;
  memPercent: number;
  diskPercent: number;
}

export interface InstanceDetailsPanelProps {
  instanceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}


function launchDaysAgo(launchTime: string): string {
  const d = new Date(launchTime);
  if (isNaN(d.getTime())) return launchTime;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return `${d.toISOString().replace('T', ' ').slice(0, 19)} UTC (${days} days)`;
}

function formatPortDisplay(rule: SGRule): string {
  if (rule.protocol === '-1') return 'All traffic';
  const proto = rule.protocol || 'tcp';
  if (!rule.to_port || rule.from_port === rule.to_port) return `${rule.from_port}/${proto}`;
  return `${rule.from_port}-${rule.to_port}/${proto}`;
}

function gaugeColor(pct: number): string {
  if (pct < 70) return 'var(--success)';
  if (pct < 90) return 'var(--warn)';
  return 'var(--danger)';
}


function KVRow({
  label,
  value,
  mono = false,
  accent = false,
}: {
  label: string;
  value?: string | boolean | number | null;
  mono?: boolean;
  accent?: boolean;
}) {
  if (value === undefined || value === null || value === '') return null;
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return (
    <>
      <span className="text-[12px] text-text-mut font-medium self-start leading-relaxed">{label}</span>
      <span
        className={[
          'text-[12px] font-medium break-all leading-relaxed',
          mono ? 'font-mono' : '',
          accent ? 'text-accent' : 'text-text-pri',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {display}
      </span>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-2)' }}>
      <h3 className="text-[12px] uppercase font-bold tracking-[0.07em] text-text-mut mb-2.5">{title}</h3>
      {children}
    </div>
  );
}

function GaugeBar({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  const color = gaugeColor(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-[12px]">
        <span className="text-text-mut">{label}</span>
        {loading ? (
          <span className="text-text-dim">—</span>
        ) : (
          <span className="font-semibold" style={{ color }}>
            {value}%
          </span>
        )}
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: loading ? '0%' : `${Math.min(value, 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}


export function InstanceDetailsModal({ instanceId, open, onOpenChange }: InstanceDetailsPanelProps) {
  const [details, setDetails] = useState<InstanceDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsFailed, setMetricsFailed] = useState(false);

  const fetchMetrics = (id: string) => {
    setMetricsLoading(true);
    setMetricsFailed(false);
    api
      .get<MetricsData>(`/instance-metrics?instance_id=${id}`)
      .then((r) => {
        if (r.ok) {
          setMetrics(r.data);
        } else {
          setMetricsFailed(true);
        }
        setMetricsLoading(false);
      })
      .catch(() => {
        setMetricsFailed(true);
        setMetricsLoading(false);
      });
  };

  const fetchDetails = () => {
    if (!instanceId) return;
    setLoading(true);
    setDetails(null);
    setMetrics(null);
    setMetricsFailed(false);
    api
      .get<InstanceDetails>(`/instance-details?id=${instanceId}`)
      .then((r) => {
        if (r.ok) {
          setDetails(r.data);
          fetchMetrics(instanceId);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (open && instanceId) fetchDetails();
  }, [open, instanceId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const d = details;

  return (
    <div className="fixed inset-0 z-[150] flex">
      <div className="flex-1" onClick={() => onOpenChange(false)} />

      <div className="w-[620px] h-full bg-surface border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">

        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          {d ? (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Server size={15} className="text-accent shrink-0" />
                <span className="text-[15px] font-bold tracking-tight text-text-pri truncate">{d.name}</span>
                <Badge variant={d.state === 'running' ? 'success' : 'danger'} size="sm">
                  {d.state}
                </Badge>
              </div>
              <div className="text-[12px] text-text-mut mt-0.5">
                {d.instance_id} · {d.instance_type} · {d.account_alias}
              </div>
            </div>
          ) : (
            <span className="text-[14px] text-text-pri font-bold">Instance Details</span>
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-text-mut hover:text-text-pri shrink-0 ml-3 flex items-center justify-center w-7 h-7 rounded hover:bg-elev transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-accent" />
            </div>
          )}

          {!loading && !d && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-text-dim">
              <Server size={32} />
              <span className="text-[13px]">Could not load instance details</span>
            </div>
          )}

          {!loading && d && (
            <>
              <Section title="Instance">
                <div
                  className="grid gap-y-1.5 gap-x-3"
                  style={{ gridTemplateColumns: '120px 1fr' }}
                >
                  <KVRow label="Instance ID" value={d.instance_id} mono />
                  <KVRow label="Name" value={d.name} />
                  <KVRow label="Instance Type" value={d.instance_type} mono />
                  <KVRow label="Architecture" value={d.architecture} />
                  <KVRow label="Platform" value={d.os ?? d.platform} />
                  <KVRow label="AMI ID" value={d.ami_id} mono />
                  <KVRow label="IAM Profile" value={d.instance_profile} mono />
                  <KVRow label="Key Name" value={d.key_name} mono />
                  <KVRow label="Launch Time" value={launchDaysAgo(d.launch_time)} />
                  <KVRow label="EBS Optimized" value={d.ebs_optimized} />
                  <KVRow label="State" value={d.state} />
                </div>
              </Section>

              <Section title="Network">
                <div
                  className="grid gap-y-1.5 gap-x-3"
                  style={{ gridTemplateColumns: '120px 1fr' }}
                >
                  <KVRow label="VPC ID" value={d.vpc_id} mono accent />
                  <KVRow label="Subnet" value={d.subnet_id} mono />
                  <KVRow label="Private IP" value={d.private_ip} mono />
                  <KVRow label="Public IP" value={d.public_ip} mono />
                  <KVRow label="Private DNS" value={d.private_dns} mono />
                  <KVRow label="Public DNS" value={d.public_dns} mono />
                  <KVRow label="Availability Zone" value={d.availability_zone} />
                  <KVRow label="Tenancy" value={d.tenancy} />
                </div>
              </Section>

              {d.network_interfaces && d.network_interfaces.length > 0 && (
                <Section title="Network Interfaces">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr>
                        {['ENI ID', 'Subnet', 'IPv4', 'MAC Address', 'Status'].map((h) => (
                          <th
                            key={h}
                            className="py-1.5 pr-3 last:pr-0 text-left text-[10px] font-medium text-text-mut uppercase tracking-wide"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {d.network_interfaces.map((ni) => (
                        <tr
                          key={ni.interface_id}
                          style={{ borderTop: '1px solid var(--border-2)' }}
                        >
                          <td className="py-1.5 pr-3 font-mono text-text-pri">{ni.interface_id}</td>
                          <td className="py-1.5 pr-3 text-accent">{ni.subnet_id}</td>
                          <td className="py-1.5 pr-3 font-mono text-text-pri">{ni.private_ip}</td>
                          <td className="py-1.5 pr-3 font-mono text-text-mut">{ni.mac_address}</td>
                          <td className="py-1.5">
                            <Badge variant={ni.status === 'in-use' ? 'success' : 'default'} size="sm">
                              {ni.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>
              )}

              {d.block_devices && d.block_devices.length > 0 && (
                <Section title="Storage (EBS Volumes)">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr>
                        {['Device', 'Vol ID', 'Size', 'Type', 'IOPS', 'Encrypted'].map((h) => (
                          <th
                            key={h}
                            className="py-1.5 pr-3 last:pr-0 text-left text-[10px] font-medium text-text-mut uppercase tracking-wide"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {d.block_devices.map((vol) => (
                        <tr
                          key={vol.volume_id}
                          style={{ borderTop: '1px solid var(--border-2)' }}
                        >
                          <td className="py-1.5 pr-3 font-mono text-text-pri">{vol.device_name}</td>
                          <td className="py-1.5 pr-3 font-mono text-text-mut">{vol.volume_id}</td>
                          <td className="py-1.5 pr-3 text-text-pri">{vol.volume_size} GiB</td>
                          <td className="py-1.5 pr-3 text-text-pri">{vol.volume_type}</td>
                          <td className="py-1.5 pr-3 text-text-pri">{vol.iops ?? '—'}</td>
                          <td className="py-1.5">
                            {vol.encrypted ? (
                              <Badge variant="success" size="sm">Yes</Badge>
                            ) : (
                              <span className="text-text-dim text-[10px]">No</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>
              )}

              {d.security_group_details && d.security_group_details.length > 0 && (
                <Section title="Security Groups">
                  <div className="space-y-4">
                    {d.security_group_details.map((sg) => (
                      <div key={sg.group_id}>
                        <div className="text-[12px] font-medium text-text-pri mb-2">
                          <span className="font-mono">{sg.group_id}</span>{' '}
                          <span className="text-text-mut font-normal">({sg.group_name})</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div
                            className="border border-border overflow-hidden"
                            style={{ borderRadius: 'var(--radius-sm)' }}
                          >
                            <div
                              className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.05em] border-b border-border"
                              style={{
                                background: 'rgba(61,214,140,0.07)',
                                color: 'var(--success)',
                              }}
                            >
                              ↓ Inbound
                            </div>
                            {sg.inbound_rules.length === 0 ? (
                              <div className="px-2.5 py-2 text-[12px] text-text-dim">No rules</div>
                            ) : (
                              sg.inbound_rules.map((rule, i) => (
                                <div
                                  key={i}
                                  className="px-2.5 py-1.5 text-[12px] flex justify-between gap-2"
                                  style={
                                    i < sg.inbound_rules.length - 1
                                      ? { borderBottom: '1px solid var(--border-2)' }
                                      : undefined
                                  }
                                >
                                  <span className="text-text-pri shrink-0">{formatPortDisplay(rule)}</span>
                                  <span className="text-text-mut truncate text-right">{rule.source}</span>
                                </div>
                              ))
                            )}
                          </div>

                          <div
                            className="border border-border overflow-hidden"
                            style={{ borderRadius: 'var(--radius-sm)' }}
                          >
                            <div
                              className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.05em] border-b border-border"
                              style={{
                                background: 'rgba(248,113,113,0.07)',
                                color: 'var(--danger)',
                              }}
                            >
                              ↑ Outbound
                            </div>
                            {sg.outbound_rules.length === 0 ? (
                              <div className="px-2.5 py-2 text-[12px] text-text-dim">No rules</div>
                            ) : (
                              sg.outbound_rules.map((rule, i) => (
                                <div
                                  key={i}
                                  className="px-2.5 py-1.5 text-[12px] flex justify-between gap-2"
                                  style={
                                    i < sg.outbound_rules.length - 1
                                      ? { borderBottom: '1px solid var(--border-2)' }
                                      : undefined
                                  }
                                >
                                  <span className="text-text-pri shrink-0">{formatPortDisplay(rule)}</span>
                                  <span className="text-text-mut truncate text-right">{rule.source}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {!d.security_group_details && d.security_groups && d.security_groups.length > 0 && (
                <Section title="Security Groups">
                  <div className="flex flex-wrap gap-1.5">
                    {d.security_groups.map((sg) => (
                      <span
                        key={sg}
                        className="font-mono text-[10px] px-2 py-0.5 rounded bg-elev border border-border text-text-pri"
                      >
                        {sg}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {d.tags && Object.keys(d.tags).length > 0 && (
                <Section title="Tags">
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(d.tags)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([k, v]) => (
                        <div
                          key={k}
                          className="flex justify-between text-[12px] px-2 py-1.5"
                          style={{
                            background: 'var(--elev)',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          <span className="text-text-mut shrink-0 mr-2 truncate max-w-[45%]">{k}</span>
                          <span className="text-text-pri truncate">{v}</span>
                        </div>
                      ))}
                  </div>
                </Section>
              )}

              <Section title="Quick Metrics">
                {metricsFailed && !metricsLoading ? (
                  <div className="text-[12px] text-text-dim">Metrics unavailable</div>
                ) : (
                  <div className="space-y-2.5">
                    <GaugeBar label="CPU Usage" value={metrics?.cpuPercent ?? 0} loading={metricsLoading} />
                    <GaugeBar label="Memory Usage" value={metrics?.memPercent ?? 0} loading={metricsLoading} />
                    <GaugeBar label="Disk Usage" value={metrics?.diskPercent ?? 0} loading={metricsLoading} />
                  </div>
                )}
              </Section>
            </>
          )}
        </div>

        {d && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-border shrink-0">
            <Button
              variant="primary"
              size="sm"
              icon={<Terminal size={12} />}
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('ct:open-ssh', {
                    detail: {
                      instanceId: d.instance_id,
                      instanceName: d.name,
                      accountId: d.account_id,
                      region: d.aws_region,
                    },
                  }),
                );
                onOpenChange(false);
              }}
            >
              Open SSH
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={12} />}
              onClick={() => {
                if (instanceId) fetchMetrics(instanceId);
              }}
            >
              Refresh Metrics
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" icon={<X size={12} />} onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
