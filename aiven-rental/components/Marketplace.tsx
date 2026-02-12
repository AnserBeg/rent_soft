import React, { useEffect, useState } from 'react';
import { Equipment, Company } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Search, Calendar, User as UserIcon } from 'lucide-react';

interface MarketplaceProps {
  items: Equipment[];
  companies: Company[];
  loading?: boolean;
  error?: string | null;
  onSearch: (params: { searchText: string; location: string; startDate: string; endDate: string }) => void;
  onSelect: (item: Equipment) => void;
  onViewCompany: (companyId: string) => void;
}

interface Card3DProps {
  item: Equipment;
  onClick: () => void;
  ownerName?: string;
  onOwnerClick?: (e: React.MouseEvent) => void;
  showOwner?: boolean;
}

// Exporting Card3D so CompanyProfile can use it
export const Card3D: React.FC<Card3DProps> = ({ item, onClick, ownerName, onOwnerClick, showOwner = true }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    const width = e.currentTarget.offsetWidth;
    const index = Math.round(scrollLeft / width);
    setCurrentImageIndex(index);
  };
  const isRate = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value);
  const formatRate = (value: number) =>
    value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rateRows = [
    { label: 'Daily', value: item.dailyRate, suffix: '/day' },
    { label: 'Weekly', value: item.weeklyRate, suffix: '/week' },
    { label: 'Monthly', value: item.monthlyRate, suffix: '/month' },
  ].filter((rate): rate is { label: string; value: number; suffix: string } => isRate(rate.value));

  return (
    <motion.div
      layoutId={`card-${item.id}`}
      onClick={onClick}
      className="group relative w-full cursor-pointer perspective-1000 h-full"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.3 }}
    >
      <div className="relative h-full bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden transform transition-all duration-500 style-preserve-3d group-hover:shadow-brand-accent/20 group-hover:border-brand-accent/30 flex flex-col">
        
        {/* Image Area with Scroll (fixed height keeps headers aligned across cards) */}
        <div className="h-64 w-full relative shrink-0 bg-gray-100">
          <div 
            className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
            onScroll={handleScroll}
          >
            {item.images.map((img, idx) => (
              <img 
                key={idx}
                src={img} 
                alt={`${item.name} - View ${idx + 1}`} 
                className="w-full h-full object-contain object-center flex-shrink-0 snap-center"
              />
            ))}
          </div>
          
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-brand-accent border border-gray-200 shadow-sm z-10">
            {item.category}
          </div>
          
          {/* Scroll Indicators */}
          {item.images.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 p-1.5 rounded-full bg-black/20 backdrop-blur-sm z-10">
              {item.images.map((_, i) => (
                <div 
                  key={i} 
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === currentImageIndex ? 'bg-white scale-125' : 'bg-white/40'}`} 
                />
              ))}
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="p-5 flex flex-col flex-1">
          <div className="mb-2 grid grid-rows-[1.25rem_3.5rem] gap-2">
            <div className="flex items-center justify-between gap-3 h-5 whitespace-nowrap">
              <div className="flex items-center gap-2 text-slate-500 text-xs min-w-0 flex-1 overflow-hidden">
                <MapPin size={12} className="shrink-0" />
                <span className="truncate">{item.location || '—'}</span>
              </div>
              {showOwner && ownerName ? (
                <button
                  onClick={onOwnerClick}
                  className="flex items-center gap-1 text-xs font-bold text-brand-secondary hover:underline z-10 min-w-0 max-w-[45%]"
                >
                  <UserIcon size={12} className="shrink-0" />
                  <span className="truncate">{ownerName}</span>
                </button>
              ) : (
                <div className="h-5" aria-hidden="true" />
              )}
            </div>

            <h3 className="text-lg font-display font-bold text-slate-900 group-hover:text-brand-accent transition-colors line-clamp-2 leading-snug h-[3.5rem] overflow-hidden">
              {item.name}
            </h3>
          </div>

          <div className="flex-1">
             <p className="text-sm text-slate-500 line-clamp-3 mt-2 min-h-[3.75rem]">{item.description}</p>
          </div>

          {/* Footer */}
          <div className="mt-auto pt-4 flex items-start justify-between border-t border-gray-50 gap-3">
             <div className="min-w-0">
                {rateRows.length ? (
                  <div className="flex flex-col gap-1">
                    {rateRows.map((rate) => (
                      <div key={rate.label} className="flex items-baseline gap-2 text-slate-900">
                        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-400">
                          {rate.label}
                        </span>
                        <span className="text-sm font-bold">${formatRate(rate.value)}</span>
                        <span className="text-[0.65rem] text-slate-400 font-medium">{rate.suffix}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm font-semibold text-slate-500">Request Quote</div>
                )}
             </div>
             <button className="px-4 py-2 bg-slate-900 hover:bg-brand-accent hover:text-white text-white border border-transparent rounded-lg text-xs font-bold transition-all shadow-md">
                RENT NOW
             </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const Marketplace: React.FC<MarketplaceProps> = ({
  items,
  companies,
  loading = false,
  error = null,
  onSearch,
  onSelect,
  onViewCompany,
}) => {
  const [searchText, setSearchText] = useState('');
  const [searchLocation, setSearchLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Helper to get company name
  const getCompany = (id: string) => companies.find(c => c.id === id);

  useEffect(() => {
    onSearch({ searchText: '', location: '', startDate: '', endDate: '' });
  }, [onSearch]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onSearch({ searchText, location: searchLocation, startDate, endDate });
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-24">
      {/* Search & Filter Section */}
      <div className="bg-white rounded-2xl p-6 shadow-xl border border-gray-100 mb-12">
        <form className="grid grid-cols-1 md:grid-cols-12 gap-4" onSubmit={handleSearch}>
          
          {/* Text Search - 4 cols */}
          <div className="md:col-span-4 relative">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Search Equipment</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Keywords or Company"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-gray-200 rounded-xl text-slate-900 focus:outline-none focus:border-brand-accent focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Location Search - 3 cols */}
          <div className="md:col-span-2 relative">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Location</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="City, State, or Zip"
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-gray-200 rounded-xl text-slate-900 focus:outline-none focus:border-brand-accent focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Date Search - 2 cols each */}
          <div className="md:col-span-2">
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Start</label>
             <div className="relative">
               <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
               <input 
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-10 pr-2 py-3 bg-slate-50 border border-gray-200 rounded-xl text-slate-900 focus:outline-none focus:border-brand-accent focus:bg-white transition-all text-sm"
               />
             </div>
          </div>

          <div className="md:col-span-2">
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">End</label>
             <div className="relative">
               <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
               <input 
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-10 pr-2 py-3 bg-slate-50 border border-gray-200 rounded-xl text-slate-900 focus:outline-none focus:border-brand-accent focus:bg-white transition-all text-sm"
               />
            </div>
          </div>
          
          <div className="md:col-span-2 flex items-end">
            <div className="w-full grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setSearchText('');
                  setSearchLocation('');
                  setStartDate('');
                  setEndDate('');
                  onSearch({ searchText: '', location: '', startDate: '', endDate: '' });
                }}
                className="py-3 bg-slate-100 text-slate-500 hover:text-slate-900 font-bold rounded-xl text-sm transition-colors"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={loading}
                className="py-3 bg-slate-900 text-white hover:bg-brand-accent font-bold rounded-xl text-sm transition-colors disabled:opacity-60"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-3xl font-display font-bold text-slate-900">
           {items.length} Result{items.length !== 1 && 's'} Found
        </h2>
      </div>
      <div className="mb-8 text-sm">
        {loading ? (
          <span className="text-slate-500">Loading listings…</span>
        ) : error ? (
          <span className="text-red-600 font-semibold">{error}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <AnimatePresence>
          {items.map((item) => (
             <Card3D 
               key={item.id} 
               item={item} 
               onClick={() => onSelect(item)} 
               ownerName={getCompany(item.ownerId)?.name}
               onOwnerClick={(e) => {
                 e.stopPropagation();
                 onViewCompany(item.ownerId);
               }}
             />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
