export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const KEY = 'tvdept_admin_tokens';

function readTokens(): Tokens | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null; // storage blocked: the session simply lasts until reload
  }
}

let tokens: Tokens | null = readTokens();

export function setTokens(t: Tokens | null): void {
  tokens = t;
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const getAccess = () => tokens?.accessToken ?? null;
export const getRefresh = () => tokens?.refreshToken ?? null;

async function refresh(): Promise<boolean> {
  const rt = getRefresh();
  if (!rt) return false;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!res.ok) {
    setTokens(null);
    return false;
  }
  setTokens(await res.json());
  return true;
}

/** Fetch against the API with the bearer token; refreshes once on 401. */
export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const access = getAccess();
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && retry && (await refresh())) return api<T>(path, init, false);

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
