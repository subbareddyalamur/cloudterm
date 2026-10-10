import { DialogPageContext } from '@/components/primitives/Dialog';
import { FleetDashboard } from '@/components/dashboard/FleetDashboard';
import { AuditLogModal } from '@/components/modals/AuditLogModal';
import { RecordingsModal } from '@/components/recordings/RecordingsModal';
import { SnippetsModal } from '@/components/modals/SnippetsModal';
import { useLayoutStore, type DeskView } from '@/stores/layout';

const back = () => useLayoutStore.getState().setView('session');

/** Full work-column page for a desk destination. The fleet column stays beside it. */
export function DeskPage({ view }: { view: Exclude<DeskView, 'session'> }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-bg">
      <DialogPageContext.Provider value>
        {view === 'fleet' && <FleetDashboard />}
        {view === 'audit' && <AuditLogModal open onOpenChange={back} />}
        {view === 'recordings' && <RecordingsModal open onOpenChange={back} />}
        {view === 'snippets' && <SnippetsModal open onOpenChange={back} />}
      </DialogPageContext.Provider>
    </div>
  );
}
