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
  onLogoutClick: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  userEmail,
  villagesData,
  onSelectVillage,
  onOpenGlobalSearch,
  onOpenAnalytics,
  onOpenSlipModal,
  onLogoutClick,
}) => {
  const villageNames = Object.keys(villagesData);

  return (
    <div className="max-w-5xl mx-auto soft-card p-4 sm:p-6 pb-20">
      {/* Home Header */}
      <div className="flex flex-wrap justify-between items-center pb-4 mb-5 border-b border-slate-200/80 gap-3">
        <div className="flex items-center gap-3">
          <img
            src="./logo.png"
            alt="App Logo"
            className="w-12 h-12 object-cover rounded-full border-2 border-white shadow-md"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div>
            <h2 className="text-lg font-bold text-slate-800">গ্রাম নির্বাচন করুন</h2>
            {userEmail && (
              <span className="text-xs text-slate-500 font-semibold">{userEmail}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Analytics Button with vibrant gradient styling matching the user reference image */}
          <button
            type="button"
            onClick={() => onOpenAnalytics('all')}
            className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md hover:shadow-lg shadow-pink-500/25 cursor-pointer transition flex items-center gap-1.5"
            title="ইউনিয়ন ভোটার ডাটা অ্যানালাইসিস"
          >
            <span>📊</span> ডাটা অ্যানালাইসিস
          </button>

          {/* Voter Slip Maker Button */}
          {onOpenSlipModal && (
            <button
              type="button"
              onClick={() => onOpenSlipModal()}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md hover:shadow-lg shadow-emerald-600/25 cursor-pointer transition flex items-center gap-1.5"
              title="নির্বাচনী ভোটার স্লিপ প্রস্তুতকারক"
            >
              <span>🗳️</span> ভোটার স্লিপ
            </button>
          )}

          {/* Global Search Button */}
          <button
            type="button"
            onClick={onOpenGlobalSearch}
            className="soft-btn px-3 py-2 text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-xs font-bold cursor-pointer"
            title="সকল গ্রামের তথ্য খুঁজুন"
          >
            <span>🔍</span> গ্লোবাল সার্চ
          </button>

          {/* Logout Button */}
          <button
            type="button"
            onClick={onLogoutClick}
            className="soft-btn bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-2 text-xs font-bold cursor-pointer flex items-center gap-1.5"
            title="লগআউট"
          >
            🚪 লগআউট
          </button>
        </div>
      </div>

      {/* Villages Grid */}
      {villageNames.length === 0 ? (
        <div className="text-center py-16 text-red-500 font-bold border border-dashed border-red-200 rounded-2xl bg-red-50/50">
          এখনো কোনো গ্রামের ডাটা যোগ করা হয়নি।
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5 sm:gap-4">
          {villageNames.map((village) => {
            const voters = villagesData[village] || [];
            const activeCount = voters.filter((v) =>
              v._isMigrated !== undefined ? !v._isMigrated : !isMigrated(v)
            ).length;
            const migratedCount = voters.filter((v) =>
              v._isMigrated !== undefined ? v._isMigrated : isMigrated(v)
            ).length;
            const malesCount = voters.filter(
              (v) => (v._gender || v.gender) === 'পুরুষ'
            ).length;
            const femalesCount = voters.filter(
              (v) => (v._gender || v.gender) === 'মহিলা'
            ).length;

            return (
              <div
                key={village}
                className="soft-card p-4 text-center transition hover:-translate-y-1 hover:shadow-lg flex flex-col items-center justify-between gap-2.5 group relative border border-slate-200/70"
              >
                <div
                  onClick={() => onSelectVillage(village)}
                  className="w-full flex flex-col items-center cursor-pointer"
                >
                  <span className="text-3xl transition group-hover:scale-110 mb-1">📍</span>
                  <div className="flex items-center justify-center gap-1.5 flex-wrap mb-1.5">
                    <span className="font-bold text-slate-800 text-base group-hover:text-indigo-600">
                      {village}
                    </span>
                    <span className="text-[11px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full border border-slate-200">
                      মোট: {convertToBengaliNumbers(voters.length)}
                    </span>
                  </div>

                  {/* Original vs Struck-off / Migrated Voter Badges */}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5 w-full my-1">
                    <span
                      className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full font-bold shadow-xs w-full sm:w-auto"
                      title="অরিজিনাল / বৈধ ভোটার"
                    >
                      অরিজিনাল: {convertToBengaliNumbers(activeCount)} জন
                    </span>
                    {migratedCount > 0 ? (
                      <span
                        className="text-xs bg-rose-50 border border-rose-200 text-rose-600 px-2.5 py-1 rounded-full font-bold shadow-xs w-full sm:w-auto"
                        title="কর্তিত / মাইগ্রেটেড ভোটার"
                      >
                        কর্তিত: {convertToBengaliNumbers(migratedCount)} জন
                      </span>
                    ) : (
                      <span
                        className="text-[11px] bg-slate-50 border border-slate-200 text-slate-400 px-2 py-0.5 rounded-full font-medium"
                      >
                        কর্তিত: ০ জন
                      </span>
                    )}
                  </div>

                  {(malesCount > 0 || femalesCount > 0) && (
                    <span className="text-[11px] text-slate-500 mt-1 font-medium">
                      👨 {convertToBengaliNumbers(malesCount)} | 👩{' '}
                      {convertToBengaliNumbers(femalesCount)}
                    </span>
                  )}
                </div>

                {/* Village Quick Action Buttons */}
                <div className="w-full grid grid-cols-2 gap-1.5 pt-2.5 mt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onSelectVillage(village)}
                    className="py-1 px-1.5 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition cursor-pointer"
                  >
                    🔍 সার্চ
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAnalytics(village)}
                    className="py-1 px-1.5 text-[11px] font-bold text-pink-600 bg-pink-50 hover:bg-pink-100 rounded-lg transition cursor-pointer"
                  >
                    📊 গ্রাফ
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
