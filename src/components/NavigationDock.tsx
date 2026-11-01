import React from 'react';

interface NavigationDockProps {
  activeScreen: 'home' | 'search' | 'analytics';
  onNavigate: (screen: 'home' | 'search' | 'analytics') => void;
  onLogoutClick: () => void;
  onOpenSlipModal?: () => void;
  onOpenUserMonitoring?: () => void;
  isAdmin?: boolean;
  onOpenAdminPanel?: () => void;
}

export const NavigationDock: React.FC<NavigationDockProps> = ({
  activeScreen,
  onNavigate,
  onOpenSlipModal,
  isAdmin,
  onOpenAdminPanel,
}) => {
  return (
    <nav
      role="navigation"
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 w-full sm:bottom-4 sm:max-w-xl mx-auto z-40 bg-white/95 backdrop-blur-md border-t sm:border border-slate-200/90 sm:rounded-full shadow-[0_-4px_20px_rgba(0,0,0,0.06)] sm:shadow-2xl h-16 sm:h-14 flex items-center justify-around px-2 select-none transition-all"
    >
      {/* 1. Home Tab */}
      <button
        type="button"
        onClick={() => onNavigate('home')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 transition-all duration-150 cursor-pointer active:scale-90 ${
          activeScreen === 'home'
            ? 'text-indigo-600 font-extrabold'
            : 'text-slate-500 hover:text-slate-800'
        }`}
        title="হোম পেজ"
      >
        <div
          className={`w-9 h-6 flex items-center justify-center rounded-full transition-all duration-200 ${
            activeScreen === 'home' ? 'bg-indigo-100 text-indigo-700' : ''
          }`}
        >
          <span className="text-lg">🏠</span>
        </div>
        <span className="text-[10px] tracking-tight mt-0.5">হোম</span>
      </button>

      {/* 2. Search Tab */}
      <button
        type="button"
        onClick={() => onNavigate('search')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 transition-all duration-150 cursor-pointer active:scale-90 ${
          activeScreen === 'search'
            ? 'text-indigo-600 font-extrabold'
            : 'text-slate-500 hover:text-slate-800'
        }`}
        title="ভোটার অনুসন্ধান"
      >
        <div
          className={`w-9 h-6 flex items-center justify-center rounded-full transition-all duration-200 ${
            activeScreen === 'search' ? 'bg-indigo-100 text-indigo-700' : ''
          }`}
        >
          <span className="text-lg">🔍</span>
        </div>
        <span className="text-[10px] tracking-tight mt-0.5">অনুসন্ধান</span>
      </button>

      {/* 3. Voter Slip Maker Tab */}
      {onOpenSlipModal && (
        <button
          type="button"
          onClick={onOpenSlipModal}
          className="flex-1 flex flex-col items-center justify-center py-1.5 transition-all duration-150 cursor-pointer active:scale-90 text-emerald-700 hover:text-emerald-800"
          title="ভোটার স্লিপ তৈরি ও থার্মাল প্রিন্ট"
        >
          <div className="w-9 h-6 flex items-center justify-center rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700 shadow-xs">
            <span className="text-base">🗳️</span>
          </div>
          <span className="text-[10px] font-bold tracking-tight mt-0.5 text-emerald-800">
            ভোটার স্লিপ
          </span>
        </button>
      )}

      {/* 4. Analytics Tab */}
      <button
        type="button"
        onClick={() => onNavigate('analytics')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 transition-all duration-150 cursor-pointer active:scale-90 relative ${
          activeScreen === 'analytics'
            ? 'text-pink-600 font-extrabold'
            : 'text-slate-500 hover:text-slate-800'
        }`}
        title="ডাটা অ্যানালাইসিস"
      >
        <div
          className={`w-9 h-6 flex items-center justify-center rounded-full transition-all duration-200 relative ${
            activeScreen === 'analytics' ? 'bg-pink-100 text-pink-700' : ''
          }`}
        >
          <span className="text-lg">📊</span>
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-pink-500 rounded-full" />
        </div>
        <span className="text-[10px] tracking-tight mt-0.5">অ্যানালাইসিস</span>
      </button>

      {/* 5. Admin Panel Tab (Only for authorized Admin emails) */}
      {isAdmin && onOpenAdminPanel && (
        <button
          type="button"
          onClick={onOpenAdminPanel}
          className="flex-1 flex flex-col items-center justify-center py-1.5 transition-all duration-150 cursor-pointer active:scale-90 text-indigo-950 relative"
          title="সুপার অ্যাডমিন ড্যাশবোর্ড"
        >
          <div className="w-9 h-6 flex items-center justify-center rounded-full bg-slate-900 text-white shadow-sm relative">
            <span className="text-xs">⚙️</span>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          </div>
          <span className="text-[10px] font-black tracking-tight mt-0.5 text-slate-900">
            অ্যাডমিন
          </span>
        </button>
      )}
    </nav>
  );
};
