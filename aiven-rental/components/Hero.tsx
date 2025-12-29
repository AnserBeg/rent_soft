import React from 'react';
import { ViewState } from '../types';
import { motion } from 'framer-motion';
import { ArrowRight, UserCircle } from 'lucide-react';

interface HeroProps {
  setView: (view: ViewState) => void;
}

export const Hero: React.FC<HeroProps> = ({ setView }) => {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 pt-20 overflow-hidden">
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 shadow-sm mb-8"
        >
          <span className="w-2 h-2 rounded-full bg-brand-accent animate-pulse" />
          <span className="text-sm font-medium text-slate-600 tracking-wide uppercase">The Future of Equipment Rental</span>
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-6xl md:text-8xl font-display font-bold leading-tight mb-8 text-slate-900"
        >
          RENT SMARTER.<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-700 via-brand-accent to-slate-900">BUILD FASTER.</span>
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-xl text-slate-600 mb-12 max-w-2xl mx-auto leading-relaxed"
        >
          Aiven Rental is the premier B2B marketplace for industrial equipment. 
          Rent top-tier machinery or monetize your idle assets.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <button 
            onClick={() => setView('marketplace')}
            className="w-full sm:w-auto px-8 py-4 bg-brand-accent text-white font-bold text-lg rounded-xl hover:bg-yellow-500 shadow-lg shadow-yellow-500/20 transition-all flex items-center justify-center gap-2 group"
          >
            Browse Inventory
            <ArrowRight className="group-hover:translate-x-1 transition-transform" />
          </button>
          
          <button 
            onClick={() => setView('login')}
            className="w-full sm:w-auto px-8 py-4 bg-white text-slate-900 font-bold text-lg rounded-xl border border-gray-200 hover:bg-gray-50 shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            <UserCircle size={20} />
            Partner Login
          </button>
        </motion.div>
      </div>
    </div>
  );
};