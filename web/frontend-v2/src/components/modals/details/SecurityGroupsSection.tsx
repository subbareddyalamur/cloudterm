import { Shield } from 'lucide-react';

interface SGRule {
  protocol: string;
  fromPort?: number;
  toPort?: number;
  cidr?: string;
  sgId?: string;
  description?: string;
}

interface SecurityGroup {
  sgId: string;
  sgName: string;
  inbound: SGRule[];
  outbound: SGRule[];
}

interface SecurityGroupsSectionProps {
  securityGroups: SecurityGroup[];
}

function portRange(rule: SGRule): string {
  if (!rule.fromPort && !rule.toPort) return 'All';
  if (rule.fromPort === rule.toPort) return String(rule.fromPort);
  return `${rule.fromPort}–${rule.toPort}`;
}

function RuleTable({ rules, label }: { rules: SGRule[]; label: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[10px] font-semibold text-text-dim uppercase tracking-wide mb-1.5">{label}</div>
      {rules.length === 0 ? (
        <div className="text-[11px] text-text-dim px-1">No rules</div>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border text-[10px] text-text-dim">
              <th className="pb-1 pr-2 text-left font-medium">Proto:Port</th>
              <th className="pb-1 pr-2 text-left font-medium">Source/Dest</th>
              <th className="pb-1 text-left font-medium">Desc</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rules.map((r, i) => (
              <tr key={i} className="hover:bg-elev/30">
                <td className="py-1 pr-2 font-mono text-text-pri">{(r.protocol ?? "").toUpperCase()}:{portRange(r)}</td>
                <td className="py-1 pr-2 font-mono text-text-mut truncate max-w-[120px]">{r.cidr ?? r.sgId ?? '—'}</td>
                <td className="py-1 text-text-dim truncate max-w-[100px]">{r.description ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function SecurityGroupsSection({ securityGroups }: SecurityGroupsSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Shield size={13} className="text-accent" />
        <span className="text-[11px] font-semibold text-text-dim uppercase tracking-wide">Security Groups</span>
      </div>
      <div className="space-y-3">
        {securityGroups.map((sg) => (
          <div key={sg.sgId} className="bg-elev rounded p-3">
            <div className="text-[11px] font-medium text-text-pri mb-2">
              {sg.sgName} <span className="font-mono text-text-dim ml-1">{sg.sgId}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <RuleTable rules={sg.inbound} label="Inbound" />
              <RuleTable rules={sg.outbound} label="Outbound" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
