import { apiJson } from './rentSoftApi';

export type StorefrontListing = {
  typeId: number;
  typeName: string;
  imageUrl: string | null;
  imageUrls?: string[] | null;
  documents?: Array<{
    url: string;
    fileName?: string | null;
    mime?: string | null;
    sizeBytes?: number | null;
  }> | null;
  description: string | null;
  terms: string | null;
  categoryName: string | null;
  dailyRate: number | null;
  weeklyRate: number | null;
  monthlyRate: number | null;
  company: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    website: string | null;
    logoUrl: string | null;
    streetAddress: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    postalCode: string | null;
  };
  stock: {
    totalUnits: number;
    reservedUnits: number;
    availableUnits: number;
    locations: Array<{
      id: number;
      name: string | null;
      streetAddress: string | null;
      city: string | null;
      region: string | null;
      country: string | null;
    }>;
  };
};

export type ListStorefrontListingsResponse = { listings: StorefrontListing[] };

export async function listStorefrontListings(params: {
  equipment?: string;
  company?: string;
  location?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params.equipment) qs.set('equipment', params.equipment);
  if (params.company) qs.set('company', params.company);
  if (params.location) qs.set('location', params.location);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
  if (typeof params.offset === 'number') qs.set('offset', String(params.offset));
  const url = `/api/storefront/listings?${qs.toString()}`;
  return apiJson<ListStorefrontListingsResponse>(url);
}

export type CreateReservationPayload = {
  companyId: number;
  typeId: number;
  locationId?: number;
  startAt: string;
  endAt: string;
  quantity?: number;
  customerToken: string;
  customerNotes?: string;
};

export type CreateReservationResponse =
  | { ok: true; orderId: number; roNumber?: string; quoteNumber?: string }
  | { ok: false; status?: number; message?: string; error?: string; missingFields?: string[]; requiredFields?: string[] };

export async function createStorefrontReservation(payload: CreateReservationPayload) {
  const res = await fetch('/api/storefront/reservations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${payload.customerToken}`,
    },
    body: JSON.stringify({ ...payload, quantity: payload.quantity ?? 1 }),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (res.ok) return data as CreateReservationResponse;
  return { ok: false, status: res.status, ...data } as CreateReservationResponse;
}

export type UpdateStorefrontCustomerProfileResponse = { customer: any };

export async function updateStorefrontCustomerProfile(params: { token: string; form: FormData }) {
  return apiJson<UpdateStorefrontCustomerProfileResponse>('/api/storefront/customers/profile', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
    },
    body: params.form,
  });
}

export type UpdateCustomerAccountProfileResponse = { customer: any };

export async function updateCustomerAccountProfile(params: { token: string; form: FormData }) {
  return apiJson<UpdateCustomerAccountProfileResponse>('/api/customers/profile', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
    },
    body: params.form,
  });
}
