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
  startDay: string;
  startTime: string;
  endDay: string;
  endTime: string;
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

const coverageDayKeys = coverageDayOptions.map((option) => option.key);
const coverageDayIndex = coverageDayOptions.reduce<Record<string, number>>((acc, option, index) => {
  acc[option.key] = index;
  return acc;
}, {});

const defaultContactRow = (): ContactRow => ({ name: '', email: '', phone: '' });
const defaultCoverageRow = (): CoverageRow => ({ startDay: 'mon', startTime: '', endDay: 'mon', endTime: '' });

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

const normalizeTimeValue = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const parts = trimmed.split(':');
  if (parts.length < 2) return trimmed;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return trimmed;
  const safeHour = Math.min(23, Math.max(0, hour));
  const safeMinute = Math.min(59, Math.max(0, minute));
  return `${String(safeHour).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}`;
};

const coerceCoverageDay = (value: string, fallback = 'mon') => {
  const key = String(value || '').trim().toLowerCase();
  return coverageDayIndex[key] !== undefined ? key : fallback;
};

const normalizeCoverageSlot = (slot: CoverageRow) => ({
  startDay: coerceCoverageDay(slot.startDay),
  startTime: normalizeTimeValue(slot.startTime),
  endDay: coerceCoverageDay(slot.endDay),
  endTime: normalizeTimeValue(slot.endTime),
});

const coverageSlotKey = (slot: CoverageRow) =>
  `${slot.startDay}|${slot.startTime}|${slot.endDay}|${slot.endTime}`;

const coverageDayOffset = (startDay: string, endDay: string) => {
  const startIdx = coverageDayIndex[coerceCoverageDay(startDay)];
  const endIdx = coverageDayIndex[coerceCoverageDay(endDay)];
  if (startIdx === undefined || endIdx === undefined) return 0;
  const diff = endIdx - startIdx;
  return diff < 0 ? diff + 7 : diff;
};

const shiftCoverageDay = (startDay: string, offset: number) => {
  const startIdx = coverageDayIndex[coerceCoverageDay(startDay)];
  if (startIdx === undefined) return 'mon';
  const nextIdx = (startIdx + offset + 7) % 7;
  return coverageDayOptions[nextIdx]?.key || 'mon';
};

const coverageRowsToPayload = (rows: CoverageRow[]) => {
  return rows
    .map((row) => normalizeCoverageSlot(row))
    .filter((slot) => slot.startDay && slot.startTime && slot.endDay && slot.endTime);
};

const hasCoverageHours = (rows: CoverageRow[]) =>
  rows.some((row) => {
    const slot = normalizeCoverageSlot(row);
    return Boolean(slot.startDay && slot.startTime && slot.endDay && slot.endTime);
  });

export const DetailModal: React.FC<DetailModalProps> = ({ item, company, onClose }) => {
  const [step, setStep] = useState<'details' | 'auth' | 'form' | 'profile' | 'success'>('details');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reservationRef, setReservationRef] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [companyLogoFailed, setCompanyLogoFailed] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
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
  const [coverageCopyIndex, setCoverageCopyIndex] = useState<number | null>(null);
  const [coverageCopyDays, setCoverageCopyDays] = useState<Record<string, boolean>>({});

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

  const updateCoverageRow = (index: number, field: keyof CoverageRow, value: string) => {
    setCoverageRows((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row))
    );
  };

  const addCoverageRow = () =>
    setCoverageRows((prev) => [
      ...prev,
      {
        ...defaultCoverageRow(),
        startDay: coverageDayOptions[prev.length % coverageDayOptions.length].key,
        endDay: coverageDayOptions[prev.length % coverageDayOptions.length].key,
      },
    ]);

  const duplicateCoverageRow = (index: number) => {
    setCoverageRows((prev) => {
      const slot = prev[index];
      if (!slot) return prev;
      return [...prev, { ...slot }];
    });
  };

  const removeCoverageRow = (index: number) => {
    setCoverageRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  const openCoverageCopy = (index: number) => {
    setCoverageCopyIndex(index);
    const initialDays: Record<string, boolean> = {};
    coverageDayKeys.forEach((key) => {
      initialDays[key] = false;
    });
    setCoverageCopyDays(initialDays);
  };

  const toggleCoverageCopyDay = (day: string) => {
    setCoverageCopyDays((prev) => ({ ...prev, [day]: !prev[day] }));
  };

  const applyCoverageCopy = () => {
    if (coverageCopyIndex === null) return;
    setCoverageRows((prev) => {
      const base = prev[coverageCopyIndex];
      if (!base) return prev;
      const normalizedBase = normalizeCoverageSlot(base);
      const offset = coverageDayOffset(normalizedBase.startDay, normalizedBase.endDay);
      const existingKeys = new Set(prev.map((row) => coverageSlotKey(normalizeCoverageSlot(row))));
      const additions = coverageDayKeys
        .filter((day) => coverageCopyDays[day])
        .map((day) => ({
          ...normalizedBase,
          startDay: day,
          endDay: shiftCoverageDay(day, offset),
        }))
        .filter((slot) => {
          const key = coverageSlotKey(slot);
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        });
      if (!additions.length) return prev;
      return [...prev, ...additions];
    });
    setCoverageCopyIndex(null);
    setCoverageCopyDays({});
  };

  const cancelCoverageCopy = () => {
    setCoverageCopyIndex(null);
    setCoverageCopyDays({});
  };

  useEffect(() => {
    setCompanyLogoFailed(false);
  }, [company?.id, company?.logoUrl]);

  useEffect(() => {
    setShowFullDescription(false);
  }, [item.id]);

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
        !coveragePayload.length
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
  const descriptionText = String(item.description || '');
  const descriptionLimit = 260;
  const descriptionTooLong = descriptionText.length > descriptionLimit;
  const descriptionPreview =
    descriptionTooLong && !showFullDescription
      ? `${descriptionText.slice(0, descriptionLimit).trim()}...`
      : descriptionText;
  const documents = Array.isArray(item.documents)
    ? item.documents.filter((doc) => doc && doc.url)
    : [];
  const isSale = item.listingType === 'sale';
  const salePriceLabel =
    typeof item.salePrice === 'number' && Number.isFinite(item.salePrice)
      ? `$${item.salePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : 'Contact for price';

  if (isSale) {
    const email = company?.email || '';
    const phone = company?.phone || '';
    const website = company?.website || '';
    const mailto = email ? `mailto:${email}` : undefined;
    const tel = phone ? `tel:${phone}` : undefined;

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
          <div className="sticky top-0 right-0 z-20 flex justify-between items-center p-4 pointer-events-none">
            <div />
            <button
              onClick={onClose}
              className="pointer-events-auto bg-white/80 backdrop-blur rounded-full p-2 text-slate-500 hover:text-slate-900 shadow-sm border border-gray-100 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="px-6 pb-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="relative rounded-2xl border border-gray-100 overflow-hidden bg-slate-50">
                  <div
                    id="sale-gallery-container"
                    className="w-full h-80 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                    onScroll={(e) => {
                      const width = e.currentTarget.offsetWidth;
                      const index = Math.round(e.currentTarget.scrollLeft / width);
                      setCurrentImageIndex(index);
                    }}
                  >
                    {item.images.map((img, idx) => (
                      <img
                        key={idx}
                        src={img}
                        alt={`${item.name} - View ${idx + 1}`}
                        loading={idx === 0 ? 'eager' : 'lazy'}
                        decoding="async"
                        className="w-full h-full object-contain object-center flex-shrink-0 snap-center"
                      />
                    ))}
                  </div>

                  {item.images.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => scrollImage('prev', 'sale-gallery-container')}
                        className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 rounded-full p-2 shadow border border-gray-100"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollImage('next', 'sale-gallery-container')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 rounded-full p-2 shadow border border-gray-100"
                      >
                        <ChevronRight size={18} />
                      </button>
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 p-1.5 rounded-full bg-black/20 backdrop-blur-sm">
                        {item.images.map((_, i) => (
                          <div
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                              i === currentImageIndex ? 'bg-white scale-125' : 'bg-white/40'
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {documents.length > 0 && (
                  <div className="rounded-2xl border border-gray-100 p-4">
                    <h4 className="text-sm font-bold text-slate-700 mb-2">Documents</h4>
                    <div className="flex flex-col gap-2 text-sm">
                      {documents.map((doc, idx) => (
                        <a
                          key={idx}
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-secondary hover:underline"
                        >
                          {doc.fileName || doc.url.split('/').pop() || 'Document'}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    For Sale
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <MapPin size={14} />
                    {item.location || '--'}
                  </span>
                </div>

                <div>
                  <h2 className="text-3xl font-display font-bold text-slate-900">{item.name}</h2>
                  {item.unitId && (
                    <p className="text-sm text-slate-500 mt-1">Unit #{item.unitId}</p>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-100 p-4 bg-slate-50">
                  <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Sale Price</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{salePriceLabel}</div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-2">Description</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {item.description || 'No description provided.'}
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-100 p-4">
                  <h4 className="text-sm font-bold text-slate-700 mb-3">Contact seller</h4>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    {email && (
                      <a
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-gray-200 hover:border-brand-accent hover:text-brand-accent transition-colors"
                        href={mailto}
                      >
                        <Mail size={16} /> {email}
                      </a>
                    )}
                    {phone && (
                      <a
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-gray-200 hover:border-brand-accent hover:text-brand-accent transition-colors"
                        href={tel}
                      >
                        <Phone size={16} /> {phone}
                      </a>
                    )}
                    {website && (
                      <a
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-gray-200 hover:border-brand-accent hover:text-brand-accent transition-colors"
                        href={website}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Home size={16} /> {website.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                    {!email && !phone && !website && (
                      <span className="text-xs text-slate-500">No contact details provided yet.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const formatDocSize = (sizeBytes?: number | null) => {
    if (!sizeBytes || !Number.isFinite(sizeBytes)) return '';
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    return `${Math.round(sizeBytes / 1024)} KB`;
  };

  const scrollImage = (direction: 'next' | 'prev', targetId = 'modal-gallery-container') => {
      const container = document.getElementById(targetId);
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
                                loading="lazy"
                                decoding="async"
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
                                <img
                                  key={i}
                                  src={img}
                                  alt={item.name}
                                  loading={i === 0 ? 'eager' : 'lazy'}
                                  decoding="async"
                                  className="w-full h-full object-cover flex-shrink-0 snap-center"
                                />
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

                    </div>

                    {/* Right Column: Details */}
                    <div className="w-full md:w-1/2 p-8 flex flex-col">
                       <h2 className="text-3xl font-display font-bold text-slate-900 mb-4">{item.name}</h2>
                       
                       <div className="mb-6">
                          <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Description</h4>
                          <p className="text-slate-600 leading-relaxed text-sm whitespace-pre-wrap break-words">
                            {descriptionPreview}
                          </p>
                          {descriptionTooLong && (
                            <button
                              type="button"
                              onClick={() => setShowFullDescription((prev) => !prev)}
                              className="mt-2 text-xs font-semibold text-brand-secondary hover:underline"
                            >
                              {showFullDescription ? 'Show less' : 'See more'}
                            </button>
                          )}
                       </div>

                       {documents.length > 0 && (
                         <div className="mb-6">
                           <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Documents</h4>
                           <div className="space-y-2">
                             {documents.map((doc, idx) => {
                               const label = doc.fileName || `Document ${idx + 1}`;
                               const sizeLabel = formatDocSize(doc.sizeBytes ?? null);
                               const meta = [doc.mime || '', sizeLabel].filter(Boolean).join(' | ');
                               return (
                                 <div
                                   key={`${doc.url}-${idx}`}
                                   className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-slate-50 px-4 py-3 text-sm"
                                 >
                                   <a
                                     href={doc.url}
                                     target="_blank"
                                     rel="noreferrer"
                                     className="font-semibold text-slate-700 hover:text-brand-accent transition-colors"
                                   >
                                     {label}
                                   </a>
                                   {meta ? <span className="text-xs text-slate-400">{meta}</span> : null}
                                 </div>
                               );
                             })}
                           </div>
                         </div>
                       )}

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
                               <span className="text-xs font-bold text-slate-500">Critical Assets and Locations on Site</span>
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
                               <div className="stack" style={{ gap: '12px' }}>
                                  {coverageRows.map((row, idx) => (
                                    <div key={`coverage-${idx}`} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                                       <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                                          <label className="text-xs font-bold text-slate-500">
                                             Start day
                                             <select
                                               value={row.startDay}
                                               onChange={(e) => updateCoverageRow(idx, 'startDay', e.target.value)}
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
                                             Start time
                                             <input
                                               type="time"
                                               step={300}
                                               value={row.startTime}
                                               onChange={(e) => updateCoverageRow(idx, 'startTime', e.target.value)}
                                               className="mt-1 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                             />
                                          </label>
                                          <label className="text-xs font-bold text-slate-500">
                                             End day
                                             <select
                                               value={row.endDay}
                                               onChange={(e) => updateCoverageRow(idx, 'endDay', e.target.value)}
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
                                             End time
                                             <input
                                               type="time"
                                               step={300}
                                               value={row.endTime}
                                               onChange={(e) => updateCoverageRow(idx, 'endTime', e.target.value)}
                                               className="mt-1 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                                             />
                                          </label>
                                       </div>
                                       <div className="flex flex-wrap gap-2 mt-3">
                                          <button
                                            type="button"
                                            className="ghost small"
                                            onClick={() => duplicateCoverageRow(idx)}
                                          >
                                            Duplicate
                                          </button>
                                          <button
                                            type="button"
                                            className="ghost small"
                                            onClick={() => openCoverageCopy(idx)}
                                          >
                                            Copy to days
                                          </button>
                                          {coverageRows.length > 1 && (
                                            <button
                                              type="button"
                                              className="ghost small danger"
                                              onClick={() => removeCoverageRow(idx)}
                                            >
                                              Remove
                                            </button>
                                          )}
                                       </div>
                                       {coverageCopyIndex === idx && (
                                         <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-slate-50 p-3">
                                            <div className="text-xs font-bold text-slate-500 mb-2">Copy this slot to:</div>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                               {coverageDayOptions.map((option) => (
                                                 <label key={`copy-${option.key}`} className="flex items-center gap-2">
                                                    <input
                                                      type="checkbox"
                                                      checked={Boolean(coverageCopyDays[option.key])}
                                                      onChange={() => toggleCoverageCopyDay(option.key)}
                                                      className="h-4 w-4 rounded border-gray-300 text-brand-accent focus:ring-brand-accent"
                                                    />
                                                    <span>{option.label}</span>
                                                 </label>
                                               ))}
                                            </div>
                                            <div className="flex flex-wrap gap-2 mt-3">
                                               <button type="button" className="ghost small" onClick={applyCoverageCopy}>
                                                  Apply copy
                                               </button>
                                               <button type="button" className="ghost small danger" onClick={cancelCoverageCopy}>
                                                  Cancel
                                               </button>
                                            </div>
                                         </div>
                                       )}
                                    </div>
                                  ))}
                                  <button type="button" className="ghost small" onClick={addCoverageRow}>
                                    + Add time slot
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

