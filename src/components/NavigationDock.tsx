import React from 'react';

interface NavigationDockProps {
  activeScreen: 'home' | 'search' | 'analytics';
  onNavigate: (screen: 'home' | 'search' | 'analytics') => void;
  onLogoutClick: () => void;
  onOpenSlipModal?: () => void;
}

export const NavigationDock: React.FC<NavigationDockProps> = ({
  activeScreen,
  onNavigate,
  onLogoutClick,
  onOpenSlipModal,
}) => {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
      <nav className="soft-card px-3 py-2 flex items-center gap-1.5 sm:gap-2.5 rounded-full border border-slate-200/80 shadow-2xl backdrop-blur-md bg-white/95">
        {/* Home */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition cursor-pointer ${
            activeScreen === 'home'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-100'
          }`}
          title="হোম পেজ"
        >
          <span className="text-base">🏠</span>
          <span className="hidden sm:inline">হোম</span>
        </button>

        {/* Search */}
        <button
          type="button"
          onClick={() => onNavigate('search')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition cursor-pointer ${
            activeScreen === 'search'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-100'
          }`}
          title="ভোটার অনুসন্ধান"
        >
          <span className="text-base">🔍</span>
          <span className="hidden sm:inline">অনুসন্ধান</span>
        </button>

        {/* Voter Slip Maker */}
        {onOpenSlipModal && (
          <button
            type="button"
            onClick={onOpenSlipModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition cursor-pointer bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
            title="নির্বাচনী ভোটার স্লিপ তৈরি"
          >
            <span className="text-base">🗳️</span>
            <span className="hidden sm:inline">ভোটার স্লিপ</span>
          </button>
        )}

        {/* Analytics (New Material Data Analysis feature) */}
        <button
          type="button"
          onClick={() => onNavigate('analytics')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition cursor-pointer relative ${
            activeScreen === 'analytics'
              ? 'bg-pink-600 text-white shadow-md shadow-pink-500/25'
              : 'text-slate-600 hover:text-pink-600 hover:bg-slate-100'
          }`}
          title="ডাটা অ্যানালাইসিস"
        >
          <span className="text-base">📊</span>
          <span className="hidden sm:inline">অ্যানালাইসিস</span>
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-pink-500 rounded-full animate-ping" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-pink-500 rounded-full" />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-slate-200 mx-0.5" />

        {/* Logout */}
        <button
          type="button"
          onClick={onLogoutClick}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-full text-xs font-bold text-red-600 hover:bg-red-50 transition cursor-pointer"
          title="লগআউট"
        >
          <span className="text-base">🚪</span>
          <span className="hidden sm:inline">লগআউট</span>
        </button>
      </nav>
    </div>
  );
};
