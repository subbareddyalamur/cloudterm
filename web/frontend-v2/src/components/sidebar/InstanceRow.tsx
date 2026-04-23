import { memo, type MouseEvent } from 'react';
import { Star } from 'lucide-react';
import type { EC2Instance } from '@/lib/types';
import { PlatformIcon } from '@/components/primitives/PlatformIcon';
import { detectPlatform } from '@/lib/platform';
import { useInstancesStore } from '@/stores/instances';
import { openContextMenu } from './InstanceContextMenu';

export interface InstanceRowProps {
  instance: EC2Instance;
  showAccount?: boolean;
  onActivate?: (inst: EC2Instance) => void;
}

const ENV_TINT: Record<string, string> = {
  prod: 'bg-danger/15 text-danger',
  production: 'bg-danger/15 text-danger',
  staging: 'bg-warn/15 text-warn',
  stage: 'bg-warn/15 text-warn',
  dev: 'bg-success/15 text-success',
  development: 'bg-success/15 text-success',
  test: 'bg-info/15 text-info',
  testing: 'bg-info/15 text-info',
};

function envPillClass(env: string): string | undefined {
  return ENV_TINT[(env ?? "").toLowerCase()];
}

function dotClass(state: string): string {
  if (state === 'running') return 'bg-success shadow-[0_0_4px_var(--success)]';
  if (state === 'stopped') return 'bg-danger';
  return 'bg-warn';
}

export const InstanceRow = memo(function InstanceRow({
  instance,
  showAccount,
}: InstanceRowProps) {
  const isFav = useInstancesStore((s) => s.favorites.includes(instance.instance_id));
  const isSelected = useInstancesStore((s) => s.selectedId === instance.instance_id);
  const toggleFav = useInstancesStore((s) => s.toggleFavorite);
  const setSelected = useInstancesStore((s) => s.setSelected);

  const platform = detectPlatform({ Platform: instance.platform, PlatformDetails: instance.os });
  const envRaw = instance.tags?.['Environment'] ?? instance.tags?.['environment'] ?? '';
  const pillClass = envPillClass(envRaw);

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
      style={{ alignItems: 'flex-start', paddingTop: 5, paddingBottom: 5 }}
    >
      <span
        className={`inst-dot ${dotClass(instance.state)}`}
        aria-hidden="true"
        style={{ marginTop: 4 }}
      />

      <div style={{ marginTop: 1 }}>
        <PlatformIcon platform={platform} size={13} />
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5 leading-tight">
        <div className="flex items-start gap-1.5">
          <span className="text-[14px] font-medium text-text-pri break-all leading-snug flex-1 min-w-0">
            {instance.name}
          </span>
          {pillClass && envRaw && (
            <span className={`text-[9px] font-semibold px-1 py-0.5 rounded uppercase shrink-0 mt-px ${pillClass}`}>
              {envRaw}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-text-dim">
          <span className="font-mono text-[10px] opacity-70 group-hover:opacity-100 transition-opacity truncate">
            {instance.instance_id}
          </span>
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
          isFav ? 'text-warn opacity-100' : 'opacity-0 group-hover:opacity-100'
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
