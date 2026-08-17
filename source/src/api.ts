import type { AdminPayload, PublicPayload } from './types';

const URL_STORAGE_KEY = 'gc_tickets_apps_script_url';

/**
 * Apps Script can legitimately take a while — it waits up to 25s for the script
 * lock before giving up — so writes get a long ceiling. Without any ceiling a
 * stalled mobile connection leaves the button spinning forever with no way out.
 */
const READ_TIMEOUT_MS = 20000;
const WRITE_TIMEOUT_MS = 45000;

/** localStorage throws in some locked-down mobile browser modes. Never fatal. */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* nothing we can do, and nothing worth interrupting the user for */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Where the Apps Script web app lives. Env var wins, then a saved value. */
export function getScriptUrl(): string {
  const fromEnv = (import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined) || '';
  if (fromEnv) return fromEnv;
  return safeStorage.get(URL_STORAGE_KEY) || '';
}

export function saveScriptUrl(url: string) {
  safeStorage.set(URL_STORAGE_KEY, url.trim());
}

export function clearScriptUrl() {
  safeStorage.remove(URL_STORAGE_KEY);
}

export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

function friendlyNetworkError(err: unknown): ApiError {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new ApiError(
      'The request timed out. Check your connection and try again — if your tickets went ' +
        'through, trying again will simply show them rather than booking twice.',
      'timeout'
    );
  }
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
    const res = await fetchWithTimeout(url, { method: 'GET' }, READ_TIMEOUT_MS);
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
    const res = await fetchWithTimeout(target, { method: 'GET' }, READ_TIMEOUT_MS);
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
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      },
      WRITE_TIMEOUT_MS
    );
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
