import React, { useMemo } from 'react';
import { ViewState } from '../types';
import { Box, Layers, LogIn, LogOut, Search, LayoutDashboard, UserCircle2, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { getCustomerAccount, getCustomerAccountToken } from '../services/customerAccountSession';
import { logout as logoutAll } from '../services/session';

interface NavbarProps {
  setView: (view: ViewState) => void;
  currentView: ViewState;
  isLoggedIn?: boolean;
  userRole?: string | null;
  userLabel?: string | null;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  setView,
  currentView,
  isLoggedIn = false,
  userRole = null,
  userLabel = null,
  onLogout,
}) => {
  const customerToken = getCustomerAccountToken();
  const customer = customerToken ? getCustomerAccount() : null;
  const hasAnyLogin = isLoggedIn || !!customerToken;
  const normalizedRole = userRole ? String(userRole).trim().toLowerCase() : "";
  const isDispatch = isLoggedIn && normalizedRole === "dispatch";
  const appHref = normalizedRole === "dispatch" ? "/dispatch.html" : "/work-bench.html";
  const appLabel = isDispatch ? "Open Dispatch" : "Open App";

  const customerProfileHref = useMemo(() => {
    if (!customerToken) return null;
    const returnTo = window.location.pathname + window.location.search + window.location.hash;
    const qs = new URLSearchParams();
    qs.set('returnTo', returnTo);
    const lastCompanyId = localStorage.getItem('rentSoft.customerLastCompanyId');
    if (lastCompanyId) qs.set('companyId', String(lastCompanyId));
    return `/customer-account.html?${qs.toString()}`;
  }, [customerToken]);

  const navItems = [
    { id: 'home', label: 'Home', icon: Box },
    { id: 'marketplace', label: 'Marketplace', icon: Layers },
    ...(!hasAnyLogin ? [{ id: 'login', label: 'Log In', icon: LogIn }] : []),
  ] as Array<{ id: ViewState; label: string; icon: any }>;

  const handleLogout = () => {
    if (!hasAnyLogin) return;
    const shouldReload = !isLoggedIn;
    logoutAll();
    if (isLoggedIn) onLogout?.();
    if (shouldReload) window.location.reload();
  };

  return (
    <motion.nav 
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 100 }}
      className="fixed top-0 left-0 right-0 z-50 px-4 py-2 bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div
          className={`flex items-center gap-2 ${isDispatch ? '' : 'cursor-pointer group'}`}
          onClick={isDispatch ? undefined : () => setView('home')}
        >
          <div className="w-7 h-7 bg-brand-accent rounded-lg flex items-center justify-center transform group-hover:rotate-12 transition-transform shadow-lg shadow-brand-accent/30">
             <Box className="text-white w-4 h-4" />
          </div>
          <span className="text-lg font-display font-bold tracking-wider text-slate-900">
            AIVEN<span className="text-brand-accent">RENTAL</span>
          </span>
        </div>

        {!isDispatch && (
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id as ViewState)}
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                  currentView === item.id 
                    ? 'text-brand-accent' 
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            ))}
            {isLoggedIn && (
              <a
                href={appHref}
                className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
              >
                <LayoutDashboard size={16} />
                {appLabel}
              </a>
            )}
          </div>
        )}

        <div className="flex items-center gap-4">
          {isDispatch && isLoggedIn && (
            <a
              href={appHref}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white/90 text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:shadow-sm transition-colors"
              title={appLabel}
            >
              <LayoutDashboard size={16} />
              <span className="text-xs font-semibold uppercase tracking-wide">{appLabel}</span>
            </a>
          )}
          {!isDispatch && (
            <>
              <button 
                onClick={() => setView('marketplace')}
                className="p-1 text-slate-400 hover:text-slate-900 transition-colors"
                title="Search Marketplace"
              >
                <Search size={18} />
              </button>
              {isLoggedIn ? (
                <div className="flex items-center gap-2">
                  <a
                    href="/settings.html"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white/90 text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:shadow-sm transition-colors"
                    title="View your profile"
                  >
                    <UserCircle2 size={16} />
                    <span className="max-w-[180px] truncate text-xs">{userLabel || 'Your profile'}</span>
                    <ChevronRight size={14} className="text-slate-400" />
                  </a>
                </div>
              ) : customerToken && customerProfileHref ? (
                <div className="flex items-center gap-2">
                  <a
                    href={customerProfileHref}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white/90 text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:shadow-sm transition-colors"
                    title="View your customer profile"
                  >
                    <UserCircle2 size={16} />
                    <span className="max-w-[180px] truncate text-xs">
                      {customer?.name || customer?.email || 'Customer profile'}
                    </span>
                    <ChevronRight size={14} className="text-slate-400" />
                  </a>
                </div>
              ) : (
                <button 
                  onClick={() => setView('login')}
                  className="w-7 h-7 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-400 hover:bg-brand-accent hover:text-white hover:border-brand-accent transition-colors md:hidden"
                  title="Log in"
                >
                  <LogIn size={14} />
                </button>
              )}
            </>
          )}
          {hasAnyLogin && (
            <button
              onClick={handleLogout}
              className="w-8 h-8 rounded-full border flex items-center justify-center transition-colors bg-slate-100 border-slate-300 text-slate-500 hover:bg-slate-900 hover:text-white hover:border-slate-900"
              title="Log out"
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>
    </motion.nav>
  );
};
