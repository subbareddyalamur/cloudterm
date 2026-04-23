import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { Badge } from '@/components/primitives';

interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
}

interface ActiveAlertsProps {
  alerts: Alert[];
}

const severityIcon = {
  critical: <AlertCircle size={13} className="text-danger" />,
  warning: <AlertTriangle size={13} className="text-warn" />,
  info: <Info size={13} className="text-info" />,
};

const severityVariant: Record<Alert['severity'], 'danger' | 'warn' | 'info'> = {
  critical: 'danger',
  warning: 'warn',
  info: 'info',
};

const DEMO_ALERTS: Alert[] = [
  { id: 'a1', severity: 'critical', title: 'High CPU on prod-web-01', detail: 'CPU > 95% for 10 min' },
  { id: 'a2', severity: 'warning', title: 'Disk space low on db-primary', detail: '87% used' },
  { id: 'a3', severity: 'info', title: 'Scheduled maintenance window', detail: 'Tomorrow 02:00 UTC' },
];

export function ActiveAlerts({ alerts = DEMO_ALERTS }: Partial<ActiveAlertsProps>) {
  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-[12px] font-semibold text-text-pri">Active Alerts</span>
        {alerts.length > 0 && (
          <Badge variant="danger">{alerts.length}</Badge>
        )}
      </div>
      {alerts.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-text-dim">No active alerts</div>
      ) : (
        <div className="divide-y divide-border">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-4 py-3 hover:bg-elev/50 transition-colors">
              <span className="mt-0.5 shrink-0">{severityIcon[a.severity]}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-text-pri truncate">{a.title}</div>
                <div className="text-[11px] text-text-dim">{a.detail}</div>
              </div>
              <Badge variant={severityVariant[a.severity]}>{a.severity}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
