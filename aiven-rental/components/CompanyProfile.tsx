import React, { useEffect, useState } from 'react';
import { Company, Equipment } from '../types';
import { motion } from 'framer-motion';
import { MapPin, Star, Calendar, ArrowLeft, Mail, Phone, MessageCircle, Globe } from 'lucide-react';
import { Card3D } from './Marketplace'; // We will export Card3D from Marketplace to reuse it

interface CompanyProfileProps {
  company: Company;
  items: Equipment[];
  onBack: () => void;
  onSelectItem: (item: Equipment) => void;
}

export const CompanyProfile: React.FC<CompanyProfileProps> = ({ company, items, onBack, onSelectItem }) => {
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => {
    setLogoFailed(false);
  }, [company.logoUrl]);

  const locationLabel = company.location || '—';
  const joinedLabel = company.joinedDate ? `Member since ${company.joinedDate}` : null;
  const ratingLabel = typeof company.rating === 'number' ? `${company.rating.toFixed(1)} / 5.0` : null;
  const emailSubject = encodeURIComponent(`Rental inquiry for ${company.name}`);
  const emailBody = encodeURIComponent(`Hi ${company.name} team,\n\nI'm interested in renting equipment from your storefront on Aiven Rental.`);
  const emailHref = company.email ? `mailto:${encodeURIComponent(company.email)}?subject=${emailSubject}&body=${emailBody}` : null;
  const phoneDigits = company.phone ? company.phone.replace(/[^0-9+]/g, '') : '';
  const phoneHref = phoneDigits ? `tel:${phoneDigits}` : null;
  const websiteRaw = (company.website || '').trim();
  const websiteDisplay = websiteRaw.replace(/^https?:\/\//i, '');
  const websiteHref = websiteRaw ? (/^https?:\/\//i.test(websiteRaw) ? websiteRaw : `https://${websiteRaw}`) : null;
  const hasDirectContact = !!emailHref || !!phoneHref;
  const hasContact = hasDirectContact || !!websiteHref;
  const showLogo = !!company.logoUrl && !logoFailed;

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-24">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-slate-500 hover:text-brand-accent transition-colors mb-8 font-medium"
      >
        <ArrowLeft size={20} /> Back to Marketplace
      </button>

      {/* Company Header */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-8 border border-gray-200 shadow-xl mb-12 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        
        <div className="flex flex-col md:flex-row gap-8 relative z-10">
          <div
            className={`w-32 h-32 rounded-2xl flex items-center justify-center shadow-lg shrink-0 overflow-hidden ${
              showLogo ? 'bg-white' : 'bg-slate-900 text-4xl font-display font-bold text-white'
            }`}
          >
            {showLogo ? (
              <img
                src={company.logoUrl!}
                alt={`${company.name} logo`}
                className="w-full h-full object-contain p-3"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              company.name.substring(0, 2).toUpperCase()
            )}
          </div>

          <div className="flex-1">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <h1 className="text-4xl font-display font-bold text-slate-900 mb-2">{company.name}</h1>
                <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mb-4">
                  <span className="flex items-center gap-1"><MapPin size={16} /> {locationLabel}</span>
                  {joinedLabel && <span className="flex items-center gap-1"><Calendar size={16} /> {joinedLabel}</span>}
                  {ratingLabel && (
                    <span className="flex items-center gap-1 text-yellow-500 font-bold bg-yellow-50 px-2 py-0.5 rounded-full border border-yellow-200">
                      <Star size={14} fill="currentColor" /> {ratingLabel}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={!emailHref && !phoneHref}
                  onClick={() => {
                    const target = emailHref || phoneHref;
                    if (target) window.location.href = target;
                  }}
                  className={`flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl font-medium text-slate-700 transition-colors ${
                    hasDirectContact ? 'hover:bg-gray-50' : 'opacity-60 cursor-not-allowed'
                  }`}
                >
                  <MessageCircle size={18} /> Message
                </button>
                <button
                  type="button"
                  disabled={!phoneHref && !emailHref}
                  onClick={() => {
                    const target = phoneHref || emailHref;
                    if (target) window.location.href = target;
                  }}
                  className={`flex items-center gap-2 px-4 py-2 bg-brand-accent text-white rounded-xl font-medium transition-colors shadow-lg shadow-yellow-500/20 ${
                    hasDirectContact ? 'hover:bg-yellow-500' : 'opacity-60 cursor-not-allowed'
                  }`}
                >
                  <Phone size={18} /> Contact
                </button>
              </div>
            </div>

            <p className="text-slate-600 leading-relaxed max-w-3xl mb-3">
              {company.description || 'Company profile details are managed inside Aiven Rental.'}
            </p>

            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              {company.email && (
                <a
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-gray-200 hover:border-brand-accent hover:text-brand-accent transition-colors"
                  href={emailHref || undefined}
                  onClick={(e) => {
                    if (!emailHref) e.preventDefault();
                  }}
                >
                  <Mail size={16} /> {company.email}
                </a>
              )}
              {company.phone && (
                <a
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-gray-200 hover:border-brand-accent hover:text-brand-accent transition-colors"
                  href={phoneHref || undefined}
                  onClick={(e) => {
                    if (!phoneHref) e.preventDefault();
                  }}
                >
                  <Phone size={16} /> {company.phone}
                </a>
              )}
              {websiteHref && (
                <a
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-gray-200 hover:border-brand-accent hover:text-brand-accent transition-colors"
                  href={websiteHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Globe size={16} /> {websiteDisplay}
                </a>
              )}
              {!hasContact && (
                <span className="text-xs text-slate-500">No contact details provided yet.</span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Company Inventory */}
      <div>
        <h2 className="text-2xl font-display font-bold text-slate-900 mb-6">Current Inventory ({items.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
           {items.map(item => (
             <Card3D 
                key={item.id} 
                item={item} 
                onClick={() => onSelectItem(item)} 
                showOwner={false} // Don't show owner link since we are on the profile
             />
           ))}
        </div>
        {items.length === 0 && (
          <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed border-gray-300">
            <p className="text-slate-500">No equipment currently listed.</p>
          </div>
        )}
      </div>
    </div>
  );
};
