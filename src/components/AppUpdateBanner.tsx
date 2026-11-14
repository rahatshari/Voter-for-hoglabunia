import React, { useState, useEffect, useCallback } from 'react';
import { AppUpdatePreferences, RemoteReleaseInfo } from '../types';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';
import {
  checkForAppUpdates,
  getAndroidNativeBridge,
  getInstalledAppVersion,
  getSessionDismissedVersion,
  loadUpdatePrefs,
  saveUpdatePrefs,
  setSessionDismissedVersion,
  shouldShowAutoUpdatePopup,
  triggerUpdateNotifications,
} from '../lib/appUpdateUtils';
import { AppUpdateSettingsModal } from './AppUpdateSettingsModal';

interface AppUpdateBannerProps {
  globalAutoUpdateEnabled?: boolean;
}

export const AppUpdateBanner: React.FC<AppUpdateBannerProps> = ({
  globalAutoUpdateEnabled = true,
}) => {
  const [currentVersionName, setCurrentVersionName] = useState<string>('1.0.0');
  const [currentVersionCode, setCurrentVersionCode] = useState<number>(100);
  const [isAndroidNative, setIsAndroidNative] = useState<boolean>(false);
  const [updateInfo, setUpdateInfo] = useState<RemoteReleaseInfo | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [updateStatusText, setUpdateStatusText] = useState<string | null>(null);
  const [lastCheckError, setLastCheckError] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [prefs, setPrefs] = useState<AppUpdatePreferences>(() => loadUpdatePrefs());
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    getSessionDismissedVersion()
  );

  // Sync installed version info immediately
  useEffect(() => {
    getInstalledAppVersion().then((info) => {
      setCurrentVersionName(info.versionName);
      setCurrentVersionCode(info.versionCode);
      setIsAndroidNative(info.isAndroidNative);
    });
  }, []);

  const runUpdateCheck = useCallback(
    async (manual = false) => {
      const latestPrefs = loadUpdatePrefs();
      if (!manual && (!latestPrefs.autoCheckEnabled || globalAutoUpdateEnabled === false)) {
        return;
      }

      setIsChecking(true);
      setLastCheckError(false);

      try {
        const res = await checkForAppUpdates();
        setCurrentVersionCode(res.installedCode);
        setCurrentVersionName(res.installedName);
        setIsAndroidNative(res.isAndroidNative);
        setPrefs(loadUpdatePrefs());
        setLastCheckError(res.networkFailed);

        if (res.updateInfo) {
          setUpdateInfo(res.updateInfo);
          if (manual) {
            setDismissedVersion(null);
            setSessionDismissedVersion(null);
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('voter_update_availability', {
                detail: { hasUpdate: true, versionName: res.updateInfo.versionName },
              })
            );
          }

          if (
            manual ||
            shouldShowAutoUpdatePopup({
              remote: res.updateInfo,
              prefs: latestPrefs,
              globalAutoUpdateEnabled,
              sessionDismissedVersion: getSessionDismissedVersion(),
            })
          ) {
            triggerUpdateNotifications(res.updateInfo, latestPrefs);
          }
        } else if (manual) {
          setUpdateInfo(null);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('voter_update_availability', {
                detail: { hasUpdate: false, versionName: res.installedName },
              })
            );
          }
        }
      } finally {
        setIsChecking(false);
      }
    },
    [globalAutoUpdateEnabled]
  );

  // Automatic check lifecycle (strictly respects autoCheckEnabled & globalAutoUpdateEnabled)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;

    if (prefs.autoCheckEnabled && globalAutoUpdateEnabled !== false) {
      timer = setTimeout(() => {
        runUpdateCheck(false);
      }, 2500);

      interval = setInterval(() => {
        runUpdateCheck(false);
      }, 10 * 60 * 1000);
    }

    const onFocus = () => {
      const latest = loadUpdatePrefs();
      if (latest.autoCheckEnabled && globalAutoUpdateEnabled !== false) {
        runUpdateCheck(false);
      }
    };

    const onPrefsChanged = () => {
      setPrefs(loadUpdatePrefs());
    };

    const onOpenModal = () => {
      setIsSettingsOpen(true);
    };

    const onManualCheckEvent = () => {
      setIsSettingsOpen(true);
      runUpdateCheck(true);
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('voter_update_prefs_changed', onPrefsChanged);
    window.addEventListener('voter_open_update_modal', onOpenModal);
    window.addEventListener('voter_manual_check_update', onManualCheckEvent);

    // Expose global helper for tests, native callbacks, or debugging
    (window as any).__CHECK_APP_UPDATE__ = (mockInfo?: RemoteReleaseInfo) => {
      if (mockInfo) {
        setUpdateInfo(mockInfo);
        setDismissedVersion(null);
        setSessionDismissedVersion(null);
        window.dispatchEvent(
          new CustomEvent('voter_update_availability', {
            detail: { hasUpdate: true, versionName: mockInfo.versionName },
          })
        );
      } else {
        runUpdateCheck(true);
      }
    };

    return () => {
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('voter_update_prefs_changed', onPrefsChanged);
      window.removeEventListener('voter_open_update_modal', onOpenModal);
      window.removeEventListener('voter_manual_check_update', onManualCheckEvent);
    };
  }, [prefs.autoCheckEnabled, globalAutoUpdateEnabled, runUpdateCheck]);

  const handleUpdatePrefs = (patch: Partial<AppUpdatePreferences>) => {
    const next = saveUpdatePrefs(patch);
    setPrefs(next);
  };

  const handleInstallUpdate = () => {
    if (!updateInfo) return;
    const native = getAndroidNativeBridge();

    setIsUpdating(true);
    setUpdateStatusText('⏳ নতুন APK ডাউনলোড শুরু হচ্ছে... অনুগ্রহ করে অপেক্ষা করুন।');

    if (native && typeof native.downloadAndInstallApk === 'function') {
      try {
        if (typeof native.canInstallPackages === 'function' && !native.canInstallPackages()) {
          setUpdateStatusText(
            '⚠️ অনুগ্রহ করে "Install unknown apps" অনুমতি চালু করুন—পারমিশন চালু হলেই আপডেট ইনস্টল হবে।'
          );
          if (typeof native.openInstallPermissionSettings === 'function') {
            native.openInstallPermissionSettings();
          }
          setIsUpdating(false);
          return;
        }
        native.downloadAndInstallApk(updateInfo.apkUrl, updateInfo.versionName);
        setTimeout(() => {
          setUpdateStatusText(
            '✅ ডাউনলোড চলছে! নোটিফিকেশন বারে অগ্রগতি দেখুন। ডাউনলোড শেষ হলে স্বয়ংক্রিয়ভাবে Install অপশন ওপেন হবে।'
          );
          setIsUpdating(false);
        }, 2000);
        return;
      } catch (e) {
        console.warn('Native APK installer fallback:', e);
      }
    }

    // Fallback for Web / standard browser: trigger direct APK download
    const a = document.createElement('a');
    a.href = updateInfo.apkUrl;
    a.download = `Union-Voter-App-v${updateInfo.versionName}.apk`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      setUpdateStatusText(
        '✅ নতুন APK ডাউনলোড শুরু হয়েছে! ডাউনলোড সম্পন্ন হলে ফাইলটি ওপেন করে "Update" চাপুন (পুরানো অ্যাপ আনইন্সটল করার প্রয়োজন নেই)।'
      );
      setIsUpdating(false);
    }, 1200);
  };

  const handleDismiss = () => {
    if (updateInfo) {
      setDismissedVersion(updateInfo.versionName);
      setSessionDismissedVersion(updateInfo.versionName);
    }
  };

  const handleDisableAutoUpdateFromBanner = () => {
    handleUpdatePrefs({ autoCheckEnabled: false, autoNotifyEnabled: false });
    handleDismiss();
  };

  const showFloatingBanner = shouldShowAutoUpdatePopup({
    remote: updateInfo,
    prefs,
    globalAutoUpdateEnabled,
    sessionDismissedVersion: dismissedVersion,
  });

  return (
    <>
      {!isSettingsOpen && showFloatingBanner && updateInfo && (
        <div
          role="region"
          aria-label="অ্যাপ আপডেট নোটিফিকেশন"
          className="fixed inset-x-0 top-3 z-[250] px-3 sm:px-6 pointer-events-none flex justify-center"
        >
          <div className="pointer-events-auto w-full max-w-lg bg-gradient-to-br from-indigo-950 via-indigo-900 to-emerald-950 text-white rounded-2xl shadow-2xl border border-emerald-400/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-2xl shrink-0">
                  🚀
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black uppercase tracking-wider bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-md">
                      নতুন আপডেট এসেছে!
                    </span>
                    <span className="text-xs font-bold text-emerald-300">
                      ভার্সন v{convertToBengaliNumbers(updateInfo.versionName)} (বর্তমান: v
                      {convertToBengaliNumbers(currentVersionName)})
                    </span>
                  </div>
                  <h4 className="text-sm sm:text-base font-black text-white mt-1">
                    ইউনিয়ন ভোটার অ্যাপের নতুন ভার্সন প্রস্তুত
                  </h4>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDismiss}
                aria-label="আপডেট নোটিফিকেশন বন্ধ করুন"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/80 flex items-center justify-center text-xs cursor-pointer transition shrink-0"
                title="পরে করব"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-indigo-100/90 mt-2.5 leading-relaxed bg-white/5 border border-white/10 rounded-xl p-2.5 max-h-24 overflow-y-auto">
              {updateInfo.releaseNotes}
            </p>

            {updateStatusText && (
              <div className="mt-2.5 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 rounded-xl px-3 py-2 text-xs font-bold">
                {updateStatusText}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-white/10">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleDisableAutoUpdateFromBanner}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-red-500/30 text-[11px] font-bold text-indigo-200 hover:text-white cursor-pointer transition"
                  title="অটো আপডেট বন্ধ করুন"
                >
                  🔕 অটো বন্ধ করুন
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold text-indigo-100 cursor-pointer transition"
                  title="আপডেট সেটিংস"
                >
                  ⚙️ সেটিংস
                </button>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-indigo-200 cursor-pointer transition"
                >
                  পরে করব
                </button>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={handleInstallUpdate}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs sm:text-sm font-black shadow-lg shadow-emerald-500/25 cursor-pointer transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>⬇️</span>
                  {isUpdating ? 'ডাউনলোড হচ্ছে...' : 'এখনই আপডেট করুন'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AppUpdateSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentVersionName={currentVersionName}
        currentVersionCode={currentVersionCode}
        isAndroidNative={isAndroidNative}
        updateInfo={updateInfo}
        isChecking={isChecking}
        isUpdating={isUpdating}
        updateStatusText={updateStatusText}
        lastCheckError={lastCheckError}
        prefs={prefs}
        globalAutoUpdateEnabled={globalAutoUpdateEnabled}
        onUpdatePrefs={handleUpdatePrefs}
        onManualCheck={() => runUpdateCheck(true)}
        onInstallUpdate={handleInstallUpdate}
      />
    </>
  );
};
