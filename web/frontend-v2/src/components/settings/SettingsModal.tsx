import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from 'react';
import { Palette, Type, Cloud, Sparkles, KeyRound, Database, Minus, Plus, Trash2, X, Pencil, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings';
import { useThemeStore } from '@/stores/theme';
import { themes, themesByGroup } from '@/lib/themes';
import { Button, Input } from '@/components/primitives';
import { api } from '@/lib/api';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Tab = 'appearance' | 'general' | 'accounts' | 'ai' | 'vault' | 'database';

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('appearance');

  // Escape to close + body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onOpenChange(false); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prev;
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'appearance', label: 'Appearance', icon: <Palette size={13} /> },
    { id: 'general', label: 'General', icon: <Type size={13} /> },
    { id: 'accounts', label: 'AWS Accounts', icon: <Cloud size={13} /> },
    { id: 'ai', label: 'AI Agent', icon: <Sparkles size={13} /> },
    { id: 'vault', label: 'Credential Vault', icon: <KeyRound size={13} /> },
    { id: 'database', label: 'Database Viewer', icon: <Database size={13} /> },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div
        className="bg-surface border border-border rounded-lg shadow-2xl w-[80vw] h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-1 min-h-0">
          <nav className="w-44 border-r border-border bg-bg py-3 shrink-0">
            <div className="px-3 mb-3 text-[10px] uppercase tracking-widest text-text-dim font-semibold">Settings</div>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] rounded-none transition-colors ${
                  tab === t.id
                    ? 'bg-elev text-text-pri font-semibold border-r-2 border-accent'
                    : 'text-text-mut hover:bg-elev/50 hover:text-text-pri border-r-2 border-transparent'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[14px] font-semibold text-text-pri capitalize">{tabs.find((t) => t.id === tab)?.label ?? tab}</h2>
              <button type="button" onClick={() => onOpenChange(false)} className="text-text-dim hover:text-text-pri p-1 rounded transition-colors focus-visible:outline-2 focus-visible:outline-accent" aria-label="Close settings">
                <X size={16} />
              </button>
            </div>
            {tab === 'appearance' && <AppearanceTab />}
            {tab === 'general' && <GeneralTab />}
            {tab === 'accounts' && <AWSAccountsTab />}
            {tab === 'ai' && <AIAgentTab />}
            {tab === 'vault' && <VaultTab />}
            {tab === 'database' && <DatabaseViewerTab />}
          </div>
        </div>
        <SettingsFooter onClose={() => onOpenChange(false)} />
      </div>
    </div>
  );
}

function SettingsFooter({ onClose }: { onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const saveToServer = useSettingsStore((s) => s.saveToServer);

  const handleSave = useCallback(async () => {
    setSaving(true);
    await saveToServer();
    setSaving(false);
    onClose();
  }, [saveToServer, onClose]);

  return (
    <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-bg shrink-0">
      <Button variant="outline" size="sm" onClick={onClose}>
        Cancel
      </Button>
      <Button variant="primary" size="sm" onClick={() => void handleSave()} loading={saving}>
        Save
      </Button>
    </div>
  );
}

const THEME_GROUPS = [
  { label: 'System', items: themesByGroup('system') },
  { label: 'Design Languages', items: themesByGroup('design') },
  { label: 'Dark Classics', items: themesByGroup('classic-dark') },
  { label: 'Light Themes', items: themesByGroup('light') },
] as const;

function AppearanceTab() {
  const currentTheme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const envColors = useSettingsStore((s) => s.envColors);
  const addEnvColor = useSettingsStore((s) => s.addEnvColor);
  const removeEnvColor = useSettingsStore((s) => s.removeEnvColor);
  const enableEnvBorders = useSettingsStore((s) => s.enableEnvBorders);
  const setEnableEnvBorders = useSettingsStore((s) => s.setEnableEnvBorders);

  const [newEnv, setNewEnv] = useState('');
  const [newColor, setNewColor] = useState('#F87171');

  const selectedThemeMeta = themes.find((t) => t.slug === currentTheme);

  return (
    <>
      <section>
        <h3 className="text-[11px] text-text-dim uppercase tracking-wide font-semibold mb-3">Theme</h3>
        <div className="flex items-center gap-3 mb-2">
          {selectedThemeMeta && (
            <div className="flex gap-1">
              {selectedThemeMeta.swatches.map((c, i) => (
                <span key={i} className="w-4 h-4 rounded" style={{ background: c, border: '1px solid rgba(128,128,128,0.2)' }} />
              ))}
            </div>
          )}
          <select
            value={currentTheme}
            onChange={(e) => setTheme(e.target.value)}
            className="flex-1 bg-elev border border-border rounded text-text-pri text-[12px] h-8 px-2 focus:outline-none focus:border-accent"
          >
            {THEME_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((t) => (
                  <option key={t.slug} value={t.slug}>{t.label} — {t.tagline}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </section>

      <section>
        <h3 className="text-[11px] text-text-dim uppercase tracking-wide font-semibold mb-3">Terminal Font Size</h3>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setFontSize(fontSize - 1)} className="w-7 h-7 flex items-center justify-center rounded border border-border hover:bg-elev text-text-mut" aria-label="Decrease font size">
            <Minus size={14} />
          </button>
          <span className="text-[14px] font-mono tabular-nums text-text-pri w-8 text-center">{fontSize}</span>
          <button type="button" onClick={() => setFontSize(fontSize + 1)} className="w-7 h-7 flex items-center justify-center rounded border border-border hover:bg-elev text-text-mut" aria-label="Increase font size">
            <Plus size={14} />
          </button>
          <span className="text-[11px] text-text-dim">px</span>
        </div>
      </section>

      <section>
        <h3 className="text-[11px] text-text-dim uppercase tracking-wide font-semibold mb-3">Terminal Font Family</h3>
        <select
          value={useSettingsStore.getState().fontFamily}
          onChange={(e) => useSettingsStore.setState({ fontFamily: e.target.value })}
          className="w-full max-w-xs bg-elev border border-border rounded text-text-pri text-[12px] h-8 px-2 focus:outline-none focus:border-accent font-mono"
        >
          {['JetBrains Mono', 'Fira Code', 'Source Code Pro', 'IBM Plex Mono', 'Cascadia Code', 'Menlo', 'Monaco', 'Consolas', 'Ubuntu Mono', 'monospace'].map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
          ))}
        </select>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] text-text-dim uppercase tracking-wide font-semibold">Environment Color Borders</h3>
          <label className="flex items-center gap-2 text-[11px] text-text-mut cursor-pointer">
            <input type="checkbox" checked={enableEnvBorders} onChange={(e) => setEnableEnvBorders(e.target.checked)} className="rounded" />
            Enabled
          </label>
        </div>
        <div className="space-y-1.5">
          {envColors.map((ec) => (
            <div key={ec.env} className="flex items-center gap-2 text-[12px]">
              <span className="w-4 h-4 rounded" style={{ background: ec.color }} />
              <span className="text-text-pri font-medium w-20">{ec.env}</span>
              <span className="text-text-dim">{ec.width}px border</span>
              <button type="button" className="ml-auto text-text-dim hover:text-danger" onClick={() => removeEnvColor(ec.env)} aria-label={`Remove ${ec.env}`}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Input placeholder="env name" value={newEnv} onChange={(e) => setNewEnv(e.target.value)} className="w-24 text-[11px]" />
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
          <Button variant="ghost" size="xs" onClick={() => { if (newEnv.trim()) { addEnvColor({ env: newEnv.trim().toLowerCase(), color: newColor, width: 2 }); setNewEnv(''); } }}>
            Add
          </Button>
        </div>
      </section>
    </>
  );
}

function GeneralTab() {
  const compactMode = useSettingsStore((s) => s.compactMode);
  const setCompactMode = useSettingsStore((s) => s.setCompactMode);
  const scrollbackLines = useSettingsStore((s) => s.scrollbackLines);
  const setScrollbackLines = useSettingsStore((s) => s.setScrollbackLines);
  const s3Bucket = useSettingsStore((s) => s.s3Bucket);
  const setS3Bucket = useSettingsStore((s) => s.setS3Bucket);
  const enableDiagramBoard = useSettingsStore((s) => s.enableDiagramBoard);
  const setEnableDiagramBoard = useSettingsStore((s) => s.setEnableDiagramBoard);
  const enableFleetMap = useSettingsStore((s) => s.enableFleetMap);
  const setEnableFleetMap = useSettingsStore((s) => s.setEnableFleetMap);

  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between text-[12px]">
        <span className="text-text-pri">Compact mode</span>
        <input type="checkbox" checked={compactMode} onChange={(e) => setCompactMode(e.target.checked)} className="rounded" />
      </label>
      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-text-dim font-semibold">Experimental Features</p>
        <label className="flex items-center justify-between text-[12px]">
          <div>
            <span className="text-text-pri">Fleet Map</span>
            <p className="text-[10px] text-text-dim mt-0.5">Visual overview of all VPCs across accounts</p>
          </div>
          <input type="checkbox" checked={enableFleetMap} onChange={(e) => setEnableFleetMap(e.target.checked)} className="rounded" />
        </label>
        <label className="flex items-center justify-between text-[12px]">
          <div>
            <span className="text-text-pri">Diagram Board</span>
            <p className="text-[10px] text-text-dim mt-0.5">Freeform architecture diagram canvas (work in progress)</p>
          </div>
          <input type="checkbox" checked={enableDiagramBoard} onChange={(e) => setEnableDiagramBoard(e.target.checked)} className="rounded" />
        </label>
      </div>
      <div className="flex items-center justify-between text-[12px]">
        <label htmlFor="scrollback-lines" className="text-text-pri">Scrollback lines</label>
        <input
          id="scrollback-lines"
          type="number"
          min={1000}
          max={100000}
          step={1000}
          value={scrollbackLines}
          onChange={(e) => setScrollbackLines(Number(e.target.value))}
          className="w-24 bg-elev border border-border rounded px-2 py-1 text-[12px] font-mono text-text-pri text-right focus:outline-none focus:border-accent transition-colors"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[12px] text-text-pri font-medium">S3 Bucket (Express Upload/Download)</label>
        <Input
          placeholder="e.g. my-cloudterm-transfers"
          value={s3Bucket}
          onChange={(e) => setS3Bucket(e.target.value)}
          className="text-[12px]"
        />
        <p className="text-[10px] text-text-dim">
          Set an S3 bucket to enable Express Upload and Express Download in the right-click menu. Transfers go through S3 presigned URLs for faster speeds.
        </p>
      </div>
    </div>
  );
}

interface AWSAccount {
  id: string;
  name: string;
  access_key_id: string;
  secret_access_key: string;
  session_token?: string;
  added_at?: string;
}

function maskKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

function AWSAccountsTab() {
  const [accounts, setAccounts] = useState<AWSAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAccessKeyId, setNewAccessKeyId] = useState('');
  const [newSecretAccessKey, setNewSecretAccessKey] = useState('');
  const [newSessionToken, setNewSessionToken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<AWSAccount[]>('/aws-accounts').then((r) => {
      if (r.ok) setAccounts(r.data ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const addAccount = async () => {
    if (!newAccessKeyId.trim() || !newSecretAccessKey.trim()) return;
    setSubmitting(true);
    const result = await api.post<AWSAccount>('/aws-accounts', {
      name: newName.trim() || undefined,
      access_key_id: newAccessKeyId.trim(),
      secret_access_key: newSecretAccessKey.trim(),
      session_token: newSessionToken.trim() || undefined,
    });
    if (result.ok && result.data) {
      setAccounts((prev) => [...prev, result.data as AWSAccount]);
      setNewName('');
      setNewAccessKeyId('');
      setNewSecretAccessKey('');
      setNewSessionToken('');
      setShowAdd(false);
    }
    setSubmitting(false);
  };

  const deleteAccount = async (id: string) => {
    await api.delete(`/aws-accounts/${id}`);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  const scanAccount = async (id: string) => {
    await api.post(`/aws-accounts/${id}/scan`, {});
  };

  if (loading) return <div className="text-[12px] text-text-dim">Loading accounts...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] text-text-dim leading-relaxed">
          Add AWS accounts with access keys for scanning instances. Useful when ~/.aws/credentials is not available.
        </p>
        <Button variant="ghost" size="xs" onClick={() => setShowAdd(!showAdd)} className="shrink-0">
          {showAdd ? 'Cancel' : '+ Add Account'}
        </Button>
      </div>

      {showAdd && (
        <div className="bg-elev rounded border border-border p-3 space-y-2">
          <Input
            placeholder="Account name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="text-[12px]"
          />
          <Input
            placeholder="Access Key ID *"
            value={newAccessKeyId}
            onChange={(e) => setNewAccessKeyId(e.target.value)}
            className="text-[12px] font-mono"
          />
          <Input
            type="password"
            placeholder="Secret Access Key *"
            value={newSecretAccessKey}
            onChange={(e) => setNewSecretAccessKey(e.target.value)}
            className="text-[12px] font-mono"
          />
          <Input
            placeholder="Session Token (optional)"
            value={newSessionToken}
            onChange={(e) => setNewSessionToken(e.target.value)}
            className="text-[12px] font-mono"
          />
          <Button
            variant="primary"
            size="xs"
            onClick={() => void addAccount()}
            disabled={!newAccessKeyId.trim() || !newSecretAccessKey.trim() || submitting}
          >
            {submitting ? 'Adding…' : 'Add Account'}
          </Button>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="text-[12px] text-text-dim text-center py-6">No AWS accounts configured</div>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-3 py-2.5 rounded bg-elev/50 border border-border text-[12px]">
              <Cloud size={14} className="text-text-dim shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-text-pri truncate">{a.name || a.access_key_id}</div>
                <div className="text-[10px] text-text-dim font-mono mt-0.5">
                  {maskKey(a.access_key_id)} · <span className="opacity-60">secret: {maskKey(a.secret_access_key)}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="xs"
                icon={<RefreshCw size={11} />}
                onClick={() => void scanAccount(a.id)}
                aria-label="Scan instances"
              >
                Scan
              </Button>
              <button
                type="button"
                className="text-text-dim hover:text-danger transition-colors"
                onClick={() => void deleteAccount(a.id)}
                aria-label="Delete account"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AIAgentTab() {
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const aiModel = useSettingsStore((s) => s.aiModel);
  const bedrockAuthMode = useSettingsStore((s) => s.bedrockAuthMode);
  const bedrockRegion = useSettingsStore((s) => s.bedrockRegion);
  const bedrockProfile = useSettingsStore((s) => s.bedrockProfile);
  const bedrockAccessKeyId = useSettingsStore((s) => s.bedrockAccessKeyId);
  const bedrockSecretKey = useSettingsStore((s) => s.bedrockSecretKey);
  const bedrockSessionToken = useSettingsStore((s) => s.bedrockSessionToken);
  const bedrockInferenceProfileArn = useSettingsStore((s) => s.bedrockInferenceProfileArn);
  const aiApiKey = useSettingsStore((s) => s.aiApiKey);
  const ollamaUrl = useSettingsStore((s) => s.ollamaUrl);

  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const fetchModels = useCallback((provider: string) => {
    setModelsLoading(true);
    setModelsError(null);
    const params = new URLSearchParams({ provider });
    if (provider === 'bedrock') {
      const st = useSettingsStore.getState();
      params.set('region', st.bedrockRegion);
      params.set('auth_mode', st.bedrockAuthMode);
      if (st.bedrockAuthMode === 'profile' || st.bedrockAuthMode === 'inference_profile') {
        params.set('profile', st.bedrockProfile);
      }
      if (st.bedrockAuthMode === 'api_key') {
        params.set('access_key_id', st.bedrockAccessKeyId);
        params.set('secret_key', st.bedrockSecretKey);
        if (st.bedrockSessionToken) params.set('session_token', st.bedrockSessionToken);
      }
    }
    if (provider === 'ollama') {
      params.set('ollama_url', useSettingsStore.getState().ollamaUrl);
    }
    const key = useSettingsStore.getState().aiApiKey;
    if (key && (provider === 'anthropic' || provider === 'openai' || provider === 'gemini')) {
      params.set('api_key', key);
    }
    api.get<Array<{ id: string; name: string }>>(`/ai-agent/models?${params.toString()}`).then((r) => {
      if (r.ok && Array.isArray(r.data)) {
        setModels(r.data);
        if (r.data.length > 0) {
          const current = useSettingsStore.getState().aiModel;
          const hasMatch = r.data.some((m) => m.id === current);
          if (!hasMatch) {
            useSettingsStore.setState({ aiModel: r.data[0].id });
          }
        }
      } else {
        let msg = r.error?.message ?? 'Failed to load models';
        try {
          const parsed = JSON.parse(msg);
          if (parsed?.error) msg = parsed.error;
        } catch { /* not JSON, use as-is */ }
        setModelsError(msg);
        setModels([]);
      }
      setModelsLoading(false);
    }).catch((e: unknown) => {
      setModelsError(e instanceof Error ? e.message : 'Failed to fetch');
      setModels([]);
      setModelsLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchModels(aiProvider);
  }, [aiProvider, bedrockAuthMode, fetchModels]);

  const providers = [
    { id: 'bedrock', label: 'AWS Bedrock' },
    { id: 'anthropic', label: 'Anthropic' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'gemini', label: 'Google Gemini' },
    { id: 'ollama', label: 'Ollama (local)' },
  ];

  const isApiKeyProvider = aiProvider === 'anthropic' || aiProvider === 'openai' || aiProvider === 'gemini';

  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-[11px] text-text-dim uppercase tracking-wide font-semibold mb-3">Provider</h3>
        <div className="space-y-1">
          {providers.map((p) => (
            <label key={p.id} className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors ${
              aiProvider === p.id ? 'bg-accent/10 border border-accent/30' : 'border border-transparent hover:bg-elev/50'
            }`}>
              <input
                type="radio"
                name="ai-provider"
                value={p.id}
                checked={aiProvider === p.id}
                onChange={() => {
                  useSettingsStore.setState({ aiProvider: p.id, aiModel: '' });
                }}
                className="accent-accent"
              />
              <span className="text-[12px] text-text-pri">{p.label}</span>
            </label>
          ))}
        </div>
      </section>

      {aiProvider === 'bedrock' && (
        <section className="space-y-3">
          <h3 className="text-[11px] text-text-dim uppercase tracking-wide font-semibold">Bedrock Authentication</h3>

          <div className="space-y-1">
            {([
              { mode: 'profile' as const, label: 'AWS Profile & Region', desc: 'Use shared credentials file (~/.aws/credentials)' },
              { mode: 'api_key' as const, label: 'Access Key & Secret', desc: 'Direct IAM access key authentication' },
              { mode: 'inference_profile' as const, label: 'Application Inference Profile', desc: 'Use a pre-configured inference profile ARN' },
            ]).map((opt) => (
              <label key={opt.mode} className={`flex items-start gap-3 px-3 py-2 rounded cursor-pointer transition-colors ${
                bedrockAuthMode === opt.mode ? 'bg-accent/10 border border-accent/30' : 'border border-transparent hover:bg-elev/50'
              }`}>
                <input
                  type="radio"
                  name="bedrock-auth"
                  checked={bedrockAuthMode === opt.mode}
                  onChange={() => useSettingsStore.setState({ bedrockAuthMode: opt.mode })}
                  className="accent-accent mt-0.5"
                />
                <div>
                  <div className="text-[12px] text-text-pri font-medium">{opt.label}</div>
                  <div className="text-[10px] text-text-dim">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>

          <div>
            <label className="text-[11px] text-text-dim mb-1 block">Region</label>
            <Input
              placeholder="us-east-1"
              value={bedrockRegion}
              onChange={(e) => useSettingsStore.setState({ bedrockRegion: e.target.value })}
              onBlur={() => fetchModels('bedrock')}
              className="text-[12px]"
            />
          </div>

          {bedrockAuthMode === 'profile' && (
            <div>
              <label className="text-[11px] text-text-dim mb-1 block">AWS Profile</label>
              <Input
                placeholder="default"
                value={bedrockProfile}
                onChange={(e) => useSettingsStore.setState({ bedrockProfile: e.target.value })}
                onBlur={() => fetchModels('bedrock')}
                className="text-[12px]"
              />
            </div>
          )}

          {bedrockAuthMode === 'api_key' && (
            <>
              <div>
                <label className="text-[11px] text-text-dim mb-1 block">Access Key ID</label>
                <Input
                  placeholder="AKIA..."
                  value={bedrockAccessKeyId}
                  onChange={(e) => useSettingsStore.setState({ bedrockAccessKeyId: e.target.value })}
                  className="text-[12px] font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-text-dim mb-1 block">Secret Access Key</label>
                <Input
                  type="password"
                  placeholder="Secret key"
                  value={bedrockSecretKey}
                  onChange={(e) => useSettingsStore.setState({ bedrockSecretKey: e.target.value })}
                  onBlur={() => fetchModels('bedrock')}
                  className="text-[12px] font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-text-dim mb-1 block">Session Token <span className="text-text-dim font-normal">(optional)</span></label>
                <Input
                  type="password"
                  placeholder="Temporary session token"
                  value={bedrockSessionToken}
                  onChange={(e) => useSettingsStore.setState({ bedrockSessionToken: e.target.value })}
                  className="text-[12px] font-mono"
                />
              </div>
            </>
          )}

          {bedrockAuthMode === 'inference_profile' && (
            <>
              <div>
                <label className="text-[11px] text-text-dim mb-1 block">Inference Profile ARN</label>
                <Input
                  placeholder="arn:aws:bedrock:us-east-1:123456789:inference-profile/..."
                  value={bedrockInferenceProfileArn}
                  onChange={(e) => useSettingsStore.setState({ bedrockInferenceProfileArn: e.target.value })}
                  onBlur={() => fetchModels('bedrock')}
                  className="text-[12px] font-mono"
                />
                <p className="text-[10px] text-text-dim mt-1">The inference profile ARN will be used as the model ID for API calls.</p>
              </div>
              <div>
                <label className="text-[11px] text-text-dim mb-1 block">AWS Profile <span className="text-text-dim font-normal">(for authentication)</span></label>
                <Input
                  placeholder="default"
                  value={bedrockProfile}
                  onChange={(e) => useSettingsStore.setState({ bedrockProfile: e.target.value })}
                  onBlur={() => fetchModels('bedrock')}
                  className="text-[12px]"
                />
              </div>
            </>
          )}
        </section>
      )}

      {isApiKeyProvider && (
        <section>
          <h3 className="text-[11px] text-text-dim uppercase tracking-wide font-semibold mb-2">API Key</h3>
          <Input
            type="password"
            placeholder="Enter API key"
            value={aiApiKey}
            onChange={(e) => useSettingsStore.setState({ aiApiKey: e.target.value })}
            className="text-[12px]"
          />
        </section>
      )}

      {aiProvider === 'ollama' && (
        <section>
          <h3 className="text-[11px] text-text-dim uppercase tracking-wide font-semibold mb-2">Ollama Server URL</h3>
          <Input
            placeholder="http://localhost:11434"
            value={ollamaUrl}
            onChange={(e) => useSettingsStore.setState({ ollamaUrl: e.target.value })}
            onBlur={() => fetchModels('ollama')}
            className="text-[12px]"
          />
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] text-text-dim uppercase tracking-wide font-semibold">Model</h3>
          <Button
            variant="ghost"
            size="xs"
            icon={<RefreshCw size={11} className={modelsLoading ? 'animate-spin' : ''} />}
            onClick={() => fetchModels(aiProvider)}
            disabled={modelsLoading}
          >
            {modelsLoading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
        {modelsError && (
          <p className="text-[11px] text-danger mb-2">{modelsError}</p>
        )}
        {models.length > 0 ? (
          <div ref={modelDropdownRef} className="relative">
            <input
              type="text"
              placeholder="Search models…"
              value={modelDropdownOpen ? modelSearch : models.find((m) => m.id === aiModel)?.name ? `${models.find((m) => m.id === aiModel)!.name} (${aiModel})` : aiModel}
              onChange={(e) => { setModelSearch(e.target.value); setModelDropdownOpen(true); }}
              onFocus={() => { setModelSearch(''); setModelDropdownOpen(true); }}
              onBlur={(e) => {
                if (modelDropdownRef.current?.contains(e.relatedTarget as Node)) return;
                setTimeout(() => setModelDropdownOpen(false), 150);
              }}
              className="w-full bg-elev border border-border rounded text-text-pri text-[12px] h-8 px-2 focus:outline-none focus:border-accent"
            />
            {modelDropdownOpen && (() => {
              const q = modelSearch.toLowerCase();
              const filtered = q
                ? models.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
                : models;
              return (
                <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-elev border border-border rounded shadow-xl">
                  {filtered.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-text-dim">No models match "{modelSearch}"</div>
                  ) : filtered.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        useSettingsStore.setState({ aiModel: m.id });
                        setModelDropdownOpen(false);
                        setModelSearch('');
                      }}
                      className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-accent/20 transition-colors ${
                        m.id === aiModel ? 'bg-accent/10 text-accent' : 'text-text-pri'
                      }`}
                    >
                      <span>{m.name}</span>
                      <span className="block text-[10px] text-text-dim font-mono">{m.id}</span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        ) : !modelsLoading ? (
          <Input
            placeholder="Enter model ID manually"
            value={aiModel}
            onChange={(e) => useSettingsStore.setState({ aiModel: e.target.value })}
            className="text-[12px] font-mono"
          />
        ) : null}
        {aiModel && (
          <p className="text-[10px] text-text-dim mt-1 font-mono break-all">{aiModel}</p>
        )}
      </section>
    </div>
  );
}

interface VaultRule {
  id: string;
  type: string;
  value: string;
  label: string;
  priority: number;
}

interface VaultCredential {
  username: string;
  password?: string;
  domain?: string;
  security: string;
}

interface VaultEntry {
  rule: VaultRule;
  credential: VaultCredential;
  created_at: string;
  updated_at: string;
}

const VAULT_RULE_TYPES = [
  { type: 'instance', label: 'This instance only' },
  { type: 'substring', label: 'Name contains (substring)' },
  { type: 'pattern', label: 'Name pattern (glob)' },
  { type: 'environment', label: 'Environment' },
  { type: 'account', label: 'Account' },
  { type: 'global', label: 'All instances' },
] as const;

const VAULT_SECURITY_OPTIONS = [
  { value: 'any', label: 'Auto (any)' },
  { value: 'nla', label: 'NLA' },
  { value: 'tls', label: 'TLS' },
  { value: 'rdp', label: 'RDP' },
] as const;

function VaultTab() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [resolvedPasswords, setResolvedPasswords] = useState<Record<string, string>>({});

  const toggleReveal = useCallback(async (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    if (!resolvedPasswords[id]) {
      const res = await api.get<VaultEntry>(`/vault/credentials?resolve=${encodeURIComponent(id)}`);
      if (res.ok && res.data) {
        const pwd = (res.data.credential as Record<string, string>).password ?? '';
        setResolvedPasswords((prev) => ({ ...prev, [id]: pwd }));
      }
    }
  }, [resolvedPasswords]);

  // Form state shared between add and edit
  const [formLabel, setFormLabel] = useState('');
  const [formRuleType, setFormRuleType] = useState('substring');
  const [formRuleValue, setFormRuleValue] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formSecurity, setFormSecurity] = useState('any');

  const resetForm = () => {
    setFormLabel('');
    setFormRuleType('substring');
    setFormRuleValue('');
    setFormUsername('');
    setFormPassword('');
    setFormSecurity('any');
  };

  const loadEntries = useCallback(() => {
    setLoading(true);
    api.get<VaultEntry[]>('/vault/credentials').then((r) => {
      if (r.ok) setEntries(r.data ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const startAdd = () => {
    resetForm();
    setEditingId(null);
    setShowAdd(true);
  };

  const startEdit = (e: VaultEntry) => {
    setFormLabel(e.rule.label);
    setFormRuleType(e.rule.type);
    setFormRuleValue(e.rule.value);
    setFormUsername(e.credential.username);
    setFormPassword('');
    setFormSecurity(e.credential.security || 'any');
    setEditingId(e.rule.id);
    setShowAdd(true);
  };

  const cancelForm = () => {
    resetForm();
    setShowAdd(false);
    setEditingId(null);
  };

  const saveEntry = async () => {
    if (!formRuleValue.trim() || !formUsername.trim()) return;
    if (!editingId && !formPassword) return;

    let password = formPassword;
    if (editingId && !formPassword) {
      // Fetch the existing entry to preserve the stored password
      const existing = await api.get<VaultEntry>(`/vault/credentials?resolve=${encodeURIComponent(editingId)}`);
      if (existing.ok && existing.data) {
        password = (existing.data.credential as Record<string, string>).password ?? '';
      }
    }

    const payload = {
      rule: {
        id: editingId ?? undefined,
        type: formRuleType,
        value: formRuleValue.trim(),
        label: formLabel.trim() || formRuleValue.trim(),
      },
      credential: {
        username: formUsername.trim(),
        password,
        security: formSecurity,
        domain: '',
      },
    };

    const result = await api.post<{ id: string }>('/vault/credentials', payload);

    if (result.ok) {
      cancelForm();
      loadEntries();
    }
  };

  const deleteEntry = async (id: string) => {
    await api.delete(`/vault/credentials?id=${id}`);
    setEntries((prev) => prev.filter((e) => e.rule.id !== id));
  };

  if (loading) return <div className="text-[12px] text-text-dim">Loading vault...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-text-dim">Store RDP credentials encrypted, matched by instance rule</p>
        <Button variant="ghost" size="xs" onClick={showAdd ? cancelForm : startAdd}>
          {showAdd ? 'Cancel' : '+ Add Credential'}
        </Button>
      </div>

      {showAdd && (
        <div className="bg-elev rounded border border-border p-3 space-y-2">
          <div className="flex gap-2">
            <select
              value={formRuleType}
              onChange={(e) => setFormRuleType(e.target.value)}
              className="px-2 py-1.5 rounded border border-border bg-surface text-text-pri text-[12px] outline-none focus:border-accent/50"
            >
              {VAULT_RULE_TYPES.map((r) => <option key={r.type} value={r.type}>{r.label}</option>)}
            </select>
            <Input
              placeholder="Value (e.g. *-prod-*, substring, instance id…)"
              value={formRuleValue}
              onChange={(e) => setFormRuleValue(e.target.value)}
              className="text-[12px] flex-1"
            />
          </div>
          <Input placeholder="Label (optional, e.g. Prod Windows)" value={formLabel} onChange={(e) => setFormLabel(e.target.value)} className="text-[12px]" />
          <Input placeholder="Username" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} className="text-[12px]" />
          <Input
            type="password"
            placeholder={editingId ? 'New password (leave blank to keep current)' : 'Password'}
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            className="text-[12px]"
          />
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-text-dim">Security:</label>
            <select
              value={formSecurity}
              onChange={(e) => setFormSecurity(e.target.value)}
              className="px-2 py-1 rounded border border-border bg-surface text-text-pri text-[12px] outline-none focus:border-accent/50"
            >
              {VAULT_SECURITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <Button variant="primary" size="xs" onClick={() => void saveEntry()}>
            {editingId ? 'Update Credential' : 'Save Credential'}
          </Button>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="text-[12px] text-text-dim text-center py-6">No credentials stored</div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.rule.id} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-elev/50 border border-border">
              <span className="text-[18px] shrink-0">🔒</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-text-pri">{e.rule.label || e.rule.value}</span>
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-info/15 text-info tracking-wide">
                    {e.rule.type.toUpperCase()}
                  </span>
                </div>
                <div className="text-[11px] text-text-dim font-mono mt-0.5">{e.rule.value}</div>
                <div className="text-[10px] text-text-mut mt-0.5">
                  {e.credential.username} • Security: {e.credential.security || 'any'}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[11px] font-mono text-text-dim tracking-widest">
                    {revealedIds.has(e.rule.id)
                      ? (resolvedPasswords[e.rule.id] ?? '••••••••')
                      : '••••••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void toggleReveal(e.rule.id)}
                    className="text-text-dim hover:text-text-pri transition-colors"
                    aria-label={revealedIds.has(e.rule.id) ? 'Hide password' : 'Show password'}
                  >
                    {revealedIds.has(e.rule.id) ? <EyeOff size={11} /> : <Eye size={11} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded border border-border text-text-dim hover:text-text-pri hover:bg-elev transition-colors"
                  aria-label="Edit"
                  onClick={() => startEdit(e)}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded border border-danger/30 text-danger/70 hover:text-danger hover:bg-danger/10 transition-colors"
                  onClick={() => void deleteEntry(e.rule.id)}
                  aria-label="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 text-[11px] text-text-dim p-4 rounded-lg bg-elev/50 border border-border leading-relaxed">
        <p>🔒 Credentials are encrypted at rest using AES-256-GCM.</p>
        <p className="mt-2"><strong className="text-text-mut">Match Priority:</strong> Instance → Substring → Name Pattern → Environment → Account → Global</p>
      </div>
    </div>
  );
}

interface DBEntry {
  key: string;
  value: string;
  encrypted?: boolean;
}

interface DBBucket {
  name: string;
  count: number;
  entries?: DBEntry[];
}

function DatabaseViewerTab() {
  const [activeDB, setActiveDB] = useState<'suggest' | 'vault'>('suggest');
  const [buckets, setBuckets] = useState<DBBucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [pendingDeleteBucket, setPendingDeleteBucket] = useState<string | null>(null);

  const fetchDB = () => {
    setLoading(true);
    setBuckets([]);
    setExpandedBucket(null);
    fetch(`/db-viewer?db=${activeDB}`)
      .then((r) => r.json())
      .then((d: { buckets?: DBBucket[] }) => setBuckets(d.buckets ?? []))
      .catch(() => setBuckets([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDB(); }, [activeDB]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBucket = (name: string) => {
    setExpandedBucket(expandedBucket === name ? null : name);
    setSearch('');
    setEditingKey(null);
  };

  const handleDeleteKey = async (bucket: string, key: string) => {
    const res = await fetch(`/db-viewer?db=${activeDB}&bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`, { method: 'DELETE' });
    if (res.ok) {
      setBuckets((prev) =>
        prev.map((b) =>
          b.name === bucket
            ? { ...b, entries: b.entries?.filter((e) => e.key !== key), count: b.count - 1 }
            : b,
        ),
      );
      setPendingDeleteKey(null);
    }
  };

  const handleDeleteBucket = async (bucket: string) => {
    const res = await fetch(`/db-viewer?db=${activeDB}&bucket=${encodeURIComponent(bucket)}`, { method: 'DELETE' });
    if (res.ok) {
      setBuckets((prev) => prev.filter((b) => b.name !== bucket));
      setPendingDeleteBucket(null);
      if (expandedBucket === bucket) setExpandedBucket(null);
    }
  };

  const handleUpdateKey = async (bucket: string, key: string) => {
    const res = await fetch(`/db-viewer?db=${activeDB}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket, key, value: editValue }),
    });
    if (res.ok) {
      setEditingKey(null);
      fetchDB();
    }
  };

  const isReadonly = activeDB === 'vault';

  const totalEntries = buckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-text-dim">
        Browse encrypted bbolt databases (suggest.db and vault.db). Values are decrypted for display; vault passwords are redacted.
      </p>

      <div className="flex items-center gap-2">
        {(['suggest', 'vault'] as const).map((db) => (
          <button
            key={db}
            type="button"
            onClick={() => setActiveDB(db)}
            className={`px-4 py-1.5 rounded text-[12px] font-semibold transition-colors ${
              activeDB === db
                ? 'bg-elev border border-border text-text-pri'
                : 'bg-transparent border border-border text-text-dim hover:text-text-mut'
            }`}
          >
            {db}.db
          </button>
        ))}
        <span className="ml-auto text-[10px] text-text-dim font-mono">
          {buckets.length} bucket{buckets.length === 1 ? '' : 's'} · {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {loading ? (
        <div className="text-[12px] text-text-dim py-4">Loading {activeDB}.db…</div>
      ) : buckets.length === 0 ? (
        <div className="text-[12px] text-text-dim py-4 text-center">No buckets found in {activeDB}.db</div>
      ) : (
        <div className="space-y-1 max-h-[55vh] overflow-y-auto">
          {buckets.map((b) => {
            const isOpen = expandedBucket === b.name;
            const entries = b.entries ?? [];
            const filtered = search.trim()
              ? entries.filter(
                  (e) =>
                    e.key.toLowerCase().includes(search.toLowerCase()) ||
                    e.value.toLowerCase().includes(search.toLowerCase()),
                )
              : entries;
            return (
              <div key={b.name} className="rounded border border-border overflow-hidden">
                <div className={`flex items-center gap-2 px-3 py-2 text-[12px] transition-colors ${
                  isOpen ? 'bg-elev text-text-pri' : 'hover:bg-elev/50 text-text-mut'
                }`}>
                  <button type="button" onClick={() => toggleBucket(b.name)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <span className="text-[14px]">{isOpen ? '📂' : '📁'}</span>
                    <span className="font-mono">{b.name}</span>
                    <span className="text-[10px] text-text-dim font-mono ml-auto">{b.count}</span>
                  </button>
                  {!isReadonly && (
                    pendingDeleteBucket === b.name ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-danger">Delete?</span>
                        <button type="button" onClick={() => void handleDeleteBucket(b.name)} className="text-[10px] text-danger font-semibold px-1">Yes</button>
                        <button type="button" onClick={() => setPendingDeleteBucket(null)} className="text-[10px] text-text-dim px-1">No</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteBucket(b.name)}
                        className="shrink-0 text-danger/50 hover:text-danger transition-colors p-0.5"
                        title="Delete entire bucket"
                      >
                        <Trash2 size={11} />
                      </button>
                    )
                  )}
                </div>
                {isOpen && (
                  <div className="bg-bg border-t border-border">
                    {entries.length > 10 && (
                      <div className="p-2 border-b border-border">
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Filter keys/values…"
                          className="w-full bg-elev border border-border rounded text-[11px] px-2 py-1 text-text-pri focus:outline-none focus:border-accent"
                        />
                      </div>
                    )}
                    {entries.length === 0 ? (
                      <div className="text-[11px] text-text-dim py-3 text-center">Empty bucket</div>
                    ) : filtered.length === 0 ? (
                      <div className="text-[11px] text-text-dim py-3 text-center">No matches</div>
                    ) : (
                      <div className="max-h-[40vh] overflow-y-auto">
                        <table className="w-full text-[11px]">
                          <thead className="sticky top-0 bg-surface border-b border-border">
                            <tr className="text-text-dim uppercase tracking-wide text-[9px]">
                              <th className="text-left py-1.5 px-3 font-medium w-[35%]">Key</th>
                              <th className="text-left py-1.5 px-3 font-medium">Value</th>
                              {!isReadonly && <th className="py-1.5 px-1 font-medium w-14"></th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {filtered.slice(0, 100).map((kv, i) => {
                              const rowKey = `${b.name}::${kv.key}`;
                              const isEditing = editingKey === rowKey;
                              return (
                                <tr key={`${kv.key}-${i}`} className="hover:bg-elev/30 transition-colors group">
                                  <td className="py-1.5 px-3 font-mono text-text-pri break-all align-top text-[10px]">
                                    {kv.key}
                                  </td>
                                  <td className="py-1.5 px-3 font-mono text-text-mut break-all align-top text-[10px]">
                                    {isEditing ? (
                                      <div className="flex gap-1">
                                        <input
                                          type="text"
                                          value={editValue}
                                          onChange={(ev) => setEditValue(ev.target.value)}
                                          className="flex-1 bg-elev border border-border rounded px-1.5 py-0.5 text-[10px] text-text-pri font-mono focus:outline-none focus:border-accent"
                                          autoFocus
                                          onKeyDown={(ev) => { if (ev.key === 'Enter') void handleUpdateKey(b.name, kv.key); if (ev.key === 'Escape') setEditingKey(null); }}
                                        />
                                        <button type="button" onClick={() => void handleUpdateKey(b.name, kv.key)} className="text-success text-[10px] px-1">Save</button>
                                        <button type="button" onClick={() => setEditingKey(null)} className="text-text-dim text-[10px] px-1">Cancel</button>
                                      </div>
                                    ) : kv.encrypted ? (
                                      <span className="text-warn">🔒 encrypted</span>
                                    ) : (
                                      <span className="line-clamp-2">{kv.value}</span>
                                    )}
                                  </td>
                                  {!isReadonly && (
                                    <td className="py-1.5 px-1 align-top w-14">
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {!kv.encrypted && (
                                          <button
                                            type="button"
                                            onClick={() => { setEditingKey(rowKey); setEditValue(kv.value); }}
                                            className="text-text-dim hover:text-accent p-0.5"
                                            title="Edit value"
                                          >
                                            <Pencil size={10} />
                                          </button>
                                        )}
                                        {pendingDeleteKey === rowKey ? (
                                          <div className="flex items-center gap-0.5">
                                            <button type="button" onClick={() => void handleDeleteKey(b.name, kv.key)} className="text-[9px] text-danger font-semibold px-0.5">Yes</button>
                                            <button type="button" onClick={() => setPendingDeleteKey(null)} className="text-[9px] text-text-dim px-0.5">No</button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setPendingDeleteKey(rowKey)}
                                            className="text-text-dim hover:text-danger p-0.5"
                                            title="Delete entry"
                                          >
                                            <Trash2 size={10} />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {filtered.length > 100 && (
                          <div className="text-[10px] text-text-dim py-2 text-center border-t border-border">
                            Showing first 100 of {filtered.length} matches. Use filter to narrow.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
