import { useRef, useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { Xterm, type XtermRef } from './Xterm';
import { SessionStrip, isProdEnv } from './SessionStrip';
import { EnvBorder } from './EnvBorder';
import { getTerminalWS } from '@/lib/ws';
import type { Instance } from '@/stores/instances';
import { GuacamoleClient } from '@/components/rdp/GuacamoleClient';
import { useSessionsStore } from '@/stores/sessions';
import { useToastStore } from '@/stores/toast';
import { api } from '@/lib/api';
import { nanoid } from 'nanoid';
import { TopologyRoute } from '@/components/topology/TopologyRoute';
import { useInstancesStore } from '@/stores/instances';
import { useLayoutStore } from '@/stores/layout';
import { TerminalSearch } from './TerminalSearch';

export interface TerminalSessionProps {
  instance: Instance;
  sessionId: string;
  sessionType?: 'ssh' | 'rdp' | 'topology';
  rdpToken?: string;
  rdpConnectStatus?: 'connecting' | 'error';
  initialRecording?: boolean;
}

interface SplitTarget {
  sessionId: string;
  instanceId: string;
  instanceName: string;
  awsProfile: string;
  awsRegion: string;
}

export function TerminalSession({ instance, sessionId, sessionType = 'ssh', rdpToken, rdpConnectStatus, initialRecording = false }: TerminalSessionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XtermRef>(null);
  const [recording, setRecording] = useState(initialRecording);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<{ index: number; count: number } | null>(null);
  const [splitTarget, setSplitTarget] = useState<SplitTarget | null>(null);
  const [showSplitPicker, setShowSplitPicker] = useState(false);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const focus = useLayoutStore((s) => s.sidebarCollapsed);
  const detailsOpen = useLayoutStore((s) => s.detailsInstanceId === instance.instance_id);
  const toggleDetails = useLayoutStore((s) => s.toggleDetails);
  const status = useSessionsStore((s) => s.sessions.find((x) => x.id === sessionId)?.status);
  const splitXtermRef = useRef<XtermRef>(null);
  const closeSession = useSessionsStore((s) => s.closeSession);
  const sessions = useSessionsStore((s) => s.sessions);
  const accounts = useInstancesStore((s) => s.accounts);
  const toast = useToastStore.getState;

  const allInstances = accounts.flatMap((a) => a.regions).flatMap((r) => r.groups).flatMap((g) => g.instances);
  const sshSessions = sessions.filter((s) => s.type === 'ssh' && s.id !== sessionId);

  const handleSuggest = useCallback(() => {
    getTerminalWS().send({ type: 'suggest_request', payload: { session_id: sessionId } });
  }, [sessionId]);

  const handleDetails = useCallback(() => {
    toggleDetails(instance.instance_id);
  }, [instance.instance_id, toggleDetails]);

  const handleExport = useCallback(async () => {
    toast().push({ variant: 'info', title: 'Exporting session log…' });
    try {
      const result = await api.post<{ filename: string; url: string }>('/export-session', { session_id: sessionId });
      if (result.ok && result.data?.url) {
        const a = document.createElement('a');
        a.href = result.data.url;
        a.download = result.data.filename || 'session-export.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast().push({ variant: 'success', title: 'Export complete', description: result.data.filename });
      } else {
        toast().push({ variant: 'danger', title: 'Export failed', description: result.ok ? 'No download URL returned' : 'Server error' });
      }
    } catch {
      toast().push({ variant: 'danger', title: 'Export failed', description: 'Network error' });
    }
  }, [sessionId, toast]);

  const handleRecord = useCallback(async () => {
    const action = recording ? 'stop' : 'start';
    try {
      const result = await api.post<{ recording: boolean }>('/toggle-recording', { session_id: sessionId, action });
      if (result.ok) {
        setRecording(result.data?.recording ?? !recording);
        toast().push({
          variant: result.data?.recording ? 'warn' : 'success',
          title: result.data?.recording ? 'Recording started' : 'Recording stopped',
        });
      } else {
        toast().push({ variant: 'danger', title: 'Recording failed', description: 'Server returned error' });
      }
    } catch {
      toast().push({ variant: 'danger', title: 'Recording failed', description: 'Network error' });
    }
  }, [recording, sessionId, toast]);

  const handleSplit = useCallback(() => {
    if (splitTarget) {
      getTerminalWS().send({ type: 'close_session', payload: { session_id: splitTarget.sessionId } });
      splitXtermRef.current?.dispose();
      setSplitTarget(null);
      return;
    }
    setShowSplitPicker(true);
  }, [splitTarget]);

  const handlePickSplit = useCallback((picked: typeof sshSessions[0]) => {
    setShowSplitPicker(false);
    const inst = allInstances.find((i) => i.instance_id === picked.instanceId);
    setSplitTarget({
      sessionId: `${picked.instanceId}-split-${nanoid(6)}`,
      instanceId: picked.instanceId,
      instanceName: picked.instanceName,
      awsProfile: inst?.aws_profile ?? '',
      awsRegion: inst?.aws_region ?? '',
    });
  }, [allInstances]);

  const handleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }, []);

  const handleEnd = useCallback(() => {
    closeSession(sessionId);
    getTerminalWS().send({ type: 'close_session', payload: { session_id: sessionId } });
    xtermRef.current?.dispose();
  }, [sessionId, closeSession]);

  const handleSearchOpen = useCallback(() => setSearchOpen((v) => !v), []);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    setSearchResults(null);
    xtermRef.current?.clearSearch();
    xtermRef.current?.focus();
  }, []);

  const handleSearchNext = useCallback((q: string) => {
    xtermRef.current?.search(q);
  }, []);

  const handleSearchPrev = useCallback((q: string) => {
    xtermRef.current?.search(q);
    xtermRef.current?.searchPrevious();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const tags = instance.tags;
  const envLabel = tags?.['Environment'] ?? tags?.['environment'] ?? instance.tag2_value ?? '';
  const envName = envLabel.toLowerCase();
  const prod = isProdEnv(envName);
  const frame = prod ? 'border-2 border-warn' : 'border-2 border-transparent';
  const envBorderTags = prod ? {} : (tags ?? {});

  if (sessionType === 'topology') {
    return (
      <div ref={containerRef} className="flex flex-col h-full bg-bg">
        <TopologyRoute instanceId={instance.instance_id} />
      </div>
    );
  }

  if (sessionType === 'rdp') {
    return (
      <div ref={containerRef} className={`flex flex-col h-full ${frame}`} aria-label={prod ? 'Production session' : undefined}>
        <SessionStrip
          kind="rdp"
          name={instance.name}
          instanceId={instance.instance_id}
          env={envLabel}
          status={rdpConnectStatus ?? status}
          recording={recording}
          detailsOpen={detailsOpen}
          onDetails={handleDetails}
          focus={focus}
          onFocus={toggleSidebar}
          more={[
            { label: 'Send Ctrl+Alt+Del', onSelect: () => window.dispatchEvent(new CustomEvent('ct:rdp-ctrl-alt-del', { detail: { sessionId } })) },
            { label: 'Full screen', onSelect: handleFullscreen },
          ]}
          onEnd={() => { closeSession(sessionId); }}
        />
        <div className="flex-1 min-h-0">
          {rdpToken ? (
            <GuacamoleClient sessionId={sessionId} token={rdpToken} />
          ) : (
            <div className="flex items-center justify-center h-full text-text-dim text-[13px]">
              {rdpConnectStatus === 'error' ? 'Connection failed' : 'Connecting to RDP…'}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`flex flex-col h-full ${frame}`} aria-label={prod ? 'Production session' : undefined}>
      <SessionStrip
        kind="ssh"
        name={instance.name}
        instanceId={instance.instance_id}
        env={envLabel}
        status={status}
        recording={recording}
        onToggleRecording={() => void handleRecord()}
        onFind={handleSearchOpen}
        findOpen={searchOpen}
        detailsOpen={detailsOpen}
        onDetails={handleDetails}
        focus={focus}
        onFocus={toggleSidebar}
        more={[
          { label: 'Suggest a command', onSelect: handleSuggest },
          { label: splitTarget ? 'Close split' : 'Split with another session', onSelect: handleSplit },
          { label: 'Export session log', onSelect: () => void handleExport() },
          { label: 'Full screen', onSelect: handleFullscreen },
        ]}
        onEnd={handleEnd}
      />
      <div className={`flex-1 relative min-h-0 ${splitTarget ? 'flex' : ''}`}>
        {/* Split session picker overlay */}
        {showSplitPicker && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
            <div className="bg-surface border border-border rounded-lg shadow-xl w-80 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-[13px] font-semibold text-text-pri">Select session to split with</span>
                <button
                  type="button"
                  onClick={() => setShowSplitPicker(false)}
                  className="text-text-dim hover:text-text-pri transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              {sshSessions.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12px] text-text-dim">
                  No other SSH sessions open
                </div>
              ) : (
                <ul className="max-h-64 overflow-y-auto">
                  {sshSessions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => handlePickSplit(s)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-elev transition-colors"
                      >
                        <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[12px] font-medium text-text-pri truncate">{s.instanceName}</div>
                          <div className="text-[11px] text-text-dim font-mono truncate">{s.instanceId}</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className={`${splitTarget ? 'w-1/2 border-r border-border' : 'w-full h-full'} relative`}>
          {searchOpen && (
            <TerminalSearch
              onNext={handleSearchNext}
              onPrev={handleSearchPrev}
              onClose={handleSearchClose}
              resultIndex={searchResults?.index ?? -1}
              resultCount={searchResults?.count ?? 0}
            />
          )}
          <EnvBorder tags={envBorderTags}>
            <Xterm
              ref={xtermRef}
              instanceId={instance.instance_id}
              instanceName={instance.name}
              sessionId={sessionId}
              awsProfile={instance.aws_profile}
              awsRegion={instance.aws_region}
              environment={envName}
              onSearchResults={(index, count) => setSearchResults({ index, count })}
            />
          </EnvBorder>
        </div>
        {splitTarget && (
          <div className="w-1/2 relative flex flex-col">
            <div className="flex items-center gap-2 px-3 h-7 bg-surface border-b border-border shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
              <span className="text-[11px] font-medium text-text-pri truncate">{splitTarget.instanceName}</span>
              <span className="text-[10px] text-text-dim font-mono truncate flex-1">{splitTarget.instanceId}</span>
              <button
                type="button"
                onClick={() => {
                  getTerminalWS().send({ type: 'close_session', payload: { session_id: splitTarget.sessionId } });
                  splitXtermRef.current?.dispose();
                  setSplitTarget(null);
                }}
                className="text-text-dim hover:text-danger transition-colors shrink-0"
                aria-label="Close split pane"
              >
                <X size={12} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <EnvBorder tags={allInstances.find((i) => i.instance_id === splitTarget.instanceId)?.tags ?? {}}>
                <Xterm
                  ref={splitXtermRef}
                  instanceId={splitTarget.instanceId}
                  instanceName={splitTarget.instanceName}
                  sessionId={splitTarget.sessionId}
                  awsProfile={splitTarget.awsProfile}
                  awsRegion={splitTarget.awsRegion}
                />
              </EnvBorder>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

TerminalSession.displayName = 'TerminalSession';
