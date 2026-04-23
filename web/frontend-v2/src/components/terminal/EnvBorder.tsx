import type { ReactNode } from 'react';
import { useSettingsStore } from '@/stores/settings';

export interface EnvBorderProps {
  tags: Record<string, string>;
  children: ReactNode;
}

export function EnvBorder({ tags, children }: EnvBorderProps) {
  const envColors = useSettingsStore((s) => s.envColors);
  const enabled = useSettingsStore((s) => s.enableEnvBorders);

  const envValue = (
    tags['Environment'] ??
    tags['environment'] ??
    tags['Env'] ??
    tags['env'] ??
    ''
  ).toLowerCase();

  const match = envColors.find((ec) => envValue.includes(ec.env.toLowerCase()));

  if (!enabled || !match) {
    return <div className="relative h-full w-full">{children}</div>;
  }

  return (
    <div
      className="relative h-full w-full"
      style={{ borderLeft: `${match.width}px solid ${match.color}` }}
    >
      {children}
    </div>
  );
}

EnvBorder.displayName = 'EnvBorder';
