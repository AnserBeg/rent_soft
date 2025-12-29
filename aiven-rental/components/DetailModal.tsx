import React, { useEffect, useState } from 'react';
import { Equipment, Company } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, CheckCircle, AlertCircle, Star, Calendar, ShieldCheck, Truck, ArrowLeft, Mail, Phone, User, Home, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { createStorefrontReservation, updateCustomerAccountProfile } from '../services/storefront';
import { clearCustomerAccountSession, getCustomerAccount, getCustomerAccountToken, setCustomerAccountSession } from '../services/customerAccountSession';

interface DetailModalProps {
  item: Equipment;
  company?: Company;
  onClose: () => void;
}

type ContactRow = {
  name: string;
  email: string;
  phone: string;
};

type CoverageRow = {
  day: string;
  start: string;
  end: string;
};

const coverageDayOptions = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const defaultContactRow = (): ContactRow => ({ name: '', email: '', phone: '' });
const defaultCoverageRow = (): CoverageRow => ({ day: 'mon', start: '', end: '' });

const isContactRowValid = (contact: ContactRow) => {
  const name = String(contact.name || '').trim();
  const email = String(contact.email || '').trim();
  const phone = String(contact.phone || '').trim();
  return Boolean(name && (email || phone));
};

const normalizeContactList = (contacts: ContactRow[]) =>
  contacts
    .map((contact) => ({
      name: String(contact.name || '').trim(),
      email: String(contact.email || '').trim(),
      phone: String(contact.phone || '').trim(),
    }))
    .filter((contact) => isContactRowValid(contact));

const coverageRowsToPayload = (rows: CoverageRow[]) => {
  const payload: Record<string, { start: string; end: string }> = {};
  rows.forEach((row) => {
    const start = String(row.start || '').trim();
    const end = String(row.end || '').trim();
    const dayKey = String(row.day || 'mon').trim() || 'mon';
    if (start && end) {
      payload[dayKey] = { start, end };
    }
  });
  return payload;
};

const hasCoverageHours = (rows: CoverageRow[]) =>
  rows.some((row) => String(row.start || '').trim() && String(row.end || '').trim());

export const DetailModal: React.FC<DetailModalProps> = ({ item, company, onClose }) => {
  const [step, setStep] = useState<'details' | 'auth' | 'form' | 'profile' | 'success'>('details');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reservationRef, setReservationRef] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [companyLogoFailed, setCompanyLogoFailed] = useState(false);
  const [missingProfileFields, setMissingProfileFields] = useState<string[]>([]);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileValues, setProfileValues] = useState({
    businessName: '',
    phone: '',
    streetAddress: '',
    city: '',
    region: '',
    postalCode: '',
    country: '',
    creditCardNumber: '',
  });
  const [profileFiles, setProfileFiles] = useState<{
    reference1: File | null;
    reference2: File | null;
    proofOfInsurance: File | null;
    driversLicense: File | null;
  }>({
    reference1: null,
    reference2: null,
    proofOfInsurance: null,
    driversLicense: null,
  });
  
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    deliveryMethod: 'pickup' as 'pickup' | 'delivery',
    deliveryAddress: '',
    criticalAreas: '',
    generalNotes: '',
  });

  const [emergencyContacts, setEmergencyContacts] = useState<ContactRow[]>([defaultContactRow()]);
  const [siteContacts, setSiteContacts] = useState<ContactRow[]>([defaultContactRow()]);
  const [coverageRows, setCoverageRows] = useState<CoverageRow[]>([defaultCoverageRow()]);

  const updateContactRow = (
    index: number,
    setter: React.Dispatch<React.SetStateAction<ContactRow[]>>,
    value: string,
    field: keyof ContactRow
  ) => {
    setter((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row))
    );
  };

  const removeContactRow = (
    index: number,
    setter: React.Dispatch<React.SetStateAction<ContactRow[]>>,
    current: ContactRow[]
  ) => {
    if (current.length <= 1) return;
    setter(current.filter((_, idx) => idx !== index));
  };

  const addContactRow = (setter: React.Dispatch<React.SetStateAction<ContactRow[]>>) =>
    setter((prev) => [...prev, defaultContactRow()]);

  const updateCoverageRow = (
    index: number,
    field: keyof CoverageRow,
    value: string
  ) => {
    setCoverageRows((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row))
    );
  };

  const addCoverageRow = () =>
    setCoverageRows((prev) => [
      ...prev,
      {
        ...defaultCoverageRow(),
        day: coverageDayOptions[prev.length % coverageDayOptions.length].key,
      },
    ]);

  const removeCoverageRow = (index: number) => {
    setCoverageRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  useEffect(() => {
    setCompanyLogoFailed(false);
  }, [company?.id, company?.logoUrl]);

  const dateToIsoStart = (dateStr: string) => {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const dateToIsoEnd = (dateStr: string) => {
    const d = new Date(`${dateStr}T23:59:59`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const profileLabel = (key: string) => {
    const labels: Record<string, string> = {
      businessName: 'Business name',
      phone: 'Phone',
      streetAddress: 'Street address',
      city: 'City',
      region: 'Province / State',
      postalCode: 'Postal code',
      country: 'Country',
      creditCardNumber: 'Credit card',
      reference1: 'Reference #1',
      reference2: 'Reference #2',
      proofOfInsurance: 'Proof of insurance',
      driversLicense: "Driver's license",
    };
    return labels[key] || key;
  };

  const seedProfileFromSession = (companyId: number) => {
    const customer = getCustomerAccount() as any;
    setProfileValues({
      businessName: String(customer?.businessName || ''),
      phone: String(customer?.phone || ''),
      streetAddress: String(customer?.streetAddress || ''),
      city: String(customer?.city || ''),
      region: String(customer?.region || ''),
      postalCode: String(customer?.postalCode || ''),
      country: String(customer?.country || ''),
      creditCardNumber: '',
    });
    setProfileFiles({
      reference1: null,
      reference2: null,
      proofOfInsurance: null,
      driversLicense: null,
    });
  };

  const openProfileStep = (companyId: number, fields: string[]) => {
    setMissingProfileFields(fields);
    setProfileError(null);
    seedProfileFromSession(companyId);
    setStep('profile');
  };

  const submitReservation = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (!company) throw new Error('Missing company information.');
      const companyId = Number(company.id);
      const typeId = Number(item.id);
      if (!Number.isFinite(companyId) || companyId <= 0) throw new Error('Invalid company id.');
      if (!Number.isFinite(typeId) || typeId <= 0) throw new Error('Invalid equipment type id.');

      const token = getCustomerAccountToken();
      const customer = token ? getCustomerAccount() : null;
      if (!token || !customer) throw new Error('Please log in or create a customer account before requesting a booking.');

      const startAt = dateToIsoStart(formData.startDate);
      const endAt = dateToIsoEnd(formData.endDate);
      if (!startAt || !endAt) throw new Error('Please select valid rental dates.');

      const criticalAreas = String(formData.criticalAreas || '').trim();
      const generalNotes = String(formData.generalNotes || '').trim();
      const sanitizedEmergencyContacts = normalizeContactList(emergencyContacts);
      const sanitizedSiteContacts = normalizeContactList(siteContacts);
      const coveragePayload = coverageRowsToPayload(coverageRows);
      if (
        !criticalAreas ||
        !generalNotes ||
        !sanitizedEmergencyContacts.length ||
        !sanitizedSiteContacts.length ||
        !Object.keys(coveragePayload).length
      ) {
        throw new Error('Please complete the rental information before submitting your booking request.');
      }

      const notes = [
        `Fulfillment: ${formData.deliveryMethod}`,
        formData.deliveryMethod === 'delivery' && formData.deliveryAddress ? `Delivery address: ${formData.deliveryAddress}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const result = await createStorefrontReservation({
        companyId,
        typeId,
        startAt,
        endAt,
        customerToken: token,
        customerNotes: notes || undefined,
        criticalAreas,
        generalNotes,
        emergencyContacts: sanitizedEmergencyContacts,
        siteContacts: sanitizedSiteContacts,
        coverageHours: coveragePayload,
      });

      if (!result || (result as any).ok !== true) {
        const missing = (result as any)?.missingFields;
        if ((result as any)?.error === 'missing_profile_fields' && Array.isArray(missing) && missing.length) {
          openProfileStep(companyId, missing.map(String));
          return;
        }
        throw new Error((result as any)?.message || (result as any)?.error || 'Request failed.');
      }

      const ref = (result as any).roNumber ? `Request ${(result as any).roNumber}` : `Request #${(result as any).orderId}`;
      setReservationRef(ref);
      setStep('success');
    } catch (err: any) {
      setSubmitError(err?.message ? String(err.message) : 'Request failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitReservation();
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    const companyId = Number(company.id);
    if (!Number.isFinite(companyId) || companyId <= 0) return;

    const token = getCustomerAccountToken();
    if (!token) return;

    setIsProfileSaving(true);
    setProfileError(null);
    try {
      const form = new FormData();
      form.set('companyId', String(companyId));
      form.set('submissionId', (crypto?.randomUUID?.() || String(Date.now())));

      for (const field of missingProfileFields) {
        if (field in profileFiles) {
          const file = (profileFiles as any)[field] as File | null;
          if (!file) throw new Error(`${profileLabel(field)} is required.`);
          form.append(field, file);
          continue;
        }

        const value = (profileValues as any)[field];
        if (!value || !String(value).trim()) throw new Error(`${profileLabel(field)} is required.`);
        form.set(field, String(value));
      }

      const updated = await updateCustomerAccountProfile({ token, form });
      if (updated?.customer) {
        setCustomerAccountSession({ token, customer: updated.customer });
      }

      await submitReservation();
    } catch (err: any) {
      setProfileError(err?.message ? String(err.message) : 'Unable to save profile.');
    } finally {
      setIsProfileSaving(false);
    }
  };

  const sanitizedEmergencyContacts = normalizeContactList(emergencyContacts);
  const sanitizedSiteContacts = normalizeContactList(siteContacts);
  const criticalAreasFilled = String(formData.criticalAreas || '').trim();
  const generalNotesFilled = String(formData.generalNotes || '').trim();
  const coverageValid = hasCoverageHours(coverageRows);
  const deliveryAddressFilled = String(formData.deliveryAddress || '').trim();
  const hasRentalInfo =
    Boolean(criticalAreasFilled && generalNotesFilled && sanitizedEmergencyContacts.length && sanitizedSiteContacts.length && coverageValid);
  const hasDates = Boolean(formData.startDate && formData.endDate);
  const hasFulfillment = formData.deliveryMethod === 'pickup' || Boolean(deliveryAddressFilled);
  const isFormValid = Boolean(hasDates && hasFulfillment && hasRentalInfo);
  const companyIdNum = company ? Number(company.id) : null;
  const storefrontCustomer = getCustomerAccount();

  const scrollImage = (direction: 'next' | 'prev') => {
      const container = document.getElementById('modal-gallery-container');
      if (container) {
          const width = container.offsetWidth;
          const newIndex = direction === 'next' 
            ? Math.min(item.images.length - 1, currentImageIndex + 1)
            : Math.max(0, currentImageIndex - 1);
            
          container.scrollTo({ left: newIndex * width, behavior: 'smooth' });
          setCurrentImageIndex(newIndex);
      }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 sm:px-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      <motion.div 
        layout
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl relative z-10 flex flex-col"
      >
        {/* Sticky Header with Close Button */}
        <div className="sticky top-0 right-0 z-20 flex justify-between items-center p-4 pointer-events-none">
           {step !== 'details' && step !== 'success' ? (
             <button 
               onClick={() => setStep('details')}
               className="pointer-events-auto bg-white/80 backdrop-blur rounded-full p-2 text-slate-500 hover:text-slate-900 shadow-sm border border-gray-100 transition-colors flex items-center gap-2 px-4"
             >
               <ArrowLeft size={18} /> <span className="text-sm font-bold">Back</span>
             </button>
           ) : <div />}
           
           <button 
             onClick={onClose}
             className="pointer-events-auto bg-white/80 backdrop-blur rounded-full p-2 text-slate-500 hover:text-slate-900 shadow-sm border border-gray-100 transition-colors"
           >
             <X size={24} />
           </button>
        </div>
        
        {/* Content Container - negative margin to pull under sticky header */}
        <div className="-mt-16">
            
            <AnimatePresence mode="wait">
              {step === 'details' && (
                <motion.div 
                  key="details"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Company Info Banner */}
                  {company && (
                    <div className="bg-slate-50 border-b border-gray-100 px-8 pt-20 pb-6">
                       <div className="flex items-start gap-4">
                           <div
                             className={`w-16 h-16 rounded-xl flex items-center justify-center shrink-0 shadow-md overflow-hidden ${
                               company?.logoUrl && !companyLogoFailed
                                 ? 'bg-white'
                                 : 'bg-slate-900 text-white text-xl font-display font-bold'
                             }`}
                           >
                             {company?.logoUrl && !companyLogoFailed ? (
                               <img
                                 src={company.logoUrl}
                                 alt={`${company.name} logo`}
                                 className="w-full h-full object-contain p-2"
                                 onError={() => setCompanyLogoFailed(true)}
                               />
                             ) : (
                               company.name.substring(0, 2).toUpperCase()
                             )}
                           </div>
                          <div>
                             <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-xl font-display font-bold text-slate-900">{company.name}</h3>
                                <span className="bg-brand-accent/10 text-brand-accent text-xs px-2 py-0.5 rounded-full border border-brand-accent/20 font-bold flex items-center gap-1">
                                   <ShieldCheck size={10} /> VERIFIED OWNER
                                </span>
                             </div>
                             <div className="flex items-center gap-4 text-sm text-slate-500">
                                <span className="flex items-center gap-1"><MapPin size={14} /> {company.location}</span>
                                <span className="flex items-center gap-1 text-yellow-500 font-bold"><Star size={14} fill="currentColor" /> {company.rating}</span>
                                <span className="flex items-center gap-1"><Calendar size={14} /> Member since {company.joinedDate}</span>
                             </div>
                          </div>
                       </div>
                    </div>
                  )}

                  <div className="flex flex-col md:flex-row">
                    {/* Left Column: Image & Status */}
                    <div className="w-full md:w-1/2 p-8 border-b md:border-b-0 md:border-r border-gray-100">
                       <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 mb-6 relative shadow-inner group">
                          
                          {/* Scrollable Gallery */}
                          <div 
                            id="modal-gallery-container"
                            className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                            onScroll={(e) => {
                                const width = e.currentTarget.offsetWidth;
                                setCurrentImageIndex(Math.round(e.currentTarget.scrollLeft / width));
                            }}
                          >
                            {item.images.map((img, i) => (
                                <img key={i} src={img} alt={item.name} className="w-full h-full object-cover flex-shrink-0 snap-center" />
                            ))}
                          </div>

                          {/* Navigation Buttons */}
                          {item.images.length > 1 && (
                            <>
                                <button 
                                    onClick={() => scrollImage('prev')}
                                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                                    disabled={currentImageIndex === 0}
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <button 
                                    onClick={() => scrollImage('next')}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                                    disabled={currentImageIndex === item.images.length - 1}
                                >
                                    <ChevronRight size={20} />
                                </button>
                                
                                {/* Indicators */}
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 p-1.5 rounded-full bg-black/20 backdrop-blur-sm z-10">
                                    {item.images.map((_, i) => (
                                        <div 
                                        key={i} 
                                        className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === currentImageIndex ? 'bg-white scale-125' : 'bg-white/40'}`} 
                                        />
                                    ))}
                                </div>
                            </>
                          )}

                          <div className="absolute top-4 left-4">
                             <span className="bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-slate-900 border border-gray-200 shadow-sm">
                               {item.category}
                             </span>
                          </div>
                       </div>

                       <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-gray-100">
                          <div className="flex items-center gap-2">
                             {item.available ? (
                               <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                             ) : (
                               <div className="w-2 h-2 rounded-full bg-red-500" />
                             )}
                             <span className={`text-sm font-bold ${item.available ? 'text-green-700' : 'text-red-700'}`}>
                                {item.available ? 'Available Now' : 'Currently Unavailable'}
                             </span>
                          </div>
                          {item.available && (
                             <span className="text-xs text-slate-500 flex items-center gap-1">
                               <Truck size={12} /> Delivery available
                             </span>
                          )}
                       </div>
                    </div>

                    {/* Right Column: Details */}
                    <div className="w-full md:w-1/2 p-8 flex flex-col">
                       <h2 className="text-3xl font-display font-bold text-slate-900 mb-4">{item.name}</h2>
                       
                       <div className="mb-6">
                          <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Description</h4>
                          <p className="text-slate-600 leading-relaxed text-sm">
                            {item.description}
                          </p>
                       </div>

                       <div className="mb-8">
                          <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Specifications</h4>
                          <div className="grid grid-cols-2 gap-3">
                             {Object.entries(item.specs).map(([key, val]) => (
                                <div key={key} className="bg-slate-50 p-3 rounded-lg border border-gray-100">
                                   <div className="text-xs text-slate-500 mb-1">{key}</div>
                                   <div className="text-sm font-bold text-slate-900">{val}</div>
                                </div>
                             ))}
                          </div>
                       </div>

                       {/* Footer Action */}
                       <div className="mt-auto pt-6 border-t border-gray-100">
                          <div className="flex items-end justify-between mb-4">
                             <div>
                                <div className="text-sm text-slate-500">Daily Rate</div>
                                <div className="text-3xl font-display font-bold text-brand-accent">
                                   ${item.pricePerDay}
                                </div>
                             </div>
                             <div className="text-right">
                                <div className="text-sm text-slate-500">Total Est. (7 days)</div>
                                <div className="text-xl font-bold text-slate-700">
                                   ${item.pricePerDay * 7}
                                </div>
                             </div>
                          </div>
                          
                           <button 
                             className="w-full py-4 bg-brand-accent hover:bg-yellow-500 text-white font-bold rounded-xl shadow-lg shadow-yellow-500/20 transition-all flex items-center justify-center gap-2"
                             onClick={() => {
                               const companyId = company ? Number(company.id) : null;
                               if (!companyId || !Number.isFinite(companyId)) return setStep('auth');
                               const token = getCustomerAccountToken();
                               const customer = token ? getCustomerAccount() : null;
                               if (!token || !customer) return setStep('auth');
                               setStep('form');
                             }}
                           >
                             Request Booking
                           </button>
                          <p className="text-center text-xs text-slate-400 mt-3">
                             You won't be charged until the owner confirms.
                          </p>
                       </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 'auth' && (
                <motion.div
                  key="auth"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-8 pt-20"
                >
                  <div className="max-w-xl mx-auto">
                    <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">Log in required</h2>
                    <p className="text-slate-500 mb-6">
                      Use the same credential to request equipment, and keep your customer profile in sync so {company?.name ?? 'the owner'} has all the information they require.
                    </p>
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-3">
                      <a
                        className="w-full py-3 bg-brand-accent hover:bg-yellow-500 text-white font-bold rounded-xl text-center"
                        href={`/login.html?returnTo=${encodeURIComponent(window.location.href)}`}
                      >
                        Customer log in
                      </a>
                      <a
                        className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-center"
                        href={`/customer-signup.html?returnTo=${encodeURIComponent(window.location.href)}`}
                      >
                        Customer sign up
                      </a>
                      <button type="button" className="ghost" onClick={() => setStep('details')}>
                        Back to details
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 'profile' && (
                <motion.div
                  key="profile"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-8 pt-20"
                >
                  <div className="max-w-2xl mx-auto">
                    <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">Complete your profile</h2>
                    <p className="text-slate-500 mb-6">This rental company requires a few details before you can submit a booking request.</p>

                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
                      <div className="text-sm text-slate-600 mb-4">
                        Missing: <span className="font-bold text-slate-900">{missingProfileFields.map(profileLabel).join(', ')}</span>
                      </div>

                      <form onSubmit={handleProfileSubmit} className="space-y-4">
                        {missingProfileFields.map((field) => {
                          const isFile = field in profileFiles;
                          if (isFile) {
                            return (
                              <label key={field} className="block text-sm font-bold text-slate-700">
                                {profileLabel(field)}
                                <input
                                  type="file"
                                  className="mt-2 w-full p-3 rounded-xl border border-gray-200 bg-slate-50"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    setProfileFiles((prev) => ({ ...prev, [field]: file } as any));
                                  }}
                                />
                              </label>
                            );
                          }

                          const isCard = field === 'creditCardNumber';
                          return (
                            <label key={field} className="block text-sm font-bold text-slate-700">
                              {profileLabel(field)}
                              <input
                                value={(profileValues as any)[field] || ''}
                                onChange={(e) => setProfileValues((prev) => ({ ...prev, [field]: e.target.value } as any))}
                                inputMode={isCard ? 'numeric' : undefined}
                                placeholder={isCard ? 'Card number' : ''}
                                className="mt-2 w-full p-3 rounded-xl border border-gray-200 bg-slate-50 focus:outline-none focus:border-brand-accent focus:bg-white transition-all"
                              />
                            </label>
                          );
                        })}

                        {profileError && <div className="text-sm text-red-600 font-medium">{profileError}</div>}

                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                          <button
                            type="submit"
                            disabled={isProfileSaving}
                            className="flex-1 py-3 bg-brand-accent hover:bg-yellow-500 text-white font-bold rounded-xl disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isProfileSaving ? <Loader2 className="animate-spin" /> : 'Save and continue'}
                          </button>
                          <button type="button" className="ghost" onClick={() => setStep('form')}>
                            Back
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 'form' && (
                <motion.div 
                   key="form"
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -20 }}
                   className="p-8 pt-20"
                >
                   <div className="max-w-2xl mx-auto">
                      <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">Finalize Request</h2>
                      <p className="text-slate-500 mb-8">Complete the details below to request this equipment from {company?.name}.</p>
                      
                      <form onSubmit={handleSubmit} className="space-y-6">
                         {/* Contact Info */}
                         <div className="bg-slate-50 p-6 rounded-2xl border border-gray-100">
                             <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <User size={16} /> Contact Information
                             </h3>
                             {(() => {
                               const companyId = company ? Number(company.id) : null;
                               const token = getCustomerAccountToken();
                               const customer = token ? getCustomerAccount() : null;
                               if (!token || !customer) {
                                 return (
                                   <div className="flex flex-col gap-3">
                                     <div className="text-sm text-slate-600">You are not logged in.</div>
                                     <button type="button" className="w-full py-3 bg-brand-accent text-white font-bold rounded-xl" onClick={() => setStep('auth')}>
                                       Log in to continue
                                     </button>
                                   </div>
                                 );
                               }
                               return (
                                 <div className="flex items-start justify-between gap-4">
                                   <div className="text-sm text-slate-700">
                                     <div className="font-bold">{customer.name}</div>
                                     <div className="text-slate-500">
                                       {customer.email}
                                       {customer.phone ? ` • ${customer.phone}` : ''}
                                     </div>
                                   </div>
                                   <button
                                     type="button"
                                     className="ghost danger"
                                     onClick={() => {
                                       clearCustomerAccountSession();
                                       setStep('auth');
                                     }}
                                   >
                                     Switch account
                                   </button>
                                 </div>
                               );
                             })()}
                          </div>

                         {/* Dates */}
                         <div className="bg-slate-50 p-6 rounded-2xl border border-gray-100">
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                               <Calendar size={16} /> Rental Dates
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1">Start Date</label>
                                  <input 
                                    required
                                    type="date" 
                                    className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                    value={formData.startDate}
                                    onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                                  />
                               </div>
                               <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1">End Date</label>
                                  <input 
                                    required
                                    type="date" 
                                    className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                    value={formData.endDate}
                                    onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                                  />
                               </div>
                            </div>
                         </div>

                         {/* Delivery */}
                         <div className="bg-slate-50 p-6 rounded-2xl border border-gray-100">
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                               <Truck size={16} /> Fulfillment Method
                            </h3>
                            <div className="flex gap-4 mb-4">
                               <button
                                 type="button"
                                 onClick={() => setFormData({...formData, deliveryMethod: 'pickup'})}
                                 className={`flex-1 py-3 px-4 rounded-xl border font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                                   formData.deliveryMethod === 'pickup' 
                                   ? 'bg-brand-accent text-white border-brand-accent shadow-md' 
                                   : 'bg-white text-slate-600 border-gray-200 hover:bg-gray-50'
                                 }`}
                               >
                                  <MapPin size={16} /> Customer Pickup
                               </button>
                               <button
                                 type="button"
                                 onClick={() => setFormData({...formData, deliveryMethod: 'delivery'})}
                                 className={`flex-1 py-3 px-4 rounded-xl border font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                                   formData.deliveryMethod === 'delivery' 
                                   ? 'bg-brand-accent text-white border-brand-accent shadow-md' 
                                   : 'bg-white text-slate-600 border-gray-200 hover:bg-gray-50'
                                 }`}
                               >
                                  <Truck size={16} /> Delivery Site
                               </button>
                            </div>
                            
                            {formData.deliveryMethod === 'delivery' && (
                               <motion.div 
                                 initial={{ opacity: 0, height: 0 }}
                                 animate={{ opacity: 1, height: 'auto' }}
                               >
                                  <label className="block text-xs font-bold text-slate-500 mb-1">Delivery Address</label>
                                  <input 
                                    required
                                    type="text" 
                                    className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                    placeholder="123 Construction Way, City, State"
                                    value={formData.deliveryAddress}
                                    onChange={(e) => setFormData({...formData, deliveryAddress: e.target.value})}
                                  />
                               </motion.div>
                            )}
                         </div>

                         {/* Rental information */}
                         <div className="bg-slate-50 p-6 rounded-2xl border border-gray-100 space-y-4">
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                               <ShieldCheck size={16} /> Rental Information
                            </h3>
                            <label className="block">
                               <span className="text-xs font-bold text-slate-500">Critical Areas on Site</span>
                               <textarea
                                 rows={3}
                                 value={formData.criticalAreas}
                                 onChange={(e) => setFormData({ ...formData, criticalAreas: e.target.value })}
                                 className="mt-2 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                 placeholder="Highlight any obstacles, underground utilities, or no-go zones."
                               />
                            </label>
                            <label className="block">
                               <span className="text-xs font-bold text-slate-500">General notes</span>
                               <textarea
                                 rows={3}
                                 value={formData.generalNotes}
                                 onChange={(e) => setFormData({ ...formData, generalNotes: e.target.value })}
                                 className="mt-2 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                 placeholder="Capture any additional instructions for the owner."
                               />
                            </label>

                            <div className="contact-block">
                               <div className="contact-header flex items-center justify-between gap-3">
                                  <strong>Emergency contacts</strong>
                                  <button
                                    type="button"
                                    className="ghost small"
                                    onClick={() => addContactRow(setEmergencyContacts)}
                                  >
                                    + Add contact
                                  </button>
                               </div>
                               <div className="contacts-list stack" style={{ gap: '12px' }}>
                                  {emergencyContacts.map((contact, idx) => (
                                    <div key={`emergency-${idx}`} className="stack" style={{ gap: '6px' }}>
                                       <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                          <input
                                            type="text"
                                            placeholder="Name"
                                            value={contact.name}
                                            onChange={(e) => updateContactRow(idx, setEmergencyContacts, e.target.value, 'name')}
                                            className="p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                          />
                                          <input
                                            type="email"
                                            placeholder="Email"
                                            value={contact.email}
                                            onChange={(e) => updateContactRow(idx, setEmergencyContacts, e.target.value, 'email')}
                                            className="p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                          />
                                          <input
                                            type="tel"
                                            placeholder="Phone"
                                            value={contact.phone}
                                            onChange={(e) => updateContactRow(idx, setEmergencyContacts, e.target.value, 'phone')}
                                            className="p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                          />
                                       </div>
                                       {emergencyContacts.length > 1 && (
                                         <button
                                           type="button"
                                           className="ghost small danger self-end"
                                           onClick={() => removeContactRow(idx, setEmergencyContacts, emergencyContacts)}
                                         >
                                           Remove contact
                                         </button>
                                       )}
                                    </div>
                                  ))}
                               </div>
                            </div>

                            <div className="contact-block">
                               <div className="contact-header flex items-center justify-between gap-3">
                                  <strong>Site contacts</strong>
                                  <button
                                    type="button"
                                    className="ghost small"
                                    onClick={() => addContactRow(setSiteContacts)}
                                  >
                                    + Add contact
                                  </button>
                               </div>
                               <div className="contacts-list stack" style={{ gap: '12px' }}>
                                  {siteContacts.map((contact, idx) => (
                                    <div key={`site-${idx}`} className="stack" style={{ gap: '6px' }}>
                                       <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                          <input
                                            type="text"
                                            placeholder="Name"
                                            value={contact.name}
                                            onChange={(e) => updateContactRow(idx, setSiteContacts, e.target.value, 'name')}
                                            className="p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                          />
                                          <input
                                            type="email"
                                            placeholder="Email"
                                            value={contact.email}
                                            onChange={(e) => updateContactRow(idx, setSiteContacts, e.target.value, 'email')}
                                            className="p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                          />
                                          <input
                                            type="tel"
                                            placeholder="Phone"
                                            value={contact.phone}
                                            onChange={(e) => updateContactRow(idx, setSiteContacts, e.target.value, 'phone')}
                                            className="p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                          />
                                       </div>
                                       {siteContacts.length > 1 && (
                                         <button
                                           type="button"
                                           className="ghost small danger self-end"
                                           onClick={() => removeContactRow(idx, setSiteContacts, siteContacts)}
                                         >
                                           Remove contact
                                         </button>
                                       )}
                                    </div>
                                  ))}
                               </div>
                            </div>

                            <div className="coverage-block">
                               <div className="coverage-header flex items-center justify-between gap-3">
                                  <strong>Hours of coverage required</strong>
                                  <span className="hint text-xs">Use 24-hour time</span>
                               </div>
                               <div className="stack" style={{ gap: '8px' }}>
                                  {coverageRows.map((row, idx) => (
                                    <div key={`coverage-${idx}`} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                                       <label className="text-xs font-bold text-slate-500">
                                          Day
                                          <select
                                            value={row.day}
                                            onChange={(e) => updateCoverageRow(idx, 'day', e.target.value)}
                                            className="mt-1 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                          >
                                            {coverageDayOptions.map((option) => (
                                              <option key={option.key} value={option.key}>
                                                {option.label}
                                              </option>
                                            ))}
                                          </select>
                                       </label>
                                       <label className="text-xs font-bold text-slate-500">
                                          Start
                                          <input
                                            type="time"
                                            value={row.start}
                                            onChange={(e) => updateCoverageRow(idx, 'start', e.target.value)}
                                            className="mt-1 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                          />
                                       </label>
                                       <label className="text-xs font-bold text-slate-500">
                                          End
                                          <input
                                            type="time"
                                            value={row.end}
                                            onChange={(e) => updateCoverageRow(idx, 'end', e.target.value)}
                                            className="mt-1 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                          />
                                       </label>
                                       {coverageRows.length > 1 ? (
                                         <button
                                           type="button"
                                           className="ghost small danger"
                                           onClick={() => removeCoverageRow(idx)}
                                         >
                                           Remove
                                         </button>
                                       ) : (
                                         <span />
                                       )}
                                    </div>
                                  ))}
                                  <button type="button" className="ghost small" onClick={addCoverageRow}>
                                    + Add coverage period
                                  </button>
                               </div>
                            </div>
                         </div>

                         <div className="pt-4">
                            <button 
                              type="submit"
                              disabled={!isFormValid || isSubmitting}
                              className="w-full py-4 bg-brand-accent hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-yellow-500/20 transition-all flex items-center justify-center gap-2 text-lg"
                            >
                              {isSubmitting ? <Loader2 className="animate-spin" /> : <CheckCircle />}
                              {isSubmitting ? 'Processing...' : 'Send Request'}
                            </button>
                            {submitError && (
                              <div className="pt-3 text-sm text-red-600 font-medium">{submitError}</div>
                            )}
                         </div>
                      </form>
                   </div>
                </motion.div>
              )}

              {step === 'success' && (
                 <motion.div 
                    key="success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center py-20 px-8 text-center h-full min-h-[500px]"
                 >
                    <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-green-100">
                       <CheckCircle size={48} strokeWidth={3} />
                    </div>
                    <h2 className="text-4xl font-display font-bold text-slate-900 mb-4">Request Sent!</h2>
                    <p className="text-slate-500 max-w-md mx-auto text-lg mb-8">
                       {reservationRef ? `${reservationRef} created.` : 'Request created.'} Your request for the <span className="font-bold text-slate-900">{item.name}</span> has been sent to {company?.name}.
                    </p>
                    <div className="bg-slate-50 rounded-2xl p-6 border border-gray-100 max-w-sm w-full mb-8 text-left">
                       <div className="space-y-3 text-sm">
                          <div className="flex justify-between">
                             <span className="text-slate-500">Dates:</span>
                             <span className="font-medium">{formData.startDate} to {formData.endDate}</span>
                          </div>
                          <div className="flex justify-between">
                             <span className="text-slate-500">Method:</span>
                             <span className="font-medium capitalize">{formData.deliveryMethod}</span>
                          </div>
                           <div className="flex justify-between">
                              <span className="text-slate-500">Contact:</span>
                              <span className="font-medium">{storefrontCustomer?.email || 'Customer'}</span>
                           </div>
                       </div>
                    </div>
                    <button 
                      onClick={onClose}
                      className="px-8 py-3 bg-brand-accent text-white font-bold rounded-xl hover:bg-yellow-500 transition-colors shadow-lg shadow-yellow-500/20"
                    >
                       Back to Marketplace
                    </button>
                 </motion.div>
              )}
            </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
