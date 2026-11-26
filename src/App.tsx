import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { get, ref } from 'firebase/database';
import { Megaphone, RefreshCw, WifiOff, Wrench } from 'lucide-react';
import { auth, database } from './lib/firebase';
import {
  AgeGroupFilter,
  AppGlobalConfig,
  AppScreenType,
  AppSearchFilters,
  AppSettings,
  CampaignStatusFilter,
  M3ThemePreferences,
  SavedAppState,
  SearchFieldMode,
  Voter,
  VoterAnnotation,
} from './types';
import { isMigrated, prepareVoter } from './lib/bengaliUtils';
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
import { VillageMenuOption } from './components/VillageDropdownMenu';
import {
  DEFAULT_APP_CONFIG,
  clientEndSession,
  clientHeartbeat,
  clientRegisterSession,
  loadStoredAdminEmails,
  loadStoredAppConfig,
} from './lib/clientAdminStore';
import {
  cloudEndSession,
  cloudHeartbeat,
  cloudRegisterSession,
  getCloudAdminEmails,
  listenForSessionTermination,
  subscribeAppGlobalConfig,
} from './lib/cloudStore';
import { isEmailAdmin } from './lib/adminUtils';
import { hasValidVillagesData } from './lib/offlineVoterCache';
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
import { safeLocalGet, safeLocalRemove, safeLocalSet } from './lib/safeStorage';

const EMPTY_FILTERS: AppSearchFilters = {
  searchField: 'name',
  query: '',
  omni: '',
  serial: '',
  name: '',
  father: '',
  mother: '',
  dob: '',
  voterId: '',
  address: '',
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
        safeLocalGet('voter_dev_test_email')
      : null;

  const [currentUser, setCurrentUser] = useState<User | null>(
    initialDevEmail ? ({ email: initialDevEmail } as any) : null
  );
  const [isAuthChecking, setIsAuthChecking] = useState(!initialDevEmail);
  const [authStatusText, setAuthStatusText] = useState('ইন্টারনেট ও অ্যাকাউন্ট যাচাই করা হচ্ছে...');

  // Online-only verification state (Persistent login — never logs out due to offline or 24h timer!)
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isCheckingConnection, setIsCheckingConnection] = useState<boolean>(false);

  const [villagesData, setVillagesData] = useState<Record<string, Voter[]>>({});
  const [activeScreen, setActiveScreen] = useState<AppScreenType>('home');
  const [activeVillageKey, setActiveVillageKey] = useState<string>('');
  const [searchTitle, setSearchTitle] = useState<string>('');
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

  // Voter Detail Sheet State
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

  // Verify live internet connectivity without signing out the user
  const verifyOnlineConnection = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOnline(false);
      return false;
    }
    setIsCheckingConnection(true);
    try {
      const TIMED_OUT = Symbol('timeout');
      const res = await Promise.race([
        get(ref(database, '.info/connected')),
        new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), 3500)),
      ]);
      // Even if RTDB websocket is still handshaking, navigator.onLine is true
      if (res !== TIMED_OUT || navigator.onLine) {
        setIsOnline(true);
        return true;
      }
      setIsOnline(navigator.onLine);
      return navigator.onLine;
    } catch {
      const navOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setIsOnline(navOnline);
      return navOnline;
    } finally {
      setIsCheckingConnection(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      verifyOnlineConnection();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [verifyOnlineConnection]);

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

  // Granular Admin Controls: Effective Slip Print & Accessible Villages
  const effectiveAllowSlipPrint = isAdmin || appConfig.allowSlipPrint !== false;

  useEffect(() => {
    if (!effectiveAllowSlipPrint && isSlipModalOpen) {
      setIsSlipModalOpen(false);
      showToast('ভোটার স্লিপ প্রিন্ট অপশনটি অ্যাডমিন কর্তৃক বন্ধ করা হয়েছে।');
    }
  }, [effectiveAllowSlipPrint, isSlipModalOpen, showToast]);

  const disabledVillagesList = useMemo(
    () => appConfig.disabledVillages || [],
    [appConfig.disabledVillages]
  );

  const accessibleVillagesData = useMemo(() => {
    if (isAdmin || disabledVillagesList.length === 0) return villagesData;
    const disabledSet = new Set(disabledVillagesList);
    const filtered: Record<string, Voter[]> = {};
    for (const [vName, list] of Object.entries(villagesData)) {
      if (!disabledSet.has(vName)) {
        filtered[vName] = list;
      }
    }
    return filtered;
  }, [villagesData, isAdmin, disabledVillagesList]);

  // If a non-admin user is currently viewing a village that gets locked in real time, return to Home
  useEffect(() => {
    if (
      !isAdmin &&
      activeScreen === 'search' &&
      activeVillageKey &&
      activeVillageKey !== 'all' &&
      disabledVillagesList.includes(activeVillageKey)
    ) {
      setActiveScreen('home');
      setActiveVillageKey('');
      showToast(`"${activeVillageKey}" গ্রামের ভোটার তথ্য অ্যাডমিন কর্তৃক বন্ধ করা হয়েছে।`);
    }
  }, [isAdmin, activeScreen, activeVillageKey, disabledVillagesList, showToast]);

  const currentVoters = useMemo(() => {
    if (activeVillageKey === 'all') {
      return Object.values(accessibleVillagesData).flat();
    }
    return accessibleVillagesData[activeVillageKey] || [];
  }, [accessibleVillagesData, activeVillageKey]);

  const villageMenuOptions: VillageMenuOption[] = useMemo(() => {
    const names = Object.keys(accessibleVillagesData);
    let totalActive = 0;
    const items = names.map((vn) => {
      const count = (accessibleVillagesData[vn] || []).filter((v) =>
        v._isMigrated !== undefined ? !v._isMigrated : !isMigrated(v)
      ).length;
      totalActive += count;
      return { key: vn, label: vn, count };
    });
    return [{ key: 'all', label: 'সকল গ্রাম (ইউনিয়ন)', count: totalActive }, ...items];
  }, [accessibleVillagesData]);

  const allAccessibleVotersFlat = useMemo(
    () => Object.values(accessibleVillagesData).flat(),
    [accessibleVillagesData]
  );

  const trackerSummary = useMemo(
    () => computeTrackerSummary(allAccessibleVotersFlat, annotationsMap),
    [allAccessibleVotersFlat, annotationsMap]
  );

  const handleOpenSlipModal = (voter?: Voter | null) => {
    if (!effectiveAllowSlipPrint) {
      showToast('ভোটার স্লিপ প্রিন্ট অপশনটি বর্তমানে অ্যাডমিন কর্তৃক বন্ধ রয়েছে।');
      return;
    }
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
    const onLocalCfgUpdate = () => {
      setAppConfig(loadStoredAppConfig());
    };
    window.addEventListener('voter_app_config_changed', onLocalCfgUpdate);

    if (!currentUser?.email) {
      return () => {
        window.removeEventListener('voter_app_config_changed', onLocalCfgUpdate);
      };
    }

    const unsubCfg = subscribeAppGlobalConfig((cfg) => {
      setAppConfig(cfg || DEFAULT_APP_CONFIG);
    });
    return () => {
      try {
        unsubCfg();
      } catch {}
      window.removeEventListener('voter_app_config_changed', onLocalCfgUpdate);
    };
  }, [currentUser?.email]);

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

    if (!isAndroidLocalAssets && navigator.onLine) {
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
              return prepared;
            }
          }
        }
      } catch (e) {
        console.warn('API villages fetch fallback to bundled villages:', e);
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

  // Persistent Firebase Authentication + Online Session Verification (No 24h auto-logout!)
  useEffect(() => {
    const authSafetyTimer = setTimeout(() => {
      setIsAuthChecking((prev) => (prev ? false : false));
    }, 1800);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearTimeout(authSafetyTimer);
      if (isDevUserActiveRef.current && !user) {
        setIsAuthChecking(false);
        return;
      }
      const effectiveUser =
        user ||
        (safeLocalGet('voter_verified_auth_email')
          ? ({ email: safeLocalGet('voter_verified_auth_email') } as any)
          : null);

      if (effectiveUser) {
        setCurrentUser(effectiveUser);
        setAuthStatusText('ইন্টারনেট সংযোগ ও ভোটার ডাটা প্রস্তুত হচ্ছে...');

        let mySessionId = safeLocalGet('voter_device_session_id');
        if (!mySessionId) {
          mySessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
          safeLocalSet('voter_device_session_id', mySessionId);
        }

        if (effectiveUser.email) {
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

          clientRegisterSession(effectiveUser.email, mySessionId, detectedDevice);

          if (navigator.onLine) {
            cloudRegisterSession(effectiveUser.email, mySessionId, detectedDevice)
              .then(async (res) => {
                if (res.isBlocked) {
                  safeLocalRemove('voter_verified_auth_email');
                  safeLocalRemove('voter_device_session_id');
                  await signOut(auth).catch(() => {});
                  setCurrentUser(null);
                  setLoginAlert({
                    text: 'আপনার অ্যাকাউন্টটি অ্যাডমিন কর্তৃক ব্লক করা হয়েছে।',
                    isError: true,
                  });
                  return;
                }
                if (res.maintenanceBlocked) {
                  safeLocalRemove('voter_verified_auth_email');
                  safeLocalRemove('voter_device_session_id');
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

            fetch('/api/session/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: effectiveUser.email,
                sessionId: mySessionId,
                deviceName: detectedDevice,
              }),
            }).catch(() => null);
          }

          sessionIntervalRef.current = setInterval(async () => {
            const currentSid = safeLocalGet('voter_device_session_id');
            if (!currentSid || !effectiveUser.email) return;

            clientHeartbeat(currentSid);
            if (!navigator.onLine) return;

            cloudHeartbeat(currentSid, effectiveUser.email);

            try {
              const valRes = await fetch(
                `/api/session/validate?email=${encodeURIComponent(
                  effectiveUser.email
                )}&sessionId=${encodeURIComponent(currentSid)}`
              );
              const vct = valRes.headers.get('content-type') || '';
              if (valRes.ok && vct.includes('application/json')) {
                const data = await valRes.json();
                if (data.isValid === false && data.reason === 'another_device_logged_in') {
                  const activeSid = safeLocalGet('voter_device_session_id');
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
                const currentSid = safeLocalGet('voter_device_session_id');
                if (reason === 'user_blocked') {
                  if (sessionIntervalRef.current) {
                    clearInterval(sessionIntervalRef.current);
                    sessionIntervalRef.current = null;
                  }
                  safeLocalRemove('voter_device_session_id');
                  safeLocalRemove('voter_verified_auth_email');
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
              effectiveUser.email
            );
          } catch {}
        }

        const data = await loadVillages();

        const savedRaw = safeLocalGet('voterAppSavedState');
        if (savedRaw) {
          try {
            const state: SavedAppState = JSON.parse(savedRaw);
            if (state.activeVillage) {
              if (state.activeVillage === 'all') {
                setSearchTitle('সকল গ্রাম');
                setActiveVillageKey('all');
                setSavedSearch({ ...EMPTY_FILTERS, ...state.search });
                setSavedSettings((prev) => ({ ...prev, ...state.settings }));
                setActiveScreen('search');
              } else if (data[state.activeVillage]) {
                setSearchTitle(state.activeVillage);
                setActiveVillageKey(state.activeVillage);
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
  }, [loadVillages, isLoggingOut]);

  // Android Hardware Back & Browser History Handler
  useEffect(() => {
    const handleBackAction = (): boolean => {
      if (detailVoter) {
        setDetailVoter(null);
        return true;
      }
      if (isSlipModalOpen) {
        setIsSlipModalOpen(false);
        return true;
      }
      if (isThemeSheetOpen) {
        setIsThemeSheetOpen(false);
        return true;
      }
      if (isAdminPanelOpen) {
        setIsAdminPanelOpen(false);
        return true;
      }
      if (isLogoutOpen) {
        setIsLogoutOpen(false);
        return true;
      }
      if (activeScreen !== 'home') {
        setActiveScreen('home');
        setActiveVillageKey('');
        safeLocalRemove('voterAppSavedState');
        return true;
      }
      return false;
    };

    const handlePopState = () => {
      handleBackAction();
    };

    (window as any).__HANDLE_ANDROID_BACK__ = handleBackAction;
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [
    activeScreen,
    detailVoter,
    isSlipModalOpen,
    isThemeSheetOpen,
    isAdminPanelOpen,
    isLogoutOpen,
  ]);

  const handleSelectVillage = (
    village: string,
    preset?: { ageGroup?: AgeGroupFilter; profession?: string }
  ) => {
    if (!isAdmin && disabledVillagesList.includes(village)) {
      showToast(`"${village}" গ্রামের ভোটার তথ্য বর্তমানে অ্যাডমিন কর্তৃক বন্ধ রয়েছে।`);
      return;
    }
    const nextSearch: AppSearchFilters = {
      ...EMPTY_FILTERS,
      searchField: preset?.profession ? 'profession' : 'name',
      query: preset?.profession || '',
      ageGroup: preset?.ageGroup || '',
    };
    setSearchTitle(village);
    setActiveVillageKey(village);
    setSavedSearch(nextSearch);
    setActiveScreen('search');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.history.pushState({ screen: 'search', village }, 'Search', '#search');

    const state: SavedAppState = {
      activeVillage: village,
      search: nextSearch,
      settings: savedSettings,
    };
    safeLocalSet('voterAppSavedState', JSON.stringify(state));
  };

  const handleOpenGlobalSearch = (preset?: {
    searchField?: SearchFieldMode;
    query?: string;
    omni?: string;
    ageGroup?: AgeGroupFilter;
    campaignFilter?: CampaignStatusFilter;
    profession?: string;
    fullList?: boolean;
  }) => {
    const allList = Object.values(accessibleVillagesData).flat();
    if (allList.length === 0) {
      showToast('দুঃখিত, বর্তমানে কোনো সক্রিয় গ্রামের ভোটার তথ্য উন্মুক্ত নেই!');
      return;
    }
    const resolvedField: SearchFieldMode = preset?.profession
      ? 'profession'
      : preset?.searchField || 'name';
    const resolvedQuery =
      preset?.profession || preset?.query || preset?.omni || '';

    const nextSearch: AppSearchFilters = {
      ...EMPTY_FILTERS,
      searchField: resolvedField,
      query: resolvedQuery,
      ageGroup: preset?.ageGroup || '',
      campaignFilter: preset?.campaignFilter || '',
    };
    const nextSettings: AppSettings = {
      ...savedSettings,
      fullList: preset?.fullList ?? savedSettings.fullList,
      migrated: false,
    };
    setSearchTitle('সকল গ্রাম');
    setActiveVillageKey('all');
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
    safeLocalSet('voterAppSavedState', JSON.stringify(state));
  };

  const handleSwitchVillageInSearch = (targetKey: string) => {
    if (targetKey === 'all') {
      setSearchTitle('সকল গ্রাম');
      setActiveVillageKey('all');
    } else if (accessibleVillagesData[targetKey]) {
      setSearchTitle(targetKey);
      setActiveVillageKey(targetKey);
    }
  };

  const handleOpenAnalytics = (village?: string) => {
    setAnalyticsVillage(village || 'all');
    setActiveScreen('analytics');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.history.pushState(
      { screen: 'analytics', village: village || 'all' },
      'Analytics',
      '#analytics'
    );
  };

  const handleOpenSavedHub = () => {
    setActiveScreen('saved');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.history.pushState({ screen: 'saved' }, 'Saved', '#saved');
  };

  const handleBackToHome = () => {
    setActiveScreen('home');
    setActiveVillageKey('');
    safeLocalRemove('voterAppSavedState');
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
        safeLocalSet('voterAppSavedState', JSON.stringify(state));
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
    const sessionId = safeLocalGet('voter_device_session_id');

    safeLocalRemove('voter_device_session_id');
    safeLocalRemove('voter_verified_auth_email');
    safeLocalRemove('voter_dev_test_email');
    safeLocalRemove('voterAppSavedState');
    isDevUserActiveRef.current = false;

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
    safeLocalRemove('voter_device_session_id');
    safeLocalRemove('voter_verified_auth_email');
    safeLocalRemove('voterAppSavedState');
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

  // 1. Not logged in -> Show LoginScreen
  if (!currentUser) {
    return (
      <>
        <AppUpdateBanner globalAutoUpdateEnabled={appConfig.autoUpdateEnabled !== false} />
        <LoginScreen
          initialMessage={loginAlert}
          onLoginSuccess={async (email) => {
            setLoginAlert(null);
            if (Object.keys(villagesData).length === 0) {
              await loadVillages();
            }
            const sid =
              safeLocalGet('voter_device_session_id') ||
              'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
            safeLocalSet('voter_device_session_id', sid);
            clientRegisterSession(email, sid, 'App Session');
            fetch('/api/session/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, sessionId: sid, deviceName: 'Web/Preview' }),
            }).catch(() => null);
            setCurrentUser((prev) => prev || ({ email } as any));
          }}
        />
      </>
    );
  }

  // 2. Logged in (persistent!) -> Verify Internet Connection before allowing entry (NEVER signs out!)
  if (!isOnline) {
    return (
      <div className="min-h-screen m3-surface flex items-center justify-center p-4">
        <div className="m3-card-elevated max-w-sm w-full rounded-[28px] p-7 text-center space-y-4 animate-m3-scale">
          <div className="w-16 h-16 rounded-3xl bg-[var(--md-error-container)] text-[var(--md-on-error-container)] flex items-center justify-center mx-auto">
            <WifiOff className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-black">ইন্টারনেট সংযোগ প্রয়োজন</h2>
            <p className="text-xs sm:text-sm text-[var(--md-on-surface-variant)] leading-relaxed">
              অ্যাপটিতে প্রবেশ ও ব্যবহারের জন্য সক্রিয় ইন্টারনেট সংযোগ আবশ্যক। আপনার অ্যাকাউন্ট (
              <b className="text-[var(--md-on-surface)]">{currentUser.email}</b>) লগইন অবস্থাতেই সংরক্ষিত আছে — ডাটা বা ওয়াইফাই চালু করলেই সরাসরি ঢুকে যাবে।
            </p>
          </div>
          <button
            type="button"
            disabled={isCheckingConnection}
            onClick={() => verifyOnlineConnection()}
            className="w-full m3-btn-filled py-3.5 text-xs sm:text-sm inline-flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isCheckingConnection ? 'animate-spin' : ''}`} />
            <span>
              {isCheckingConnection ? 'সংযোগ যাচাই হচ্ছে...' : 'সংযোগ পুনরায় পরীক্ষা করুন'}
            </span>
          </button>
        </div>
      </div>
    );
  }

  // 3. Maintenance Mode Gate for non-admins
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
              villagesData={accessibleVillagesData}
              allVillagesData={villagesData}
              disabledVillages={disabledVillagesList}
              allowSlipPrint={effectiveAllowSlipPrint}
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
              key={activeVillageKey || 'all'}
              villageTitle={searchTitle}
              villageKey={activeVillageKey}
              voters={currentVoters}
              villageNames={Object.keys(accessibleVillagesData)}
              villageOptions={villageMenuOptions}
              onSwitchVillage={handleSwitchVillageInSearch}
              allowSlipPrint={effectiveAllowSlipPrint}
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
              villagesData={accessibleVillagesData}
              annotationsMap={annotationsMap}
              slipQueue={slipQueue}
              allowSlipPrint={effectiveAllowSlipPrint}
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
              villagesData={accessibleVillagesData}
              annotationsMap={annotationsMap}
              initialVillage={analyticsVillage}
              onNavigateHome={handleBackToHome}
              onNavigateSearch={(village, preset) => {
                if (village && accessibleVillagesData[village]) {
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
        allowSlipPrint={effectiveAllowSlipPrint}
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

      {/* Voter Detail, Campaign Note & QR Bottom Sheet */}
      <VoterDetailSheet
        voter={detailVoter}
        initialTab={detailTab}
        annotationsMap={annotationsMap}
        allowSlipPrint={effectiveAllowSlipPrint}
        onAnnotationsChanged={refreshAnnotations}
        onClose={() => setDetailVoter(null)}
        onOpenSlipModal={(v) => handleOpenSlipModal(v)}
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
      {effectiveAllowSlipPrint && (
        <VoterSlipModal
          isOpen={isSlipModalOpen}
          onClose={() => {
            setIsSlipModalOpen(false);
            refreshSlipQueue();
          }}
          voter={slipModalVoter}
          allVillages={accessibleVillagesData}
        />
      )}

      {/* Super Admin Dashboard Modal */}
      {isAdmin && (
        <AdminPanelModal
          isOpen={isAdminPanelOpen}
          onClose={() => setIsAdminPanelOpen(false)}
          currentUserEmail={currentUser.email || ''}
          villageNames={Object.keys(villagesData)}
        />
      )}

      {/* Material 3 Snackbar Toast */}
      <Toast message={toastMessage} />

      {/* PWA In-App Install Prompt Banner */}
      <InstallPwaBanner />
    </div>
  );
};
