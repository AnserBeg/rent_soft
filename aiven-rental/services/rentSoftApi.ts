export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const CSRF_COOKIE = 'rentSoft.csrf';
const CSRF_HEADER = 'X-CSRF-Token';
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getCookieValue(name: string): string {
  if (typeof document === 'undefined') return '';
  const raw = document.cookie || '';
  if (!raw) return '';
  const parts = raw.split(';');
  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    if (String(key || '').trim() !== name) continue;
    return decodeURIComponent(rest.join('=').trim());
  }
  return '';
}

function isSameOrigin(url: string): boolean {
  try {
    const target = new URL(url, window.location.origin);
    return target.origin === window.location.origin;
  } catch {
    return false;
  }
}

function withCsrf(url: string, init: RequestInit = {}): RequestInit {
  const method = String(init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || undefined);
  const shouldAttach =
    !CSRF_SAFE_METHODS.has(method) && url.includes('/api/') && isSameOrigin(url);
  if (shouldAttach && !headers.has(CSRF_HEADER)) {
    const token = getCookieValue(CSRF_COOKIE);
    if (token) headers.set(CSRF_HEADER, token);
  }
  return { ...init, headers };
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, withCsrf(url, init || {}));
}

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof (data as any)?.error === 'string'
        ? (data as any).error
        : typeof (data as any)?.message === 'string'
          ? (data as any).message
          : `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}
