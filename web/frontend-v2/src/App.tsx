import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useThemeStore } from '@/stores/theme';
import { usePaletteStore } from '@/stores/palette';
import { shortcuts } from '@/lib/shortcuts';
import { CmdKPalette } from '@/components/palette/CmdKPalette';
import { FleetDashboard } from '@/components/dashboard/FleetDashboard';
import { InstanceDetailsModal } from '@/components/modals/InstanceDetailsModal';
import { RecordingsModal } from '@/components/recordings/RecordingsModal';
import { PortForwardModal } from '@/components/modals/PortForwardModal';
import { UploadModal } from '@/components/modals/UploadModal';
import { DownloadModal } from '@/components/modals/DownloadModal';
import { FileBrowserModal } from '@/components/modals/FileBrowserModal';
import { CloneModal } from '@/components/modals/CloneModal';
import { useSessionsStore } from '@/stores/sessions';
import { useInstancesStore } from '@/stores/instances';
import { useToastStore } from '@/stores/toast';
import { useSettingsStore } from '@/stores/settings';
import { TerminalSession } from '@/components/terminal/TerminalSession';
import { CostExplorerTab } from '@/components/cost/CostExplorerTab';
import { FleetMapView } from '@/components/topology/FleetMapView';
import { DiagramBoard } from '@/components/diagram/DiagramBoard';
import { RDPCredentialsModal } from '@/components/rdp/RDPCredentialsModal';
import type { RDPCredentials } from '@/components/rdp/RDPCredentialsModal';
import type { Instance } from '@/stores/instances';
import { api } from '@/lib/api';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } } });

interface InstanceModalState {
  open: boolean;
  instanceId: string;
  instanceName: string;
  awsProfile?: string;
  awsRegion?: string;
  platform?: string;
}

const CLOSED_MODAL: InstanceModalState = { open: false, instanceId: '', instanceName: '' };

export function App() {
  const theme = useThemeStore((s) => s.theme);
  const togglePalette = usePaletteStore((s) => s.toggle);

  const [detailsInstanceId, setDetailsInstanceId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [recordingsOpen, setRecordingsOpen] = useState(false);
  // settingsOpen lives in TopBar but the keyboard shortcut handler needs it here
  const [settingsOpen, setSettingsOpen] = useState(false);
  void settingsOpen; // consumed by handleSettings callback
  const [rdpModalOpen, setRdpModalOpen] = useState(false);
  const [rdpPendingInstance, setRdpPendingInstance] = useState<Instance | null>(null);

  const [portForwardModal, setPortForwardModal] = useState<InstanceModalState>(CLOSED_MODAL);
  const [uploadModal, setUploadModal] = useState<InstanceModalState>(CLOSED_MODAL);
  const [downloadModal, setDownloadModal] = useState<InstanceModalState>(CLOSED_MODAL);
  const [fileBrowserModal, setFileBrowserModal] = useState<InstanceModalState>(CLOSED_MODAL);
  const [cloneModal, setCloneModal] = useState<InstanceModalState>(CLOSED_MODAL);
  const [expressUploadModal, setExpressUploadModal] = useState<InstanceModalState>(CLOSED_MODAL);
  const [expressDownloadModal, setExpressDownloadModal] = useState<InstanceModalState>(CLOSED_MODAL);

  const [rdpTokens, setRdpTokens] = useState<Record<string, string>>({});
  const [rdpRecording, setRdpRecording] = useState<Record<string, boolean>>({});
  const [rdpStatus, setRdpStatus] = useState<Record<string, 'connecting' | 'error'>>({});

  const activeId = useSessionsStore((s) => s.activeId);
  const sessions = useSessionsStore((s) => s.sessions);
  const accounts = useInstancesStore((s) => s.accounts);
  const s3Bucket = useSettingsStore((s) => s.s3Bucket);

  const flatInstances = useMemo(
    () =>
      accounts
        .flatMap((a) => a.regions)
        .flatMap((r) => r.groups)
        .flatMap((g) => g.instances),
    [accounts],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const findInstance = useCallback(
    (instanceId: string): Instance | null =>
      flatInstances.find((inst) => inst.instance_id === instanceId) ?? null,
    [flatInstances],
  );

  const getInstanceName = useCallback(
    (instanceId: string): string =>
      findInstance(instanceId)?.name ?? instanceId,
    [findInstance],
  );

  useEffect(() => {
    const handleSSH = (e: Event) => {
      const { instanceId, instanceName } = (e as CustomEvent<{
        instanceId: string;
        instanceName: string;
        accountId: string;
        region: string;
      }>).detail;
      const sessionId = `${instanceId}-ssh-${Date.now()}`;
      useSessionsStore.getState().openSession({
        id: sessionId,
        type: 'ssh',
        instanceId,
        instanceName,
        env: '',
        status: 'connecting',
      });
    };
    window.addEventListener('ct:open-ssh', handleSSH);
    return () => window.removeEventListener('ct:open-ssh', handleSSH);
  }, []);

  useEffect(() => {
    const handleRDP = (e: Event) => {
      const { instanceId } = (e as CustomEvent<{
        instanceId: string;
        instanceName: string;
        accountId: string;
        region: string;
      }>).detail;
      const found = findInstance(instanceId);
      if (found) {
        setRdpPendingInstance(found);
        setRdpModalOpen(true);
      }
    };
    window.addEventListener('ct:open-rdp', handleRDP);
    return () => window.removeEventListener('ct:open-rdp', handleRDP);
  }, [findInstance]);

  const handleRDPSubmit = useCallback((creds: RDPCredentials) => {
    if (!rdpPendingInstance) return;

    // Open tab immediately and close modal — don't block the user
    const sessionId = `${rdpPendingInstance.instance_id}-rdp-${Date.now()}`;
    const inst = rdpPendingInstance;
    useSessionsStore.getState().openSession({
      id: sessionId,
      type: 'rdp',
      instanceId: inst.instance_id,
      instanceName: inst.name,
      env: inst.tag2_value ?? '',
      status: 'connecting',
    });
    setRdpStatus((prev) => ({ ...prev, [sessionId]: 'connecting' }));
    setRdpModalOpen(false);
    setRdpPendingInstance(null);

    // Fire API in background
    void (async () => {
      try {
        const result = await api.post<{ token: string; recording: boolean }>('/start-guacamole-rdp', {
          instance_id: inst.instance_id,
          instance_name: inst.name,
          aws_profile: inst.aws_profile,
          aws_region: inst.aws_region,
          username: creds.username,
          password: creds.password,
          security: creds.security,
          record: creds.record,
        });
        if (result.ok && result.data) {
          setRdpTokens((prev) => ({ ...prev, [sessionId]: result.data!.token }));
          setRdpRecording((prev) => ({ ...prev, [sessionId]: result.data!.recording ?? false }));
          setRdpStatus((prev) => { const next = { ...prev }; delete next[sessionId]; return next; });
          useSessionsStore.getState().updateStatus(sessionId, 'connected');
        } else {
          setRdpStatus((prev) => ({ ...prev, [sessionId]: 'error' }));
          useSessionsStore.getState().updateStatus(sessionId, 'error');
          useToastStore.getState().push({ variant: 'danger', title: 'RDP Connection Failed', description: 'Could not start RDP session' });
        }
      } catch {
        setRdpStatus((prev) => ({ ...prev, [sessionId]: 'error' }));
        useSessionsStore.getState().updateStatus(sessionId, 'error');
        useToastStore.getState().push({ variant: 'danger', title: 'RDP Connection Failed', description: 'Network error' });
      }

      if (creds.saveToVault && creds.vaultRule) {
        api.post('/vault/credentials', {
          rule: { type: creds.vaultRule.type, value: creds.vaultRule.value, label: creds.vaultRule.label },
          credential: { username: creds.username, password: creds.password, domain: '', security: creds.security },
        }).then((r) => {
          if (r.ok) {
            useToastStore.getState().push({ variant: 'success', title: 'Saved to Vault', description: `Credentials saved for "${creds.vaultRule!.label}"` });
          }
        }).catch(() => {});
      }
    })();
  }, [rdpPendingInstance]);

  useEffect(() => {
    const handleDetails = (e: Event) => {
      const { instanceId } = (e as CustomEvent<{ instanceId: string }>).detail;
      setDetailsInstanceId(instanceId);
      setDetailsOpen(true);
    };
    window.addEventListener('ct:show-details', handleDetails);
    return () => window.removeEventListener('ct:show-details', handleDetails);
  }, []);

  useEffect(() => {
    const handleCloseAll = (e: Event) => {
      const { instanceId } = (e as CustomEvent<{ instanceId: string }>).detail;
      const { sessions: currentSessions, closeSession } = useSessionsStore.getState();
      currentSessions
        .filter((s) => s.instanceId === instanceId)
        .forEach((s) => closeSession(s.id));
    };
    window.addEventListener('ct:close-all', handleCloseAll);
    return () => window.removeEventListener('ct:close-all', handleCloseAll);
  }, []);

  useEffect(() => {
    const handleUpload = (e: Event) => {
      const { instanceId } = (e as CustomEvent<{ instanceId: string }>).detail;
      setUploadModal({ open: true, instanceId, instanceName: getInstanceName(instanceId) });
    };
    const handleDownload = (e: Event) => {
      const { instanceId } = (e as CustomEvent<{ instanceId: string }>).detail;
      setDownloadModal({ open: true, instanceId, instanceName: getInstanceName(instanceId) });
    };
    const handleBrowseFiles = (e: Event) => {
      const { instanceId } = (e as CustomEvent<{ instanceId: string }>).detail;
      const inst = findInstance(instanceId);
      setFileBrowserModal({
        open: true,
        instanceId,
        instanceName: inst?.name ?? instanceId,
        awsProfile: inst?.aws_profile,
        awsRegion: inst?.aws_region,
        platform: inst?.platform,
      });
    };
    const handlePortForward = (e: Event) => {
      const { instanceId } = (e as CustomEvent<{ instanceId: string }>).detail;
      setPortForwardModal({ open: true, instanceId, instanceName: getInstanceName(instanceId) });
    };
    const handleExpressUpload = (e: Event) => {
      const { instanceId } = (e as CustomEvent<{ instanceId: string }>).detail;
      if (!s3Bucket) {
        useToastStore.getState().push({ variant: 'warn', title: 'S3 not configured', description: 'Configure S3 bucket in Settings → General' });
        return;
      }
      setExpressUploadModal({ open: true, instanceId, instanceName: getInstanceName(instanceId) });
    };
    const handleExpressDownload = (e: Event) => {
      const { instanceId } = (e as CustomEvent<{ instanceId: string }>).detail;
      if (!s3Bucket) {
        useToastStore.getState().push({ variant: 'warn', title: 'S3 not configured', description: 'Configure S3 bucket in Settings → General' });
        return;
      }
      setExpressDownloadModal({ open: true, instanceId, instanceName: getInstanceName(instanceId) });
    };
    const handleTopology = (e: Event) => {
      const { instanceId, instanceName } = (e as CustomEvent<{ instanceId: string; instanceName: string }>).detail;
      const topoId = `topo-${instanceId}`;
      const { sessions, setActive } = useSessionsStore.getState();
      const existing = sessions.find((s) => s.id === topoId);
      if (existing) {
        setActive(topoId);
        return;
      }
      useSessionsStore.getState().openSession({
        id: topoId,
        type: 'topology',
        instanceId,
        instanceName: instanceName || getInstanceName(instanceId),
        env: '',
        status: 'connected',
      });
    };
    const handleCostExplorer = () => {
      const costId = 'cost-explorer';
      const { sessions, setActive } = useSessionsStore.getState();
      const existing = sessions.find((s) => s.id === costId);
      if (existing) {
        setActive(costId);
        return;
      }
      useSessionsStore.getState().openSession({
        id: costId,
        type: 'cost',
        instanceId: '',
        instanceName: 'Cost Explorer',
        env: '',
        status: 'connected',
      });
    };
    const handleFleetMap = () => {
      const fleetId = 'fleet-map';
      const { sessions, setActive } = useSessionsStore.getState();
      const existing = sessions.find((s) => s.id === fleetId);
      if (existing) {
        setActive(fleetId);
        return;
      }
      useSessionsStore.getState().openSession({
        id: fleetId,
        type: 'fleet-map',
        instanceId: '',
        instanceName: 'Fleet Map',
        env: '',
        status: 'connected',
      });
    };
    const handleDiagram = () => {
      const diagramId = 'diagram-board';
      const { sessions: currentSessions, setActive } = useSessionsStore.getState();
      const existing = currentSessions.find((s) => s.id === diagramId);
      if (existing) {
        setActive(diagramId);
        return;
      }
      useSessionsStore.getState().openSession({
        id: diagramId,
        type: 'diagram',
        instanceId: '',
        instanceName: 'Diagram Board',
        env: '',
        status: 'connected',
      });
    };

    const handleClone = (e: Event) => {
      const { instanceId, instanceName } = (e as CustomEvent<{ instanceId: string; instanceName: string }>).detail;
      const name = instanceName || getInstanceName(instanceId);
      setCloneModal({ open: true, instanceId, instanceName: name });
    };

    window.addEventListener('ct:upload', handleUpload);
    window.addEventListener('ct:download', handleDownload);
    window.addEventListener('ct:browse-files', handleBrowseFiles);
    window.addEventListener('ct:port-forward', handlePortForward);
    window.addEventListener('ct:express-upload', handleExpressUpload);
    window.addEventListener('ct:express-download', handleExpressDownload);
    window.addEventListener('ct:topology', handleTopology);
    window.addEventListener('ct:cost-explorer', handleCostExplorer);
    window.addEventListener('ct:fleet-map', handleFleetMap);
    window.addEventListener('ct:open-diagram', handleDiagram);
    window.addEventListener('ct:clone', handleClone);

    return () => {
      window.removeEventListener('ct:upload', handleUpload);
      window.removeEventListener('ct:download', handleDownload);
      window.removeEventListener('ct:browse-files', handleBrowseFiles);
      window.removeEventListener('ct:port-forward', handlePortForward);
      window.removeEventListener('ct:express-upload', handleExpressUpload);
      window.removeEventListener('ct:express-download', handleExpressDownload);
      window.removeEventListener('ct:topology', handleTopology);
      window.removeEventListener('ct:cost-explorer', handleCostExplorer);
      window.removeEventListener('ct:fleet-map', handleFleetMap);
      window.removeEventListener('ct:open-diagram', handleDiagram);
      window.removeEventListener('ct:clone', handleClone);
    };
  }, [getInstanceName, findInstance, s3Bucket]);

  const handleTogglePalette = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      togglePalette();
    },
    [togglePalette],
  );

  const handleSettings = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    setSettingsOpen(true);
  }, []);

  const handleRecordings = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    setRecordingsOpen(true);
  }, []);

  const handleCloseTab = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    if (activeId) useSessionsStore.getState().closeSession(activeId);
  }, [activeId]);

  const handleSwitchTab = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    const idx = parseInt(e.key) - 1;
    const tabIds = useSessionsStore.getState().sessions.map((s) => s.id);
    if (idx >= 0 && idx < tabIds.length) {
      const targetId = tabIds[idx];
      if (targetId) useSessionsStore.getState().setActive(targetId);
    }
  }, []);

  useEffect(() => {
    const unsubs = [
      shortcuts.register({ keys: 'cmd+k', handler: handleTogglePalette, description: 'Open Command Palette', scope: 'global' }),
      shortcuts.register({ keys: 'ctrl+k', handler: handleTogglePalette, description: 'Open Command Palette', scope: 'global' }),
      shortcuts.register({ keys: 'cmd+,', handler: handleSettings, description: 'Open Settings', scope: 'global' }),
      shortcuts.register({ keys: 'cmd+r', handler: handleRecordings, description: 'Open Recordings', scope: 'global' }),
      shortcuts.register({ keys: 'cmd+w', handler: handleCloseTab, description: 'Close active tab', scope: 'global' }),
      shortcuts.register({ keys: 'ctrl+w', handler: handleCloseTab, description: 'Close active tab', scope: 'global' }),
      shortcuts.register({ keys: 'cmd+1', handler: handleSwitchTab, description: 'Switch to tab 1', scope: 'global' }),
      shortcuts.register({ keys: 'cmd+2', handler: handleSwitchTab, description: 'Switch to tab 2', scope: 'global' }),
      shortcuts.register({ keys: 'cmd+3', handler: handleSwitchTab, description: 'Switch to tab 3', scope: 'global' }),
      shortcuts.register({ keys: 'cmd+4', handler: handleSwitchTab, description: 'Switch to tab 4', scope: 'global' }),
      shortcuts.register({ keys: 'cmd+5', handler: handleSwitchTab, description: 'Switch to tab 5', scope: 'global' }),
      shortcuts.register({ keys: 'cmd+6', handler: handleSwitchTab, description: 'Switch to tab 6', scope: 'global' }),
      shortcuts.register({ keys: 'cmd+7', handler: handleSwitchTab, description: 'Switch to tab 7', scope: 'global' }),
      shortcuts.register({ keys: 'cmd+8', handler: handleSwitchTab, description: 'Switch to tab 8', scope: 'global' }),
      shortcuts.register({ keys: 'cmd+9', handler: handleSwitchTab, description: 'Switch to tab 9', scope: 'global' }),
      shortcuts.register({ keys: 'ctrl+1', handler: handleSwitchTab, description: 'Switch to tab 1', scope: 'global' }),
      shortcuts.register({ keys: 'ctrl+2', handler: handleSwitchTab, description: 'Switch to tab 2', scope: 'global' }),
      shortcuts.register({ keys: 'ctrl+3', handler: handleSwitchTab, description: 'Switch to tab 3', scope: 'global' }),
      shortcuts.register({ keys: 'ctrl+4', handler: handleSwitchTab, description: 'Switch to tab 4', scope: 'global' }),
      shortcuts.register({ keys: 'ctrl+5', handler: handleSwitchTab, description: 'Switch to tab 5', scope: 'global' }),
      shortcuts.register({ keys: 'ctrl+6', handler: handleSwitchTab, description: 'Switch to tab 6', scope: 'global' }),
      shortcuts.register({ keys: 'ctrl+7', handler: handleSwitchTab, description: 'Switch to tab 7', scope: 'global' }),
      shortcuts.register({ keys: 'ctrl+8', handler: handleSwitchTab, description: 'Switch to tab 8', scope: 'global' }),
      shortcuts.register({ keys: 'ctrl+9', handler: handleSwitchTab, description: 'Switch to tab 9', scope: 'global' }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [handleTogglePalette, handleSettings, handleRecordings, handleCloseTab, handleSwitchTab]);

  const startCloneWithProgress = useCallback(async (instanceId: string, cloneName: string) => {
    const toastStore = useToastStore.getState();
    let poll: ReturnType<typeof setInterval> | null = null;
    const toastId = toastStore.push({
      variant: 'progress',
      title: 'Clone started',
      description: `Creating AMI for ${cloneName}…`,
      duration: null,
      progress: 0,
      onDismiss: () => { if (poll) clearInterval(poll); },
    });

    const r = await api.post<{ id: string }>('/clone/start', { instance_id: instanceId, clone_name: cloneName });
    if (!r.ok) {
      toastStore.update(toastId, { variant: 'danger', title: 'Clone Failed', description: 'Failed to start clone', duration: 4000 });
      return;
    }

    const cloneId = r.data!.id;
    const PHASE_LABELS: Record<string, string> = {
      creating_ami: 'Creating AMI snapshot…',
      ami_ready: 'AMI ready — launching instance…',
      launching: 'Launching instance…',
      complete: 'Clone complete',
      error: 'Clone failed',
    };

    poll = setInterval(async () => {
      const s = await api.get<{ phase: string; progress: number; message: string; new_instance_id?: string }>(`/clone/status/${cloneId}`);
      if (!s.ok) return;
      const { phase, progress, message, new_instance_id } = s.data!;
      const label = PHASE_LABELS[phase] ?? message;

      if (phase === 'complete') {
        clearInterval(poll!); poll = null;
        toastStore.update(toastId, { variant: 'success', title: `Clone complete: ${cloneName}`, description: new_instance_id ? `Instance ID: ${new_instance_id}` : label, progress: 100, duration: 6000 });
      } else if (phase === 'error') {
        clearInterval(poll!); poll = null;
        toastStore.update(toastId, { variant: 'danger', title: 'Clone failed', description: message, duration: 6000 });
      } else {
        toastStore.update(toastId, { description: label, progress });
      }
    }, 3000);
  }, []);

  const mainContent = (() => {
    const hasAnySessions = sessions.length > 0;
    return (
      <>
        {sessions.map((session) => {
          const isActive = session.id === activeId;

          if (session.type === 'cost') {
            return (
              <div key={session.id} style={{ position: 'absolute', inset: 0, display: isActive ? 'block' : 'none' }}>
                <CostExplorerTab />
              </div>
            );
          }

          if (session.type === 'fleet-map') {
            return (
              <div key={session.id} style={{ position: 'absolute', inset: 0, display: isActive ? 'block' : 'none' }}>
                <FleetMapView />
              </div>
            );
          }

          if (session.type === 'diagram') {
            return (
              <div key={session.id} style={{ position: 'absolute', inset: 0, display: isActive ? 'block' : 'none' }}>
                <DiagramBoard />
              </div>
            );
          }

          const inst = findInstance(session.instanceId);
          if (!inst) {
            return (
              <div key={session.id} style={{ position: 'absolute', inset: 0, display: session.id === activeId ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center' }}>
                <span className="text-text-dim text-sm">Loading instance data…</span>
              </div>
            );
          }
          return (
            <div
              key={session.id}
              style={{
                position: 'absolute',
                inset: 0,
                display: isActive ? 'block' : 'none',
              }}
            >
              <TerminalSession
                instance={inst}
                sessionId={session.id}
                sessionType={session.type}
                rdpToken={rdpTokens[session.id]}
                rdpConnectStatus={rdpStatus[session.id]}
                initialRecording={rdpRecording[session.id] ?? false}
              />
            </div>
          );
        })}
        {!hasAnySessions && <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}><FleetDashboard /></div>}
        {hasAnySessions && !activeId && <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}><FleetDashboard /></div>}
      </>
    );
  })();

  return (
    <QueryClientProvider client={queryClient}>
      <>
        <AppShell>
          {mainContent}
        </AppShell>

        <CmdKPalette />

        <InstanceDetailsModal
          instanceId={detailsInstanceId}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        />

        <RecordingsModal
          open={recordingsOpen}
          onOpenChange={setRecordingsOpen}
        />

        {rdpPendingInstance && (
          <RDPCredentialsModal
            open={rdpModalOpen}
            instance={rdpPendingInstance}
            onSubmit={handleRDPSubmit}
            onCancel={() => { setRdpModalOpen(false); setRdpPendingInstance(null); }}
          />
        )}

        <PortForwardModal
          open={portForwardModal.open}
          onOpenChange={(v) => setPortForwardModal((p) => ({ ...p, open: v }))}
          defaultInstanceId={portForwardModal.instanceId}
          defaultInstanceName={portForwardModal.instanceName}
        />

        <UploadModal
          open={uploadModal.open}
          onOpenChange={(v) => setUploadModal((p) => ({ ...p, open: v }))}
          instanceId={uploadModal.instanceId}
          instanceName={uploadModal.instanceName}
        />

        <DownloadModal
          open={downloadModal.open}
          onOpenChange={(v) => setDownloadModal((p) => ({ ...p, open: v }))}
          instanceId={downloadModal.instanceId}
          instanceName={downloadModal.instanceName}
        />

        <FileBrowserModal
          open={fileBrowserModal.open}
          onOpenChange={(v) => setFileBrowserModal((p) => ({ ...p, open: v }))}
          instanceId={fileBrowserModal.instanceId}
          instanceName={fileBrowserModal.instanceName}
          awsProfile={fileBrowserModal.awsProfile}
          awsRegion={fileBrowserModal.awsRegion}
          platform={fileBrowserModal.platform}
          onDownload={(path) => {
            setFileBrowserModal((p) => ({ ...p, open: false }));
            setDownloadModal({ open: true, instanceId: fileBrowserModal.instanceId, instanceName: fileBrowserModal.instanceName });
            window.dispatchEvent(new CustomEvent('ct:prefill-download-path', { detail: { path } }));
          }}
          onUpload={(path) => {
            setFileBrowserModal((p) => ({ ...p, open: false }));
            setUploadModal({ open: true, instanceId: fileBrowserModal.instanceId, instanceName: fileBrowserModal.instanceName });
            window.dispatchEvent(new CustomEvent('ct:prefill-upload-path', { detail: { path } }));
          }}
          onExpressDownload={(path) => {
            setFileBrowserModal((p) => ({ ...p, open: false }));
            setExpressDownloadModal({ open: true, instanceId: fileBrowserModal.instanceId, instanceName: fileBrowserModal.instanceName });
            window.dispatchEvent(new CustomEvent('ct:prefill-download-path', { detail: { path } }));
          }}
        />

        <CloneModal
          open={cloneModal.open}
          onOpenChange={(v) => setCloneModal((p) => ({ ...p, open: v }))}
          instanceId={cloneModal.instanceId}
          instanceName={cloneModal.instanceName}
          onConfirm={(cloneName) => {
            void startCloneWithProgress(cloneModal.instanceId, cloneName);
          }}
        />

        <UploadModal
          open={expressUploadModal.open}
          onOpenChange={(v) => setExpressUploadModal((p) => ({ ...p, open: v }))}
          instanceId={expressUploadModal.instanceId}
          instanceName={expressUploadModal.instanceName}
          express
          s3Bucket={s3Bucket}
        />

        <DownloadModal
          open={expressDownloadModal.open}
          onOpenChange={(v) => setExpressDownloadModal((p) => ({ ...p, open: v }))}
          instanceId={expressDownloadModal.instanceId}
          instanceName={expressDownloadModal.instanceName}
          express
          s3Bucket={s3Bucket}
        />

      </>
    </QueryClientProvider>
  );
}
