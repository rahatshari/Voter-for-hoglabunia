import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ApkDownloadState,
  AppUpdatePreferences,
  RemoteReleaseInfo,
} from '../types';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';
import {
  checkForAppUpdates,
  clearUpdateGraceRecord,
  createInitialDownloadState,
  formatRemainingGraceBengali,
  getAndroidNativeBridge,
  getInstalledAppVersion,
  getSessionDismissedVersion,
  getUpdateGraceStatus,
  isRemoteVersionNewer,
  loadPendingUpdateCache,
  loadUpdatePrefs,
  refreshWebAppCachesAndReload,
  saveUpdatePrefs,
  setSessionDismissedVersion,
  shouldShowAutoUpdatePopup,
  triggerUpdateNotifications,
} from '../lib/appUpdateUtils';
import { AppUpdateSettingsModal } from './AppUpdateSettingsModal';
import { InAppDownloadManagerPanel } from './InAppDownloadManagerPanel';

interface AppUpdateBannerProps {
  globalAutoUpdateEnabled?: boolean;
}

export const AppUpdateBanner: React.FC<AppUpdateBannerProps> = ({
  globalAutoUpdateEnabled = true,
}) => {
  const [currentVersionName, setCurrentVersionName] = useState<string>('1.0.0');
  const [currentVersionCode, setCurrentVersionCode] = useState<number>(100);
  const [isAndroidNative, setIsAndroidNative] = useState<boolean>(false);
  const [canInstallPkgs, setCanInstallPkgs] = useState<boolean>(true);
  const [updateInfo, setUpdateInfo] = useState<RemoteReleaseInfo | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [updateStatusText, setUpdateStatusText] = useState<string | null>(null);
  const [lastCheckError, setLastCheckError] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [prefs, setPrefs] = useState<AppUpdatePreferences>(() => loadUpdatePrefs());
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    getSessionDismissedVersion()
  );
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [downloadState, setDownloadState] = useState<ApkDownloadState>(() =>
    createInitialDownloadState()
  );

  const webDownloadAbortRef = useRef<AbortController | null>(null);

  // Sync installed version info + cached pending update + native download status immediately
  useEffect(() => {
    getInstalledAppVersion().then((info) => {
      setCurrentVersionName(info.versionName);
      setCurrentVersionCode(info.versionCode);
      setIsAndroidNative(info.isAndroidNative);

      // Restore cached update if still newer than installed (prevents offline/restart bypass of 3-hour deadline)
      const cachedPending = loadPendingUpdateCache();
      if (cachedPending) {
        if (
          isRemoteVersionNewer(
            cachedPending.versionCode,
            cachedPending.versionName,
            info.versionCode,
            info.versionName
          )
        ) {
          setUpdateInfo((prev) => prev || cachedPending);
        } else {
          // User already updated to >= cached version
          clearUpdateGraceRecord();
        }
      }

      const native = getAndroidNativeBridge();
      if (native) {
        try {
          if (typeof native.canInstallPackages === 'function') {
            setCanInstallPkgs(Boolean(native.canInstallPackages()));
          }
          if (typeof native.getApkDownloadState === 'function') {
            const raw = native.getApkDownloadState();
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.status && parsed.status !== 'idle') {
                setDownloadState((prev) => ({ ...prev, ...parsed }));
              }
            }
          }
        } catch {
          // ignore
        }
      }
    });
  }, []);

  // Live 15-second clock ticker to update 3-hour grace countdown & enforce mandatory lock smoothly
  useEffect(() => {
    if (!updateInfo) return;
    const ticker = setInterval(() => {
      setNowTick(Date.now());
    }, 15000);
    return () => clearInterval(ticker);
  }, [updateInfo]);

  // Listen for live progress events from AndroidNative Download Manager
  useEffect(() => {
    const onNativeProgress = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail || typeof detail !== 'object') return;
      setDownloadState((prev) => ({
        ...prev,
        ...detail,
      }));
      if (detail.status === 'completed') {
        setUpdateStatusText(
          '✅ ফাইল ডাউনলোড সম্পন্ন হয়েছে! ইন্সটল স্ক্রিন না এলে নিচের "এখনই ইন্সটল করুন" বাটনে চাপুন।'
        );
      } else if (detail.status === 'error') {
        setUpdateStatusText(null);
      }
    };

    window.addEventListener('voter_apk_download_progress', onNativeProgress);
    return () => window.removeEventListener('voter_apk_download_progress', onNativeProgress);
  }, []);

  // Sync whether downloaded APK already exists on device when updateInfo changes
  useEffect(() => {
    if (!updateInfo) return;
    const native = getAndroidNativeBridge();
    if (native && typeof native.hasDownloadedApk === 'function') {
      try {
        if (native.hasDownloadedApk(updateInfo.versionName)) {
          setDownloadState((prev) => {
            if (prev.status === 'downloading') return prev;
            return {
              ...prev,
              status: 'completed',
              versionName: updateInfo.versionName,
              apkUrl: updateInfo.apkUrl,
              percent: 100,
              fileName: `Union-Voter-App-v${updateInfo.versionName}.apk`,
            };
          });
        }
      } catch {
        // ignore
      }
    }
  }, [updateInfo]);

  const runUpdateCheck = useCallback(
    async (manual = false) => {
      setIsChecking(true);
      setLastCheckError(false);

      try {
        const res = await checkForAppUpdates();
        const latestPrefs = loadUpdatePrefs();
        setCurrentVersionCode(res.installedCode);
        setCurrentVersionName(res.installedName);
        setIsAndroidNative(res.isAndroidNative);
        setPrefs(latestPrefs);
        setLastCheckError(res.networkFailed);

        if (res.updateInfo) {
          setUpdateInfo(res.updateInfo);
          setNowTick(Date.now());
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

          const grace = getUpdateGraceStatus({
            remote: res.updateInfo,
            installedCode: res.installedCode,
            installedName: res.installedName,
            now: Date.now(),
          });

          if (
            manual ||
            grace.isMandatory ||
            shouldShowAutoUpdatePopup({
              remote: res.updateInfo,
              prefs: latestPrefs,
              globalAutoUpdateEnabled,
              sessionDismissedVersion: getSessionDismissedVersion(),
            })
          ) {
            triggerUpdateNotifications(res.updateInfo, latestPrefs);
          }
        } else if (!res.networkFailed) {
          // Online check confirmed no newer release exists -> clear any old grace records
          clearUpdateGraceRecord();
          if (manual) {
            setUpdateInfo(null);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('voter_update_availability', {
                  detail: { hasUpdate: false, versionName: res.installedName },
                })
              );
            }
          }
        }
      } finally {
        setIsChecking(false);
      }
    },
    [globalAutoUpdateEnabled]
  );

  // Automatic check lifecycle (checks release silently so 3-hour mandatory deadline is tracked accurately)
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      runUpdateCheck(false);
    }, 2500);

    const periodicTimer = setInterval(() => {
      runUpdateCheck(false);
    }, 10 * 60 * 1000);

    const onFocus = () => {
      const native = getAndroidNativeBridge();
      if (native && typeof native.canInstallPackages === 'function') {
        try {
          setCanInstallPkgs(Boolean(native.canInstallPackages()));
        } catch {}
      }
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

    // Helper for verification or manual release injection
    (window as any).__CHECK_APP_UPDATE__ = (mockInfo?: RemoteReleaseInfo) => {
      if (mockInfo) {
        setUpdateInfo(mockInfo);
        setNowTick(Date.now());
        setDismissedVersion(null);
        setSessionDismissedVersion(null);
        setDownloadState(createInitialDownloadState(mockInfo.versionName, mockInfo.apkUrl));
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
      clearTimeout(initialTimer);
      clearInterval(periodicTimer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('voter_update_prefs_changed', onPrefsChanged);
      window.removeEventListener('voter_open_update_modal', onOpenModal);
      window.removeEventListener('voter_manual_check_update', onManualCheckEvent);
    };
  }, [globalAutoUpdateEnabled, runUpdateCheck]);

  const handleUpdatePrefs = (patch: Partial<AppUpdatePreferences>) => {
    const next = saveUpdatePrefs(patch);
    setPrefs(next);
  };

  const triggerBlobSave = (blobUrl: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleInstallUpdate = async () => {
    if (!updateInfo) return;
    const native = getAndroidNativeBridge();

    // 1. Android Native Built-In Phone Download Manager
    if (native && typeof native.downloadAndInstallApk === 'function') {
      try {
        if (typeof native.canInstallPackages === 'function') {
          setCanInstallPkgs(Boolean(native.canInstallPackages()));
        }
        setUpdateStatusText('⬇️ ইনবিল্ট ডাউনলোড ম্যানেজারের মাধ্যমে ডাউনলোড শুরু হচ্ছে...');
        setDownloadState({
          ...createInitialDownloadState(updateInfo.versionName, updateInfo.apkUrl),
          status: 'downloading',
        });
        native.downloadAndInstallApk(updateInfo.apkUrl, updateInfo.versionName);
        return;
      } catch (e) {
        console.warn('Native APK installer fallback:', e);
      }
    }

    // 2. Web / PWA In-App Streaming Downloader with Progress + Fallback
    if (webDownloadAbortRef.current) {
      webDownloadAbortRef.current.abort();
    }
    const controller = new AbortController();
    webDownloadAbortRef.current = controller;

    const fileName = `Union-Voter-App-v${updateInfo.versionName}.apk`;
    setUpdateStatusText('⬇️ অ্যাপের ভেতরেই APK ডাউনলোড শুরু হচ্ছে...');
    setDownloadState({
      ...createInitialDownloadState(updateInfo.versionName, updateInfo.apkUrl),
      status: 'downloading',
      fileName,
    });

    try {
      const response = await fetch(updateInfo.apkUrl, { signal: controller.signal });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentLength = Number(response.headers.get('content-length') || 0);
      const reader = response.body.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;
      let speedWindowBytes = 0;
      let speedWindowStart = Date.now();
      let lastUiEmit = speedWindowStart;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          speedWindowBytes += value.length;

          const now = Date.now();
          if (now - lastUiEmit >= 200) {
            const elapsedSec = Math.max(0.05, (now - speedWindowStart) / 1000);
            const speedBps = Math.round(speedWindowBytes / elapsedSec);
            speedWindowBytes = 0;
            speedWindowStart = now;
            lastUiEmit = now;

            const percent =
              contentLength > 0 ? Math.min(99, Math.round((received * 100) / contentLength)) : 0;
            setDownloadState((prev) => ({
              ...prev,
              status: 'downloading',
              downloadedBytes: received,
              totalBytes: contentLength,
              percent,
              speedBps,
            }));
          }
        }
      }

      const blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
      const blobUrl = URL.createObjectURL(blob);
      setDownloadState({
        status: 'completed',
        versionName: updateInfo.versionName,
        apkUrl: updateInfo.apkUrl,
        downloadedBytes: blob.size,
        totalBytes: blob.size,
        percent: 100,
        speedBps: 0,
        errorMessage: null,
        fileName,
        blobUrl,
      });
      setUpdateStatusText(
        '✅ ডাউনলোড সম্পন্ন! ফোনে সংরক্ষণ হচ্ছে—ফাইলটি ওপেন করে "Install / Update" চাপুন।'
      );
      triggerBlobSave(blobUrl, fileName);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setDownloadState((prev) => ({ ...prev, status: 'cancelled', speedBps: 0 }));
        setUpdateStatusText('ডাউনলোড বাতিল করা হয়েছে।');
        return;
      }

      // Direct link fallback if CORS blocks browser fetch() on external CDN
      const a = document.createElement('a');
      a.href = updateInfo.apkUrl;
      a.download = fileName;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setDownloadState({
        status: 'completed',
        versionName: updateInfo.versionName,
        apkUrl: updateInfo.apkUrl,
        downloadedBytes: 0,
        totalBytes: 0,
        percent: 100,
        speedBps: 0,
        errorMessage: null,
        fileName,
        blobUrl: null,
      });
      setUpdateStatusText(
        '✅ ফোনের ব্রাউজার ডাউনলোড শুরু হয়েছে! ডাউনলোড শেষ হলে নোটিফিকেশন থেকে ফাইলটি ওপেন করে Install করুন।'
      );
    }
  };

  const handleCancelDownload = () => {
    const native = getAndroidNativeBridge();
    if (native && typeof native.cancelApkDownload === 'function') {
      try {
        native.cancelApkDownload();
      } catch {}
    }
    if (webDownloadAbortRef.current) {
      webDownloadAbortRef.current.abort();
      webDownloadAbortRef.current = null;
    }
    setDownloadState((prev) => ({
      ...prev,
      status: 'cancelled',
      speedBps: 0,
    }));
  };

  const handleInstallDownloadedApk = () => {
    if (!updateInfo) return;
    const native = getAndroidNativeBridge();

    if (native && typeof native.installDownloadedApk === 'function') {
      try {
        if (typeof native.canInstallPackages === 'function') {
          const allowed = Boolean(native.canInstallPackages());
          setCanInstallPkgs(allowed);
          if (!allowed && typeof native.openInstallPermissionSettings === 'function') {
            setUpdateStatusText(
              '⚠️ অনুগ্রহ করে "Allow from this source" চালু করে ফিরে এসে আবার "এখনই ইন্সটল করুন" চাপুন।'
            );
            native.openInstallPermissionSettings();
            return;
          }
        }
        const ok = native.installDownloadedApk(updateInfo.versionName);
        if (!ok) {
          handleInstallUpdate();
        }
        return;
      } catch {
        // fallback below
      }
    }

    if (downloadState.blobUrl) {
      triggerBlobSave(
        downloadState.blobUrl,
        downloadState.fileName || `Union-Voter-App-v${updateInfo.versionName}.apk`
      );
    } else {
      const a = document.createElement('a');
      a.href = updateInfo.apkUrl;
      a.download = `Union-Voter-App-v${updateInfo.versionName}.apk`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleOpenInstallPermission = () => {
    const native = getAndroidNativeBridge();
    if (native && typeof native.openInstallPermissionSettings === 'function') {
      native.openInstallPermissionSettings();
    }
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

  const graceStatus = getUpdateGraceStatus({
    remote: updateInfo,
    installedCode: currentVersionCode,
    installedName: currentVersionName,
    now: nowTick,
  });

  const showMandatoryLock = Boolean(updateInfo && graceStatus.hasUpdate && graceStatus.isMandatory);

  const showFloatingBanner =
    !showMandatoryLock &&
    shouldShowAutoUpdatePopup({
      remote: updateInfo,
      prefs,
      globalAutoUpdateEnabled,
      sessionDismissedVersion: dismissedVersion,
    });

  const isUpdating = downloadState.status === 'downloading';

  return (
    <>
      {/* MANDATORY UPDATE FULL-SCREEN LOCK (Triggered strictly after 3-hour grace expires) */}
      {showMandatoryLock && updateInfo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mandatory-update-title"
          data-testid="mandatory-update-lock"
          className="fixed inset-0 z-[300] bg-slate-950/90 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="w-full max-w-md bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl shadow-2xl border-2 border-red-400/60 p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-400/50 flex items-center justify-center text-2xl shrink-0">
                ⛔
              </div>
              <div>
                <span className="inline-block text-[10px] font-black uppercase tracking-wider bg-red-500 text-white px-2.5 py-0.5 rounded-md">
                  বাধ্যতামূলক আপডেট (৩ ঘণ্টা সময় শেষ)
                </span>
                <h2
                  id="mandatory-update-title"
                  className="text-base sm:text-lg font-black text-white mt-1.5 leading-snug"
                >
                  অ্যাপ চালিয়ে যেতে নতুন ভার্সন v{convertToBengaliNumbers(updateInfo.versionName)} আপডেট করুন
                </h2>
                <p className="text-[11px] text-indigo-200 mt-1">
                  বর্তমান ভার্সন: v{convertToBengaliNumbers(currentVersionName)} → নতুন ভার্সন: v
                  {convertToBengaliNumbers(updateInfo.versionName)}
                </p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-xs text-indigo-100 leading-relaxed max-h-28 overflow-y-auto">
              {updateInfo.releaseNotes}
            </div>

            {updateStatusText && (
              <div className="bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 rounded-xl px-3 py-2 text-xs font-bold">
                {updateStatusText}
              </div>
            )}

            <InAppDownloadManagerPanel
              downloadState={downloadState}
              versionName={updateInfo.versionName}
              isAndroidNative={isAndroidNative}
              canInstallPkgs={canInstallPkgs}
              compact
              onStartDownload={handleInstallUpdate}
              onCancelDownload={handleCancelDownload}
              onInstallDownloaded={handleInstallDownloadedApk}
              onOpenInstallPermission={handleOpenInstallPermission}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                disabled={isChecking}
                onClick={() => runUpdateCheck(true)}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold text-indigo-100 cursor-pointer transition"
              >
                {isChecking ? '⏳ চেক হচ্ছে...' : '🔄 ভার্সন পুনরায় যাচাই'}
              </button>

              {!isAndroidNative && (
                <button
                  type="button"
                  onClick={() => refreshWebAppCachesAndReload()}
                  className="px-3 py-2 rounded-xl bg-indigo-500/30 hover:bg-indigo-500/50 text-[11px] font-bold text-white cursor-pointer transition"
                >
                  ⚡ ওয়েব ভার্সন রিলোড
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NON-BLOCKING FLOATING BANNER DURING 3-HOUR GRACE PERIOD */}
      {!isSettingsOpen && showFloatingBanner && updateInfo && (
        <div
          role="region"
          aria-label="অ্যাপ আপডেট নোটিফিকেশন"
          className="fixed inset-x-0 top-3 z-[250] px-3 sm:px-6 pointer-events-none flex justify-center"
        >
          <div className="pointer-events-auto w-full max-w-lg bg-gradient-to-br from-indigo-950 via-indigo-900 to-emerald-950 text-white rounded-2xl shadow-2xl border border-emerald-400/40 p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-2xl shrink-0">
                  🚀
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-black uppercase tracking-wider bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-md">
                      নতুন আপডেট এসেছে!
                    </span>
                    <span className="text-[11px] font-bold bg-amber-400/20 border border-amber-300/40 text-amber-200 px-2 py-0.5 rounded-md">
                      ⏳ {formatRemainingGraceBengali(graceStatus.remainingMs)}
                    </span>
                  </div>
                  <h4 className="text-sm sm:text-base font-black text-white mt-1">
                    ভার্সন v{convertToBengaliNumbers(updateInfo.versionName)} প্রস্তুত (বর্তমান: v
                    {convertToBengaliNumbers(currentVersionName)})
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

            <p className="text-[11px] text-amber-100/95 bg-amber-500/10 border border-amber-400/25 rounded-xl px-2.5 py-1.5 font-semibold">
              ℹ️ ৩ ঘণ্টা পর্যন্ত আপডেট ছাড়া চালানো যাবে; এরপর অ্যাপ চালিয়ে যেতে আপডেট বাধ্যতামূলক হবে।
            </p>

            {/* Show compact in-app download progress right on the banner if download started or completed */}
            {downloadState.status !== 'idle' && (
              <InAppDownloadManagerPanel
                downloadState={downloadState}
                versionName={updateInfo.versionName}
                isAndroidNative={isAndroidNative}
                canInstallPkgs={canInstallPkgs}
                compact
                onStartDownload={handleInstallUpdate}
                onCancelDownload={handleCancelDownload}
                onInstallDownloaded={handleInstallDownloadedApk}
                onOpenInstallPermission={handleOpenInstallPermission}
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleDisableAutoUpdateFromBanner}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-red-500/30 text-[11px] font-bold text-indigo-200 hover:text-white cursor-pointer transition"
                  title="অটো পপআপ বন্ধ করুন"
                >
                  🔕 পপআপ বন্ধ
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold text-indigo-100 cursor-pointer transition"
                  title="ডাউনলোড ম্যানেজার ও সেটিংস"
                >
                  ⚙️ বিস্তারিত
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
                {downloadState.status === 'completed' ? (
                  <button
                    type="button"
                    onClick={handleInstallDownloadedApk}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs sm:text-sm font-black shadow-lg shadow-emerald-500/25 cursor-pointer transition flex items-center gap-1.5"
                  >
                    <span>📲</span> এখনই ইন্সটল করুন
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={handleInstallUpdate}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs sm:text-sm font-black shadow-lg shadow-emerald-500/25 cursor-pointer transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span>⬇️</span>
                    {isUpdating ? 'ডাউনলোড হচ্ছে...' : 'এখনই ডাউনলোড ও আপডেট'}
                  </button>
                )}
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
        graceStatus={graceStatus}
        downloadState={downloadState}
        isChecking={isChecking}
        isUpdating={isUpdating}
        updateStatusText={updateStatusText}
        lastCheckError={lastCheckError}
        prefs={prefs}
        globalAutoUpdateEnabled={globalAutoUpdateEnabled}
        onUpdatePrefs={handleUpdatePrefs}
        onManualCheck={() => runUpdateCheck(true)}
        onInstallUpdate={handleInstallUpdate}
        onCancelDownload={handleCancelDownload}
        onInstallDownloadedApk={handleInstallDownloadedApk}
      />
    </>
  );
};
