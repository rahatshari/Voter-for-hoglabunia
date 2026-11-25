import React, { useState, useEffect } from 'react';
import { ApkDownloadState, AppUpdatePreferences, RemoteReleaseInfo } from '../types';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';
import {
  UpdateGraceStatus,
  formatRemainingGraceBengali,
  getAndroidNativeBridge,
  refreshWebAppCachesAndReload,
} from '../lib/appUpdateUtils';
import { InAppDownloadManagerPanel } from './InAppDownloadManagerPanel';
import { useLockBodyScroll } from '../lib/useLockBodyScroll';

interface AppUpdateSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVersionName: string;
  currentVersionCode: number;
  isAndroidNative: boolean;
  updateInfo: RemoteReleaseInfo | null;
  graceStatus: UpdateGraceStatus;
  downloadState: ApkDownloadState;
  isChecking: boolean;
  isUpdating: boolean;
  updateStatusText: string | null;
  lastCheckError: boolean;
  prefs: AppUpdatePreferences;
  globalAutoUpdateEnabled: boolean;
  onUpdatePrefs: (patch: Partial<AppUpdatePreferences>) => void;
  onManualCheck: () => void;
  onInstallUpdate: () => void;
  onCancelDownload: () => void;
  onInstallDownloadedApk: () => void;
}

export const AppUpdateSettingsModal: React.FC<AppUpdateSettingsModalProps> = ({
  isOpen,
  onClose,
  currentVersionName,
  currentVersionCode,
  isAndroidNative,
  updateInfo,
  graceStatus,
  downloadState,
  isChecking,
  updateStatusText,
  lastCheckError,
  prefs,
  globalAutoUpdateEnabled,
  onUpdatePrefs,
  onManualCheck,
  onInstallUpdate,
  onCancelDownload,
  onInstallDownloadedApk,
}) => {
  useLockBodyScroll(isOpen);
  const [canInstallPkgs, setCanInstallPkgs] = useState<boolean>(true);
  const [webNotifPermission, setWebNotifPermission] = useState<string>('default');
  const [isRefreshingWeb, setIsRefreshingWeb] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const native = getAndroidNativeBridge();
    if (native && typeof native.canInstallPackages === 'function') {
      try {
        setCanInstallPkgs(Boolean(native.canInstallPackages()));
      } catch {
        setCanInstallPkgs(true);
      }
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setWebNotifPermission(Notification.permission);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatLastChecked = (ts: number | null) => {
    if (!ts) return 'এখনো চেক করা হয়নি';
    try {
      return new Date(ts).toLocaleString('bn-BD', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'সম্প্রতি';
    }
  };

  const handleRequestWebNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setWebNotifPermission(perm);
    } catch {
      // ignore
    }
  };

  const handleOpenInstallPermission = () => {
    const native = getAndroidNativeBridge();
    if (native && typeof native.openInstallPermissionSettings === 'function') {
      native.openInstallPermissionSettings();
    }
  };

  const handleWebCacheRefresh = async () => {
    setIsRefreshingWeb(true);
    await refreshWebAppCachesAndReload();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-modal-title"
      className="fixed inset-0 z-[260] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/75"
    >
      <div className="bg-slate-50 w-full max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-slate-800">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-emerald-950 text-white p-4 sm:p-5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-xl shrink-0">
              🚀
            </div>
            <div className="min-w-0">
              <h3 id="app-update-modal-title" className="text-base sm:text-lg font-black tracking-tight">
                অ্যাপ আপডেট ও সেটিংস
              </h3>
              <p className="text-[11px] text-slate-300 font-medium">
                বর্তমান ভার্সন: <strong className="text-emerald-300">v{convertToBengaliNumbers(currentVersionName)}</strong> (বিল্ড {convertToBengaliNumbers(currentVersionCode)})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="আপডেট সেটিংস বন্ধ করুন"
            className="w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition font-bold"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Platform & Last Checked Strip */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 block">অ্যাপ মোড</span>
              <span className="text-xs font-black text-slate-900 mt-0.5 block">
                {isAndroidNative ? '📱 Android APK অ্যাপ' : '🌐 Web / PWA অ্যাপ'}
              </span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 block">সর্বশেষ চেক</span>
              <span className="text-xs font-black text-indigo-900 mt-0.5 block">
                {formatLastChecked(prefs.lastCheckedAt)}
              </span>
            </div>
          </div>

          {/* Update Status Card */}
          {updateInfo ? (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-300 rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-block text-[10px] font-black uppercase bg-emerald-600 text-white px-2 py-0.5 rounded-md">
                      নতুন ভার্সন পাওয়া গেছে!
                    </span>
                    {graceStatus.hasUpdate && (
                      <span
                        className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-md ${
                          graceStatus.isMandatory
                            ? 'bg-red-600 text-white'
                            : 'bg-amber-200 text-amber-950'
                        }`}
                      >
                        ⏳ {formatRemainingGraceBengali(graceStatus.remainingMs)}
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm sm:text-base font-black text-emerald-950 mt-1">
                    ভার্সন v{convertToBengaliNumbers(updateInfo.versionName)} প্রস্তুত
                  </h4>
                </div>
                <span className="text-2xl">✨</span>
              </div>

              <p className="text-xs text-emerald-900 bg-white/80 border border-emerald-200 rounded-xl p-2.5 leading-relaxed">
                {updateInfo.releaseNotes}
              </p>

              {updateStatusText && (
                <div className="bg-emerald-900 text-emerald-100 rounded-xl p-2.5 text-xs font-bold">
                  {updateStatusText}
                </div>
              )}

              <InAppDownloadManagerPanel
                downloadState={downloadState}
                versionName={updateInfo.versionName}
                isAndroidNative={isAndroidNative}
                canInstallPkgs={canInstallPkgs}
                onStartDownload={onInstallUpdate}
                onCancelDownload={onCancelDownload}
                onInstallDownloaded={onInstallDownloadedApk}
                onOpenInstallPermission={handleOpenInstallPermission}
              />

              {!isAndroidNative && (
                <button
                  type="button"
                  disabled={isRefreshingWeb}
                  onClick={handleWebCacheRefresh}
                  className="w-full py-2 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer transition"
                >
                  {isRefreshingWeb ? 'রিলোড হচ্ছে...' : '🔄 ওয়েব ভার্সন রিলোড করুন'}
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{isChecking ? '⏳' : lastCheckError ? '📡' : '✅'}</span>
                  <div>
                    <h4 className="text-sm font-black text-slate-900">
                      {isChecking
                        ? 'নতুন আপডেট খোঁজা হচ্ছে...'
                        : lastCheckError
                        ? 'অনলাইনে আপডেট সার্ভার পাওয়া যায়নি'
                        : 'আপনি সর্বশেষ ভার্সন ব্যবহার করছেন'}
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {isChecking
                        ? 'GitHub রিলিজ ও ভার্সন সার্ভার পরীক্ষা করা হচ্ছে...'
                        : lastCheckError
                        ? 'ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।'
                        : `বর্তমানে ইনস্টলকৃত ভার্সন v${convertToBengaliNumbers(currentVersionName)} আপটুডেট রয়েছে।`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isChecking}
                  onClick={onManualCheck}
                  className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-bold cursor-pointer transition flex items-center justify-center gap-1.5"
                >
                  <span className={isChecking ? 'animate-spin' : ''}>🔄</span>
                  <span>{isChecking ? 'চেক করা হচ্ছে...' : 'এখনই আপডেট চেক করুন'}</span>
                </button>

                {!isAndroidNative && (
                  <button
                    type="button"
                    disabled={isRefreshingWeb}
                    onClick={handleWebCacheRefresh}
                    className="py-2.5 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer transition"
                    title="সর্বশেষ ওয়েব ক্যাশ রিলোড করুন"
                  >
                    {isRefreshingWeb ? 'রিলোড...' : '⚡ ক্যাশ রিফ্রেশ'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Android Unknown App Sources Permission Alert */}
          {isAndroidNative && !canInstallPkgs && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 space-y-2">
              <div className="text-xs font-black text-amber-950">
                🔓 ইন-অ্যাপ APK ইনস্টল অনুমতি প্রয়োজন
              </div>
              <p className="text-[11px] text-amber-900 leading-relaxed">
                সরাসরি অ্যাপের ভেতর থেকে আপডেট ইনস্টল করতে আপনার ফোনের &quot;Install unknown apps&quot; পারমিশন চালু রাখতে হবে।
              </p>
              <button
                type="button"
                onClick={handleOpenInstallPermission}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold cursor-pointer transition"
              >
                ⚙️ পারমিশন সেটিংস খুলুন
              </button>
            </div>
          )}

          {/* Auto-Update & Notification Toggle Controls */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5">
            <div>
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                <span>🔔</span> অটো আপডেট ও নোটিফিকেশন কন্ট্রোল
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                অটো আপডেট না চাইলে নিচ থেকে যেকোনো সময় বন্ধ করতে পারবেন; ম্যানুয়ালি চেক সবসময় চালু থাকবে।
              </p>
            </div>

            {!globalAutoUpdateEnabled && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[11px] font-bold text-amber-900">
                ℹ️ অ্যাডমিন গ্লোবাল কন্ট্রোল থেকে অটো আপডেট নোটিফিকেশন বর্তমানে বন্ধ রাখা হয়েছে (তবে ম্যানুয়ালি চেক করা যাবে)।
              </div>
            )}

            {/* Toggle 1: Auto Check */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3">
              <div>
                <label
                  htmlFor="toggle-auto-check"
                  className="text-xs sm:text-sm font-extrabold text-slate-900 cursor-pointer block"
                >
                  🔄 অটো আপডেট চেক চালু রাখুন
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {prefs.autoCheckEnabled
                    ? 'চালু আছে: অ্যাপ খোলার সময় স্বয়ংক্রিয়ভাবে নতুন আপডেট খোঁজা হবে।'
                    : 'বন্ধ আছে: কোনো অটো আপডেট চেক বা পপআপ হবে না; শুধু বাটনে চাপলেই চেক হবে।'}
                </p>
              </div>
              <input
                id="toggle-auto-check"
                type="checkbox"
                checked={prefs.autoCheckEnabled}
                onChange={(e) => onUpdatePrefs({ autoCheckEnabled: e.target.checked })}
                className="w-5 h-5 accent-indigo-600 cursor-pointer shrink-0 mt-0.5"
              />
            </div>

            {/* Toggle 2: Auto Notification Popup */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3">
              <div>
                <label
                  htmlFor="toggle-auto-notify"
                  className="text-xs sm:text-sm font-extrabold text-slate-900 cursor-pointer block"
                >
                  🔔 আপডেট নোটিফিকেশন ও পপআপ ব্যানার
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {prefs.autoNotifyEnabled
                    ? 'চালু আছে: নতুন ভার্সন এলে স্ক্রিনে ব্যানার ও নোটিফিকেশন দেখাবে।'
                    : 'বন্ধ আছে: অটো ব্যানার ও নোটিফিকেশন বন্ধ থাকবে।'}
                </p>
              </div>
              <input
                id="toggle-auto-notify"
                type="checkbox"
                checked={prefs.autoNotifyEnabled}
                disabled={!prefs.autoCheckEnabled}
                onChange={(e) => onUpdatePrefs({ autoNotifyEnabled: e.target.checked })}
                className="w-5 h-5 accent-emerald-600 cursor-pointer shrink-0 mt-0.5 disabled:opacity-40"
              />
            </div>

            {/* Browser Web Notification Permission (only on Web when supported) */}
            {!isAndroidNative && typeof window !== 'undefined' && 'Notification' in window && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                <span className="text-slate-600 font-medium">
                  ব্রাউজার পুশ নোটিফিকেশন:{' '}
                  <strong
                    className={
                      webNotifPermission === 'granted'
                        ? 'text-emerald-700'
                        : webNotifPermission === 'denied'
                        ? 'text-red-600'
                        : 'text-amber-700'
                    }
                  >
                    {webNotifPermission === 'granted'
                      ? 'চালু আছে'
                      : webNotifPermission === 'denied'
                      ? 'ব্রাউজার থেকে ব্লক করা'
                      : 'অনুমতি দেওয়া হয়নি'}
                  </strong>
                </span>
                {webNotifPermission === 'default' && (
                  <button
                    type="button"
                    onClick={handleRequestWebNotifications}
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold cursor-pointer"
                  >
                    🔔 নোটিফিকেশন চালু করুন
                  </button>
                )}
              </div>
            )}

            {/* Reset Skipped Version */}
            {prefs.skippedVersion && (
              <div className="flex items-center justify-between gap-2 bg-slate-100 px-3 py-2 rounded-xl text-xs">
                <span className="text-slate-700 font-semibold">
                  এড়িয়ে যাওয়া ভার্সন: <strong>v{convertToBengaliNumbers(prefs.skippedVersion)}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => onUpdatePrefs({ skippedVersion: null })}
                  className="text-indigo-700 hover:underline font-bold cursor-pointer"
                >
                  রিসেট করুন
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-white border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          {updateInfo && (
            <button
              type="button"
              onClick={onManualCheck}
              disabled={isChecking}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition"
            >
              🔄 পুনরায় চেক
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold cursor-pointer transition"
          >
            বন্ধ করুন
          </button>
        </div>
      </div>
    </div>
  );
};
