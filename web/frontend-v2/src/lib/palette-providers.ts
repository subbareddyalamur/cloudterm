import { createElement, type ReactNode } from 'react';
import type { EC2Instance } from '@/lib/types';
import { PlatformIcon } from '@/components/primitives/PlatformIcon';
import { detectPlatform } from '@/lib/platform';

export type PaletteItemKind = 'instance' | 'command' | 'snippet' | 'session';

export interface PaletteItem {
  id: string;
  kind: PaletteItemKind;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  kbd?: string;
  action: () => void;
}

export interface PaletteGroup {
  label: string;
  items: PaletteItem[];
}

export interface PaletteContext {
  instances: EC2Instance[];
  favoriteIds: string[];
  recentSessions: Array<{ id: string; instanceName: string; type: string; createdAt: number }>;
  onSSH: (instanceId: string, instanceName: string) => void;
  onRDP: (instanceId: string, instanceName: string) => void;
  onOpenSettings: () => void;
  onToggleAI: () => void;
  onCycleTheme: () => void;
}

export function buildPaletteGroups(
  query: string,
  ctx: PaletteContext,
): PaletteGroup[] {
  const q = query.toLowerCase();
  const groups: PaletteGroup[] = [];

  const instanceItems: PaletteItem[] = ctx.instances
    .filter((inst) => {
      if (!q) return true;
      const tokens = q.split(/\s+/).filter(Boolean);
      const tagValues = inst.tags ? Object.values(inst.tags) : [];
      const hay = [
        inst.name,
        inst.instance_id,
        inst.private_ip ?? '',
        inst.instance_type ?? '',
        inst.account_alias,
        inst.aws_region,
        ...tagValues,
      ].join(' ').toLowerCase();
      return tokens.every((t) => hay.includes(t));
    })
    .slice(0, 8)
    .map((inst) => ({
      id: `inst-${inst.instance_id}`,
      kind: 'instance' as PaletteItemKind,
      title: inst.name,
      subtitle: `${inst.instance_id} · ${inst.instance_type ?? inst.platform} · ${inst.aws_region} · ${inst.private_ip ?? '—'}`,
      icon: createElement(PlatformIcon, { platform: detectPlatform({ Platform: inst.platform, PlatformDetails: inst.os }), size: 14 }),
      action: () => ctx.onSSH(inst.instance_id, inst.name),
    }));

  if (instanceItems.length > 0) {
    groups.push({ label: 'Instances', items: instanceItems });
  }

  const commandItems: PaletteItem[] = [
    { id: 'cmd-settings', kind: 'command', title: 'Open Settings', kbd: '⌘,', action: ctx.onOpenSettings },
    { id: 'cmd-ai', kind: 'command', title: 'Toggle AI Chat', kbd: '⌘/', action: ctx.onToggleAI },
    { id: 'cmd-theme', kind: 'command', title: 'Cycle Theme', action: ctx.onCycleTheme },
  ].filter((c) => !q || c.title.toLowerCase().includes(q));

  if (commandItems.length > 0) {
    groups.push({ label: 'Commands', items: commandItems });
  }

  const recentItems: PaletteItem[] = ctx.recentSessions
    .filter((s) => !q || s.instanceName.toLowerCase().includes(q))
    .slice(0, 5)
    .map((s) => ({
      id: `recent-${s.id}`,
      kind: 'session' as PaletteItemKind,
      title: s.instanceName,
      subtitle: `Recent ${(s.type ?? 'ssh').toUpperCase()} session`,
      action: () => {},
    }));

  if (recentItems.length > 0) {
    groups.push({ label: 'Recent Sessions', items: recentItems });
  }

  return groups;
}
