import React, { useEffect, useRef, useState } from 'react';
import { AppGlobalConfig, RemoteReleaseInfo } from '../types';
import { auth } from '../lib/firebase';
import {
  SECURE_RTDB_RULES_JSON,
  getCloudAppRelease,
  saveCloudAppRelease,
} from '../lib/cloudStore';
import {
  getInstalledAppVersion,
  normalizeApkDownloadUrl,
  parseVersionCodeFromTag,
} from '../lib/appUpdateUtils';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';

interface AdminControlsTabProps {
  appConfig: AppGlobalConfig;
  villageNames?: string[];
  onlineCount: number;
  historyCount: number;
  dataSource: 'firebase' | 'server' | 'local';
  cloudConnected: boolean;
  cloudError: string | null;
  onSaveConfig: (cfg: AppGlobalConfig) => Promise<void>;
  onKickAllSessions: () => Promise<void>;
  onForceRefresh: () => void;
}

function serializeAppConfig(cfg: AppGlobalConfig): string {
  return JSON.stringify([
    Boolean(cfg.enforceSingleDevice),
    cfg.autoUpdateEnabled !== false,
    cfg.allowSlipPrint !== false,
    [...(cfg.disabledVillages || [])].sort(),
    Boolean(cfg.announcementEnabled),
    cfg.announcementText || '',
    Boolean(cfg.maintenanceMode),
    cfg.maintenanceMessage || '',
  ]);
}

export const AdminControlsTab: React.FC<AdminControlsTabProps> = ({
  appConfig,
  villageNames = [],
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
  const [isDirty, setIsDirty] = useState(false);
  const lastSyncedKeyRef = useRef<string>(serializeAppConfig(appConfig));
  const [isSaving, setIsSaving] = useState(false);
  const [isKickingAll, setIsKickingAll] = useState(false);
  const [confirmKickAll, setConfirmKickAll] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);
  const [showRulesBox, setShowRulesBox] = useState(false);

  // OTA App Release Publisher State (/app_release)
  const [relVersionName, setRelVersionName] = useState('');
  const [relVersionCode, setRelVersionCode] = useState('');
  const [relApkUrl, setRelApkUrl] = useState('');
  const [relNotes, setRelNotes] = useState('');
  const [currentPublishedRel, setCurrentPublishedRel] = useState<RemoteReleaseInfo | null>(null);
  const [isPublishingRel, setIsPublishingRel] = useState(false);
  const [relNotice, setRelNotice] = useState<string | null>(null);

  useEffect(() => {
    const incomingKey = serializeAppConfig(appConfig);
    if (!isDirty && incomingKey !== lastSyncedKeyRef.current) {
      lastSyncedKeyRef.current = incomingKey;
      setDraft(appConfig);
    }
  }, [appConfig, isDirty]);

  useEffect(() => {
    let active = true;
    Promise.all([getCloudAppRelease(), getInstalledAppVersion()]).then(([cloudRel, installed]) => {
      if (!active) return;
      if (cloudRel) {
        setCurrentPublishedRel(cloudRel);
        setRelVersionName(cloudRel.versionName);
        setRelVersionCode(String(cloudRel.versionCode));
        setRelApkUrl(cloudRel.apkUrl);
        setRelNotes(cloudRel.releaseNotes);
      } else {
        setRelVersionName(installed.versionName);
        setRelVersionCode(String(installed.versionCode));
        setRelNotes(
          'নতুন আপডেটে উন্নত সার্চ, স্লিপ কাস্টমাইজার ও পারফরম্যান্স যুক্ত করা হয়েছে।'
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const updateDraft = (patch: Partial<AppGlobalConfig>) => {
    setIsDirty(true);
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const toggleVillageDisabled = (village: string) => {
    const current = new Set(draft.disabledVillages || []);
    if (current.has(village)) {
      current.delete(village);
    } else {
      current.add(village);
    }
    updateDraft({ disabledVillages: Array.from(current) });
  };

  const handleDiscardDraft = () => {
    lastSyncedKeyRef.current = serializeAppConfig(appConfig);
    setDraft(appConfig);
    setIsDirty(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveConfig(draft);
      lastSyncedKeyRef.current = serializeAppConfig(draft);
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanVer = relVersionName.replace(/^v/i, '').trim();
    const cleanUrl = normalizeApkDownloadUrl(relApkUrl);
    if (!cleanVer || !cleanUrl) {
      setRelNotice('⚠️ নতুন ভার্সন নম্বর এবং APK ডাউনলোড লিঙ্ক দিন।');
      return;
    }
    const parsedCode = parseInt(relVersionCode, 10) || parseVersionCodeFromTag(cleanVer);
    setIsPublishingRel(true);
    setRelNotice(null);
    try {
      const payload: RemoteReleaseInfo = {
        versionName: cleanVer,
        versionCode: parsedCode,
        apkUrl: cleanUrl,
        releaseNotes:
          relNotes.trim() ||
          `ভার্সন v${cleanVer} প্রকাশিত হয়েছে। নতুন ফিচার পেতে এখনই আপডেট করুন।`,
        publishedAt: new Date().toISOString(),
      };
      await saveCloudAppRelease(payload);
      setCurrentPublishedRel(payload);
      setRelApkUrl(cleanUrl);
      setRelVersionCode(String(parsedCode));
      setRelNotice(
        `✅ অটো-আপডেট v${cleanVer} ফায়ারবেসে লাইভ পাবলিশ হয়েছে! সব ইউজারের ফোনে স্বয়ংক্রিয় পপআপ চলে যাবে।`
      );
    } catch (err: any) {
      setRelNotice(`❌ পাবলিশ ব্যর্থ: ${err?.message || 'ফায়ারবেস পারমিশন চেক করুন'}`);
    } finally {
      setIsPublishingRel(false);
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
  const disabledSet = new Set(draft.disabledVillages || []);

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
                ফায়ারবেস ক্লাউড ও রিয়েল-টাইম কন্ট্রোল স্ট্যাটাস
              </h4>
              <p className="text-xs text-slate-600">
                {cloudConnected && dataSource === 'firebase'
                  ? 'ফায়ারবেস রিয়েলটাইম ডাটাবেসের সাথে সরাসরি লাইভ সংযুক্ত।'
                  : 'বর্তমানে ব্যাকআপ মোডে চলছে। ইন্টারনেট ও ফায়ারবেস যাচাই করুন।'}
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
              {firebaseAuthEmail || 'লগইন নেই'}
            </span>
          </div>
          <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/70">
            <span className="text-[10px] font-bold text-slate-500 block">মোট সংরক্ষিত হিস্ট্রি</span>
            <span className="font-extrabold text-indigo-900">
              {convertToBengaliNumbers(historyCount)} টি রেকর্ড
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {!cloudError ? (
            <button
              type="button"
              onClick={() => setShowRulesBox((v) => !v)}
              className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 underline cursor-pointer"
            >
              {showRulesBox
                ? '🔽 নিরাপদ Firebase Rules লুকান'
                : '🛡️ নিরাপদ Firebase Database Rules দেখুন ও কপি করুন'}
            </button>
          ) : (
            <span className="text-[11px] font-bold text-amber-800">
              🛡️ নিরাপদ Firebase Database Rules নির্দেশিকা:
            </span>
          )}
          <a
            href="https://console.firebase.google.com/project/voter-ba30b/database/voter-ba30b-default-rtdb/rules"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-indigo-700 font-bold hover:underline text-[11px]"
          >
            <span>Firebase Console Rules খুলুন</span>
            <span>↗</span>
          </a>
        </div>

        {(cloudError || showRulesBox) && (
          <div className="bg-white p-3.5 rounded-2xl border border-amber-300 space-y-2.5 text-xs">
            {cloudError && <div className="font-bold text-red-700">কারণ: {cloudError}</div>}
            <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-800/80 border-b border-slate-700/70">
                <span className="text-[10px] font-bold text-slate-300 font-sans truncate">
                  database.rules.json (Secure)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(SECURE_RTDB_RULES_JSON);
                    setCopiedRules(true);
                    setTimeout(() => setCopiedRules(false), 2500);
                  }}
                  className="px-2.5 py-1 bg-white/15 hover:bg-white/25 text-white rounded-lg font-sans text-[10px] font-bold cursor-pointer transition shrink-0"
                >
                  {copiedRules ? '✓ কপি হয়েছে' : '📋 রুলস কপি করুন'}
                </button>
              </div>
              <pre className="text-emerald-300 p-3 font-mono text-[10px] leading-relaxed overflow-x-auto max-h-60">
                {SECURE_RTDB_RULES_JSON}
              </pre>
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
            <span>🎛️</span> গ্লোবাল অ্যাপ কন্ট্রোল, গ্রাম লক ও প্রিন্ট নিয়ন্ত্রণ
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            এখান থেকে করা প্রতিটি পরিবর্তন সাথে সাথে সব ব্যবহারকারীর অ্যাপে রিয়েল-টাইম কার্যকর হবে।
          </p>
        </div>

        {/* 1. Voter Slip Print Feature Toggle */}
        <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200 flex items-start justify-between gap-3">
          <div>
            <label
              htmlFor="cfg-allow-slip"
              className="text-xs sm:text-sm font-extrabold text-indigo-950 cursor-pointer block"
            >
              🗳️ ভোটার স্লিপ ও থার্মাল/পেজ প্রিন্ট অপশন সচল রাখুন
            </label>
            <p className="text-[11px] text-slate-600 mt-0.5">
              বন্ধ করলে সাধারণ ব্যবহারকারীদের অ্যাপ থেকে ভোটার স্লিপ তৈরি ও প্রিন্ট বাটন সাথে সাথে বন্ধ হয়ে যাবে (অ্যাডমিনরা সবসময় দেখতে পাবেন)।
            </p>
          </div>
          <input
            id="cfg-allow-slip"
            type="checkbox"
            checked={draft.allowSlipPrint !== false}
            onChange={(e) => updateDraft({ allowSlipPrint: e.target.checked })}
            className="w-5 h-5 accent-indigo-600 cursor-pointer shrink-0 mt-0.5"
          />
        </div>

        {/* 2. Per-Village Access Control (Disable/Enable Any Village) */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h5 className="text-xs sm:text-sm font-extrabold text-slate-900">
                🏡 গ্রামভিত্তিক ভোটার তথ্য চালু / বন্ধ নিয়ন্ত্রণ
              </h5>
              <p className="text-[11px] text-slate-500 mt-0.5">
                যে গ্রামের সুইচ বন্ধ (লক) করবেন, সাধারণ ব্যবহারকারীরা সেই গ্রামের কোনো ভোটার তথ্য দেখতে বা সার্চ করতে পারবেন না।
              </p>
            </div>
            {villageNames.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => updateDraft({ disabledVillages: [] })}
                  className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[11px] font-extrabold cursor-pointer"
                >
                  ✓ সব গ্রাম চালু
                </button>
                <button
                  type="button"
                  onClick={() => updateDraft({ disabledVillages: [...villageNames] })}
                  className="px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 text-[11px] font-extrabold cursor-pointer"
                >
                  🔒 সব গ্রাম বন্ধ
                </button>
              </div>
            )}
          </div>

          {villageNames.length === 0 ? (
            <p className="text-xs text-slate-500">গ্রামের তালিকা লোড হচ্ছে...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {villageNames.map((vName) => {
                const isLocked = disabledSet.has(vName);
                return (
                  <button
                    key={vName}
                    type="button"
                    onClick={() => toggleVillageDisabled(vName)}
                    className={`px-3 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 cursor-pointer transition ${
                      isLocked
                        ? 'bg-red-50 border-red-300 text-red-950'
                        : 'bg-white border-emerald-200 text-slate-900 hover:border-emerald-400'
                    }`}
                  >
                    <span className="text-xs font-extrabold truncate">{vName}</span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                        isLocked
                          ? 'bg-red-600 text-white'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isLocked ? '🔒 বন্ধ' : '🟢 চালু'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Single Device Enforcement */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3">
          <div>
            <label
              htmlFor="cfg-single-device"
              className="text-xs sm:text-sm font-extrabold text-slate-900 cursor-pointer block"
            >
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
            onChange={(e) => updateDraft({ enforceSingleDevice: e.target.checked })}
            className="w-5 h-5 accent-indigo-600 cursor-pointer shrink-0 mt-0.5"
          />
        </div>

        {/* 4. Global Auto Update Policy */}
        <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 flex items-start justify-between gap-3">
          <div>
            <label
              htmlFor="cfg-auto-update"
              className="text-xs sm:text-sm font-extrabold text-emerald-950 cursor-pointer block"
            >
              🚀 সবার জন্য অটো আপডেট চেক ও নোটিফিকেশন
            </label>
            <p className="text-[11px] text-slate-600 mt-0.5">
              চালু থাকলে নিচের রিলিজ পাবলিশার থেকে নতুন ভার্সন দিলে সবার ফোনে সাথে সাথে আপডেট পপআপ যাবে।
            </p>
          </div>
          <input
            id="cfg-auto-update"
            type="checkbox"
            checked={draft.autoUpdateEnabled !== false}
            onChange={(e) => updateDraft({ autoUpdateEnabled: e.target.checked })}
            className="w-5 h-5 accent-emerald-600 cursor-pointer shrink-0 mt-0.5"
          />
        </div>

        {/* 5. Global Announcement Banner */}
        <div className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <label
                htmlFor="cfg-announce-toggle"
                className="text-xs sm:text-sm font-extrabold text-slate-900 cursor-pointer block"
              >
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
              onChange={(e) => updateDraft({ announcementEnabled: e.target.checked })}
              className="w-5 h-5 accent-amber-600 cursor-pointer shrink-0 mt-0.5"
            />
          </div>

          <input
            id="cfg-announce-text"
            type="text"
            value={draft.announcementText}
            onChange={(e) => updateDraft({ announcementText: e.target.value })}
            placeholder="যেমন: আজ সন্ধ্যা ৬টায় নতুন ভোটার তালিকা আপডেট হবে..."
            className="w-full px-3.5 py-2.5 bg-white border border-amber-300 rounded-xl text-xs focus:outline-none focus:border-amber-600"
          />
        </div>

        {/* 6. Maintenance Mode Lock */}
        <div className="p-3.5 rounded-2xl bg-red-50/40 border border-red-200/80 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <label
                htmlFor="cfg-maint-toggle"
                className="text-xs sm:text-sm font-extrabold text-red-900 cursor-pointer block"
              >
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
              onChange={(e) => updateDraft({ maintenanceMode: e.target.checked })}
              className="w-5 h-5 accent-red-600 cursor-pointer shrink-0 mt-0.5"
            />
          </div>

          <input
            id="cfg-maint-msg"
            type="text"
            value={draft.maintenanceMessage}
            onChange={(e) => updateDraft({ maintenanceMessage: e.target.value })}
            placeholder="রক্ষণাবেক্ষণ বার্তা লিখুন..."
            className="w-full px-3.5 py-2.5 bg-white border border-red-200 rounded-xl text-xs focus:outline-none focus:border-red-500"
          />
        </div>

        {isDirty && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-bold">
            <span>✏️ আপনি সেটিংসে পরিবর্তন করেছেন — কার্যকর করতে নিচের বাটনে সংরক্ষণ করুন।</span>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="px-2.5 py-1 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg text-[10px] font-bold text-amber-900 cursor-pointer"
            >
              বাতিল করুন
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-bold cursor-pointer transition shadow-md shadow-indigo-500/20"
        >
          {isSaving ? 'সংরক্ষণ হচ্ছে...' : '💾 সব গ্লোবাল কন্ট্রোল সংরক্ষণ ও কার্যকর করুন'}
        </button>
      </form>

      {/* Live Firebase OTA App Update Release Publisher Card */}
      <form
        onSubmit={handlePublishRelease}
        className="bg-white p-4 sm:p-6 rounded-3xl border border-emerald-200 shadow-xs space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
              <span>📲</span> অটো-আপডেট রিলিজ পাবলিশার (Firebase Cloud OTA)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              যেহেতু GitHub রিপোজিটরি প্রাইভেট, তাই নতুন APK ফাইল Google Drive (Anyone with link) বা যেকোনো ডাইরেক্ট লিঙ্কে রেখে এখানে পাবলিশ করলেই সবার অ্যাপে সাথে সাথে অটো-আপডেট চলে আসবে!
            </p>
          </div>
          {currentPublishedRel && (
            <span className="text-[11px] font-extrabold px-3 py-1 rounded-full bg-emerald-100 text-emerald-900">
              বর্তমান লাইভ রিলিজ: v{currentPublishedRel.versionName} (#{currentPublishedRel.versionCode})
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              নতুন ভার্সন নাম (যেমন: 1.0.5)
            </label>
            <input
              type="text"
              value={relVersionName}
              onChange={(e) => {
                const v = e.target.value;
                setRelVersionName(v);
                const autoCode = parseVersionCodeFromTag(v);
                if (autoCode > 100) setRelVersionCode(String(autoCode));
              }}
              placeholder="1.0.5"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              ভার্সন কোড (আগের চেয়ে বড় সংখ্যা, যেমন: 105)
            </label>
            <input
              type="number"
              value={relVersionCode}
              onChange={(e) => setRelVersionCode(e.target.value)}
              placeholder="105"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-bold text-slate-700 mb-1">
              APK ডাউনলোড লিঙ্ক (Google Drive শেয়ার লিঙ্ক বা ডাইরেক্ট .apk URL)
            </label>
            <input
              type="url"
              value={relApkUrl}
              onChange={(e) => setRelApkUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-[11px]"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              💡 টিপস: Google Drive-এ APK আপলোড করে &quot;Anyone with the link&quot; করে লিঙ্কটি এখানে পেস্ট করলেই অ্যাপ স্বয়ংক্রিয়ভাবে ডাইরেক্ট ডাউনলোড লিঙ্কে রূপান্তর করে নেবে।
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="block font-bold text-slate-700 mb-1">রিলিজ নোটস (কী কী নতুন যুক্ত হয়েছে)</label>
            <input
              type="text"
              value={relNotes}
              onChange={(e) => setRelNotes(e.target.value)}
              placeholder="নতুন আপডেটে উন্নত সার্চ, স্লিপ কাস্টমাইজার ও বাগ ফিক্স যুক্ত হয়েছে।"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
        </div>

        {relNotice && (
          <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-950">
            {relNotice}
          </div>
        )}

        <button
          type="submit"
          disabled={isPublishingRel}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-black cursor-pointer transition shadow-md shadow-emerald-500/20"
        >
          {isPublishingRel
            ? 'পাবলিশ হচ্ছে...'
            : '🚀 নতুন APK অটো-আপডেট সব ফোনে পুশ করুন'}
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
