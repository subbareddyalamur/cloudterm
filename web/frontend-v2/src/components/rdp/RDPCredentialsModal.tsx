import { useState, useCallback, useMemo } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ChevronDown, Check } from 'lucide-react';
import { Dialog } from '@/components/primitives/Dialog';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { api } from '@/lib/api';
import type { Instance } from '@/stores/instances';

const MATCH_RULES = [
  { type: 'instance', label: 'This instance only' },
  { type: 'substring', label: 'Name contains (substring)' },
  { type: 'pattern', label: 'Name pattern (glob)' },
  { type: 'environment', label: 'Environment' },
  { type: 'account', label: 'Account' },
  { type: 'global', label: 'All instances' },
] as const;

type MatchRuleType = (typeof MATCH_RULES)[number]['type'];

const SECURITY_OPTIONS = [
  { value: 'any', label: 'Security: Auto (any)' },
  { value: 'nla', label: 'Security: NLA' },
  { value: 'tls', label: 'Security: TLS' },
  { value: 'rdp', label: 'Security: RDP' },
] as const;

type SecurityType = (typeof SECURITY_OPTIONS)[number]['value'];

export interface RDPCredentials {
  username: string;
  password: string;
  security: SecurityType;
  record: boolean;
  saveToVault: boolean;
  vaultRule?: {
    type: MatchRuleType;
    value: string;
    label: string;
  };
  vaultEntryId?: string;
}

export interface RDPCredentialsModalProps {
  open: boolean;
  instance: Instance;
  onSubmit: (creds: RDPCredentials) => void;
  onCancel: () => void;
}

interface VaultMatchEntry {
  rule: { id: string; label: string };
  credential: { username: string };
}

function MatchRuleSelect({
  value,
  onChange,
}: {
  value: MatchRuleType;
  onChange: (v: MatchRuleType) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const selected = MATCH_RULES.find((r) => r.type === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setDropdownOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-elev text-text-pri text-[12px] font-medium hover:border-accent/50 transition-colors"
      >
        <span>{selected?.label ?? 'Select rule'}</span>
        <ChevronDown size={13} className={`text-text-dim transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
      </button>
      {dropdownOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
          <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-border bg-surface shadow-xl overflow-hidden">
            {MATCH_RULES.map((rule) => (
              <button
                key={rule.type}
                type="button"
                onClick={() => {
                  onChange(rule.type);
                  setDropdownOpen(false);
                }}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left transition-colors
                  ${value === rule.type ? 'bg-accent/15 text-accent font-medium' : 'text-text-mut hover:bg-elev hover:text-text-pri'}
                `}
              >
                {value === rule.type && <Check size={12} className="shrink-0" />}
                <span className={value === rule.type ? '' : 'ml-5'}>{rule.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function RDPCredentialsModal({ open, instance, onSubmit, onCancel }: RDPCredentialsModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [security, setSecurity] = useState<SecurityType>('any');
  const [record, setRecord] = useState(false);
  const [saveToVault, setSaveToVault] = useState(false);
  const [matchRule, setMatchRule] = useState<MatchRuleType>('instance');
  const [matchValue, setMatchValue] = useState('');
  const [vaultLabel, setVaultLabel] = useState('');
  const [vaultEntryId, setVaultEntryId] = useState<string | undefined>(undefined);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<'idle' | 'found' | 'none'>('idle');
  const [error, setError] = useState<string | null>(null);

  const defaultMatchValue = useMemo(() => {
    switch (matchRule) {
      case 'instance': return instance.instance_id;
      case 'substring': return instance.name;
      case 'pattern': return `*${instance.name.split('-').slice(0, 2).join('-')}*`;
      case 'environment': return instance.tag2_value ?? '';
      case 'account': return instance.account_id;
      case 'global': return '*';
      default: return '';
    }
  }, [matchRule, instance]);

  const matchValueEditable = matchRule !== 'instance' && matchRule !== 'global';

  const handleVaultLookup = useCallback(async () => {
    setVaultLoading(true);
    setVaultStatus('idle');
    const params = new URLSearchParams({
      instance_id: instance.instance_id,
      name: instance.name,
      env: instance.tag2_value ?? '',
      account: instance.account_id,
    });
    const matchRes = await api.get<VaultMatchEntry>(`/vault/match?${params.toString()}`);
    if (!matchRes.ok || !matchRes.data) {
      setVaultLoading(false);
      setVaultStatus('none');
      return;
    }
    // Fetch the full entry (with real decrypted password) via resolve endpoint
    const resolveRes = await api.get<VaultMatchEntry>(`/vault/credentials?resolve=${encodeURIComponent(matchRes.data.rule.id)}`);
    setVaultLoading(false);
    if (resolveRes.ok && resolveRes.data) {
      setUsername(resolveRes.data.credential.username);
      setPassword((resolveRes.data.credential as Record<string, string>).password ?? '');
      setVaultEntryId(resolveRes.data.rule.id);
      setVaultStatus('found');
    } else {
      setVaultStatus('none');
    }
  }, [instance]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!username.trim()) {
        setError('Username is required');
        return;
      }
      if (!password && vaultStatus !== 'found') {
        setError('Password is required');
        return;
      }
      setError(null);
      onSubmit({
        username: username.trim(),
        password,
        security,
        record,
        saveToVault,
        vaultRule: saveToVault
          ? {
              type: matchRule,
              value: matchValueEditable ? (matchValue || defaultMatchValue) : defaultMatchValue,
              label: vaultLabel.trim() || `${instance.name} (${matchRule})`,
            }
          : undefined,
        vaultEntryId,
      });
    },
    [username, password, security, record, saveToVault, vaultEntryId, onSubmit, vaultStatus, matchRule, matchValue, defaultMatchValue, matchValueEditable, vaultLabel, instance.name],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) onCancel(); }}
      title={`Connect to ${instance.name}`}
      size="sm"
      footer={
        <div className="flex gap-2 w-full">
          <Button
            variant="primary"
            size="sm"
            type="submit"
            form="rdp-creds-form"
            className="flex-1"
          >
            Connect
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        </div>
      }
    >
      <form id="rdp-creds-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="rdp-username" className="text-[12px] text-text-dim font-medium">
            Username
          </label>
          <Input
            id="rdp-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="DOMAIN\username or username"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="rdp-password" className="text-[12px] text-text-dim font-medium">
            Password
          </label>
          <Input
            id="rdp-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder={vaultStatus === 'found' ? 'Using saved credential' : 'Password'}
            disabled={false}
            rightIcon={
              <button
                type="button"
                className="pointer-events-auto text-text-dim hover:text-text-pri transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="rdp-security" className="text-[12px] text-text-dim font-medium">
            Security
          </label>
          <select
            id="rdp-security"
            value={security}
            onChange={(e) => setSecurity(e.target.value as SecurityType)}
            className="w-full px-3 py-2 rounded-md border border-border bg-elev text-text-pri text-[12px] font-medium outline-none focus:border-accent/50 transition-colors"
          >
            {SECURITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-[12px] cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-border accent-[#F87171]"
            checked={record}
            onChange={(e) => setRecord(e.target.checked)}
          />
          <span className="w-2 h-2 rounded-full bg-danger inline-block" aria-hidden="true" />
          <span className="text-text-dim font-medium">Record this session</span>
        </label>

        {error && <p className="text-[12px] text-danger">{error}</p>}

        <div className="flex items-center justify-between pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<KeyRound size={13} />}
            loading={vaultLoading}
            onClick={handleVaultLookup}
          >
            Use Vault
          </Button>
          {vaultStatus === 'found' && (
            <span className="text-[11px] text-success">Vault credentials applied</span>
          )}
          {vaultStatus === 'none' && (
            <span className="text-[11px] text-text-dim">No vault match</span>
          )}
        </div>

        {/* ── Save to Vault ── */}
        <label className="flex items-center gap-2 text-[12px] text-text-dim cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-border accent-accent"
            checked={saveToVault}
            onChange={(e) => setSaveToVault(e.target.checked)}
          />
          <Lock size={12} className="text-accent" />
          <span className="font-medium text-text-pri">Save to Vault</span>
        </label>

        {saveToVault && (
          <div
            className="flex flex-col gap-3 pl-1 border-l-2 border-accent/30 ml-1 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-widest text-text-dim font-semibold">Match Rule</span>
              <MatchRuleSelect value={matchRule} onChange={(v) => { setMatchRule(v); setMatchValue(''); }} />
            </div>

            <div className="flex flex-col gap-1">
              <Input
                value={matchValueEditable ? (matchValue || defaultMatchValue) : defaultMatchValue}
                onChange={(e) => matchValueEditable ? setMatchValue(e.target.value) : undefined}
                readOnly={!matchValueEditable}
                className={!matchValueEditable ? 'opacity-60 cursor-default' : ''}
                placeholder={matchRule === 'substring' ? 'e.g. windows' : matchRule === 'pattern' ? 'e.g. *-windows-*' : ''}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Input
                value={vaultLabel}
                onChange={(e) => setVaultLabel(e.target.value)}
                placeholder="Label (e.g. Dev Windows)"
              />
            </div>
          </div>
        )}
      </form>
    </Dialog>
  );
}

RDPCredentialsModal.displayName = 'RDPCredentialsModal';
