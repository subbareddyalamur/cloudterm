import { useState, useEffect } from 'react';
import { useAIStore } from '@/stores/ai';
import { useInstancesStore } from '@/stores/instances';
import { useSettingsStore } from '@/stores/settings';
import { useSessionsStore } from '@/stores/sessions';
import { useLayoutStore, type DeskView } from '@/stores/layout';
import { usePaletteStore } from '@/stores/palette';
import { useThemeStore } from '@/stores/theme';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { Menu } from '@/components/primitives/Menu';
import { useAuthStore } from '@/stores/auth';

type SettingsTab = 'appearance' | 'accounts';

function Mark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <rect x="0.5" y="0.5" width="15" height="15" fill="none" stroke="var(--warn)" />
      <path d="M4 11 L7 5 L4 5" fill="none" stroke="var(--warn)" strokeWidth="1.2" />
      <path d="M9 11 H13" stroke="var(--text-pri)" strokeWidth="1.2" />
    </svg>
  );
}

interface License {
  plan?: string;
  status?: string;
  days_remaining?: number;
  notice?: string;
}

function useLicense(): License | null {
  const [license, setLicense] = useState<License | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () => {
      void fetch('/api/license')
        .then((r) => (r.ok ? (r.json() as Promise<License>) : null))
        .then((data) => {
          if (!stop) setLicense(data && data.plan && data.plan !== 'unconfigured' ? data : null);
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);
  return license;
}

function LicenseDialog({ license, isAdmin, onClose }: { license: License; isAdmin: boolean; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const redeem = async () => {
    setResult(null);
    const res = await fetch('/api/license/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim() }),
    });
    const text = await res.text();
    setResult(res.ok ? 'Coupon applied. The new terms arrive with the next heartbeat.' : text.trim() || 'The coupon was not accepted.');
  };
  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl p-5 w-[400px] space-y-3 text-[13px]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="License">
        <div className="font-semibold text-text-pri capitalize">{license.plan} plan</div>
        <div className="text-text-mut">
          {license.status === 'active' ? 'Active' : license.status}
          {typeof license.days_remaining === 'number' ? ` · ${license.days_remaining} days left` : ''}
        </div>
        {license.notice && <p className="text-[12px] text-text-dim leading-relaxed">{license.notice}</p>}
        {isAdmin && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void redeem(); }}>
            <input className="flex-1 h-8 px-2 rounded-md bg-bg border border-border text-[12px] font-mono text-text-pri focus:outline-none focus:border-accent" placeholder="Coupon code" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Coupon code" />
            <button type="submit" disabled={!code.trim()} className="h-8 px-3 rounded-md border border-border text-[12px] text-text-pri disabled:opacity-50">Redeem</button>
          </form>
        )}
        {result && <p className="text-[12px] text-text-mut">{result}</p>}
        <div className="flex justify-end pt-1">
          <button type="button" onClick={onClose} className="h-7 px-3 rounded-md text-[12px] border border-border text-text-pri">Close</button>
        </div>
      </div>
    </div>
  );
}

const METHOD_LABEL: Record<string, string> = {
  sso: 'Single sign-on',
  password: 'Password',
  break_glass: 'Break-glass password',
};

const DESTINATIONS: { view: DeskView; label: string }[] = [
  { view: 'session', label: 'Session' },
  { view: 'fleet', label: 'Fleet' },
  { view: 'audit', label: 'Audit' },
  { view: 'recordings', label: 'Recordings' },
  { view: 'snippets', label: 'Snippets' },
];

const quiet = 'h-7 px-2 rounded-md text-[12px] text-text-mut hover:text-text-pri hover:bg-elev transition-colors';

export function TopBar() {
  const aiOpen = useAIStore((s) => s.open);
  const setAIOpen = useAIStore((s) => s.setOpen);
  const view = useLayoutStore((s) => s.view);
  const setView = useLayoutStore((s) => s.setView);
  const sessionCount = useSessionsStore((s) => s.sessions.length);
  const openPalette = usePaletteStore((s) => s.setOpen);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const zoomIn = useSettingsStore((s) => s.zoomIn);
  const zoomOut = useSettingsStore((s) => s.zoomOut);
  const resetZoom = useSettingsStore((s) => s.resetZoom);
  const enableFleetMap = useSettingsStore((s) => s.enableFleetMap);
  const enableDiagramBoard = useSettingsStore((s) => s.enableDiagramBoard);
  const triggerScan = useInstancesStore((s) => s.triggerScan);
  const scanning = useInstancesStore((s) => s.scanning);
  const accounts = useInstancesStore((s) => s.accounts);
  const license = useLicense();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance');
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [syncOn, setSyncOn] = useState(false);
  const me = useAuthStore((s) => s.me);
  const signOut = useAuthStore((s) => s.signOut);
  const setSignInOpen = useAuthStore((s) => s.setSignInOpen);
  const isAdmin = me?.role === 'admin';

  const totalInstances = accounts.reduce(
    (n, a) => n + (a.regions ?? []).reduce(
      (rn, r) => rn + (r.groups ?? []).reduce((gn, g) => gn + (g.instances?.length ?? 0), 0), 0,
    ), 0,
  );

  const openSettings = (tab: SettingsTab) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const tab = (ev as CustomEvent<{ tab?: SettingsTab }>).detail?.tab;
      openSettings(tab === 'accounts' ? 'accounts' : 'appearance');
    };
    window.addEventListener('ct:open-settings', onOpen);
    return () => window.removeEventListener('ct:open-settings', onOpen);
  }, []);

  const toggleSync = () => {
    const next = !syncOn;
    setSyncOn(next);
    window.dispatchEvent(new CustomEvent('ct:sync-typing', { detail: { enabled: next } }));
  };

  const initials = me ? (me.name || me.email).slice(0, 2).toUpperCase() : null;

  return (
    <>
      <div className="h-10 flex items-center gap-3 px-3 bg-surface border-b border-border shrink-0">
        <a href="/" className="flex items-center gap-2 shrink-0 no-underline text-text-pri" aria-label="CloudTerm home">
          <Mark />
          <span className="text-[14px] font-semibold tracking-[0.01em]">CloudTerm</span>
        </a>

        <button
          type="button"
          onClick={() => openPalette(true)}
          className="flex-1 max-w-[320px] min-w-[140px] h-[26px] flex items-center px-2.5 rounded-md bg-bg border border-border text-[12px] text-text-dim hover:border-text-dim transition-colors"
        >
          Find an instance
          <span className="ml-auto font-mono text-[10px]">⌘K</span>
        </button>

        <nav aria-label="Desk" className="flex items-center ml-auto">
          {DESTINATIONS.map((d) => (
            <button
              key={d.view}
              type="button"
              aria-current={view === d.view ? 'page' : undefined}
              onClick={() => setView(d.view)}
              className={`h-7 px-2 rounded-md text-[12px] transition-colors ${
                view === d.view ? 'bg-elev text-text-pri' : 'text-text-mut hover:text-text-pri'
              }`}
            >
              {d.label}
              {d.view === 'session' && sessionCount > 0 && (
                <span className="ml-1 text-text-dim tabular-nums">{sessionCount}</span>
              )}
            </button>
          ))}
          <Menu
            label="More places"
            trigger={<span>More</span>}
            triggerClassName={quiet}
            sections={[{
              items: [
                { label: 'Cost', onSelect: () => window.dispatchEvent(new CustomEvent('ct:cost-explorer')) },
                ...(enableFleetMap ? [{ label: 'Fleet map', onSelect: () => window.dispatchEvent(new CustomEvent('ct:fleet-map')) }] : []),
                ...(enableDiagramBoard ? [{ label: 'Diagram', onSelect: () => window.dispatchEvent(new CustomEvent('ct:open-diagram')) }] : []),
              ],
            }]}
          />
        </nav>

        <span className="w-px h-4 bg-border shrink-0" aria-hidden="true" />

        <button
          type="button"
          onClick={() => void triggerScan()}
          disabled={scanning}
          className={`${quiet} tabular-nums disabled:opacity-100`}
          title="Rescan all AWS accounts"
        >
          {scanning ? 'Scanning…' : `Scan ${totalInstances}`}
        </button>
        <button
          type="button"
          onClick={toggleSync}
          aria-pressed={syncOn}
          className={`h-7 px-2 rounded-md text-[12px] transition-colors ${syncOn ? 'bg-warn-ink text-warn' : 'text-text-mut hover:text-text-pri'}`}
          title="Type into every open SSH session at once"
        >
          {syncOn ? 'Sync typing on' : 'Sync typing'}
        </button>
        <button
          type="button"
          onClick={() => setAIOpen(!aiOpen)}
          aria-pressed={aiOpen}
          className={`h-7 px-2 rounded-md text-[12px] transition-colors ${aiOpen ? 'bg-elev text-text-pri' : 'text-text-mut hover:text-text-pri'}`}
        >
          Assistant
        </button>
        {license && (
          <button type="button" onClick={() => setLicenseOpen(true)} className={`${quiet} capitalize`}>
            {license.plan}
            {typeof license.days_remaining === 'number' ? ` · ${license.days_remaining}d` : ''}
          </button>
        )}

        <Menu
          label="Account and preferences"
          trigger={
            initials ? (
              <span className="w-[24px] h-[24px] rounded-full inline-flex items-center justify-center bg-elev text-[10px] font-semibold text-text-pri">{initials}</span>
            ) : (
              <span className="text-[12px] text-text-mut hover:text-text-pri px-1">Sign in</span>
            )
          }
          triggerClassName="h-7 flex items-center"
          sections={[
            {
              heading: me ? `${me.email} · ${me.role}` : 'Not signed in',
              items: me
                ? [
                    { label: METHOD_LABEL[me.method] ?? me.method, disabled: true, onSelect: () => undefined },
                    { label: 'Sign out', onSelect: () => void signOut() },
                  ]
                : [{ label: 'Sign in', onSelect: () => setSignInOpen(true) }],
            },
            {
              heading: 'Desk',
              items: [
                { label: 'Night', hint: theme === 'night' ? 'on' : undefined, onSelect: () => setTheme('night') },
                { label: 'Paper (high contrast)', hint: theme === 'paper' ? 'on' : undefined, onSelect: () => setTheme('paper') },
                { label: 'Other desk themes…', onSelect: () => openSettings('appearance') },
              ],
            },
            {
              heading: 'Terminal text',
              items: [
                { label: 'Larger', hint: '⌘+', onSelect: zoomIn },
                { label: 'Smaller', hint: '⌘−', onSelect: zoomOut },
                { label: 'Default size', onSelect: resetZoom },
              ],
            },
            {
              items: [
                ...(isAdmin || !me ? [{ label: 'AWS accounts', onSelect: () => openSettings('accounts') }] : []),
                { label: 'Settings', hint: '⌘,', onSelect: () => openSettings('appearance') },
              ],
            },
          ]}
        />
      </div>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} initialTab={settingsTab} />
      {licenseOpen && license && <LicenseDialog license={license} isAdmin={isAdmin} onClose={() => setLicenseOpen(false)} />}
    </>
  );
}
