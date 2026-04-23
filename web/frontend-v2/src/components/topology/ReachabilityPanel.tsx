import { useState, useCallback, useMemo, useRef } from 'react';
import { CheckCircle2, XCircle, Info, Loader2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Select } from '@/components/primitives/Select';
import { Badge } from '@/components/primitives/Badge';
import { useInstancesStore } from '@/stores/instances';
import { useToastStore } from '@/stores/toast';
import type { EC2Instance } from '@/lib/types';
import type {
  AnalyzeRequest,
  DeepAnalysisEvent,
  DeepHop,
  DeepResult,
} from '@/lib/topology-types';

type DestMode = 'instance' | 'ip';
type Protocol = 'tcp' | 'udp' | 'icmp';

interface HopStepperProps {
  hops: DeepHop[];
}

function HopIcon({ status }: { status: string }) {
  if (status === 'allow') return <CheckCircle2 size={16} className="text-success shrink-0" />;
  if (status === 'deny') return <XCircle size={16} className="text-danger shrink-0" />;
  return <Info size={16} className="text-info shrink-0" />;
}

function HopStepper({ hops }: HopStepperProps) {
  return (
    <ol className="flex flex-col gap-0" aria-label="Analysis hops">
      {hops.map((hop, idx) => (
        <li key={idx} className="flex items-start gap-3">
          <div className="flex flex-col items-center shrink-0">
            <HopIcon status={hop.status} />
            {idx < hops.length - 1 && (
              <div className="w-px flex-1 min-h-[16px] bg-border mt-1" aria-hidden="true" />
            )}
          </div>
          <div className="pb-3 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-semibold text-text-pri">{hop.componentName || hop.component}</span>
              {hop.resourceId && (
                <span className="text-[10px] font-mono text-text-dim">{hop.resourceId}</span>
              )}
              {hop.direction && (
                <Badge variant={hop.direction === 'inbound' ? 'info' : 'default'} size="sm">
                  {hop.direction}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-text-dim mt-0.5">{hop.detail}</p>
            {hop.matchedRule && (
              <p className="text-[10px] font-mono text-accent mt-0.5">{hop.matchedRule}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

interface InstanceAutocompleteProps {
  value: string;
  onChange: (instanceId: string, label: string) => void;
  placeholder: string;
  id: string;
}

function InstanceAutocomplete({ value, onChange, placeholder, id }: InstanceAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const allInstances = useInstancesStore((s) => s.accounts);
  const inputRef = useRef<HTMLInputElement>(null);

  const instances = useMemo(() => {
    const flat: EC2Instance[] = [];
    for (const a of allInstances) {
      for (const r of a.regions) {
        for (const g of r.groups) {
          for (const i of g.instances) {
            flat.push(i);
          }
        }
      }
    }
    return flat;
  }, [allInstances]);

  const filtered = useMemo(() => {
    if (!query.trim()) return instances.slice(0, 10);
    const q = query.toLowerCase();
    return instances.filter(
      (i) => i.name.toLowerCase().includes(q) || i.instance_id.toLowerCase().includes(q),
    ).slice(0, 10);
  }, [instances, query]);

  const displayValue = useMemo(() => {
    if (!value) return '';
    const found = instances.find((i) => i.instance_id === value);
    return found ? `${found.name} (${found.instance_id})` : value;
  }, [value, instances]);

  return (
    <div className="relative">
      <Input
        id={id}
        ref={inputRef}
        value={open ? query : displayValue}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setQuery(''); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface border border-border rounded shadow-lg max-h-48 overflow-y-auto"
        >
          {filtered.map((inst) => (
            <li
              key={inst.instance_id}
              role="option"
              aria-selected={inst.instance_id === value}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-elev text-[12px]"
              onMouseDown={() => {
                onChange(inst.instance_id, `${inst.name} (${inst.instance_id})`);
                setQuery('');
                setOpen(false);
              }}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${inst.state === 'running' ? 'bg-success' : 'bg-danger'}`}
              />
              <span className="font-medium text-text-pri truncate">{inst.name}</span>
              <span className="text-text-dim font-mono ml-auto shrink-0">{inst.instance_id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface ReachabilityPanelProps {
  initialSourceId?: string;
}

export function ReachabilityPanel({ initialSourceId = '' }: ReachabilityPanelProps) {
  const push = useToastStore((s) => s.push);

  const [sourceId, setSourceId] = useState(initialSourceId);
  const [destMode, setDestMode] = useState<DestMode>('instance');
  const [destId, setDestId] = useState('');
  const [destIp, setDestIp] = useState('');
  const [protocol, setProtocol] = useState<Protocol>('tcp');
  const [port, setPort] = useState('443');
  const [analyzing, setAnalyzing] = useState(false);
  const [hops, setHops] = useState<DeepHop[]>([]);
  const [result, setResult] = useState<DeepResult | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const canAnalyze =
    sourceId.trim() !== '' &&
    (destMode === 'instance' ? destId.trim() !== '' : destIp.trim() !== '') &&
    (protocol === 'icmp' || port.trim() !== '');

  const handleAnalyze = useCallback(async () => {
    if (!canAnalyze) return;
    setAnalyzing(true);
    setHops([]);
    setResult(null);
    setStatusMsg('Starting analysis…');

    const body: AnalyzeRequest = {
      sourceInstanceId: sourceId,
      destInstanceId: destMode === 'instance' ? destId : undefined,
      destIp: destMode === 'ip' ? destIp : undefined,
      protocol,
      port: protocol === 'icmp' ? 0 : parseInt(port, 10),
    };

    try {
      const res = await fetch('/topology/deep-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        push({ variant: 'danger', title: 'Analysis failed', description: `HTTP ${res.status}` });
        setAnalyzing(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines[lines.length - 1] ?? '';
        for (const line of lines.slice(0, -1)) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const event = JSON.parse(jsonStr) as DeepAnalysisEvent;
            if (event.type === 'status' && event.message) {
              setStatusMsg(event.message);
            } else if (event.type === 'hop' && event.hop) {
              setHops((prev) => [...prev, event.hop as DeepHop]);
            } else if (event.type === 'result' && event.result) {
              setResult(event.result);
              setStatusMsg(null);
            } else if (event.type === 'error') {
              push({ variant: 'danger', title: 'Analysis error', description: event.message });
              setStatusMsg(null);
            }
          } catch {
            void 0;
          }
        }
      }
    } catch (err) {
      push({
        variant: 'danger',
        title: 'Analysis failed',
        description: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setAnalyzing(false);
    }
  }, [canAnalyze, sourceId, destMode, destId, destIp, protocol, port, push]);

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="reach-source" className="text-[12px] font-medium text-text-dim">
            Source Instance
          </label>
          <InstanceAutocomplete
            id="reach-source"
            value={sourceId}
            onChange={(id) => setSourceId(id)}
            placeholder="Search instances…"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-text-dim">Destination</span>
            <div className="flex rounded overflow-hidden border border-border text-[11px]">
              <button
                type="button"
                className={`px-2 py-0.5 ${destMode === 'instance' ? 'bg-accent text-white' : 'bg-surface text-text-dim hover:bg-elev'}`}
                onClick={() => setDestMode('instance')}
              >
                Instance
              </button>
              <button
                type="button"
                className={`px-2 py-0.5 ${destMode === 'ip' ? 'bg-accent text-white' : 'bg-surface text-text-dim hover:bg-elev'}`}
                onClick={() => setDestMode('ip')}
              >
                IP
              </button>
            </div>
          </div>
          {destMode === 'instance' ? (
            <InstanceAutocomplete
              id="reach-dest-inst"
              value={destId}
              onChange={(id) => setDestId(id)}
              placeholder="Search instances…"
            />
          ) : (
            <Input
              id="reach-dest-ip"
              value={destIp}
              onChange={(e) => setDestIp(e.target.value)}
              placeholder="10.0.0.1 or 0.0.0.0/0"
            />
          )}
        </div>

        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="reach-proto" className="text-[12px] font-medium text-text-dim">
              Protocol
            </label>
            <Select
              id="reach-proto"
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as Protocol)}
              className="w-24"
            >
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
              <option value="icmp">ICMP</option>
            </Select>
          </div>
          {protocol !== 'icmp' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="reach-port" className="text-[12px] font-medium text-text-dim">
                Port
              </label>
              <Input
                id="reach-port"
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-24"
              />
            </div>
          )}
          <Button
            variant="primary"
            size="sm"
            icon={analyzing ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={13} />}
            disabled={!canAnalyze || analyzing}
            onClick={handleAnalyze}
          >
            Analyze
          </Button>
        </div>
      </div>

      {(hops.length > 0 || statusMsg || result) && (
        <div className="flex flex-col gap-3">
          <div className="h-px bg-border" />

          {statusMsg && (
            <div className="flex items-center gap-2 text-[12px] text-text-dim">
              <Loader2 size={13} className="animate-spin" />
              {statusMsg}
            </div>
          )}

          {hops.length > 0 && <HopStepper hops={hops} />}

          {result && (
            <div
              className={`flex items-center gap-3 px-4 py-3 rounded-lg font-semibold text-sm ${
                result.reachable
                  ? 'bg-success/15 text-success border border-success/30'
                  : 'bg-danger/15 text-danger border border-danger/30'
              }`}
              role="status"
              aria-live="polite"
            >
              {result.reachable ? (
                <CheckCircle2 size={18} />
              ) : (
                <XCircle size={18} />
              )}
              <div className="flex flex-col gap-0.5">
                <span>{result.reachable ? 'REACHABLE' : 'UNREACHABLE'}</span>
                {result.blocker && (
                  <span className="text-[11px] font-normal opacity-80">{result.blocker}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

ReachabilityPanel.displayName = 'ReachabilityPanel';
