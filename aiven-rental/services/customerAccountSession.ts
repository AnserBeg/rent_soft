export type CustomerAccount = {
  id: number;
  name: string;
  businessName?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postalCode?: string | null;
  email: string;
  phone?: string | null;
  ccLast4?: string | null;
  documents?: Record<string, any>;
};

const TOKEN_KEY = 'rentSoft.customerAccountToken';
const CUSTOMER_KEY = 'rentSoft.customerAccount';

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function getCustomerAccountToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getCustomerAccount(): CustomerAccount | null {
  const raw = localStorage.getItem(CUSTOMER_KEY);
  if (!raw) return null;
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed as CustomerAccount;
}

export function setCustomerAccountSession(session: { token: string; customer: CustomerAccount }) {
  if (!session?.token) throw new Error('Missing token');
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(session.customer));
}

export function clearCustomerAccountSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_KEY);
}

