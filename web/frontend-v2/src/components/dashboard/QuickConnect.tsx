import { Terminal, Monitor, Star } from 'lucide-react';
import { useMemo } from 'react';
import { Button, StatusDot } from '@/components/primitives';
import { useInstancesStore } from '@/stores/instances';
import { getAllInstances } from '@/lib/filter';

interface QuickConnectProps {
  onSSH?: (instanceId: string, instanceName: string) => void;
  onRDP?: (instanceId: string, instanceName: string) => void;
}

export function QuickConnect({ onSSH, onRDP }: QuickConnectProps) {
  const accounts = useInstancesStore((s) => s.accounts);
  const favorites = useInstancesStore((s) => s.favorites);

  const favInstances = useMemo(
    () => getAllInstances(accounts).filter((i) => favorites.includes(i.instance_id)).slice(0, 6),
    [accounts, favorites],
  );

  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <Star size={13} className="text-warn" />
        <span className="text-[12px] font-semibold text-text-pri">Quick Connect</span>
      </div>
      {favInstances.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-text-dim">
          Star instances in the sidebar for quick access
        </div>
      ) : (
        <div className="divide-y divide-border">
          {favInstances.map((inst) => (
            <div key={inst.instance_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-elev/50 transition-colors">
              <StatusDot state={inst.state} />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-text-pri truncate">{inst.name}</div>
                <div className="text-[10px] text-text-dim">
                  {inst.instance_type ?? inst.platform} · {inst.aws_region}
                </div>
              </div>
              <div className="flex gap-1">
                {inst.platform?.toLowerCase() !== 'windows' && (
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<Terminal size={11} />}
                    onClick={() => onSSH?.(inst.instance_id, inst.name)}
                    aria-label={`SSH to ${inst.name}`}
                  >
                    SSH
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  icon={<Monitor size={11} />}
                  onClick={() => onRDP?.(inst.instance_id, inst.name)}
                  aria-label={`RDP to ${inst.name}`}
                >
                  RDP
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
