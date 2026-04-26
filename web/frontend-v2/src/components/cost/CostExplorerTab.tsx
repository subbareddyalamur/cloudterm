import { useEffect } from 'react';
import { useSessionsStore } from '@/stores/sessions';

export function CostExplorerTab() {
  // Close this tab and open the cost-dashboard in a new browser window,
  // exactly as the vanilla JS implementation did.
  useEffect(() => {
    const { hostname } = window.location;
    window.open(`http://${hostname}:5173`, '_blank', 'noopener');

    // Remove this session tab immediately — it's just a launcher
    const { sessions, closeSession } = useSessionsStore.getState();
    const costSession = sessions.find((s) => s.type === 'cost');
    if (costSession) closeSession(costSession.id);
  }, []);

  return null;
}

CostExplorerTab.displayName = 'CostExplorerTab';
