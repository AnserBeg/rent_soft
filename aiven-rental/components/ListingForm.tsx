import React, { useState } from 'react';
import { generateListingDetails } from '../services/gemini';
import { Equipment } from '../types';
import { motion } from 'framer-motion';
import { Sparkles, Check, Loader2, ArrowRight } from 'lucide-react';

interface ListingFormProps {
  onAddItem: (item: Equipment) => void;
  onCancel: () => void;
}

export const ListingForm: React.FC<ListingFormProps> = ({ onAddItem, onCancel }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [condition, setCondition] = useState('Good');
  const [location, setLocation] = useState('New York, NY');
  
  // AI Generated / Editable State
  const [generatedData, setGeneratedData] = useState<{
    description: string;
    price: number;
    category: string;
    specs: Record<string, string>;
  } | null>(null);

  const handleGenerate = async () => {
    if (!name) return;
    setLoading(true);
    try {
      const data = await generateListingDetails(name, condition);
      setGeneratedData({
        description: data.description,
        price: data.suggestedPrice,
        category: data.category,
        specs: data.specs,
      });
      setStep(2);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!generatedData) return;
    
    const newItem: Equipment = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      category: generatedData.category,
      pricePerDay: generatedData.price,
      description: generatedData.description,
      specs: generatedData.specs,
      images: [`https://picsum.photos/seed/${name}/600/400`], // Placeholder
      ownerId: 'current-user',
      available: true,
      location,
    };
    
    onAddItem(newItem);
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-6 py-24 relative z-10">
      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/90 backdrop-blur-xl border border-gray-200 rounded-3xl p-8 md:p-12 shadow-2xl"
      >
        <div className="mb-8">
           <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">List New Equipment</h2>
           <p className="text-slate-500">Turn your idle assets into revenue. Use AI to auto-fill details.</p>
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">Equipment Name / Model</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Caterpillar 320 Excavator"
                className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-brand-accent focus:bg-white transition-all shadow-inner"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Condition</label>
                <select 
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-brand-accent focus:bg-white transition-all shadow-inner"
                >
                  <option>New</option>
                  <option>Like New</option>
                  <option>Good</option>
                  <option>Fair</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Location</label>
                <input 
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-brand-accent focus:bg-white transition-all shadow-inner"
                />
              </div>
            </div>

            <button 
              onClick={handleGenerate}
              disabled={loading || !name}
              className="w-full bg-gradient-to-r from-brand-accent to-yellow-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-accent/20"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {loading ? 'Analyzing with AI...' : 'Auto-Generate Listing'}
            </button>
          </div>
        )}

        {step === 2 && generatedData && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="p-4 bg-brand-accent/5 border border-brand-accent/20 rounded-xl">
               <div className="flex items-start gap-3">
                  <Sparkles className="text-brand-accent mt-1 flex-shrink-0" size={20} />
                  <div>
                    <h4 className="text-brand-accent font-bold mb-1">AI Suggestion</h4>
                    <p className="text-sm text-slate-600 italic">"{generatedData.description}"</p>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
               <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">Category</label>
                  <input 
                    type="text" 
                    value={generatedData.category}
                    onChange={(e) => setGeneratedData({...generatedData, category: e.target.value})}
                    className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-3 text-slate-900"
                  />
               </div>
               <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">Daily Price ($)</label>
                  <input 
                    type="number" 
                    value={generatedData.price}
                    onChange={(e) => setGeneratedData({...generatedData, price: Number(e.target.value)})}
                    className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-3 text-slate-900"
                  />
               </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">Key Specs</label>
              <div className="bg-slate-50 rounded-xl p-4 border border-gray-200 space-y-2">
                 {Object.entries(generatedData.specs).map(([k, v], idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                       <span className="text-slate-500">{k}</span>
                       <span className="text-slate-900 font-medium">{v}</span>
                    </div>
                 ))}
              </div>
            </div>

            <div className="flex gap-4 pt-4">
               <button 
                 onClick={() => setStep(1)}
                 className="flex-1 py-3 text-slate-500 font-medium hover:text-slate-900 transition-colors"
               >
                 Back
               </button>
               <button 
                 onClick={handleSubmit}
                 className="flex-1 bg-brand-accent text-white font-bold py-3 rounded-xl hover:bg-yellow-500 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/20"
               >
                 <Check size={18} /> Publish Listing
               </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};
