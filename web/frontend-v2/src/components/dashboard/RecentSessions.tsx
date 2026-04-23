import { Clock, Terminal, Monitor } from 'lucide-react';
import { useSessionsStore } from '@/stores/sessions';
import { Badge } from '@/components/primitives';

export function RecentSessions() {
  const sessions = useSessionsStore((s) => s.sessions).slice(0, 10);

  if (sessions.length === 0) {
    return (
      <div className="bg-surface rounded-lg border border-border">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <Clock size={13} className="text-text-dim" />
          <span className="text-[12px] font-semibold text-text-pri">Recent Sessions</span>
        </div>
        <div className="px-4 py-6 text-center text-[12px] text-text-dim">
          No recent sessions
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <Clock size={13} className="text-text-dim" />
        <span className="text-[12px] font-semibold text-text-pri">Recent Sessions</span>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-border text-text-dim text-[10px] uppercase tracking-wide">
            <th className="px-4 py-2 text-left font-medium">Instance</th>
            <th className="px-4 py-2 text-left font-medium">Type</th>
            <th className="px-4 py-2 text-left font-medium">Status</th>
            <th className="px-4 py-2 text-left font-medium">Started</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sessions.map((s) => (
            <tr key={s.id} className="hover:bg-elev/50 transition-colors">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  {s.type === 'ssh' ? (
                    <Terminal size={12} className="text-success shrink-0" />
                  ) : (
                    <Monitor size={12} className="text-info shrink-0" />
                  )}
                  <span className="text-text-pri truncate max-w-[180px]">{s.instanceName}</span>
                </div>
              </td>
              <td className="px-4 py-2.5">
                <Badge variant={s.type === 'ssh' ? 'success' : 'info'}>{(s.type ?? "ssh").toUpperCase()}</Badge>
              </td>
              <td className="px-4 py-2.5">
                <Badge variant={s.status === 'connected' ? 'success' : s.status === 'error' ? 'danger' : 'default'}>
                  {s.status}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-text-dim">
                {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
