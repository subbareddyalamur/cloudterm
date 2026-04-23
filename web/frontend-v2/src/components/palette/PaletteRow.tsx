import type { PaletteItem } from '@/lib/palette-providers';
import { Server, Terminal, Settings, Zap, History } from 'lucide-react';

const iconMap: Record<string, React.ReactNode> = {};

function kindIcon(kind: PaletteItem['kind']) {
  switch (kind) {
    case 'instance': return <Server size={14} className="text-accent" />;
    case 'command': return <Zap size={14} className="text-warn" />;
    case 'session': return <History size={14} className="text-info" />;
    case 'snippet': return <Terminal size={14} className="text-success" />;
    default: return <Settings size={14} className="text-text-dim" />;
  }
}

export interface PaletteRowProps {
  item: PaletteItem;
  active: boolean;
  onActivate: () => void;
  onMouseEnter: () => void;
}

export function PaletteRow({ item, active, onActivate, onMouseEnter }: PaletteRowProps) {
  void iconMap;
  return (
    <div
      role="option"
      aria-selected={active}
      className={`
        flex items-center gap-3 px-4 py-2.5 cursor-pointer relative
        ${active ? 'bg-elev text-text-pri' : 'text-text-mut hover:bg-elev/50'}
        transition-colors duration-75
      `}
      onClick={onActivate}
      onMouseEnter={onMouseEnter}
    >
      {active && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r" style={{ background: 'var(--accent)' }} />
      )}
      <span className="shrink-0">{item.icon ?? kindIcon(item.kind)}</span>
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] truncate ${active ? 'text-text-pri' : 'text-text-mut'}`}>
          {item.title}
        </div>
        {item.subtitle && (
          <div className="text-[11px] text-text-dim truncate">{item.subtitle}</div>
        )}
      </div>
      {item.kbd && (
        <kbd className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-bg border border-border text-text-dim font-mono">
          {item.kbd}
        </kbd>
      )}
    </div>
  );
}
