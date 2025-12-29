import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, Loader2, UserCircle } from 'lucide-react';
import { apiJson } from '../services/rentSoftApi';
import { RentSoftSession } from '../services/session';
import { setCustomerAccountSession } from '../services/customerAccountSession';

interface LoginProps {
  onLogin: (session: RentSoftSession, returnTo?: string | null) => void;
  returnTo?: string | null;
}

export const Login: React.FC<LoginProps> = ({ onLogin, returnTo = null }) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);
    try {
      let companySession: RentSoftSession | null = null;
      let customerSession: { customer: any; token: string; expiresAt?: string | null } | null = null;

      try {
        customerSession = await apiJson<any>('/api/customers/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
      } catch {
        customerSession = null;
      }

      try {
        companySession = await apiJson<RentSoftSession>('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
      } catch {
        companySession = null;
      }

      if (!customerSession && companySession?.user?.id) {
        try {
          customerSession = await apiJson<any>('/api/customers/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: companySession.user.name || 'Customer', email, password }),
          });
        } catch {
          customerSession = null;
        }
      }

      if (customerSession?.token && customerSession?.customer) {
        setCustomerAccountSession({ token: String(customerSession.token), customer: customerSession.customer });
      }

      if (companySession) {
        onLogin(companySession, returnTo);
        return;
      }

      if (customerSession?.token) {
        if (returnTo) {
          window.location.href = returnTo;
          return;
        }
        window.location.hash = '#/home';
        return;
      }

      throw new Error('Invalid email or password.');
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen flex items-center justify-center px-6 pt-32 pb-12 relative z-10">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/90 backdrop-blur-xl border border-gray-200 rounded-3xl p-8 md:p-10 shadow-2xl"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-accent rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-yellow-500/20">
            <UserCircle className="text-white w-8 h-8" />
          </div>
          <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">Welcome Back</h2>
          <p className="text-slate-500">
            One login keeps storefront and customer sessions synced: companies can list equipment and manage the rental-ready profiles their partners require, while individuals can still rent through the same credentials.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-gray-200 rounded-xl text-slate-900 focus:outline-none focus:border-brand-accent focus:bg-white transition-all font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                autoComplete="current-password"
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-gray-200 rounded-xl text-slate-900 focus:outline-none focus:border-brand-accent focus:bg-white transition-all font-medium"
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-brand-accent text-white font-bold py-4 rounded-xl hover:bg-yellow-500 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/20 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : <>Sign In <ArrowRight size={18} /></>}
          </button>
           {error && <div className="text-sm text-red-600 font-medium pt-1">{error}</div>}
        </form>

        <div className="mt-6 text-center text-sm text-slate-500 space-y-2">
          <p>
            Company accounts stay in sync with the marketplace and can update customer profiles on the fly, so your team can open the app, rent, and list without switching contexts.
          </p>
          <p>
            Need a customer profile?{' '}
            <a
              className="text-brand-accent font-bold hover:underline"
              href={`/customer-signup.html${returnTo ? `?returnTo=${encodeURIComponent(String(returnTo))}` : ''}`}
            >
              Customer sign up
            </a>
          </p>
          <p>
            Don&apos;t have a rental business account?{' '}
            <a className="text-brand-accent font-bold hover:underline" href="/signup.html">
              Sign up
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
};
