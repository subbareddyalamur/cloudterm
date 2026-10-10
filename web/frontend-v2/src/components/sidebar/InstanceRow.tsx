import { memo, type MouseEvent } from 'react';
import { Star } from 'lucide-react';
import { matchField } from '@/lib/filter';
import type { EC2Instance } from '@/lib/types';
import { PlatformIcon } from '@/components/primitives/PlatformIcon';
import { detectPlatform } from '@/lib/platform';
import { useInstancesStore } from '@/stores/instances';
import { openContextMenu } from './InstanceContextMenu';
import { envTone } from '@/lib/env';

export interface InstanceRowProps {
  instance: EC2Instance;
  showAccount?: boolean;
  onActivate?: (inst: EC2Instance) => void;
}

function dotClass(state: string): string {
  if (state === 'running') return 'bg-success';
  if (state === 'stopped') return 'border border-text-dim';
  return 'bg-text-mut';
}

export const InstanceRow = memo(function InstanceRow({
  instance,
  showAccount,
}: InstanceRowProps) {
  const isFav = useInstancesStore((s) => s.favorites.includes(instance.instance_id));
  const isSelected = useInstancesStore((s) => s.selectedId === instance.instance_id);
  const filter = useInstancesStore((s) => s.filter);
  const matched = filter ? matchField(instance, filter) : null;
  const toggleFav = useInstancesStore((s) => s.toggleFavorite);
  const setSelected = useInstancesStore((s) => s.setSelected);

  const platform = detectPlatform({ Platform: instance.platform, PlatformDetails: instance.os });
  const envRaw = instance.tags?.['Environment'] ?? instance.tags?.['environment'] ?? instance.tag2_value ?? '';

  const handleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    openContextMenu({ x: e.clientX, y: e.clientY, instance });
  };

  const handleClick = () => {
    setSelected(instance.instance_id);
    window.dispatchEvent(
      new CustomEvent('ct:open-ssh', {
        detail: {
          instanceId: instance.instance_id,
          instanceName: instance.name,
          accountId: instance.account_id,
          region: instance.aws_region,
        },
      }),
    );
  };

  const handleStarClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    toggleFav(instance.instance_id);
  };

  return (
    <div
      className={`group inst-row ${isSelected ? 'bg-elev' : ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      role="option"
      aria-selected={isSelected}
      title={`${instance.name} · ${instance.state}`}
      style={{ alignItems: 'flex-start', paddingTop: 4, paddingBottom: 4 }}
    >
      <span
        className={`inst-dot ${dotClass(instance.state)}`}
        aria-label={instance.state}
        style={{ marginTop: 5 }}
      />

      <div style={{ marginTop: 1 }}>
        <PlatformIcon platform={platform} size={13} />
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5 leading-tight">
        <div className="flex items-start gap-1.5">
          <span className={`text-[12.5px] font-semibold leading-snug flex-1 min-w-0 [overflow-wrap:anywhere] ${instance.state === 'running' ? 'text-text-pri' : 'text-text-mut'}`}>
            {instance.name}
          </span>
          {envRaw && (
            <span className={`font-mono text-[9.5px] tracking-[0.04em] uppercase shrink-0 mt-[2px] ${envTone(envRaw)}`}>
              {envRaw}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-text-dim">
          <button
            type="button"
            className="font-mono text-[10.5px] text-text-mut hover:text-text-pri truncate text-left"
            title="Copy instance id"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(instance.instance_id);
            }}
          >
            {instance.instance_id}
          </button>
          {matched && matched !== 'name' && matched !== 'instance id' && (
            <span className="text-[9.5px] text-accent shrink-0">matched {matched}</span>
          )}
          {showAccount && (
            <span className="text-[9px] truncate">
              · {instance.account_alias}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        className={`shrink-0 transition-opacity ${
          isFav ? 'text-warn opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        }`}
        onClick={handleStarClick}
        aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
        style={{ marginTop: 2 }}
      >
        <Star size={12} fill={isFav ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
});
