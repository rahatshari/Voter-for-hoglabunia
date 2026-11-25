import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface LoadingScreenProps {
  statusText?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  statusText = 'নিরাপত্তা যাচাই করা হচ্ছে...',
}) => {
  return (
    <div className="min-h-screen w-full m3-surface flex items-center justify-center p-4 antialiased">
      <div className="m3-card-elevated w-full max-w-sm p-8 rounded-[28px] text-center flex flex-col items-center animate-m3-scale">
        <div className="relative mb-5">
          <img
            src="./logo.png"
            alt="ইউনিয়ন ভোটার তালিকা লোগো"
            className="w-24 h-24 rounded-3xl object-contain shadow-md border-2 border-[var(--md-primary-container)] p-2 bg-white"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (!target.src.includes('icon-192.png')) {
                target.src = './icon-192.png';
              }
            }}
          />
          <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-[var(--md-surface-container-lowest)] rounded-full animate-ping" />
          <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-[var(--md-surface-container-lowest)] rounded-full" />
        </div>

        <h1 className="text-xl sm:text-2xl font-black tracking-tight">
          হোগলাবুনিয়া ভোটার তালিকা
        </h1>
        <p className="text-[var(--md-on-surface-variant)] text-xs sm:text-sm mt-1 mb-6 font-medium">
          স্মার্ট ভোটার অনুসন্ধান ও তথ্য ব্যবস্থাপনা
        </p>

        <div className="w-full m3-card-filled p-4 flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-[3.5px] border-[var(--md-secondary-container)] border-t-[var(--md-primary)] rounded-full animate-spin" />
          <div className="space-y-0.5">
            <p className="text-sm font-bold tracking-tight">{statusText}</p>
            <p className="text-[11px] text-[var(--md-on-surface-variant)]">
              অনুগ্রহ করে অপেক্ষা করুন...
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-1.5 text-[11px] text-[var(--md-on-surface-variant)] font-semibold">
          <ShieldCheck className="w-3.5 h-3.5 text-[var(--md-primary)]" />
          <span>নিরাপদ ক্লাউড ও অফলাইন ডাটাবেস দ্বারা সুরক্ষিত</span>
        </div>
      </div>
    </div>
  );
};
