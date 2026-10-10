import { useState } from 'react';
import { X } from 'lucide-react';
import { useSessionsStore, type Session } from '@/stores/sessions';
import { useInstancesStore } from '@/stores/instances';
import { useLayoutStore } from '@/stores/layout';
import { isProdEnv } from '@/components/terminal/SessionStrip';

const KIND: Record<Session['type'], { label: string; tone: string }> = {
  ssh: { label: 'SSH', tone: 'text-success' },
  rdp: { label: 'RDP', tone: 'text-info' },
  topology: { label: 'NET', tone: 'text-text-mut' },
  cost: { label: 'COST', tone: 'text-text-mut' },
  'fleet-map': { label: 'MAP', tone: 'text-text-mut' },
  diagram: { label: 'DRAW', tone: 'text-text-mut' },
};

function useEnvFor(instanceId: string): string {
  return useInstancesStore((s) => {
    if (!instanceId) return '';
    for (const a of s.accounts) for (const r of a.regions) for (const g of r.groups) {
      const hit = g.instances.find((i) => i.instance_id === instanceId);
      if (hit) return hit.tags?.['Environment'] ?? hit.tags?.['environment'] ?? hit.tag2_value ?? '';
    }
    return '';
  });
}

function SessionTab({ session, active }: { session: Session; active: boolean }) {
  const closeSession = useSessionsStore((s) => s.closeSession);
  const closeOthers = useSessionsStore((s) => s.closeOthers);
  const setActive = useSessionsStore((s) => s.setActive);
  const env = useEnvFor(session.instanceId);
  const prod = isProdEnv(env);
  const kind = KIND[session.type];
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const underline = active ? (prod ? 'border-b-warn' : 'border-b-text-pri') : 'border-b-transparent';

  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={0}
      title={`${session.instanceName}${env ? ` · ${env}` : ''}`}
      onClick={() => setActive(session.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(session.id); } }}
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
      className={`group relative flex items-center gap-2 pl-3 pr-1.5 h-full cursor-pointer shrink-0 border-r border-border border-b-2 text-[12px] transition-colors ${underline} ${
        active ? 'bg-surface text-text-pri' : 'text-text-mut hover:text-text-pri'
      }`}
    >
      <span className={`font-mono text-[10px] ${kind.tone}`}>{kind.label}</span>
      <span className="max-w-[180px] truncate">{session.instanceName}</span>
      {session.status === 'error' && <span className="w-1.5 h-1.5 rounded-full bg-danger" aria-label="Connection failed" />}
      <button
        type="button"
        className="w-5 h-5 rounded flex items-center justify-center text-text-dim hover:text-text-pri opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
        onClick={(e) => { e.stopPropagation(); closeSession(session.id); }}
        aria-label={`Close ${session.instanceName}`}
      >
        <X size={12} />
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-[299]" onClick={(e) => { e.stopPropagation(); setMenu(null); }} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div role="menu" className="fixed z-[300] rounded-lg shadow-lg bg-surface border border-border p-1 min-w-[160px]" style={{ left: menu.x, top: menu.y }}>
            {[
              { label: 'Close', run: () => closeSession(session.id) },
              { label: 'Close others', run: () => closeOthers(session.id) },
              ...(session.instanceId ? [{ label: 'Details', run: () => useLayoutStore.getState().showDetails(session.instanceId) }] : []),
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="w-full text-left px-2.5 h-7 rounded-md text-[12px] text-text-pri hover:bg-elev"
                onClick={(e) => { e.stopPropagation(); setMenu(null); item.run(); }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function TabBar() {
  const sessions = useSessionsStore((s) => s.sessions);
  const activeId = useSessionsStore((s) => s.activeId);
  const view = useLayoutStore((s) => s.view);

  if (sessions.length === 0) {
    return <div className="flex items-center h-full px-3 text-[11px] text-text-dim">Open a host from the fleet to start a session.</div>;
  }

  return (
    <div role="tablist" aria-label="Open sessions" className="flex items-stretch h-full overflow-x-auto scrollbar-none">
      {sessions.map((s) => (
        <SessionTab key={s.id} session={s} active={view === 'session' && s.id === activeId} />
      ))}
    </div>
  );
}
