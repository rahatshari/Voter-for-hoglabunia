import React, { useState, useEffect } from 'react';
import { AppGlobalConfig } from '../types';
import { auth } from '../lib/firebase';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';

const RECOMMENDED_RTDB_RULES = `{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}`;

interface AdminControlsTabProps {
  appConfig: AppGlobalConfig;
  onlineCount: number;
  historyCount: number;
  dataSource: 'firebase' | 'server' | 'local';
  cloudConnected: boolean;
  cloudError: string | null;
  onSaveConfig: (cfg: AppGlobalConfig) => Promise<void>;
  onKickAllSessions: () => Promise<void>;
  onForceRefresh: () => void;
}

export const AdminControlsTab: React.FC<AdminControlsTabProps> = ({
  appConfig,
  onlineCount,
  historyCount,
  dataSource,
  cloudConnected,
  cloudError,
  onSaveConfig,
  onKickAllSessions,
  onForceRefresh,
}) => {
  const [draft, setDraft] = useState<AppGlobalConfig>(appConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [isKickingAll, setIsKickingAll] = useState(false);
  const [confirmKickAll, setConfirmKickAll] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);

  useEffect(() => {
    setDraft(appConfig);
  }, [appConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveConfig(draft);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKickAll = async () => {
    setIsKickingAll(true);
    try {
      await onKickAllSessions();
      setConfirmKickAll(false);
    } finally {
      setIsKickingAll(false);
    }
  };

  const firebaseAuthEmail = auth.currentUser?.email || null;

  return (
    <div className="space-y-4">
      {/* Firebase Cloud Sync Diagnostics Card */}
      <div
        className={`p-4 sm:p-5 rounded-3xl border shadow-xs space-y-3 ${
          cloudConnected && dataSource === 'firebase'
            ? 'bg-emerald-50/70 border-emerald-200'
            : 'bg-amber-50/80 border-amber-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">
              {cloudConnected && dataSource === 'firebase' ? '🟢' : '⚠️'}
            </span>
            <div>
              <h4 className="text-sm font-black text-slate-900">
                ফায়ারবেস ক্লাউড ও লগইন হিস্ট্রি সিঙ্ক স্ট্যাটাস
              </h4>
              <p className="text-xs text-slate-600">
                {cloudConnected && dataSource === 'firebase'
                  ? 'ফায়ারবেস রিয়েলটাইম ডাটাবেসের সাথে সরাসরি লাইভ সংযুক্ত। অ্যাপ আনইনস্টল করলেও লগইন হিস্ট্রি মুছবে না।'
                  : 'বর্তমানে ফায়ারবেস ক্লাউডের পরিবর্তে ব্যাকআপ মোডে চলছে। নিচের তথ্য যাচাই করুন।'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onForceRefresh}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-xs font-bold cursor-pointer transition"
          >
            🔄 পুনরায় পরীক্ষা করুন
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/70">
            <span className="text-[10px] font-bold text-slate-500 block">ডাটা সোর্স</span>
            <span className="font-extrabold text-slate-900">
              {dataSource === 'firebase'
                ? 'Firebase Cloud (Realtime)'
                : dataSource === 'server'
                ? 'Express Server Fallback'
                : 'Local Storage Cache'}
            </span>
          </div>
          <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/70">
            <span className="text-[10px] font-bold text-slate-500 block">ফায়ারবেস Auth লগইন</span>
            <span className="font-extrabold text-slate-900 truncate block">
              {firebaseAuthEmail || 'লগইন নেই (Dev / Offline)'}
            </span>
          </div>
          <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/70">
            <span className="text-[10px] font-bold text-slate-500 block">মোট সংরক্ষিত হিস্ট্রি</span>
            <span className="font-extrabold text-indigo-900">
              {convertToBengaliNumbers(historyCount)} টি রেকর্ড
            </span>
          </div>
        </div>

        {cloudError && (
          <div className="bg-white p-3.5 rounded-2xl border border-amber-300 space-y-2.5 text-xs">
            <div className="font-bold text-red-700">
              কারণ: {cloudError}
            </div>
            <p className="text-[11px] text-slate-700 leading-relaxed">
              যদি আসল ফায়ারবেস অ্যাকাউন্ট দিয়ে লগইন করার পরেও <strong>Permission denied</strong> দেখায়, তবে Firebase Console &gt; Realtime Database &gt; Rules-এ গিয়ে নিচের রুলসটি পাবলিশ করুন:
            </p>
            <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-800/80 border-b border-slate-700/70">
                <span className="text-[10px] font-bold text-slate-300 font-sans">database.rules.json</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(RECOMMENDED_RTDB_RULES);
                    setCopiedRules(true);
                    setTimeout(() => setCopiedRules(false), 2500);
                  }}
                  className="px-2.5 py-1 bg-white/15 hover:bg-white/25 text-white rounded-lg font-sans text-[10px] font-bold cursor-pointer transition"
                >
                  {copiedRules ? '✓ কপি হয়েছে' : '📋 রুলস কপি করুন'}
                </button>
              </div>
              <pre className="text-emerald-300 p-3 font-mono text-[11px] overflow-x-auto">{RECOMMENDED_RTDB_RULES}</pre>
            </div>
            <div>
              <a
                href="https://console.firebase.google.com/project/voter-apps-14962/database/voter-apps-14962-default-rtdb/rules"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-indigo-700 font-bold hover:underline text-[11px]"
              >
                <span>Firebase Realtime Database Rules খুলুন</span>
                <span>↗</span>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* App Global Control Form */}
      <form
        onSubmit={handleSave}
        className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5"
      >
        <div className="border-b border-slate-100 pb-3">
          <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
            <span>🎛️</span> গ্লোবাল অ্যাপ কন্ট্রোল ও নিরাপত্তা সেটিংস
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            এখান থেকে করা প্রতিটি পরিবর্তন সাথে সাথে সব ব্যবহারকারীর অ্যাপে রিয়েল-টাইম কার্যকর হবে।
          </p>
        </div>

        {/* 1. Single Device Enforcement */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3">
          <div>
            <label htmlFor="cfg-single-device" className="text-xs sm:text-sm font-extrabold text-slate-900 cursor-pointer block">
              🔒 এক জিমেইলে শুধুমাত্র একটি ডিভাইস লগইন নীতি
            </label>
            <p className="text-[11px] text-slate-500 mt-0.5">
              চালু থাকলে নতুন মোবাইলে লগইন করলে আগের মোবাইল থেকে স্বয়ংক্রিয়ভাবে লগআউট হয়ে যাবে।
            </p>
          </div>
          <input
            id="cfg-single-device"
            type="checkbox"
            checked={draft.enforceSingleDevice}
            onChange={(e) => setDraft({ ...draft, enforceSingleDevice: e.target.checked })}
            className="w-5 h-5 accent-indigo-600 cursor-pointer shrink-0 mt-0.5"
          />
        </div>

        {/* 2. Global Announcement Banner */}
        <div className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <label htmlFor="cfg-announce-toggle" className="text-xs sm:text-sm font-extrabold text-slate-900 cursor-pointer block">
                📢 গ্লোবাল নোটিশ / ঘোষণা ব্যানার
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">
                চালু করলে সব ব্যবহারকারীর অ্যাপের একদম উপরে জরুরি বার্তা প্রদর্শিত হবে।
              </p>
            </div>
            <input
              id="cfg-announce-toggle"
              type="checkbox"
              checked={draft.announcementEnabled}
              onChange={(e) => setDraft({ ...draft, announcementEnabled: e.target.checked })}
              className="w-5 h-5 accent-amber-600 cursor-pointer shrink-0 mt-0.5"
            />
          </div>

          <div>
            <label htmlFor="cfg-announce-text" className="sr-only">
              ঘোষণা বার্তা
            </label>
            <input
              id="cfg-announce-text"
              type="text"
              value={draft.announcementText}
              onChange={(e) => setDraft({ ...draft, announcementText: e.target.value })}
              placeholder="যেমন: আজ সন্ধ্যা ৬টায় নতুন ভোটার তালিকা আপডেট হবে..."
              className="w-full px-3.5 py-2.5 bg-white border border-amber-300 rounded-xl text-xs focus:outline-none focus:border-amber-600"
            />
          </div>
        </div>

        {/* 3. Maintenance Mode Lock */}
        <div className="p-3.5 rounded-2xl bg-red-50/40 border border-red-200/80 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <label htmlFor="cfg-maint-toggle" className="text-xs sm:text-sm font-extrabold text-red-900 cursor-pointer block">
                🔧 জরুরি মেইনটেন্যান্স লক (অ্যাডমিন ছাড়া সবার প্রবেশ বন্ধ)
              </label>
              <p className="text-[11px] text-slate-600 mt-0.5">
                চালু করলে সাধারণ ব্যবহারকারীরা অ্যাপে ঢুকতে পারবেন না; শুধুমাত্র অ্যাডমিনরা প্রবেশ করতে পারবেন।
              </p>
            </div>
            <input
              id="cfg-maint-toggle"
              type="checkbox"
              checked={draft.maintenanceMode}
              onChange={(e) => setDraft({ ...draft, maintenanceMode: e.target.checked })}
              className="w-5 h-5 accent-red-600 cursor-pointer shrink-0 mt-0.5"
            />
          </div>

          <div>
            <label htmlFor="cfg-maint-msg" className="sr-only">
              মেইনটেন্যান্স বার্তা
            </label>
            <input
              id="cfg-maint-msg"
              type="text"
              value={draft.maintenanceMessage}
              onChange={(e) => setDraft({ ...draft, maintenanceMessage: e.target.value })}
              placeholder="রক্ষণাবেক্ষণ বার্তা লিখুন..."
              className="w-full px-3.5 py-2.5 bg-white border border-red-200 rounded-xl text-xs focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-bold cursor-pointer transition shadow-md shadow-indigo-500/20"
        >
          {isSaving ? 'সংরক্ষণ হচ্ছে...' : '💾 সব গ্লোবাল কন্ট্রোল সংরক্ষণ ও কার্যকর করুন'}
        </button>
      </form>

      {/* Mass Session Control Card */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-slate-900">
            🚨 এক ক্লিকে সবাইকে লগআউট করান (Remote Emergency Logout)
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            আপনি ব্যতীত বর্তমানে অনলাইনে থাকা বাকি সকল ব্যবহারকারীর সেশন সাথে সাথে বন্ধ করে দেবে (সক্রিয়: {convertToBengaliNumbers(onlineCount)} জন)।
          </p>
        </div>

        {confirmKickAll ? (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 p-2 rounded-xl">
            <span className="text-xs font-bold text-red-800">নিশ্চিত লগআউট?</span>
            <button
              type="button"
              onClick={handleKickAll}
              disabled={isKickingAll}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              {isKickingAll ? 'বন্ধ হচ্ছে...' : 'হ্যাঁ, সবাইকে বন্ধ করুন'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmKickAll(false)}
              className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
            >
              না
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmKickAll(true)}
            className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold cursor-pointer transition"
          >
            🚪 সবাইকে লগআউট করান
          </button>
        )}
      </div>
    </div>
  );
};
