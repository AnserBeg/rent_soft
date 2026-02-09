import { clearCustomerAccountSession, getCustomerAccountToken } from './customerAccountSession';

export type RentSoftSession = {
  user: { id: number; name: string; email: string; role: string; companyId: number };
  company: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    streetAddress: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    postalCode: string | null;
  };
  token?: string;
  expiresAt?: string | null;
};

const SESSION_KEY = 'rentSoft.session';
const COMPANY_KEY = 'rentSoft.companyId';

function normalizeCompanyId(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function getSession(): RentSoftSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed as RentSoftSession;
}

export function setSession(session: RentSoftSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  const companyId = normalizeCompanyId((session as any)?.company?.id || (session as any)?.companyId || (session as any)?.user?.companyId);
  if (companyId) localStorage.setItem(COMPANY_KEY, String(companyId));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getCompanyId(): number | null {
  const stored = normalizeCompanyId(localStorage.getItem(COMPANY_KEY));
  if (stored) return stored;
  const session = getSession();
  return normalizeCompanyId(session?.company?.id || session?.user?.companyId);
}

export function logout() {
  const customerToken = getCustomerAccountToken();
  fetch('/api/logout', { method: 'POST' }).catch(() => {});
  if (customerToken) {
    fetch('/api/customers/logout', { method: 'POST', headers: { Authorization: `Bearer ${customerToken}` } }).catch(() => {});
  }
  clearSession();
  localStorage.removeItem(COMPANY_KEY);
  clearCustomerAccountSession();
}
