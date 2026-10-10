import { useEffect, useState, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="0.5" y="0.5" width="15" height="15" rx="3" fill="none" stroke="var(--warn)" />
      <path d="M4 11 L7 5 L4 5" fill="none" stroke="var(--warn)" strokeWidth="1.2" />
      <path d="M9 11 H13" stroke="var(--text-pri)" strokeWidth="1.2" />
    </svg>
  );
}

function readAuthError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const err = params.get('auth_error');
  if (err) {
    params.delete('auth_error');
    const q = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : ''));
  }
  return err;
}

/** Full-page sign-in. SSO is the main path; a password form serves local or break-glass accounts. */
export function SignInPage({ onClose }: { onClose?: () => void }) {
  const config = useAuthStore((s) => s.config);
  const expired = useAuthStore((s) => s.expired);
  const signIn = useAuthStore((s) => s.signIn);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showLocal, setShowLocal] = useState(false);

  useEffect(() => {
    const err = readAuthError();
    if (err) setError(err);
  }, []);

  const providers = config?.sso.providers ?? [];
  const ssoOn = providers.length > 0;
  const local = config?.local ?? 'all';
  const localVisible = local !== 'off' && (!ssoOn || showLocal);
  const routable = providers.some((p) => (p.domains ?? []).length > 0);
  const [workEmail, setWorkEmail] = useState('');

  const startSSO = (id: string) => {
    window.location.assign(`/api/auth/sso/${encodeURIComponent(id)}/start`);
  };

  const routeByEmail = () => {
    const domain = workEmail.trim().toLowerCase().split('@')[1] ?? '';
    const match = providers.find((p) => (p.domains ?? []).some((d) => d.replace(/^@/, '').toLowerCase() === domain));
    if (match) {
      startSSO(match.id);
    } else {
      setError(domain ? `No sign-in provider is set up for ${domain}. Choose one below or ask your administrator.` : 'Enter your work email.');
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const err = await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
  };

  const field = 'w-full h-9 px-3 rounded-md bg-bg border border-border text-[13px] text-text-pri focus:outline-none focus:border-accent';

  let body: ReactNode = null;
  if (localVisible) {
    body = (
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {ssoOn && (
          <p className="text-[12px] text-warn bg-warn-ink rounded-md px-3 py-2 leading-relaxed">
            Break-glass access. Only the local administrator can sign in here while single sign-on is on, and every use is audited.
          </p>
        )}
        <label className="block space-y-1">
          <span className="text-[12px] text-text-mut">Email</span>
          <input className={field} autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] text-text-mut">Password</span>
          <input className={field} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" disabled={busy || !email || !password} className="w-full h-9 rounded-md bg-elev border border-border text-[13px] text-text-pri hover:border-text-dim disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    );
  }

  return (
    <div className="fixed inset-0 z-[9500] bg-bg flex items-center justify-center p-6">
      <div className="w-full max-w-[360px] space-y-6">
        <div className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[17px] font-semibold text-text-pri">CloudTerm</span>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <div className="space-y-1">
            <h1 className="text-[15px] font-semibold text-text-pri">Sign in</h1>
            <p className="text-[12px] text-text-mut">
              {expired ? 'Your session ended. Sign in again to continue.' : 'Sessions are recorded in the audit log.'}
            </p>
          </div>
          {error && <p role="alert" className="text-[12px] text-danger leading-relaxed">{error}</p>}
          {ssoOn && routable && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); routeByEmail(); }}>
              <input
                className={field}
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                aria-label="Work email"
                value={workEmail}
                onChange={(e) => setWorkEmail(e.target.value)}
              />
              <button type="submit" className="h-9 px-3 rounded-md bg-text-pri text-bg text-[13px] font-medium shrink-0 hover:opacity-90">
                Continue
              </button>
            </form>
          )}
          {ssoOn && (
            <div className="space-y-2">
              {routable && <div className="text-[11px] text-text-dim text-center">or choose your provider</div>}
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => startSSO(p.id)}
                  className="w-full h-10 rounded-md border border-border bg-elev text-[13px] text-text-pri hover:border-text-dim flex items-center justify-center gap-2"
                >
                  Continue with {p.label}
                  <span className="text-[10px] font-mono text-text-dim uppercase">{p.type}</span>
                </button>
              ))}
            </div>
          )}
          {body}
          {ssoOn && local !== 'off' && !showLocal && (
            <button type="button" onClick={() => setShowLocal(true)} className="w-full text-center text-[12px] text-text-dim hover:text-text-mut">
              Break-glass administrator
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} className="w-full text-center text-[12px] text-text-dim hover:text-text-mut">
              Cancel
            </button>
          )}
        </div>
        {config && (
          <p className="text-[11px] text-text-dim text-center">
            Sessions last up to {config.session_hours} hours and end after {config.idle_minutes} minutes idle.
          </p>
        )}
      </div>
    </div>
  );
}

/** Holds the desk until the server says who you are, and requires sign-in when the deployment does. */
export function AuthGate({ children }: { children: ReactNode }) {
  const ready = useAuthStore((s) => s.ready);
  const config = useAuthStore((s) => s.config);
  const me = useAuthStore((s) => s.me);
  const signInOpen = useAuthStore((s) => s.signInOpen);
  const setSignInOpen = useAuthStore((s) => s.setSignInOpen);
  const load = useAuthStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready) return null;
  if (config?.required && !me) return <SignInPage />;
  return (
    <>
      {children}
      {signInOpen && <SignInPage onClose={() => setSignInOpen(false)} />}
    </>
  );
}
