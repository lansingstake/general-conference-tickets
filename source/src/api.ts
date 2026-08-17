import type { AdminPayload, PublicPayload } from './types';

const URL_STORAGE_KEY = 'gc_tickets_apps_script_url';

/** Where the Apps Script web app lives. Env var wins, then a saved value. */
export function getScriptUrl(): string {
  const fromEnv = (import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined) || '';
  if (fromEnv) return fromEnv;
  return localStorage.getItem(URL_STORAGE_KEY) || '';
}

export function saveScriptUrl(url: string) {
  localStorage.setItem(URL_STORAGE_KEY, url.trim());
}

export function clearScriptUrl() {
  localStorage.removeItem(URL_STORAGE_KEY);
}

export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

function friendlyNetworkError(err: unknown): ApiError {
  const raw = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return new ApiError(
      'Could not reach the Google Apps Script. Check that the web app is deployed with ' +
        '"Execute as: Me" and "Who has access: Anyone".',
      'network'
    );
  }
  return new ApiError(raw);
}

export async function fetchPublic(url: string): Promise<PublicPayload> {
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new ApiError(`Server responded with ${res.status}.`);
    const data = await res.json();
    if (data.status === 'error') throw new ApiError(data.message, data.code);
    return data as PublicPayload;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw friendlyNetworkError(err);
  }
}

export async function fetchAdmin(url: string, passcode: string): Promise<AdminPayload> {
  const target = `${url}${url.includes('?') ? '&' : '?'}admin=1&passcode=${encodeURIComponent(passcode)}`;
  try {
    const res = await fetch(target, { method: 'GET' });
    if (!res.ok) throw new ApiError(`Server responded with ${res.status}.`);
    const data = await res.json();
    if (data.status === 'error') throw new ApiError(data.message, data.code);
    return data as AdminPayload;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw friendlyNetworkError(err);
  }
}

/**
 * Apps Script rejects a CORS preflight, so the body goes out as text/plain.
 * The script parses it as JSON regardless.
 */
export async function post<T = any>(url: string, payload: Record<string, unknown>): Promise<T> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new ApiError(`Server responded with ${res.status}.`);
    const data = await res.json();
    if (data.status === 'error') throw new ApiError(data.message, data.code);
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw friendlyNetworkError(err);
  }
}

/** Stable id for a submission so a double-click can't book twice. */
export function newToken(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
