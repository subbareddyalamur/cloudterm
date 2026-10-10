import { create } from 'zustand';

export type Role = 'admin' | 'operator' | 'viewer';

export interface Me {
  user_id: string;
  email: string;
  name?: string;
  role: Role;
  tenant_id: string;
  method: 'password' | 'break_glass' | 'sso';
  expires_at: number;
}

export interface SSOProvider {
  id: string;
  label: string;
  type: 'saml' | 'oidc';
  domains?: string[];
}

export interface AuthConfig {
  required: boolean;
  local: 'all' | 'admin' | 'off';
  sso: { enabled: boolean; providers: SSOProvider[] };
  session_hours: number;
  idle_minutes: number;
  aws_access_mode: 'hub' | 'profiles';
}

interface AuthState {
  ready: boolean;
  config: AuthConfig | null;
  me: Me | null;
  /** True when the server rejected a request because the session ended. */
  expired: boolean;
  signInOpen: boolean;
  load: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  setSignInOpen: (open: boolean) => void;
  markExpired: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  ready: false,
  config: null,
  me: null,
  expired: false,
  signInOpen: false,

  load: async () => {
    const [cfgRes, meRes] = await Promise.all([
      fetch('/api/auth/config').catch(() => null),
      fetch('/api/auth/me').catch(() => null),
    ]);
    const config = cfgRes?.ok ? ((await cfgRes.json()) as AuthConfig) : null;
    const me = meRes?.ok ? ((await meRes.json()) as Me) : null;
    set({ config, me, ready: true, expired: false });
  },

  signIn: async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return body?.error ?? 'That email and password were not accepted.';
    }
    await get().load();
    set({ signInOpen: false });
    return null;
  },

  signOut: async () => {
    // A full-page navigation lets the server continue to the IdP's own
    // logout (SAML SLO / OIDC end_session) after ending the local session.
    window.location.assign('/api/auth/logout');
  },

  setSignInOpen: (open) => set({ signInOpen: open }),

  markExpired: () => {
    if (get().config?.required) set({ me: null, expired: true });
  },
}));

let installed = false;

/** Any 401 from the server means the session ended; show the sign-in page. */
export function installSessionWatch() {
  if (installed) return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await original(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (res.status === 401 && !url.includes('/api/auth/')) {
      useAuthStore.getState().markExpired();
    }
    return res;
  };
}
