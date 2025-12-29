export interface DateRange {
  start: string; // ISO Date string YYYY-MM-DD
  end: string;
}

export interface Company {
  id: string;
  name: string;
  description?: string;
  location?: string;
  rating?: number;
  joinedDate?: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
}

export interface Equipment {
  id: string;
  name: string;
  category: string;
  pricePerDay: number;
  description: string;
  specs: Record<string, string>;
  images: string[];
  ownerId: string;
  available: boolean;
  location: string;
  unavailableDates?: DateRange[];
}

export interface User {
  id: string;
  name: string;
  companyName: string;
  type: 'renter' | 'owner' | 'both';
}

export type ViewState = 'home' | 'marketplace' | 'login' | 'details' | 'companyProfile';

export interface GeneratedListingData {
  description: string;
  suggestedPrice: number;
  specs: Record<string, string>;
  category: string;
}
