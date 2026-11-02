import React from 'react';

interface LoadingScreenProps {
  statusText?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  statusText = 'নিরাপত্তা যাচাই করা হচ্ছে...',
}) => {
  return (
    <div className="min-h-screen w-full bg-[#F0F3F8] flex items-center justify-center p-4 antialiased selection:bg-indigo-500 selection:text-white">
      <div className="bg-white w-full max-w-sm sm:max-w-md p-8 sm:p-10 rounded-3xl shadow-xl border border-slate-100 text-center flex flex-col items-center">
        {/* Prominent App Logo */}
        <div className="relative mb-5">
          <img
            src="./logo.png"
            alt="ইউনিয়ন ভোটার তালিকা লোগো"
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-contain shadow-lg border-2 border-indigo-100 p-1.5 bg-white ring-4 ring-indigo-50 transition-transform duration-300 hover:scale-105"
            onError={(e) => {
              // Fallback to icon if logo.png fails
              const target = e.target as HTMLImageElement;
              if (!target.src.includes('icon-192.png')) {
                target.src = './icon-192.png';
              }
            }}
          />
          <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full animate-ping" />
          <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full" />
        </div>

        {/* Title & Subtitle */}
        <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
          ইউনিয়ন ভোটার তালিকা
        </h1>
        <p className="text-slate-500 text-xs sm:text-sm mt-1.5 mb-6 font-medium">
          স্মার্ট ভোটার অনুসন্ধান ও তথ্য ব্যবস্থাপনা
        </p>

        {/* Loading Spinner & Status */}
        <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <div className="space-y-1">
            <p className="text-slate-700 text-sm font-bold tracking-tight">
              {statusText}
            </p>
            <p className="text-[11px] text-slate-400 font-medium">
              অনুগ্রহ করে অপেক্ষা করুন...
            </p>
          </div>
        </div>

        {/* Security badge footer */}
        <div className="mt-6 flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
          <span>🔒</span>
          <span>নিরাপদ ক্লাউড ডাটাবেস দ্বারা সুরক্ষিত</span>
        </div>
      </div>
    </div>
  );
};
