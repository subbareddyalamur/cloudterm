import { useEffect, useState } from 'react';
import { useSessionsStore } from '@/stores/sessions';
import { useInstancesStore } from '@/stores/instances';

export function StatusBar() {
  const sessionCount = useSessionsStore((s) => s.sessions.length);
  const loading = useInstancesStore((s) => s.loading);
  const lastScanAt = useInstancesStore((s) => s.lastScanAt);
  const [syncOn, setSyncOn] = useState(false);
  useEffect(() => {
    const onSync = (e: Event) => {
      setSyncOn(Boolean((e as CustomEvent<{ enabled?: boolean }>).detail?.enabled));
    };
    window.addEventListener('ct:sync-typing', onSync);
    return () => window.removeEventListener('ct:sync-typing', onSync);
  }, []);

  const elapsed = lastScanAt
    ? Math.round((Date.now() - lastScanAt) / 60000)
    : null;

  return (
    <div className="h-6 flex items-center px-3 gap-4 bg-surface border-t border-border text-[11px] text-text-dim overflow-hidden">
      <span className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full inline-block ${loading ? 'bg-warn animate-pulse motion-reduce:animate-none' : 'bg-success'}`}
        />
        {loading ? 'Scanning…' : 'Connected'}
      </span>
      {sessionCount > 0 && (
        <span>{sessionCount} session{sessionCount !== 1 ? 's' : ''}</span>
      )}
      {elapsed !== null && (
        <span>Scanned {elapsed === 0 ? 'just now' : `${elapsed}m ago`}</span>
      )}
      {syncOn && <span>Sync typing on</span>}
    </div>
  );
}
