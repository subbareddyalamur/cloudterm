import { useState, useCallback, useEffect, useMemo } from 'react';
import { ExternalLink, StopCircle } from 'lucide-react';
import { Dialog } from '@/components/primitives/Dialog';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Select } from '@/components/primitives/Select';
import { apiGet, apiPost } from '@/lib/api';
import { useToastStore } from '@/stores/toast';

export interface PortForwardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultInstanceId?: string;
  defaultInstanceName?: string;
}

const PROTOCOLS = ['TCP', 'UDP', 'HTTP', 'HTTPS', 'RDP', 'SSH'] as const;
type Protocol = (typeof PROTOCOLS)[number];

interface StartTunnelResponse {
  status: string;
  instance_id: string;
  port: number;
  remote_port: number;
  instance_name: string;
}

interface ActiveTunnel {
  instance_id: string;
  instance_name: string;
  local_port: number;
  remote_port: number;
  aws_profile: string;
  aws_region: string;
  started_at: string;
}

const WEB_PORTS = new Set([80, 443, 3000, 5000, 8000, 8080, 8443]);

const HTTPS_PORTS = new Set([443, 8443]);

function buildTunnelUrl(localPort: number, remotePort: number, proto: string): { href: string; label: string } | null {
  const upperProto = proto.toUpperCase();
  if (upperProto === 'HTTPS' || HTTPS_PORTS.has(remotePort)) {
    return { href: `https://localhost:${localPort}`, label: `https://localhost:${localPort}` };
  }
  if (upperProto === 'HTTP' || WEB_PORTS.has(remotePort)) {
    return { href: `http://localhost:${localPort}`, label: `http://localhost:${localPort}` };
  }
  if (upperProto === 'RDP' || remotePort === 3389) {
    return { href: `rdp://localhost:${localPort}`, label: `rdp://localhost:${localPort}` };
  }
  return null;
}

function tunnelKey(t: ActiveTunnel) {
  return `${t.instance_id}:${t.remote_port}`;
}

export function PortForwardModal({
  open,
  onOpenChange,
  defaultInstanceId = '',
  defaultInstanceName = '',
}: PortForwardModalProps) {
  const [remotePort, setRemotePort] = useState('');
  const [protocol, setProtocol] = useState<Protocol>('TCP');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tunnels, setTunnels] = useState<ActiveTunnel[]>([]);
  const [stoppingKey, setStoppingKey] = useState<string | null>(null);
  const pushToast = useToastStore((s) => s.push);

  const fetchTunnels = useCallback(async () => {
    const res = await apiGet<ActiveTunnel[]>('/active-tunnels');
    if (res.ok) setTunnels(res.value);
  }, []);

  useEffect(() => {
    if (open) void fetchTunnels();
  }, [open, fetchTunnels]);

  const instanceTunnels = useMemo(
    () =>
      defaultInstanceId
        ? tunnels.filter((t) => t.instance_id === defaultInstanceId)
        : tunnels,
    [tunnels, defaultInstanceId],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const remote = parseInt(remotePort, 10);

      if (!defaultInstanceId) { setError('Instance is required'); return; }
      if (!remote || remote < 1 || remote > 65535) { setError('Invalid remote port (1–65535)'); return; }

      setError('');
      setLoading(true);
      try {
        const result = await apiPost<StartTunnelResponse, Record<string, unknown>>(
          '/start-port-forward',
          { instance_id: defaultInstanceId, instance_name: defaultInstanceName, port_number: remote },
        );
        if (!result.ok) {
          setError('Failed to start tunnel — check server logs');
          return;
        }
        const allocatedPort = result.value.port;
        const tunnelLink = buildTunnelUrl(allocatedPort, remote, protocol);
        pushToast({
          variant: 'info',
          title: 'Tunnel active',
          description: `localhost:${allocatedPort} → :${remote} on ${defaultInstanceName}`,
          duration: null,
          ...(tunnelLink ? { link: { label: tunnelLink.label, href: tunnelLink.href } } : {}),
          action: {
            label: 'Stop tunnel',
            onClick: () => {
              void apiPost('/stop-port-forward', { instance_id: defaultInstanceId, port_number: remote });
            },
          },
          onDismiss: () => {
            void apiPost('/stop-port-forward', { instance_id: defaultInstanceId, port_number: remote });
          },
        });
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    },
    [defaultInstanceId, defaultInstanceName, remotePort, protocol, pushToast, onOpenChange],
  );

  const handleStop = useCallback(
    async (tunnel: ActiveTunnel) => {
      const key = tunnelKey(tunnel);
      setStoppingKey(key);
      const result = await apiPost(`/stop-port-forward`, {
        instance_id: tunnel.instance_id,
        port_number: tunnel.remote_port,
      });
      if (result.ok) {
        pushToast({ variant: 'success', title: 'Tunnel stopped', description: `localhost:${tunnel.local_port} → :${tunnel.remote_port} on ${tunnel.instance_name}` });
        await fetchTunnels();
      } else {
        pushToast({ variant: 'danger', title: 'Failed to stop tunnel' });
      }
      setStoppingKey(null);
    },
    [pushToast, fetchTunnels],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Port Forwarding"
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={loading}
            onClick={(e) => { e.preventDefault(); void handleSubmit(e); }}
          >
            Start tunnel
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        {defaultInstanceName && (
          <div>
            <label className="text-[11px] font-medium text-text-mut block mb-1">Instance</label>
            <p className="text-[13px] text-text-pri">{defaultInstanceName}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="pf-remote-port" className="text-[11px] font-medium text-text-mut block mb-1">
              Remote port
            </label>
            <Input
              id="pf-remote-port"
              type="number"
              placeholder="5432"
              value={remotePort}
              onChange={(e) => setRemotePort(e.target.value)}
              min={1}
              max={65535}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="pf-protocol" className="text-[11px] font-medium text-text-mut block mb-1">
              Protocol
            </label>
            <Select
              id="pf-protocol"
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as Protocol)}
            >
              {PROTOCOLS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </div>
        </div>

        <p className="text-[11px] text-text-dim">
          A local port will be automatically assigned in the 33890–33999 range.
        </p>

        {error && <p className="text-[11px] text-danger">{error}</p>}
      </form>

      {instanceTunnels.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-[11px] font-semibold text-text-dim uppercase tracking-wide">
            Active tunnels
          </h3>
          <div className="border border-border rounded divide-y divide-border">
            {instanceTunnels.map((tunnel) => (
              <TunnelRow
                key={tunnelKey(tunnel)}
                tunnel={tunnel}
                stopping={stoppingKey === tunnelKey(tunnel)}
                onStop={() => void handleStop(tunnel)}
              />
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}

interface TunnelRowProps {
  tunnel: ActiveTunnel;
  stopping: boolean;
  onStop: () => void;
}

function TunnelRow({ tunnel, stopping, onStop }: TunnelRowProps) {
  const link = buildTunnelUrl(tunnel.local_port, tunnel.remote_port, 'TCP');
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex-1 min-w-0">
        <span className="text-[13px] text-text-pri font-mono">
          localhost:{tunnel.local_port} → :{tunnel.remote_port}
        </span>
        <p className="text-[11px] text-text-dim truncate">{tunnel.instance_name}</p>
        {link && (
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-accent hover:underline"
          >
            <ExternalLink size={9} />
            {link.label}
          </a>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {link && (
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:opacity-80 transition-opacity p-0.5"
            title="Open in browser"
            aria-label="Open in browser"
          >
            <ExternalLink size={13} />
          </a>
        )}
        <button
          type="button"
          className="text-text-dim hover:text-danger transition-colors p-0.5 disabled:opacity-50"
          disabled={stopping}
          onClick={onStop}
          title="Stop tunnel"
          aria-label="Stop tunnel"
        >
          <StopCircle size={13} />
        </button>
      </div>
    </div>
  );
}

PortForwardModal.displayName = 'PortForwardModal';
