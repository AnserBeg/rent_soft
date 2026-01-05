import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ViewState, Equipment, Company } from './types';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Marketplace } from './components/Marketplace';
import { Login } from './components/Login';
import { CompanyProfile } from './components/CompanyProfile';
import { Scene3D } from './components/Scene3D';
import { DetailModal } from './components/DetailModal';
import { AnimatePresence, motion } from 'framer-motion';
import { listStorefrontListings, StorefrontListing } from './services/storefront';
import { getSession, logout, setSession as persistSession, RentSoftSession } from './services/session';

function viewFromHash(hash: string): ViewState | null {
  const cleaned = String(hash || '').replace(/^#\/?/, '').trim().toLowerCase();
  const route = cleaned.split('?')[0].split('/')[0];
  if (!route) return null;
  if (route === 'home') return 'home';
  if (route === 'marketplace') return 'marketplace';
  if (route === 'login') return 'login';
  return null;
}

function returnToFromHash(hash: string): string | null {
  const cleaned = String(hash || '');
  const idx = cleaned.indexOf('?');
  if (idx < 0) return null;
  const qs = cleaned.slice(idx + 1);
  const params = new URLSearchParams(qs);
  const returnTo = params.get('returnTo');
  if (!returnTo) return null;
  if (returnTo.startsWith('/')) return returnTo;

  // Allow absolute same-origin returnTo to support redirects back to storefront pages.
  try {
    const url = new URL(returnTo);
    if (url.origin !== window.location.origin) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hashForView(view: ViewState) {
  if (view === 'home') return '#/home';
  if (view === 'marketplace') return '#/marketplace';
  if (view === 'login') return '#/login';
  return '';
}

function formatCompanyLocation(company: StorefrontListing['company']) {
  const bits = [company.city, company.region, company.country].filter(Boolean).map(String);
  return bits.join(', ') || '—';
}

function listingToCompany(listing: StorefrontListing): Company {
  const c = listing.company;
  return {
    id: String(c.id),
    name: c.name,
    location: formatCompanyLocation(c),
    description: c.streetAddress ? `${c.streetAddress}${c.postalCode ? `, ${c.postalCode}` : ''}` : undefined,
    email: c.email,
    phone: c.phone,
    logoUrl: c.logoUrl || undefined,
  };
}

function listingToEquipment(listing: StorefrontListing): Equipment {
  const companyLocation = formatCompanyLocation(listing.company);
  const images = listing.imageUrl
    ? [listing.imageUrl]
    : [`https://picsum.photos/seed/rentsoft-${listing.typeId}/600/400`];

  return {
    id: String(listing.typeId),
    name: listing.typeName,
    category: listing.categoryName || 'Equipment',
    pricePerDay: listing.dailyRate ?? 0,
    description: listing.description || listing.terms || 'No description provided.',
    specs: {
      ...(listing.dailyRate ? { 'Daily Rate': `$${listing.dailyRate.toFixed(2)}` } : {}),
      ...(listing.weeklyRate ? { 'Weekly Rate': `$${listing.weeklyRate.toFixed(2)}` } : {}),
      ...(listing.monthlyRate ? { 'Monthly Rate': `$${listing.monthlyRate.toFixed(2)}` } : {}),
    },
    images,
    ownerId: String(listing.company.id),
    available: listing.stock.availableUnits > 0,
    location: companyLocation,
  };
}

function dateToIsoStart(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function dateToIsoEnd(dateStr: string) {
  const d = new Date(`${dateStr}T23:59:59`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function App() {
  const [view, setView] = useState<ViewState>(() => viewFromHash(window.location.hash) || 'home');
  const [items, setItems] = useState<Equipment[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [session, setSession] = useState<RentSoftSession | null>(() => getSession());
  const [loginReturnTo, setLoginReturnTo] = useState<string | null>(() => returnToFromHash(window.location.hash));
  const requestSeq = useRef(0);
  
  const [selectedItem, setSelectedItem] = useState<Equipment | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const handleSelectItem = (item: Equipment) => {
    setSelectedItem(item);
  };

  const handleViewCompany = (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    if (company) {
      setSelectedCompany(company);
      setView('companyProfile');
    }
  };

  // Helper to find owner of selected item
  const getOwnerOfSelected = () => {
    if (!selectedItem) return undefined;
    return companies.find(c => c.id === selectedItem.ownerId);
  }

  const onSearch = useCallback(
    async ({ searchText, location, startDate, endDate }: { searchText: string; location: string; startDate: string; endDate: string }) => {
      const seq = ++requestSeq.current;
      setListingsLoading(true);
      setListingsError(null);
      try {
        if (startDate && endDate) {
          const startMs = Date.parse(`${startDate}T00:00:00`);
          const endMs = Date.parse(`${endDate}T23:59:59`);
          if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
            throw new Error('Please choose a valid date range (start must be on or before end).');
          }
        }

        const from = startDate && endDate ? dateToIsoStart(startDate) : null;
        const to = startDate && endDate ? dateToIsoEnd(endDate) : null;
        const hasRange = !!(from && to);

        const term = String(searchText || '').trim();
        const loc = String(location || '').trim();

        const calls: Array<Promise<{ listings: StorefrontListing[] }>> = [];
        const base = { location: loc || undefined, from: hasRange ? from! : undefined, to: hasRange ? to! : undefined, limit: 120 };

        if (term) {
          calls.push(listStorefrontListings({ ...base, equipment: term }));
          calls.push(listStorefrontListings({ ...base, company: term }));
        } else {
          calls.push(listStorefrontListings(base));
        }

        const results = await Promise.allSettled(calls);
        const merged: StorefrontListing[] = [];
        for (const r of results) {
          if (r.status === 'fulfilled' && Array.isArray(r.value.listings)) merged.push(...r.value.listings);
        }

        const deduped = Array.from(
          new Map(merged.map((l) => [`${l.company.id}:${l.typeId}`, l])).values()
        );

        if (seq !== requestSeq.current) return;

        const nextCompanies = Array.from(
          new Map(deduped.map((l) => [String(l.company.id), listingToCompany(l)])).values()
        );
        setCompanies(nextCompanies);
        setItems(deduped.map(listingToEquipment));
      } catch (err: any) {
        if (seq !== requestSeq.current) return;
        setListingsError(err?.message ? String(err.message) : 'Unable to load listings.');
        setItems([]);
        setCompanies([]);
      } finally {
        if (seq === requestSeq.current) setListingsLoading(false);
      }
    },
    []
  );

  const onLogin = useCallback((next: RentSoftSession, returnTo?: string | null) => {
    persistSession(next);
    setSession(next);
    const target = returnTo || null;
    if (target) {
      window.location.href = target;
      return;
    }
    setView('home');
  }, []);

  const onLogout = useCallback(() => {
    logout();
    setSession(null);
    setView('home');
  }, []);

  useEffect(() => {
    const handler = () => {
      const fromHash = viewFromHash(window.location.hash);
      if (fromHash) setView(fromHash);
      setLoginReturnTo(returnToFromHash(window.location.hash));
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    const nextHash = hashForView(view);
    if (!nextHash) return;
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
  }, [view]);

  const isLoggedIn = useMemo(() => !!session?.user?.id, [session]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-brand-accent selection:text-white">
      <Scene3D />
      <Navbar
        setView={setView}
        currentView={view}
        isLoggedIn={isLoggedIn}
        userLabel={session?.user?.name || session?.user?.email || null}
        onLogout={onLogout}
      />
      
      <main className="relative">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Hero setView={setView} />
            </motion.div>
          )}

          {view === 'marketplace' && (
            <motion.div
              key="marketplace"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Marketplace 
                items={items} 
                companies={companies}
                loading={listingsLoading}
                error={listingsError}
                onSearch={onSearch}
                onSelect={handleSelectItem} 
                onViewCompany={handleViewCompany}
              />
            </motion.div>
          )}

          {view === 'companyProfile' && selectedCompany && (
             <motion.div
                key="companyProfile"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
             >
                <CompanyProfile 
                  company={selectedCompany} 
                  items={items.filter(i => i.ownerId === selectedCompany.id)}
                  onBack={() => setView('marketplace')}
                  onSelectItem={handleSelectItem}
                />
             </motion.div>
          )}

          {view === 'login' && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
            >
              <Login onLogin={onLogin} returnTo={loginReturnTo} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modal Overlay */}
      <AnimatePresence>
        {selectedItem && (
           <DetailModal 
             item={selectedItem} 
             company={getOwnerOfSelected()} 
             onClose={() => setSelectedItem(null)} 
           />
        )}
      </AnimatePresence>

      {/* Background Gradients - Adjusted for light theme */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-20">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-400/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-brand-accent/10 rounded-full blur-[100px]" />
      </div>
    </div>
  );
}

export default App;
