import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { Megaphone, Wrench } from 'lucide-react';
import { auth } from './lib/firebase';
import {
  AgeGroupFilter,
  AppGlobalConfig,
  AppScreenType,
  AppSearchFilters,
  AppSettings,
  CampaignStatusFilter,
  M3ThemePreferences,
  SavedAppState,
  Voter,
  VoterAnnotation,
} from './types';
import { prepareVoter } from './lib/bengaliUtils';
import { LoginScreen } from './components/LoginScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { HomeScreen } from './components/HomeScreen';
import { SearchScreen } from './components/SearchScreen';
import { SavedVotersScreen } from './components/SavedVotersScreen';
import { AnalyticsScreen } from './components/AnalyticsScreen';
import { NavigationDock } from './components/NavigationDock';
import { LogoutModal } from './components/LogoutModal';
import { AnotherDeviceModal } from './components/AnotherDeviceModal';
import { Toast } from './components/Toast';
import { InstallPwaBanner } from './components/InstallPwaBanner';
import { AppUpdateBanner } from './components/AppUpdateBanner';
import { VoterSlipModal } from './components/VoterSlipModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { ThemeSettingsSheet } from './components/ThemeSettingsSheet';
import { VoterDetailSheet, VoterDetailTab } from './components/VoterDetailSheet';
import {
  DEFAULT_APP_CONFIG,
  clientRegisterSession,
  clientHeartbeat,
  clientEndSession,
  loadStoredAdminEmails,
  loadStoredAppConfig,
} from './lib/clientAdminStore';
import {
  cloudRegisterSession,
  cloudHeartbeat,
  cloudEndSession,
  getCloudAdminEmails,
  listenForSessionTermination,
  subscribeAppGlobalConfig,
} from './lib/cloudStore';
import { isEmailAdmin } from './lib/adminUtils';
import {
  hasValidVillagesData,
  isDeviceOffline,
  loadVillagesFromOfflineCache,
  saveVillagesToOfflineCache,
} from './lib/offlineVoterCache';
import {
  clearLoginTimestamp,
  getLoginExpiryStatus,
  recordSuccessfulLoginTimestamp,
} from './lib/sessionExpiryUtils';
import {
  applyThemeToDocument,
  loadThemePreferences,
  saveThemePreferences,
} from './lib/themeStore';
import {
  computeTrackerSummary,
  loadVoterAnnotations,
} from './lib/voterTrackerStore';
import { getSlipQueue } from './lib/voterSlipUtils';

const EMPTY_FILTERS: AppSearchFilters = {
  omni: '',
  serial: '',
  name: '',
  father: '',
  mother: '',
  dob: '',
  voterId: '',
  profession: '',
  gender: '',
  ageGroup: '',
  campaignFilter: '',
  sortBy: 'serial_asc',
};

export const App: React.FC = () => {
  const initialDevEmail =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('dev_user') ||
        localStorage.getItem('voter_dev_test_email')
      : null;

  const [currentUser, setCurrentUser] = useState<User | null>(
    initialDevEmail ? ({ email: initialDevEmail } as any) : null
  );
  const [isAuthChecking, setIsAuthChecking] = useState(!initialDevEmail);
  const [authStatusText, setAuthStatusText] = useState('নিরাপত্তা যাচাই করা হচ্ছে...');
  const [villagesData, setVillagesData] = useState<Record<string, Voter[]>>({});
  const [activeScreen, setActiveScreen] = useState<AppScreenType>('home');
  const [activeVillageKey, setActiveVillageKey] = useState<string>('');
  const [searchTitle, setSearchTitle] = useState<string>('');
  const [currentVoters, setCurrentVoters] = useState<Voter[]>([]);
  const [analyticsVillage, setAnalyticsVillage] = useState<string>('all');

  // Material Design 3 Theme State
  const [themePrefs, setThemePrefs] = useState<M3ThemePreferences>(() =>
    loadThemePreferences()
  );
  const [isThemeSheetOpen, setIsThemeSheetOpen] = useState(false);

  // Campaign Annotations & Slip Queue State
  const [annotationsMap, setAnnotationsMap] = useState<Record<string, VoterAnnotation>>(() =>
    loadVoterAnnotations()
  );
  const [slipQueue, setSlipQueue] = useState<Voter[]>(() => getSlipQueue());

  // Voter Detail / Family / QR Sheet State
  const [detailVoter, setDetailVoter] = useState<Voter | null>(null);
  const [detailTab, setDetailTab] = useState<VoterDetailTab>('info');

  // State saved across reloads
  const [savedSearch, setSavedSearch] = useState<AppSearchFilters>({ ...EMPTY_FILTERS });
  const [savedSettings, setSavedSettings] = useState<AppSettings>({
    fullList: false,
    stats: false,
    migrated: false,
    viewMode: 'card',
  });

  // Modals & Notifications
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isAnotherDeviceOpen, setIsAnotherDeviceOpen] = useState(false);
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [slipModalVoter, setSlipModalVoter] = useState<Voter | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [appConfig, setAppConfig] = useState<AppGlobalConfig>(() => loadStoredAppConfig());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loginAlert, setLoginAlert] = useState<{ text: string; isError: boolean } | null>(null);

  // Apply Material Design 3 theme to document & follow OS dark-mode changes when mode === 'system'
  useEffect(() => {
    applyThemeToDocument(themePrefs);
    if (themePrefs.mode !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeToDocument(themePrefs);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themePrefs]);

  const handleUpdateThemePrefs = useCallback((next: M3ThemePreferences) => {
    setThemePrefs(saveThemePreferences(next));
  }, []);

  const refreshAnnotations = useCallback(() => {
    setAnnotationsMap(loadVoterAnnotations());
  }, []);

  const refreshSlipQueue = useCallback(() => {
    setSlipQueue(getSlipQueue());
  }, []);

  useEffect(() => {
    window.addEventListener('voter_tracker_updated', refreshAnnotations);
    window.addEventListener('slip-queue-updated', refreshSlipQueue);
    return () => {
      window.removeEventListener('voter_tracker_updated', refreshAnnotations);
      window.removeEventListener('slip-queue-updated', refreshSlipQueue);
    };
  }, [refreshAnnotations, refreshSlipQueue]);

  const allVotersFlat = useMemo(
    () => Object.values(villagesData).flat(),
    [villagesData]
  );

  const trackerSummary = useMemo(
    () => computeTrackerSummary(allVotersFlat, annotationsMap),
    [allVotersFlat, annotationsMap]
  );

  const handleOpenSlipModal = (voter?: Voter | null) => {
    setSlipModalVoter(voter || null);
    setIsSlipModalOpen(true);
  };

  const handleOpenVoterDetail = useCallback(
    (voter: Voter, tab: VoterDetailTab = 'info') => {
      setDetailVoter(voter);
      setDetailTab(tab);
    },
    []
  );

  const sessionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionListenerUnsubRef = useRef<(() => void) | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isDevUserActiveRef = useRef(Boolean(initialDevEmail));
  const villagesDataRef = useRef(villagesData);
  villagesDataRef.current = villagesData;

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  const perform24HourAutoLogout = useCallback(async (email?: string | null) => {
    if (sessionListenerUnsubRef.current) {
      sessionListenerUnsubRef.current();
      sessionListenerUnsubRef.current = null;
    }
    if (sessionIntervalRef.current) {
      clearInterval(sessionIntervalRef.current);
      sessionIntervalRef.current = null;
    }

    const sessionId = localStorage.getItem('voter_device_session_id');
    clearLoginTimestamp();
    localStorage.removeItem('voter_device_session_id');
    localStorage.removeItem('voterAppSavedState');
    localStorage.removeItem('voter_dev_test_email');
    isDevUserActiveRef.current = false;

    if (email && sessionId) {
      try {
        clientEndSession(sessionId, email, 'logout');
      } catch {}
      if (!isDeviceOffline()) {
        cloudEndSession(sessionId, email, 'logout').catch(() => {});
      }
    }

    await signOut(auth).catch(() => {});
    setIsLogoutOpen(false);
    setIsAnotherDeviceOpen(false);
    setCurrentUser(null);
    setActiveScreen('home');
    setLoginAlert({
      text: '২৪ ঘণ্টা পূর্ণ হয়েছে! নিরাপত্তার স্বার্থে আপনার অ্যাকাউন্ট স্বয়ংক্রিয়ভাবে লগআউট হয়েছে। অনুগ্রহ করে পুনরায় লগইন করুন।',
      isError: true,
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loggedOutParam = params.get('logged_out');
    if (loggedOutParam === 'another_device') {
      setLoginAlert({
        text: 'আপনার অ্যাকাউন্টটি অন্য একটি মোবাইলে লগইন করা হয়েছে! এক সাথে কেবল একটি মোবাইলেই ব্যবহার করা যাবে, তাই এই ডিভাইসটি স্বয়ংক্রিয়ভাবে লগআউট করা হয়েছে।',
        isError: true,
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (loggedOutParam === '1') {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!currentUser?.email) {
      setIsAdmin(false);
      return;
    }
    const cleanEmail = currentUser.email.trim().toLowerCase();

    getCloudAdminEmails()
      .then((admins) => {
        setIsAdmin(isEmailAdmin(cleanEmail, admins));
      })
      .catch(() => {
        const storedAdmins = loadStoredAdminEmails();
        setIsAdmin(isEmailAdmin(cleanEmail, storedAdmins));
      });
  }, [currentUser]);

  useEffect(() => {
    const unsubCfg = subscribeAppGlobalConfig((cfg) => {
      setAppConfig(cfg || DEFAULT_APP_CONFIG);
    });
    const onLocalCfgUpdate = () => {
      setAppConfig(loadStoredAppConfig());
    };
    window.addEventListener('voter_app_config_changed', onLocalCfgUpdate);
    return () => {
      try {
        unsubCfg();
      } catch {}
      window.removeEventListener('voter_app_config_changed', onLocalCfgUpdate);
    };
  }, []);

  const getStaticUrl = useCallback((path: string) => {
    const clean = path.replace(/^\.?\//, '');
    try {
      return new URL(clean, window.location.href).href;
    } catch {
      return `./${clean}`;
    }
  }, []);

  const loadVillages = useCallback(async () => {
    const isAndroidLocalAssets =
      typeof window !== 'undefined' &&
      window.location.hostname === 'appassets.androidplatform.net';

    if (!isAndroidLocalAssets && !isDeviceOffline()) {
      try {
        const res = await fetch('/api/villages-data');
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const rawData = await res.json();
          if (rawData && Object.keys(rawData).length > 0) {
            const prepared: Record<string, Voter[]> = {};
            for (const [village, voters] of Object.entries(rawData)) {
              prepared[village] = (voters as Voter[]).map((v) => prepareVoter(v, village));
            }
            if (hasValidVillagesData(prepared)) {
              setVillagesData(prepared);
              saveVillagesToOfflineCache(prepared).catch(() => false);
              return prepared;
            }
          }
        }
      } catch (e) {
        console.warn('API villages fetch fallback to static:', e);
      }
    }

    const fallbackData: Record<string, Voter[]> = {};
    let villageFolders = [
      'pathamara',
      'cotobadura',
      'village_3',
      'village_4',
      'village_5',
      'village_6',
      'village_7',
      'village_8',
      'village_9',
    ];

    try {
      const vfRes = await fetch(getStaticUrl('villages/villages.json'));
      const ct = vfRes.headers.get('content-type') || '';
      if (vfRes.ok && ct.includes('application/json')) {
        const folders = await vfRes.json();
        if (Array.isArray(folders) && folders.length > 0) {
          villageFolders = folders;
        }
      }
    } catch {}

    for (const folder of villageFolders) {
      try {
        let vName = folder;
        if (folder === 'cotobadura') vName = 'ছোট বাদুরা';
        if (folder === 'pathamara') vName = 'পাঠামারা';

        try {
          const infoRes = await fetch(getStaticUrl(`villages/${folder}/info.json`));
          const infoCt = infoRes.headers.get('content-type') || '';
          if (infoRes.ok && infoCt.includes('application/json')) {
            const info = await infoRes.json();
            if (info?.name) vName = info.name;
          }
        } catch {}

        const list: Voter[] = [];
        try {
          const mRes = await fetch(getStaticUrl(`villages/${folder}/male.json`));
          const mCt = mRes.headers.get('content-type') || '';
          if (mRes.ok && mCt.includes('application/json')) {
            const males = await mRes.json();
            if (Array.isArray(males)) {
              list.push(
                ...males.map((v) => ({ ...v, gender: v.gender || 'পুরুষ', villageName: vName }))
              );
            }
          }
        } catch {}

        try {
          const fRes = await fetch(getStaticUrl(`villages/${folder}/female.json`));
          const fCt = fRes.headers.get('content-type') || '';
          if (fRes.ok && fCt.includes('application/json')) {
            const females = await fRes.json();
            if (Array.isArray(females)) {
              list.push(
                ...females.map((v) => ({ ...v, gender: v.gender || 'মহিলা', villageName: vName }))
              );
            }
          }
        } catch {}

        if (list.length > 0) {
          fallbackData[vName] = list.map((v) => prepareVoter(v, vName));
        }
      } catch {}
    }

    if (hasValidVillagesData(fallbackData)) {
      setVillagesData(fallbackData);
      saveVillagesToOfflineCache(fallbackData).catch(() => false);
      return fallbackData;
    }

    const cachedData = await loadVillagesFromOfflineCache();
    if (cachedData && hasValidVillagesData(cachedData)) {
      setVillagesData(cachedData);
      return cachedData;
    }

    setVillagesData(fallbackData);
    return fallbackData;
  }, [getStaticUrl]);

  useEffect(() => {
    if (initialDevEmail) {
      loadVillages();
    }
    if (typeof window !== 'undefined') {
      (window as any).__SET_DEV_USER__ = async (email: string) => {
        isDevUserActiveRef.current = true;
        setCurrentUser({ email } as any);
        setIsAuthChecking(false);
        if (Object.keys(villagesDataRef.current).length === 0) {
          await loadVillages();
        }
      };
    }
  }, [initialDevEmail, loadVillages]);

  useEffect(() => {
    const authSafetyTimer = setTimeout(() => {
      setIsAuthChecking((prev) => {
        if (prev) {
          console.warn('Auth check safety fallback triggered');
          return false;
        }
        return false;
      });
    }, 1500);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearTimeout(authSafetyTimer);
      if (isDevUserActiveRef.current && !user) {
        setIsAuthChecking(false);
        return;
      }
      if (user) {
        const fallbackSignInMs = user.metadata?.lastSignInTime
          ? Date.parse(user.metadata.lastSignInTime)
          : null;
        const expiry = getLoginExpiryStatus({
          email: user.email,
          fallbackSignInTimeMs: Number.isNaN(fallbackSignInMs as number) ? null : fallbackSignInMs,
        });

        if (expiry.isExpired) {
          await perform24HourAutoLogout(user.email);
          setIsAuthChecking(false);
          return;
        }

        setCurrentUser(user);
        setAuthStatusText('ভোটার ডাটা লোড হচ্ছে...');

        let mySessionId = localStorage.getItem('voter_device_session_id');
        if (!mySessionId) {
          mySessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
          localStorage.setItem('voter_device_session_id', mySessionId);
        }

        if (user.email) {
          const ua = navigator.userAgent;
          let detectedDevice = 'Mobile Web';
          if (/Android/i.test(ua)) detectedDevice = 'Android Mobile';
          else if (/iPhone|iPad|iPod/i.test(ua)) detectedDevice = 'iOS Device';
          else if (/Windows/i.test(ua)) detectedDevice = 'Windows PC';
          else if (/Macintosh/i.test(ua)) detectedDevice = 'Mac Computer';

          if (sessionListenerUnsubRef.current) {
            sessionListenerUnsubRef.current();
            sessionListenerUnsubRef.current = null;
          }
          if (sessionIntervalRef.current) {
            clearInterval(sessionIntervalRef.current);
            sessionIntervalRef.current = null;
          }

          clientRegisterSession(user.email, mySessionId, detectedDevice);

          cloudRegisterSession(user.email, mySessionId, detectedDevice)
            .then(async (res) => {
              if (res.isBlocked) {
                await signOut(auth).catch(() => {});
                setCurrentUser(null);
                setLoginAlert({
                  text: 'আপনার অ্যাকাউন্টটি অ্যাডমিন কর্তৃক ব্লক করা হয়েছে।',
                  isError: true,
                });
                return;
              }
              if (res.maintenanceBlocked) {
                await signOut(auth).catch(() => {});
                setCurrentUser(null);
                setLoginAlert({
                  text: `${res.maintenanceMessage || 'সিস্টেম রক্ষণাবেক্ষণের কাজ চলছে।'}`,
                  isError: true,
                });
              }
            })
            .catch((err) => {
              console.warn('Notice: cloudRegisterSession background fallback:', err);
            });

          if (!isDeviceOffline()) {
            fetch('/api/session/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: user.email,
                sessionId: mySessionId,
                deviceName: detectedDevice,
              }),
            }).catch(() => null);
          }

          sessionIntervalRef.current = setInterval(async () => {
            const currentSid = localStorage.getItem('voter_device_session_id');
            if (!currentSid || !user.email) return;

            clientHeartbeat(currentSid);
            if (isDeviceOffline()) return;

            cloudHeartbeat(currentSid, user.email);

            try {
              const valRes = await fetch(
                `/api/session/validate?email=${encodeURIComponent(
                  user.email
                )}&sessionId=${encodeURIComponent(currentSid)}`
              );
              const vct = valRes.headers.get('content-type') || '';
              if (valRes.ok && vct.includes('application/json')) {
                const data = await valRes.json();
                if (data.isValid === false && data.reason === 'another_device_logged_in') {
                  const activeSid = localStorage.getItem('voter_device_session_id');
                  if (activeSid === mySessionId && !isLoggingOut) {
                    if (sessionIntervalRef.current) {
                      clearInterval(sessionIntervalRef.current);
                      sessionIntervalRef.current = null;
                    }
                    setIsAnotherDeviceOpen(true);
                  }
                }
              }
            } catch {}
          }, 8000);

          try {
            sessionListenerUnsubRef.current = listenForSessionTermination(
              mySessionId,
              (reason) => {
                const currentSid = localStorage.getItem('voter_device_session_id');
                if (reason === 'user_blocked') {
                  if (sessionIntervalRef.current) {
                    clearInterval(sessionIntervalRef.current);
                    sessionIntervalRef.current = null;
                  }
                  localStorage.removeItem('voter_device_session_id');
                  signOut(auth).catch(() => {});
                  setCurrentUser(null);
                  setLoginAlert({
                    text: 'আপনার অ্যাকাউন্টটি অ্যাডমিন কর্তৃক ব্লক করা হয়েছে।',
                    isError: true,
                  });
                  return;
                }
                if (currentSid === mySessionId && !isLoggingOut) {
                  if (sessionIntervalRef.current) {
                    clearInterval(sessionIntervalRef.current);
                    sessionIntervalRef.current = null;
                  }
                  setIsAnotherDeviceOpen(true);
                }
              },
              user.email
            );
          } catch {}
        }

        const data = await loadVillages();

        const savedRaw = localStorage.getItem('voterAppSavedState');
        if (savedRaw) {
          try {
            const state: SavedAppState = JSON.parse(savedRaw);
            if (state.activeVillage) {
              if (state.activeVillage === 'all') {
                const allList = Object.values(data).flat();
                setSearchTitle('সকল গ্রাম');
                setActiveVillageKey('all');
                setCurrentVoters(allList);
                setSavedSearch({ ...EMPTY_FILTERS, ...state.search });
                setSavedSettings((prev) => ({ ...prev, ...state.settings }));
                setActiveScreen('search');
              } else if (data[state.activeVillage]) {
                setSearchTitle(state.activeVillage);
                setActiveVillageKey(state.activeVillage);
                setCurrentVoters(data[state.activeVillage]);
                setSavedSearch({ ...EMPTY_FILTERS, ...state.search });
                setSavedSettings((prev) => ({ ...prev, ...state.settings }));
                setActiveScreen('search');
              }
            }
          } catch {}
        }

        setIsAuthChecking(false);
      } else {
        setCurrentUser(null);
        if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
        setIsAuthChecking(false);
      }
    });

    return () => {
      unsubscribe();
      if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
    };
  }, [loadVillages, perform24HourAutoLogout]);

  useEffect(() => {
    if (!currentUser?.email) return;

    const verify24HourWindow = () => {
      const rawLastSignIn = (currentUser as any)?.metadata?.lastSignInTime;
      const fallbackSignInMs = rawLastSignIn ? Date.parse(rawLastSignIn) : null;
      const status = getLoginExpiryStatus({
        email: currentUser.email,
        fallbackSignInTimeMs: Number.isNaN(fallbackSignInMs as number) ? null : fallbackSignInMs,
      });
      if (status.isExpired) {
        perform24HourAutoLogout(currentUser.email);
      }
    };

    verify24HourWindow();
    const expiryTicker = setInterval(verify24HourWindow, 30 * 1000);
    const onVisibilityOrFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        verify24HourWindow();
      }
    };

    window.addEventListener('focus', onVisibilityOrFocus);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);

    return () => {
      clearInterval(expiryTicker);
      window.removeEventListener('focus', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    };
  }, [currentUser, perform24HourAutoLogout]);

  useEffect(() => {
    const handlePopState = () => {
      if (detailVoter) {
        setDetailVoter(null);
        return;
      }
      if (activeScreen !== 'home') {
        setActiveScreen('home');
        setActiveVillageKey('');
        localStorage.removeItem('voterAppSavedState');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeScreen, detailVoter]);

  const handleSelectVillage = (
    village: string,
    preset?: { ageGroup?: AgeGroupFilter; profession?: string }
  ) => {
    const list = villagesData[village] || [];
    const nextSearch: AppSearchFilters = {
      ...EMPTY_FILTERS,
      ageGroup: preset?.ageGroup || '',
      profession: preset?.profession || '',
    };
    setSearchTitle(village);
    setActiveVillageKey(village);
    setCurrentVoters(list);
    setSavedSearch(nextSearch);
    setActiveScreen('search');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.history.pushState({ screen: 'search', village }, 'Search', '#search');

    const state: SavedAppState = {
      activeVillage: village,
      search: nextSearch,
      settings: savedSettings,
    };
    localStorage.setItem('voterAppSavedState', JSON.stringify(state));
  };

  const handleOpenGlobalSearch = (preset?: {
    omni?: string;
    ageGroup?: AgeGroupFilter;
    campaignFilter?: CampaignStatusFilter;
    profession?: string;
    fullList?: boolean;
  }) => {
    const allList = Object.values(villagesData).flat();
    if (allList.length === 0) {
      showToast('দুঃখিত, এখনো কোনো গ্রামের তথ্য যুক্ত করা হয়নি!');
      return;
    }
    const nextSearch: AppSearchFilters = {
      ...EMPTY_FILTERS,
      omni: preset?.omni || '',
      ageGroup: preset?.ageGroup || '',
      campaignFilter: preset?.campaignFilter || '',
      profession: preset?.profession || '',
    };
    const nextSettings: AppSettings = {
      ...savedSettings,
      fullList: preset?.fullList ?? savedSettings.fullList,
      migrated: false,
    };
    setSearchTitle('সকল গ্রাম');
    setActiveVillageKey('all');
    setCurrentVoters(allList);
    setSavedSearch(nextSearch);
    setSavedSettings(nextSettings);
    setActiveScreen('search');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.history.pushState({ screen: 'search', village: 'all' }, 'Search', '#search');

    const state: SavedAppState = {
      activeVillage: 'all',
      search: nextSearch,
      settings: nextSettings,
    };
    localStorage.setItem('voterAppSavedState', JSON.stringify(state));
  };

  const handleSwitchVillageInSearch = (targetKey: string) => {
    if (targetKey === 'all') {
      const allList = Object.values(villagesData).flat();
      setSearchTitle('সকল গ্রাম');
      setActiveVillageKey('all');
      setCurrentVoters(allList);
    } else if (villagesData[targetKey]) {
      setSearchTitle(targetKey);
      setActiveVillageKey(targetKey);
      setCurrentVoters(villagesData[targetKey]);
    }
  };

  const handleOpenAnalytics = (village?: string) => {
    setAnalyticsVillage(village || 'all');
    setActiveScreen('analytics');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.history.pushState({ screen: 'analytics', village: village || 'all' }, 'Analytics', '#analytics');
  };

  const handleOpenSavedHub = () => {
    setActiveScreen('saved');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.history.pushState({ screen: 'saved' }, 'Saved', '#saved');
  };

  const handleBackToHome = () => {
    setActiveScreen('home');
    setActiveVillageKey('');
    localStorage.removeItem('voterAppSavedState');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.location.hash) {
      window.history.replaceState({ screen: 'home' }, 'Home', window.location.pathname);
    }
  };

  const handleDockNavigate = (screen: AppScreenType) => {
    if (screen === 'home') {
      handleBackToHome();
    } else if (screen === 'search') {
      if (activeVillageKey) {
        setActiveScreen('search');
      } else {
        handleOpenGlobalSearch();
      }
    } else if (screen === 'saved') {
      handleOpenSavedHub();
    } else if (screen === 'analytics') {
      handleOpenAnalytics(activeVillageKey || 'all');
    }
  };

  const handleStateChange = useCallback(
    (search: AppSearchFilters, settings: AppSettings) => {
      setSavedSearch(search);
      setSavedSettings(settings);
      if (activeVillageKey) {
        const state: SavedAppState = {
          activeVillage: activeVillageKey,
          search,
          settings,
        };
        localStorage.setItem('voterAppSavedState', JSON.stringify(state));
      }
    },
    [activeVillageKey]
  );

  const executeLogout = async () => {
    setIsLoggingOut(true);
    if (sessionListenerUnsubRef.current) {
      sessionListenerUnsubRef.current();
      sessionListenerUnsubRef.current = null;
    }
    if (sessionIntervalRef.current) {
      clearInterval(sessionIntervalRef.current);
      sessionIntervalRef.current = null;
    }

    const email = currentUser?.email;
    const sessionId = localStorage.getItem('voter_device_session_id');

    clearLoginTimestamp();
    localStorage.removeItem('voter_device_session_id');
    localStorage.removeItem('voterAppSavedState');

    if (email && sessionId) {
      try {
        await cloudEndSession(sessionId, email, 'logout');
      } catch {}

      try {
        clientEndSession(sessionId, email, 'logout');
      } catch {}

      try {
        await fetch('/api/session/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, sessionId }),
        });
      } catch {}
    }

    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Sign out error:', e);
    }

    setIsLoggingOut(false);
    setIsLogoutOpen(false);
    setIsAnotherDeviceOpen(false);
    setLoginAlert(null);
    setCurrentUser(null);
    setActiveScreen('home');
  };

  const handleKickedRedirect = () => {
    if (sessionListenerUnsubRef.current) {
      sessionListenerUnsubRef.current();
      sessionListenerUnsubRef.current = null;
    }
    if (sessionIntervalRef.current) {
      clearInterval(sessionIntervalRef.current);
      sessionIntervalRef.current = null;
    }
    setIsAnotherDeviceOpen(false);
    clearLoginTimestamp();
    localStorage.removeItem('voter_device_session_id');
    localStorage.removeItem('voterAppSavedState');
    signOut(auth).catch(() => {});
    setCurrentUser(null);
    setActiveScreen('home');
    setLoginAlert({
      text: 'আপনার অ্যাকাউন্টটি অন্য একটি মোবাইলে লগইন করা হয়েছে! এক সাথে কেবল একটি মোবাইলেই ব্যবহার করা যাবে, তাই এই ডিভাইসটি স্বয়ংক্রিয়ভাবে লগআউট করা হয়েছে।',
      isError: true,
    });
  };

  if (isAuthChecking) {
    return <LoadingScreen statusText={authStatusText} />;
  }

  if (!currentUser) {
    return (
      <>
        <AppUpdateBanner globalAutoUpdateEnabled={appConfig.autoUpdateEnabled !== false} />
        <LoginScreen
          initialMessage={loginAlert}
          onLoginSuccess={async (email) => {
            setLoginAlert(null);
            recordSuccessfulLoginTimestamp(email);
            if (Object.keys(villagesData).length === 0) {
              await loadVillages();
            }
            setCurrentUser({ email } as any);
          }}
        />
      </>
    );
  }

  if (appConfig.maintenanceMode && !isAdmin) {
    return (
      <div className="min-h-screen m3-surface flex items-center justify-center p-4">
        <div className="m3-card-elevated max-w-md w-full rounded-[28px] p-7 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
            <Wrench className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black">অ্যাপ রক্ষণাবেক্ষণ মোড চালু</h2>
          <p className="text-sm text-[var(--md-on-surface-variant)] leading-relaxed">
            {appConfig.maintenanceMessage ||
              'সিস্টেম রক্ষণাবেক্ষণের কাজ চলছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।'}
          </p>
          <div className="text-xs text-[var(--md-on-surface-variant)]">
            লগইন: {currentUser.email}
          </div>
          <button
            type="button"
            onClick={executeLogout}
            className="w-full m3-btn-filled py-3 text-xs"
          >
            লগআউট করুন
          </button>
        </div>
      </div>
    );
  }

  const savedBadgeCount = trackerSummary.starredCount + trackerSummary.notesCount;

  return (
    <div className="min-h-screen w-full m3-surface flex flex-col justify-start antialiased">
      {/* In-App APK Auto Update Notification Banner */}
      <AppUpdateBanner globalAutoUpdateEnabled={appConfig.autoUpdateEnabled !== false} />

      {/* Global Admin Broadcast Announcement Banner */}
      {appConfig.announcementEnabled && appConfig.announcementText?.trim() && (
        <div
          role="region"
          aria-label="অ্যাডমিন ঘোষণা"
          className="bg-amber-600 text-white px-4 py-2 text-xs font-bold text-center shadow-xs flex items-center justify-center gap-2"
        >
          <Megaphone className="w-4 h-4 shrink-0" />
          <span>{appConfig.announcementText}</span>
        </div>
      )}

      {/* Responsive Mobile-First Viewport Container */}
      <div className="w-full max-w-6xl mx-auto px-2.5 sm:px-6 lg:px-8 py-3 sm:py-5 flex-1 flex flex-col">
        <main className="flex-1 pb-safe-nav">
          {activeScreen === 'home' && (
            <HomeScreen
              userEmail={currentUser.email}
              villagesData={villagesData}
              annotationsMap={annotationsMap}
              onSelectVillage={(v) => handleSelectVillage(v)}
              onOpenGlobalSearch={handleOpenGlobalSearch}
              onOpenSavedHub={handleOpenSavedHub}
              onOpenAnalytics={handleOpenAnalytics}
              onOpenSlipModal={handleOpenSlipModal}
              onOpenThemeSettings={() => setIsThemeSheetOpen(true)}
              isAdmin={isAdmin}
              onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
              onOpenUpdateModal={() => window.dispatchEvent(new Event('voter_open_update_modal'))}
              onLogoutClick={() => setIsLogoutOpen(true)}
              showToast={showToast}
            />
          )}

          {activeScreen === 'search' && (
            <SearchScreen
              villageTitle={searchTitle}
              villageKey={activeVillageKey}
              voters={currentVoters}
              villageNames={Object.keys(villagesData)}
              onSwitchVillage={handleSwitchVillageInSearch}
              annotationsMap={annotationsMap}
              onAnnotationsChanged={refreshAnnotations}
              onOpenVoterDetail={handleOpenVoterDetail}
              initialSearch={savedSearch}
              initialSettings={savedSettings}
              onBack={handleBackToHome}
              onOpenAnalytics={handleOpenAnalytics}
              onOpenSlipModal={handleOpenSlipModal}
              onLogoutClick={() => setIsLogoutOpen(true)}
              showToast={showToast}
              onStateChange={handleStateChange}
            />
          )}

          {activeScreen === 'saved' && (
            <SavedVotersScreen
              villagesData={villagesData}
              annotationsMap={annotationsMap}
              slipQueue={slipQueue}
              onAnnotationsChanged={refreshAnnotations}
              onSlipQueueChanged={refreshSlipQueue}
              onBackHome={handleBackToHome}
              onOpenSlipModal={handleOpenSlipModal}
              onOpenVoterDetail={handleOpenVoterDetail}
              showToast={showToast}
            />
          )}

          {activeScreen === 'analytics' && (
            <AnalyticsScreen
              villagesData={villagesData}
              annotationsMap={annotationsMap}
              initialVillage={analyticsVillage}
              onNavigateHome={handleBackToHome}
              onNavigateSearch={(village, preset) => {
                if (village && villagesData[village]) {
                  handleSelectVillage(village, preset);
                } else {
                  handleOpenGlobalSearch({
                    ageGroup: preset?.ageGroup,
                    profession: preset?.profession,
                    fullList: !preset?.ageGroup && !preset?.profession,
                  });
                }
              }}
            />
          )}
        </main>
      </div>

      {/* Material Design 3 Bottom Navigation Bar */}
      <NavigationDock
        activeScreen={activeScreen}
        onNavigate={handleDockNavigate}
        onOpenSlipModal={() => handleOpenSlipModal(null)}
        isAdmin={isAdmin}
        onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
        onLogoutClick={() => setIsLogoutOpen(true)}
        savedCount={savedBadgeCount}
        slipQueueCount={slipQueue.length}
      />

      {/* Material You Theme & Backup Settings Sheet */}
      <ThemeSettingsSheet
        isOpen={isThemeSheetOpen}
        onClose={() => setIsThemeSheetOpen(false)}
        prefs={themePrefs}
        onChangePrefs={handleUpdateThemePrefs}
        trackerStats={{
          starredCount: trackerSummary.starredCount,
          votedCount: trackerSummary.votedCount,
          notesCount: trackerSummary.notesCount,
        }}
        onTrackerChanged={refreshAnnotations}
        showToast={showToast}
        onOpenUpdateModal={() => window.dispatchEvent(new Event('voter_open_update_modal'))}
        onLogoutClick={() => setIsLogoutOpen(true)}
        userEmail={currentUser.email}
      />

      {/* Voter Detail, Family Members, Campaign Note & Offline QR Bottom Sheet */}
      <VoterDetailSheet
        voter={detailVoter}
        initialTab={detailTab}
        allVotersPool={allVotersFlat}
        annotationsMap={annotationsMap}
        onAnnotationsChanged={refreshAnnotations}
        onClose={() => setDetailVoter(null)}
        onSelectVoter={(v) => {
          setDetailVoter(v);
          setDetailTab('info');
        }}
        onOpenSlipModal={(v) => handleOpenSlipModal(v)}
        onSlipQueueUpdated={refreshSlipQueue}
        showToast={showToast}
      />

      {/* Logout Confirmation Dialog */}
      <LogoutModal
        isOpen={isLogoutOpen}
        isLoading={isLoggingOut}
        onClose={() => setIsLogoutOpen(false)}
        onConfirm={executeLogout}
      />

      {/* Another Device Logged In Dialog */}
      <AnotherDeviceModal
        isOpen={isAnotherDeviceOpen}
        onRedirect={handleKickedRedirect}
      />

      {/* Voter Slip Maker & Bluetooth Thermal Printer Modal */}
      <VoterSlipModal
        isOpen={isSlipModalOpen}
        onClose={() => {
          setIsSlipModalOpen(false);
          refreshSlipQueue();
        }}
        voter={slipModalVoter}
        allVillages={villagesData}
      />

      {/* Super Admin Dashboard Modal */}
      {isAdmin && (
        <AdminPanelModal
          isOpen={isAdminPanelOpen}
          onClose={() => setIsAdminPanelOpen(false)}
          currentUserEmail={currentUser.email || ''}
        />
      )}

      {/* Material 3 Snackbar Toast */}
      <Toast message={toastMessage} />

      {/* PWA In-App Install Prompt Banner */}
      <InstallPwaBanner />
    </div>
  );
};
