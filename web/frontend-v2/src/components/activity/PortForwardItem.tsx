import { useState, useEffect, useMemo } from 'react';
import { Link2, ExternalLink, X } from 'lucide-react';
import { type PortForwardActivity, useActivityStore } from '@/stores/activity';

export interface PortForwardItemProps {
  activity: PortForwardActivity;
}

const WEB_PORTS = new Set([80, 443, 3000, 5000, 8000, 8080, 8443]);

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function PortForwardItem({ activity }: PortForwardItemProps) {
  const cancel = useActivityStore((s) => s.cancel);
  const [elapsed, setElapsed] = useState(
    Math.floor((Date.now() - activity.startedAt) / 1000),
  );

  useEffect(() => {
    if (activity.status !== 'running') return;
    const intervalId = setInterval(() => {
      setElapsed(Math.floor((Date.now() - activity.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [activity.startedAt, activity.status]);

  const isWebBrowsable = useMemo(
    () => WEB_PORTS.has(activity.localPort) || activity.webBrowsable,
    [activity.localPort, activity.webBrowsable],
  );

  const isRunning = activity.status === 'running';

  return (
    <div className="px-3 py-2.5 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link2 size={13} className="text-accent shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-text-pri truncate">
              {activity.instanceName}:{activity.remotePort} → :{activity.localPort}
            </p>
            <p className="text-[11px] text-text-dim">
              {activity.protocol} · {formatElapsed(elapsed)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isWebBrowsable && isRunning && (
            <a
              href={`http://localhost:${activity.localPort}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-dim hover:text-accent transition-colors p-0.5 rounded"
              aria-label={`Open localhost:${activity.localPort} in browser`}
            >
              <ExternalLink size={12} />
            </a>
          )}
          {isRunning && (
            <button
              type="button"
              onClick={() => cancel(activity.id)}
              className="text-text-dim hover:text-danger transition-colors p-0.5 rounded"
              aria-label="Stop port forward tunnel"
            >
              <X size={12} />
            </button>
          )}
          {!isRunning && (
            <span className="text-[10px] text-text-dim capitalize">{activity.status}</span>
          )}
        </div>
      </div>
    </div>
  );
}

PortForwardItem.displayName = 'PortForwardItem';
