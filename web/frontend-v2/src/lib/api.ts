const BASE = import.meta.env.VITE_API_BASE ?? '';

export class APIError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.body = body ?? null;
  }
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: APIError };

async function request<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { ok: false, error: new APIError(res.status, text) };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { ok: false, error: new APIError(0, msg) };
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export type ValueResult<T> = { ok: true; value: T } | { ok: false; error: APIError };

export async function apiGet<T>(path: string): Promise<ValueResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, { credentials: 'include' });
    if (!res.ok) {
      return { ok: false, error: new APIError(res.status, res.statusText, await res.text()) };
    }
    return { ok: true, value: (await res.json()) as T };
  } catch (e) {
    return { ok: false, error: new APIError(0, (e as Error).message) };
  }
}

export async function apiPost<T, B = unknown>(path: string, body: B): Promise<ValueResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, error: new APIError(res.status, res.statusText, await res.text()) };
    }
    return { ok: true, value: (await res.json()) as T };
  } catch (e) {
    return { ok: false, error: new APIError(0, (e as Error).message) };
  }
}