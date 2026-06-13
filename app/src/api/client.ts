import { API_BASE_URL } from '../config';
import { getAccess, getRefresh, setTokens } from '../auth/tokens';

async function tryRefresh(): Promise<boolean> {
  const rt = getRefresh();
  if (!rt) return false;
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  await setTokens(data.accessToken, data.refreshToken);
  return true;
}

/** Typed fetch against the API: adds the bearer token and refreshes once on 401. */
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const access = getAccess();
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401 && retry && (await tryRefresh())) {
    return apiRequest<T>(path, init, false);
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}
