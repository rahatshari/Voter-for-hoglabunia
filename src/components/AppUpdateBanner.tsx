import React, { useState, useEffect, useCallback } from 'react';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';

interface RemoteReleaseInfo {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  releaseNotes: string;
  publishedAt?: string;
}

const DEFAULT_REPO = 'rahatsharif10448/voter-apps';
const DEFAULT_LIVE_VERSION_URL = 'https://rahatsharif10448.github.io/voter-apps/version.json';

function parseVersionCodeFromTag(tag: string): number {
  // e.g. "v1.0.15" -> 100 + 15 = 115, or "v1.2.3" -> 10203
  const clean = tag.replace(/^v/i, '').trim();
  const parts = clean.split('.').map((n) => parseInt(n, 10) || 0);
  if (parts.length >= 3 && parts[0] === 1 && parts[1] === 0) {
    return 100 + parts[2];
  }
  if (parts.length >= 3) {
    return parts[0] * 10000 + parts[1] * 100 + parts[2];
  }
  const single = parseInt(clean.replace(/\D/g, ''), 10);
  return Number.isNaN(single) ? 100 : single;
}

export const AppUpdateBanner: React.FC = () => {
  const [currentVersionName, setCurrentVersionName] = useState<string>('1.0.0');
  const [currentVersionCode, setCurrentVersionCode] = useState<number>(100);
  const [updateInfo, setUpdateInfo] = useState<RemoteReleaseInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatusText, setUpdateStatusText] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('dismissed_apk_update_version');
    } catch {
      return null;
    }
  });

  const getNativeBridge = (): any => {
    if (typeof window !== 'undefined' && (window as any).AndroidNative) {
      return (window as any).AndroidNative;
    }
    return null;
  };

  const checkForUpdates = useCallback(async (manual = false) => {
    const native = getNativeBridge();
    let installedCode = 100;
    let installedName = '1.0.0';
    let repoSlug = DEFAULT_REPO;

    // 1. Read local bundled version.json first
    try {
      const localRes = await fetch(`./version.json?t=${Date.now()}`);
      if (localRes.ok) {
        const localData = await localRes.json();
        if (localData?.versionCode) installedCode = Number(localData.versionCode);
        if (localData?.versionName) installedName = String(localData.versionName);
        if (localData?.repo) repoSlug = String(localData.repo);
      }
    } catch {
      // ignore local fetch error
    }

    // 2. If running inside Android Native APK, prefer real PackageInfo version
    if (native) {
      try {
        if (typeof native.getAppVersionCode === 'function') {
          const code = Number(native.getAppVersionCode());
          if (code > 0) installedCode = code;
        }
        if (typeof native.getAppVersionName === 'function') {
          const name = String(native.getAppVersionName() || '');
          if (name) installedName = name;
        }
      } catch {
        // ignore
      }
    }

    setCurrentVersionCode(installedCode);
    setCurrentVersionName(installedName);

    let detectedRemote: RemoteReleaseInfo | null = null;

    // 3. Check GitHub Releases API for latest published APK release
    try {
      const ghRes = await fetch(`https://api.github.com/repos/${repoSlug}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (ghRes.ok) {
        const release = await ghRes.json();
        const tagName = String(release.tag_name || '');
        const cleanVersionName = tagName.replace(/^v/i, '') || '1.0.1';
        const remoteCode = parseVersionCodeFromTag(tagName);
        const assets = Array.isArray(release.assets) ? release.assets : [];
        const apkAsset =
          assets.find((a: any) => String(a.name || '').endsWith('.apk')) || assets[0];
        const apkUrl =
          apkAsset?.browser_download_url ||
          `https://github.com/${repoSlug}/releases/latest/download/Union-Voter-App.apk`;

        if (remoteCode > installedCode) {
          detectedRemote = {
            versionCode: remoteCode,
            versionName: cleanVersionName,
            apkUrl,
            releaseNotes:
              release.body ||
              'নতুন আপডেটে উন্নত পারফরম্যান্স, প্রিন্টিং ফিক্স এবং নতুন ফিচার যুক্ত করা হয়েছে।',
            publishedAt: release.published_at,
          };
        }
      }
    } catch {
      // Fallback to remote version.json
    }

    // 4. Fallback: check live hosted version.json if GitHub API was rate-limited or not found
    if (!detectedRemote) {
      try {
        const liveRes = await fetch(`${DEFAULT_LIVE_VERSION_URL}?t=${Date.now()}`);
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          const remoteCode = Number(liveData?.versionCode || 0);
          if (remoteCode > installedCode) {
            detectedRemote = {
              versionCode: remoteCode,
              versionName: String(liveData.versionName || `1.0.${remoteCode - 100}`),
              apkUrl:
                liveData.apkUrl ||
                `https://github.com/${repoSlug}/releases/latest/download/Union-Voter-App.apk`,
              releaseNotes:
                liveData.releaseNotes ||
                'অ্যাপের নতুন ভার্সন প্রকাশিত হয়েছে। নতুন ফিচার পেতে এখনই আপডেট করুন।',
            };
          }
        }
      } catch {
        // ignore offline
      }
    }

    if (detectedRemote) {
      setUpdateInfo(detectedRemote);
      if (manual) {
        setDismissedVersion(null);
      }
      // Trigger Android System Notification if inside APK
      if (native && typeof native.showUpdateNotification === 'function') {
        try {
          native.showUpdateNotification(
            detectedRemote.versionName,
            detectedRemote.apkUrl
          );
        } catch {
          // ignore
        }
      }
    }
  }, []);

  useEffect(() => {
    // Check on launch after 2.5 seconds
    const timer = setTimeout(() => {
      checkForUpdates(false);
    }, 2500);

    // Also re-check periodically every 10 minutes or when app returns to foreground
    const interval = setInterval(() => {
      checkForUpdates(false);
    }, 10 * 60 * 1000);

    const onFocus = () => checkForUpdates(false);
    window.addEventListener('focus', onFocus);

    // Expose a global helper so user/tests can trigger update check or preview banner
    (window as any).__CHECK_APP_UPDATE__ = (mockInfo?: RemoteReleaseInfo) => {
      if (mockInfo) {
        setUpdateInfo(mockInfo);
        setDismissedVersion(null);
      } else {
        checkForUpdates(true);
      }
    };

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [checkForUpdates]);

  const handleInstallUpdate = () => {
    if (!updateInfo) return;
    const native = getNativeBridge();

    setIsUpdating(true);
    setUpdateStatusText('⏳ নতুন APK ডাউনলোড শুরু হচ্ছে... অনুগ্রহ করে অপেক্ষা করুন।');

    if (native && typeof native.downloadAndInstallApk === 'function') {
      try {
        native.downloadAndInstallApk(updateInfo.apkUrl, updateInfo.versionName);
        setTimeout(() => {
          setUpdateStatusText(
            '✅ ডাউনলোড চলছে! নোটিফিকেশন বারে অগ্রগতি দেখুন। ডাউনলোড শেষ হলে স্বয়ংক্রিয়ভাবে Install অপশন ওপেন হবে।'
          );
          setIsUpdating(false);
        }, 2500);
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
      try {
        sessionStorage.setItem('dismissed_apk_update_version', updateInfo.versionName);
      } catch {
        // ignore
      }
    }
  };

  if (!updateInfo || dismissedVersion === updateInfo.versionName) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-3 z-[250] px-3 sm:px-6 pointer-events-none flex justify-center">
      <div className="pointer-events-auto w-full max-w-lg bg-gradient-to-br from-indigo-950 via-indigo-900 to-emerald-950 text-white rounded-2xl shadow-2xl border border-emerald-400/40 p-4 animate-slide-down">
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

        <div className="flex items-center justify-end gap-2 mt-3 pt-2.5 border-t border-white/10">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-indigo-200 cursor-pointer transition"
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
            {isUpdating ? 'ডাউনলোড হচ্ছে...' : 'এখনই আপডেট করুন (APK)'}
          </button>
        </div>
      </div>
    </div>
  );
};
