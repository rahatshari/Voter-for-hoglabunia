import { AppUpdatePreferences, RemoteReleaseInfo } from '../types';

export const DEFAULT_REPO = 'rahatsharif10448/voter-apps';
export const DEFAULT_LIVE_VERSION_URL = 'https://rahatsharif10448.github.io/voter-apps/version.json';
export const UPDATE_PREFS_STORAGE_KEY = 'voter_app_update_prefs_v1';
export const UPDATE_DISMISSED_SESSION_KEY = 'dismissed_apk_update_version';

export const DEFAULT_UPDATE_PREFS: AppUpdatePreferences = {
  autoCheckEnabled: true,
  autoNotifyEnabled: true,
  skippedVersion: null,
  lastCheckedAt: null,
};

const memoryPrefsFallback: Record<string, string> = {};

function readStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {}
  return memoryPrefsFallback[key] || null;
}

function writeStorage(key: string, val: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, val);
    }
  } catch {}
  memoryPrefsFallback[key] = val;
}

export function loadUpdatePrefs(): AppUpdatePreferences {
  try {
    const raw = readStorage(UPDATE_PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        autoCheckEnabled: parsed.autoCheckEnabled !== false,
        autoNotifyEnabled: parsed.autoNotifyEnabled !== false,
        skippedVersion: parsed.skippedVersion ? String(parsed.skippedVersion) : null,
        lastCheckedAt:
          typeof parsed.lastCheckedAt === 'number' && !Number.isNaN(parsed.lastCheckedAt)
            ? parsed.lastCheckedAt
            : null,
      };
    }
  } catch {}
  return { ...DEFAULT_UPDATE_PREFS };
}

export function saveUpdatePrefs(
  patch: Partial<AppUpdatePreferences>,
  silentEvent = false
): AppUpdatePreferences {
  const current = loadUpdatePrefs();
  const next: AppUpdatePreferences = {
    ...current,
    ...patch,
  };
  writeStorage(UPDATE_PREFS_STORAGE_KEY, JSON.stringify(next));
  if (!silentEvent && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('voter_update_prefs_changed', { detail: next }));
  }
  return next;
}

export function getSessionDismissedVersion(): string | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(UPDATE_DISMISSED_SESSION_KEY);
    }
  } catch {}
  return null;
}

export function setSessionDismissedVersion(versionName: string | null): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (versionName) {
        window.sessionStorage.setItem(UPDATE_DISMISSED_SESSION_KEY, versionName);
      } else {
        window.sessionStorage.removeItem(UPDATE_DISMISSED_SESSION_KEY);
      }
    }
  } catch {}
}

export function parseVersionCodeFromTag(tag: string): number {
  const clean = String(tag || '').replace(/^v/i, '').trim();
  if (!clean) return 100;
  const parts = clean.split('.').map((n) => parseInt(n.replace(/\D/g, ''), 10) || 0);
  if (parts.length >= 3 && parts[0] === 1 && parts[1] === 0) {
    return 100 + parts[2];
  }
  if (parts.length >= 3) {
    return parts[0] * 10000 + parts[1] * 100 + parts[2];
  }
  const single = parseInt(clean.replace(/\D/g, ''), 10);
  return Number.isNaN(single) ? 100 : single;
}

export function compareVersionStrings(a: string, b: string): number {
  const pa = String(a || '0.0.0')
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n.replace(/\D/g, ''), 10) || 0);
  const pb = String(b || '0.0.0')
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n.replace(/\D/g, ''), 10) || 0);
  const maxLen = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < maxLen; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export function isRemoteVersionNewer(
  remoteCode: number,
  remoteName: string,
  installedCode: number,
  installedName: string
): boolean {
  const semverCmp = compareVersionStrings(remoteName, installedName);
  if (semverCmp > 0) return true;
  if (semverCmp < 0) return false;
  return Number(remoteCode || 0) > Number(installedCode || 0);
}

export function normalizeGitHubRelease(
  release: any,
  repoSlug = DEFAULT_REPO
): RemoteReleaseInfo | null {
  if (!release || typeof release !== 'object') return null;
  const tagName = String(release.tag_name || '').trim();
  if (!tagName) return null;
  const cleanVersionName = tagName.replace(/^v/i, '');
  const remoteCode = parseVersionCodeFromTag(tagName);
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const apkAsset =
    assets.find((a: any) => String(a?.name || '').toLowerCase().endsWith('.apk')) || assets[0];
  const apkUrl =
    apkAsset?.browser_download_url ||
    `https://github.com/${repoSlug}/releases/latest/download/Union-Voter-App.apk`;

  return {
    versionCode: remoteCode,
    versionName: cleanVersionName,
    apkUrl,
    releaseNotes:
      String(release.body || '').trim() ||
      'নতুন আপডেটে উন্নত পারফরম্যান্স, প্রিন্টিং ফিক্স এবং নতুন ফিচার যুক্ত করা হয়েছে।',
    publishedAt: release.published_at ? String(release.published_at) : undefined,
  };
}

export function normalizeVersionJson(
  data: any,
  repoSlug = DEFAULT_REPO
): RemoteReleaseInfo | null {
  if (!data || typeof data !== 'object') return null;
  const versionCode = Number(data.versionCode || 0);
  const versionName = String(data.versionName || '').replace(/^v/i, '').trim();
  if (!versionName && versionCode <= 0) return null;
  return {
    versionCode: versionCode || parseVersionCodeFromTag(versionName),
    versionName: versionName || `1.0.${Math.max(0, versionCode - 100)}`,
    apkUrl:
      String(data.apkUrl || '').trim() ||
      `https://github.com/${data.repo || repoSlug}/releases/latest/download/Union-Voter-App.apk`,
    releaseNotes:
      String(data.releaseNotes || '').trim() ||
      'অ্যাপের নতুন ভার্সন প্রকাশিত হয়েছে। নতুন ফিচার পেতে এখনই আপডেট করুন।',
  };
}

export function shouldShowAutoUpdatePopup(params: {
  remote: RemoteReleaseInfo | null;
  prefs: AppUpdatePreferences;
  globalAutoUpdateEnabled?: boolean;
  sessionDismissedVersion?: string | null;
}): boolean {
  const { remote, prefs, globalAutoUpdateEnabled = true, sessionDismissedVersion = null } = params;
  if (!remote) return false;
  if (globalAutoUpdateEnabled === false) return false;
  if (!prefs.autoCheckEnabled || !prefs.autoNotifyEnabled) return false;
  if (prefs.skippedVersion && prefs.skippedVersion === remote.versionName) return false;
  if (sessionDismissedVersion && sessionDismissedVersion === remote.versionName) return false;
  return true;
}

export function getAndroidNativeBridge(): any {
  if (typeof window !== 'undefined' && (window as any).AndroidNative) {
    return (window as any).AndroidNative;
  }
  return null;
}

export async function getInstalledAppVersion(): Promise<{
  versionCode: number;
  versionName: string;
  repo: string;
  isAndroidNative: boolean;
}> {
  let installedCode = 100;
  let installedName = '1.0.0';
  let repoSlug = DEFAULT_REPO;

  try {
    const localRes = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (localRes.ok) {
      const localData = await localRes.json();
      if (localData?.versionCode) installedCode = Number(localData.versionCode);
      if (localData?.versionName) installedName = String(localData.versionName);
      if (localData?.repo) repoSlug = String(localData.repo);
    }
  } catch {
    // ignore local fetch error
  }

  const native = getAndroidNativeBridge();
  let isAndroidNative = false;
  if (native) {
    isAndroidNative = true;
    try {
      if (typeof native.getAppVersionCode === 'function') {
        const code = Number(native.getAppVersionCode());
        if (code > 0) installedCode = code;
      }
      if (typeof native.getAppVersionName === 'function') {
        const name = String(native.getAppVersionName() || '').trim();
        if (name) installedName = name;
      }
    } catch {
      // ignore
    }
  }

  return {
    versionCode: installedCode,
    versionName: installedName,
    repo: repoSlug,
    isAndroidNative,
  };
}

export interface UpdateCheckResult {
  installedCode: number;
  installedName: string;
  isAndroidNative: boolean;
  updateInfo: RemoteReleaseInfo | null;
  checkedAt: number;
  networkFailed: boolean;
}

export async function checkForAppUpdates(): Promise<UpdateCheckResult> {
  const installed = await getInstalledAppVersion();
  let detectedRemote: RemoteReleaseInfo | null = null;
  let anyNetworkSucceeded = false;

  // 1. Check GitHub Releases API
  try {
    const ghRes = await fetch(`https://api.github.com/repos/${installed.repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    if (ghRes.ok) {
      anyNetworkSucceeded = true;
      const release = await ghRes.json();
      const parsed = normalizeGitHubRelease(release, installed.repo);
      if (
        parsed &&
        isRemoteVersionNewer(
          parsed.versionCode,
          parsed.versionName,
          installed.versionCode,
          installed.versionName
        )
      ) {
        detectedRemote = parsed;
      }
    }
  } catch {
    // fallback below
  }

  // 2. Fallback: check GitHub Pages live version.json
  if (!detectedRemote) {
    try {
      const liveRes = await fetch(`${DEFAULT_LIVE_VERSION_URL}?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (liveRes.ok) {
        anyNetworkSucceeded = true;
        const liveData = await liveRes.json();
        const parsed = normalizeVersionJson(liveData, installed.repo);
        if (
          parsed &&
          isRemoteVersionNewer(
            parsed.versionCode,
            parsed.versionName,
            installed.versionCode,
            installed.versionName
          )
        ) {
          detectedRemote = parsed;
        }
      }
    } catch {
      // offline
    }
  }

  const checkedAt = Date.now();
  saveUpdatePrefs({ lastCheckedAt: checkedAt }, true);

  return {
    installedCode: installed.versionCode,
    installedName: installed.versionName,
    isAndroidNative: installed.isAndroidNative,
    updateInfo: detectedRemote,
    checkedAt,
    networkFailed: !anyNetworkSucceeded,
  };
}

export function triggerUpdateNotifications(
  updateInfo: RemoteReleaseInfo,
  prefs: AppUpdatePreferences
): void {
  if (!prefs.autoNotifyEnabled) return;

  const native = getAndroidNativeBridge();
  if (native && typeof native.showUpdateNotification === 'function') {
    try {
      native.showUpdateNotification(updateInfo.versionName, updateInfo.apkUrl);
      return;
    } catch {
      // ignore
    }
  }

  // Browser Web Notification API when permitted
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(`🚀 নতুন অ্যাপ আপডেট এসেছে (v${updateInfo.versionName})`, {
        body: 'নতুন ফিচার পেতে অ্যাপের ভেতরে ঢুকে এখনই আপডেট করুন।',
        icon: './icon-192.png',
        tag: `voter-app-update-${updateInfo.versionName}`,
      });
      n.onclick = () => {
        window.focus();
        window.dispatchEvent(new Event('voter_open_update_modal'));
        n.close();
      };
    } catch {
      // ignore on platforms without Notification constructor
    }
  }
}

export async function refreshWebAppCachesAndReload(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => null)));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => null)));
    }
  } catch {
    // ignore
  }
  window.location.reload();
}
