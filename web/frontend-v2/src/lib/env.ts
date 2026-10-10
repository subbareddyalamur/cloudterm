export type Env = 'prod' | 'staging' | 'dev' | 'test' | 'uat' | 'qa' | 'other';

export interface EnvStyle {
  color: string;
  width: number;
}

export const ENV_STYLES: Record<Env, EnvStyle> = {
  prod:    { color: 'var(--danger)',   width: 4 },
  staging: { color: 'var(--warn)',     width: 3 },
  dev:     { color: 'var(--success)',  width: 2 },
  test:    { color: 'var(--info)',     width: 2 },
  uat:     { color: 'var(--accent-2)', width: 3 },
  qa:      { color: 'var(--accent-2)', width: 2 },
  other:   { color: 'var(--border)',   width: 1 },
};

/**
 * Text color for an environment label on the desk. Production is amber, the
 * same color as the session frame; red stays reserved for errors and End.
 */
export function envTone(env: string): string {
  const e = env.toLowerCase();
  if (!e) return 'text-text-dim';
  if (e.includes('prod') || e === 'prd') return 'text-warn';
  if (e.includes('val') || e.includes('uat') || e.includes('stag') || e.includes('test') || e.includes('qa')) return 'text-info';
  if (e.includes('dev') || e.includes('sandbox')) return 'text-success';
  return 'text-text-mut';
}

export function detectEnv(tags: Record<string, string>): Env {
  const t = (
    tags['Environment'] ??
    tags['environment'] ??
    tags['Env'] ??
    tags['env'] ??
    ''
  ).toLowerCase();
  if (t.includes('prod')) return 'prod';
  if (t.includes('stag')) return 'staging';
  if (t.includes('dev'))  return 'dev';
  if (t.includes('test')) return 'test';
  if (t.includes('uat'))  return 'uat';
  if (t.includes('qa'))   return 'qa';
  return 'other';
}
