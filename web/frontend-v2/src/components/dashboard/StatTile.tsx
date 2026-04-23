import type { ReactNode } from 'react';

export interface StatTileProps {
  label: string;
  value: string;
  delta?: string;
  accent: 'success' | 'danger' | 'warn' | 'info';
  icon?: ReactNode;
}

const accentVar: Record<StatTileProps['accent'], string> = {
  success: 'var(--success)',
  danger: 'var(--danger)',
  warn: 'var(--warn)',
  info: 'var(--info)',
};

export function StatTile({ label, value, delta, accent, icon }: StatTileProps) {
  const color = accentVar[accent];
  return (
    <div
      className="p-4 bg-surface rounded-lg border border-border relative overflow-hidden"
      style={{ borderTopColor: color, borderTopWidth: 2 }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-text-dim uppercase tracking-widest font-semibold">{label}</div>
        {icon && <div style={{ color }}>{icon}</div>}
      </div>
      <div className="text-[40px] font-bold mt-1 leading-none tracking-tight text-text-pri">{value}</div>
      {delta && (
        <div className="text-[11px] mt-1.5 font-medium" style={{ color }}>
          {delta}
        </div>
      )}
    </div>
  );
}
