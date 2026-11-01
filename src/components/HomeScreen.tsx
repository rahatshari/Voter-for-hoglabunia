import React from 'react';
import { Voter } from '../types';
import { convertToBengaliNumbers, isMigrated } from '../lib/bengaliUtils';

interface HomeScreenProps {
  userEmail: string | null;
  villagesData: Record<string, Voter[]>;
  onSelectVillage: (villageName: string) => void;
  onOpenGlobalSearch: () => void;
  onOpenAnalytics: (villageName?: string) => void;
  onOpenSlipModal?: (voter?: Voter | null) => void;
  onOpenUserMonitoring?: () => void;
  isAdmin?: boolean;
  onOpenAdminPanel?: () => void;
  onLogoutClick: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  userEmail,
  villagesData,
  onSelectVillage,
  onOpenGlobalSearch,
  onOpenAnalytics,
  onOpenSlipModal,
  isAdmin,
  onOpenAdminPanel,
  onLogoutClick,
}) => {
  const villageNames = Object.keys(villagesData);

  // Total voters across all villages
  let grandTotalActive = 0;
  let grandTotalMigrated = 0;
  let totalMales = 0;
  let totalFemales = 0;

  Object.values(villagesData).forEach((list) => {
    list.forEach((v) => {
      const isMig = v._isMigrated !== undefined ? v._isMigrated : isMigrated(v);
      if (isMig) {
        grandTotalMigrated++;
      } else {
        grandTotalActive++;
        const g = v._gender || v.gender;
        if (g === 'পুরুষ') totalMales++;
        else if (g === 'মহিলা') totalFemales++;
      }
    });
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Responsive Top Bar for HomeScreen (Looks great on Mobile & PC) */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex items-center gap-3">
          <img
            src="./logo.png"
            alt="Logo"
            className="w-11 h-11 sm:w-12 sm:h-12 object-cover rounded-2xl border-2 border-indigo-100 shadow-sm shrink-0"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                গ্রাম নির্বাচন করুন
              </h1>
              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                অনলাইন
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium truncate max-w-[220px] sm:max-w-md">
              {userEmail ? (
                <span>লগইন: <strong className="text-slate-700 font-semibold">{userEmail}</strong></span>
              ) : (
                'ইউনিয়ন ভোটার তালিকা ও নির্বাচনী স্লিপ'
              )}
            </p>
          </div>
        </div>

        {/* Top Header Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Admin Panel Button (Only visible to authorized Admins) */}
          {isAdmin && onOpenAdminPanel && (
            <button
              type="button"
              onClick={onOpenAdminPanel}
              className="bg-slate-900 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs active:scale-95 transition cursor-pointer flex items-center gap-1.5"
              title="সুপার অ্যাডমিন ড্যাশবোর্ড"
            >
              <span>⚙️</span>
              <span>অ্যাডমিন প্যানেল</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
            </button>
          )}

          {/* Analytics Button */}
          <button
            type="button"
            onClick={() => onOpenAnalytics('all')}
            className="bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 px-3.5 py-2 rounded-xl text-xs font-bold active:scale-95 transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            title="ইউনিয়ন ভোটার ডাটা অ্যানালাইসিস"
          >
            <span>📊</span>
            <span className="hidden sm:inline">ডাটা</span> অ্যানালাইসিস
          </button>

          {/* Voter Slip Maker */}
          {onOpenSlipModal && (
            <button
              type="button"
              onClick={() => onOpenSlipModal(null)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold active:scale-95 transition cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="নির্বাচনী ভোটার স্লিপ প্রস্তুতকারক ও ব্লুটুথ প্রিন্টার"
            >
              <span>🗳️</span>
              <span>ভোটার স্লিপ</span>
            </button>
          )}

          {/* Logout Button */}
          <button
            type="button"
            onClick={onLogoutClick}
            className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-2 rounded-xl text-xs font-bold active:scale-95 transition cursor-pointer flex items-center gap-1"
            title="লগআউট"
          >
            <span>🚪</span>
            <span className="hidden sm:inline">লগআউট</span>
          </button>
        </div>
      </div>

      {/* 2. Responsive Summary KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 block">মোট সক্রিয় ভোটার</span>
          <span className="text-xl sm:text-2xl font-black text-indigo-900">
            {convertToBengaliNumbers(grandTotalActive)}
          </span>
          <span className="text-[10px] text-slate-400 font-medium block mt-0.5">অরিজিনাল ভোটার</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 block">পুরুষ ভোটার</span>
          <span className="text-xl sm:text-2xl font-black text-blue-600">
            {convertToBengaliNumbers(totalMales)}
          </span>
          <span className="text-[10px] text-slate-400 font-medium block mt-0.5">মোট পুরুষ</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 block">মহিলা ভোটার</span>
          <span className="text-xl sm:text-2xl font-black text-rose-600">
            {convertToBengaliNumbers(totalFemales)}
          </span>
          <span className="text-[10px] text-slate-400 font-medium block mt-0.5">মোট মহিলা</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 block">মোট গ্রাম এলাকা</span>
          <span className="text-xl sm:text-2xl font-black text-emerald-600">
            {convertToBengaliNumbers(villageNames.length)} টি
          </span>
          <span className="text-[10px] text-slate-400 font-medium block mt-0.5">তালিকাভুক্ত এলাকা</span>
        </div>
      </div>

      {/* 3. Quick Action Responsive Grid (2-cols on mobile, 4-cols on PC) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
        {/* Action 1: Search */}
        <button
          type="button"
          onClick={onOpenGlobalSearch}
          className="bg-white hover:bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200 shadow-xs hover:border-indigo-300 active:scale-95 transition cursor-pointer text-left flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xl shrink-0">
            🔍
          </div>
          <div className="min-w-0">
            <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 leading-tight">
              ভোটার খুঁজুন
            </h4>
            <p className="text-[10px] text-slate-500 truncate mt-0.5">নাম, পিতা বা ক্রমিক</p>
          </div>
        </button>

        {/* Action 2: Voter Slip */}
        <button
          type="button"
          onClick={() => onOpenSlipModal && onOpenSlipModal(null)}
          className="bg-white hover:bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-300 active:scale-95 transition cursor-pointer text-left flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-xl shrink-0">
            🗳️
          </div>
          <div className="min-w-0">
            <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 leading-tight">
              স্লিপ ও প্রিন্ট
            </h4>
            <p className="text-[10px] text-slate-500 truncate mt-0.5">থার্মাল ব্লুটুথ প্রিন্ট</p>
          </div>
        </button>

        {/* Action 3: Analytics */}
        <button
          type="button"
          onClick={() => onOpenAnalytics('all')}
          className="bg-white hover:bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200 shadow-xs hover:border-pink-300 active:scale-95 transition cursor-pointer text-left flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center text-xl shrink-0">
            📊
          </div>
          <div className="min-w-0">
            <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 leading-tight">
              অ্যানালাইসিস
            </h4>
            <p className="text-[10px] text-slate-500 truncate mt-0.5">পরিসংখ্যান ও চার্ট</p>
          </div>
        </button>

        {/* Action 4: Admin Panel or Global List */}
        {isAdmin && onOpenAdminPanel ? (
          <button
            type="button"
            onClick={onOpenAdminPanel}
            className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-3.5 rounded-2xl border border-slate-800 shadow-xs active:scale-95 transition cursor-pointer text-left flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl shrink-0 relative">
              ⚙️
              <span className="w-2 h-2 rounded-full bg-emerald-400 absolute top-1 right-1 animate-pulse" />
            </div>
            <div className="min-w-0">
              <h4 className="font-extrabold text-xs sm:text-sm text-white leading-tight">
                অ্যাডমিন প্যানেল
              </h4>
              <p className="text-[10px] text-indigo-200 truncate mt-0.5">ইউজার সময় ও সেশন</p>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenGlobalSearch}
            className="bg-white hover:bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-300 active:scale-95 transition cursor-pointer text-left flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-xl shrink-0">
              📋
            </div>
            <div className="min-w-0">
              <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 leading-tight">
                সম্পূর্ণ তালিকা
              </h4>
              <p className="text-[10px] text-slate-500 truncate mt-0.5">সব গ্রামের ভোটার</p>
            </div>
          </button>
        )}
      </div>

      {/* 4. Village List Section (2 cols on mobile, 3-4 cols on PC) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏡</span>
            <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
              গ্রামভিত্তিক ভোটার তালিকা ({convertToBengaliNumbers(villageNames.length)} টি)
            </h2>
          </div>
          <span className="text-xs text-indigo-600 font-bold">
            গ্রাম নির্বাচন করুন
          </span>
        </div>

        {villageNames.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200 p-6">
            <p className="text-xs text-slate-500 font-medium">কোনো গ্রামের ডাটা লোড করা যায়নি।</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {villageNames.map((village) => {
              const voters = villagesData[village] || [];
              const activeCount = voters.filter((v) =>
                v._isMigrated !== undefined ? !v._isMigrated : !isMigrated(v)
              ).length;
              const malesCount = voters.filter(
                (v) => (v._gender || v.gender) === 'পুরুষ'
              ).length;
              const femalesCount = voters.filter(
                (v) => (v._gender || v.gender) === 'মহিলা'
              ).length;

              return (
                <button
                  key={village}
                  type="button"
                  onClick={() => onSelectVillage(village)}
                  className="bg-white hover:bg-slate-50 active:scale-[0.99] border border-slate-200 hover:border-indigo-300 rounded-2xl p-4 transition-all shadow-xs hover:shadow-md flex items-center justify-between text-left cursor-pointer gap-3 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center text-xl shrink-0 font-bold group-hover:bg-indigo-600 group-hover:text-white transition">
                      🏡
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-sm sm:text-base text-slate-900 leading-tight truncate group-hover:text-indigo-600 transition">
                        {village}
                      </h3>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 font-medium flex-wrap">
                        <span className="flex items-center gap-0.5 text-blue-600 font-semibold">
                          <span>👨</span> {convertToBengaliNumbers(malesCount)}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5 text-rose-600 font-semibold">
                          <span>👩</span> {convertToBengaliNumbers(femalesCount)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right">
                      <span className="block font-black text-indigo-600 text-sm sm:text-base">
                        {convertToBengaliNumbers(activeCount)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">ভোটার</span>
                    </div>
                    <span className="text-slate-400 group-hover:text-indigo-600 text-lg transition">›</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
