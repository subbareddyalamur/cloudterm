import { Globe, Network, Wifi } from 'lucide-react';

interface ENI {
  eniId: string;
  subnetId: string;
  privateIp: string;
  publicIp?: string;
  macAddress: string;
  status: string;
}

interface NetworkSectionProps {
  vpcId?: string;
  subnetId?: string;
  az?: string;
  privateIp?: string;
  publicIp?: string;
  privateDns?: string;
  publicDns?: string;
  enis?: ENI[];
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1.5 text-[12px]">
      <span className="text-text-dim w-28 shrink-0">{label}</span>
      <span className="text-text-pri font-mono text-[11px] break-all">{value}</span>
    </div>
  );
}

export function NetworkSection({ vpcId, subnetId, az, privateIp, publicIp, privateDns, publicDns, enis }: NetworkSectionProps) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Network size={13} className="text-accent" />
          <span className="text-[11px] font-semibold text-text-dim uppercase tracking-wide">Network</span>
        </div>
        <div className="bg-elev rounded p-3 divide-y divide-border">
          <Row label="VPC" value={vpcId} />
          <Row label="Subnet" value={subnetId} />
          <Row label="AZ" value={az} />
          <Row label="Private IP" value={privateIp} />
          <Row label="Public IP" value={publicIp} />
          <Row label="Private DNS" value={privateDns} />
          <Row label="Public DNS" value={publicDns} />
        </div>
      </div>

      {enis && enis.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Wifi size={13} className="text-accent" />
            <span className="text-[11px] font-semibold text-text-dim uppercase tracking-wide">Network Interfaces</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border text-text-dim text-[10px] uppercase tracking-wide">
                  <th className="py-1.5 pr-3 text-left font-medium">ENI ID</th>
                  <th className="py-1.5 pr-3 text-left font-medium">Private IP</th>
                  <th className="py-1.5 pr-3 text-left font-medium">Public IP</th>
                  <th className="py-1.5 pr-3 text-left font-medium">MAC</th>
                  <th className="py-1.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {enis.map((e) => (
                  <tr key={e.eniId} className="hover:bg-elev/50">
                    <td className="py-1.5 pr-3 font-mono text-text-pri">{e.eniId}</td>
                    <td className="py-1.5 pr-3 font-mono text-text-pri">{e.privateIp}</td>
                    <td className="py-1.5 pr-3 font-mono text-text-mut">{e.publicIp ?? '—'}</td>
                    <td className="py-1.5 pr-3 font-mono text-text-dim">{e.macAddress}</td>
                    <td className="py-1.5 text-text-mut">{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-text-dim">
        <Globe size={11} />
        <span>Network data via AWS DescribeInstances</span>
      </div>
    </div>
  );
}
