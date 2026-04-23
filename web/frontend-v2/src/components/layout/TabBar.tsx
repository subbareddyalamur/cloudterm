import { X, Terminal, Monitor, Globe, DollarSign, PenTool, Map } from 'lucide-react';
import { useSessionsStore, type Session } from '@/stores/sessions';

function SessionTab({ session, active }: { session: Session; active: boolean }) {
  const closeSession = useSessionsStore((s) => s.closeSession);
  const setActive = useSessionsStore((s) => s.setActive);

  const Icon =
    session.type === 'rdp' ? Monitor :
    session.type === 'topology' ? Globe :
    session.type === 'cost' ? DollarSign :
    session.type === 'diagram' ? PenTool :
    session.type === 'fleet-map' ? Map :
    Terminal;
  const iconColor =
    session.type === 'rdp' ? 'text-info' :
    session.type === 'topology' ? 'text-warn' :
    session.type === 'cost' ? 'text-accent' :
    session.type === 'diagram' ? 'text-purple-400' :
    session.type === 'fleet-map' ? 'text-success' :
    'text-success';

  return (
    <div
      className={`group flex items-center gap-1.5 px-3 h-full cursor-pointer shrink-0 border-r border-border transition-colors ${
        active ? 'bg-elev border-b-[3px] border-b-accent' : 'bg-surface/40 hover:bg-surface border-b-[3px] border-b-transparent'
      }`}
      onClick={() => setActive(session.id)}
      role="tab"
      aria-selected={active}
    >
      <Icon size={13} className={iconColor} />
      <span className="text-[12px] text-text-pri font-medium max-w-[160px] truncate">
        {session.instanceName}
      </span>
      <button
        type="button"
        className="ml-1 opacity-0 group-hover:opacity-100 text-text-dim hover:text-text-pri transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          closeSession(session.id);
        }}
        aria-label={`Close tab: ${session.instanceName}`}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function TabBar() {
  const sessions = useSessionsStore((s) => s.sessions);
  const activeId = useSessionsStore((s) => s.activeId);

  if (sessions.length === 0) {
    return <div className="flex items-center h-full" />;
  }

  return (
    <div className="flex items-stretch h-full overflow-x-auto scrollbar-none border-l border-border">
      {sessions.map((s) => (
        <SessionTab key={s.id} session={s} active={s.id === activeId} />
      ))}
    </div>
  );
}
