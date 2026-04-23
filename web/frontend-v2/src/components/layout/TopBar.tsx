import { useState, useCallback } from 'react';
import { Sparkles, Settings, Film, DollarSign, Link2, Code2, Clock, RefreshCw, Map, PenTool } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import { ThemeSwitcher } from './ThemeSwitcher';
import { ZoomControls } from './ZoomControls';
import { useAIStore } from '@/stores/ai';
import { useInstancesStore } from '@/stores/instances';
import { useSettingsStore } from '@/stores/settings';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { RecordingsModal } from '@/components/recordings/RecordingsModal';
import { SnippetsModal } from '@/components/modals/SnippetsModal';
import { AuditLogModal } from '@/components/modals/AuditLogModal';

function CloudTermLogo() {
  return (
    <a href="/" className="flex items-center gap-2.5 shrink-0 no-underline select-none">
      <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
        <svg viewBox="0 0 640 512" className="absolute w-9 h-9" style={{ fill: '#58a6ff' }} aria-hidden="true">
          <path d="M537.6 226.6c4.1-10.7 6.4-22.4 6.4-34.6 0-53-43-96-96-96-19.7 0-38.1 6-53.3 16.2C367 64.2 315.3 32 256 32c-88.4 0-160 71.6-160 160 0 2.7.1 5.4.2 8.1C40.2 219.8 0 273.2 0 336c0 79.5 64.5 144 144 144h368c70.7 0 128-57.3 128-128 0-61.9-44-113.6-102.4-125.4z" />
        </svg>
        <svg viewBox="0 0 24 24" className="absolute w-4 h-4" style={{ fill: 'none', stroke: 'var(--bg)', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', zIndex: 2, marginTop: 2 }} aria-hidden="true">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-[15px] font-extrabold leading-none" style={{ background: 'linear-gradient(135deg, #58a6ff, #d2a8ff)', backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          CloudTerm
        </span>
        <span className="text-[9px] text-text-dim tracking-wide leading-tight hidden xl:block">
          Secure Web Terminal for AWS EC2 Instances via Systems Manager
        </span>
      </div>
    </a>
  );
}

function SyncButton() {
  const [syncEnabled, setSyncEnabled] = useState(false);
  const toggle = useCallback(() => {
    const next = !syncEnabled;
    setSyncEnabled(next);
    window.dispatchEvent(new CustomEvent('ct:sync-typing', { detail: { enabled: next } }));
  }, [syncEnabled]);

  return (
    <button
      type="button"
      onClick={toggle}
      className={`flex items-center gap-1 px-2 h-6 rounded text-[11px] font-medium transition-colors ${
        syncEnabled
          ? 'bg-success/20 text-success border border-success/30'
          : 'bg-elev text-text-dim border border-border hover:text-text-pri'
      }`}
      title={syncEnabled ? 'Sync typing ON' : 'Enable sync typing'}
      aria-pressed={syncEnabled}
    >
      <Link2 size={11} />
      Sync
    </button>
  );
}

export function TopBar() {
  const setAIOpen = useAIStore((s) => s.setOpen);
  const aiOpen = useAIStore((s) => s.open);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recordingsOpen, setRecordingsOpen] = useState(false);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [auditLogOpen, setAuditLogOpen] = useState(false);

  const triggerScan = useInstancesStore((s) => s.triggerScan);
  const scanning = useInstancesStore((s) => s.scanning);
  const enableFleetMap = useSettingsStore((s) => s.enableFleetMap);
  const enableDiagramBoard = useSettingsStore((s) => s.enableDiagramBoard);
  const accounts = useInstancesStore((s) => s.accounts);
  const totalInstances = accounts.reduce(
    (n, a) => n + (a.regions ?? []).reduce(
      (rn, r) => rn + (r.groups ?? []).reduce((gn, g) => gn + (g.instances?.length ?? 0), 0), 0
    ), 0
  );

  const openCostExplorer = useCallback(() => {
    window.dispatchEvent(new CustomEvent('ct:cost-explorer'));
  }, []);

  const openFleetMap = useCallback(() => {
    window.dispatchEvent(new CustomEvent('ct:fleet-map'));
  }, []);

  const openDiagram = useCallback(() => {
    window.dispatchEvent(new CustomEvent('ct:open-diagram'));
  }, []);

  return (
    <>
      <div className="h-10 flex items-center px-3 gap-3 bg-surface border-b border-border shrink-0">
        <CloudTermLogo />
        <div className="flex-1" />
        <div className="flex items-center gap-1 shrink-0">
          {/* Instance actions */}
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />}
            loading={false}
            disabled={scanning}
            onClick={() => void triggerScan()}
            title="Scan Instances"
            aria-label="Scan instances"
          >
            Scan
            {totalInstances > 0 && (
              <span className="text-[11px] text-text-dim tabular-nums ml-0.5">{totalInstances}</span>
            )}
          </Button>
          <SyncButton />

          <div className="w-px h-4 bg-border mx-1 shrink-0" aria-hidden="true" />

          {/* Views */}
          {enableFleetMap && <Button variant="ghost" size="sm" icon={<Map size={14} />} aria-label="Fleet Map" title="Fleet Map" onClick={openFleetMap} />}
          <Button variant="ghost" size="sm" icon={<DollarSign size={14} />} aria-label="Cost Explorer" title="Cost Explorer" onClick={openCostExplorer} />
          {enableDiagramBoard && <Button variant="ghost" size="sm" icon={<PenTool size={14} />} aria-label="Diagram Board" title="Diagram Board" onClick={openDiagram} />}

          <div className="w-px h-4 bg-border mx-1 shrink-0" aria-hidden="true" />

          {/* Utilities */}
<Button variant="ghost" size="sm" icon={<Film size={14} />} aria-label="Recordings" onClick={() => setRecordingsOpen(true)} />
          <Button variant="ghost" size="sm" icon={<Code2 size={14} />} aria-label="Command snippets" title="Command Snippets" onClick={() => setSnippetsOpen(true)} />
          <Button variant="ghost" size="sm" icon={<Clock size={14} />} aria-label="Session history" title="Session History" onClick={() => setAuditLogOpen(true)} />

          <div className="w-px h-4 bg-border mx-1 shrink-0" aria-hidden="true" />

          {/* App controls */}
          <ZoomControls />
          <ThemeSwitcher />
          <Button variant="ghost" size="sm" icon={<Sparkles size={14} />} aria-label="AI chat" onClick={() => setAIOpen(!aiOpen)} className={aiOpen ? 'text-accent' : ''} />
          <Button variant="ghost" size="sm" icon={<Settings size={14} />} aria-label="Settings" onClick={() => setSettingsOpen(true)} />
        </div>
      </div>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <RecordingsModal open={recordingsOpen} onOpenChange={setRecordingsOpen} />
      <SnippetsModal open={snippetsOpen} onOpenChange={setSnippetsOpen} />
      <AuditLogModal open={auditLogOpen} onOpenChange={setAuditLogOpen} />
    </>
  );
}
