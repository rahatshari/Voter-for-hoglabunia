import React, { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { Voter, AppSearchFilters, AppSettings, SavedAppState } from './types';
import { prepareVoter } from './lib/bengaliUtils';
import { LoginScreen } from './components/LoginScreen';
import { HomeScreen } from './components/HomeScreen';
import { SearchScreen } from './components/SearchScreen';
import { AnalyticsScreen } from './components/AnalyticsScreen';
import { NavigationDock } from './components/NavigationDock';
import { LogoutModal } from './components/LogoutModal';
import { AnotherDeviceModal } from './components/AnotherDeviceModal';
import { Toast } from './components/Toast';
import { InstallPwaBanner } from './components/InstallPwaBanner';
import { VoterSlipModal } from './components/VoterSlipModal';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [authStatusText, setAuthStatusText] = useState('নিরাপত্তা যাচাই করা হচ্ছে...');
  const [villagesData, setVillagesData] = useState<Record<string, Voter[]>>({});
  const [activeScreen, setActiveScreen] = useState<'home' | 'search' | 'analytics'>('home');
  const [activeVillageKey, setActiveVillageKey] = useState<string>('');
  const [searchTitle, setSearchTitle] = useState<string>('');
  const [currentVoters, setCurrentVoters] = useState<Voter[]>([]);
  const [analyticsVillage, setAnalyticsVillage] = useState<string>('all');

  // State saved across reloads
  const [savedSearch, setSavedSearch] = useState<AppSearchFilters>({
    serial: '',
    name: '',
    father: '',
    mother: '',
    dob: '',
    profession: '',
    gender: '',
  });
  const [savedSettings, setSavedSettings] = useState<AppSettings>({
    fullList: false,
    stats: false,
    migrated: false,
  });

  // Modals & Notifications
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isAnotherDeviceOpen, setIsAnotherDeviceOpen] = useState(false);
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [slipModalVoter, setSlipModalVoter] = useState<Voter | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loginAlert, setLoginAlert] = useState<{ text: string; isError: boolean } | null>(null);

  const handleOpenSlipModal = (voter?: Voter | null) => {
    setSlipModalVoter(voter || null);
    setIsSlipModalOpen(true);
  };

  const sessionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  // Check URL params for logged_out
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loggedOutParam = params.get('logged_out');
    if (loggedOutParam === 'another_device') {
      setLoginAlert({
        text: '⚠️ আপনার অ্যাকাউন্টটি অন্য একটি মোবাইলে লগইন করা হয়েছে! এক সাথে কেবল একটি মোবাইলেই ব্যবহার করা যাবে, তাই এই ডিভাইসটি স্বয়ংক্রিয়ভাবে লগআউট করা হয়েছে।',
        isError: true,
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (loggedOutParam === '1') {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Helper to resolve static asset path relative to current app URL
  const getStaticUrl = useCallback((path: string) => {
    const clean = path.replace(/^\.?\//, '');
    try {
      return new URL(clean, window.location.href).href;
    } catch {
      return `./${clean}`;
    }
  }, []);

  // Fetch village data
  const loadVillages = useCallback(async () => {
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
          setVillagesData(prepared);
          return prepared;
        }
      }
    } catch (e) {
      console.warn('API villages fetch fallback to static:', e);
    }

    // Static fallback using relative paths (for GitHub Pages & static hosting)
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
    } catch (e) {}

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
        } catch (e) {}

        const list: Voter[] = [];
        try {
          const mRes = await fetch(getStaticUrl(`villages/${folder}/male.json`));
          const mCt = mRes.headers.get('content-type') || '';
          if (mRes.ok && mCt.includes('application/json')) {
            const males = await mRes.json();
            if (Array.isArray(males)) {
              list.push(...males.map((v) => ({ ...v, gender: v.gender || 'পুরুষ', villageName: vName })));
            }
          }
        } catch (e) {}

        try {
          const fRes = await fetch(getStaticUrl(`villages/${folder}/female.json`));
          const fCt = fRes.headers.get('content-type') || '';
          if (fRes.ok && fCt.includes('application/json')) {
            const females = await fRes.json();
            if (Array.isArray(females)) {
              list.push(...females.map((v) => ({ ...v, gender: v.gender || 'মহিলা', villageName: vName })));
            }
          }
        } catch (e) {}

        if (list.length > 0) {
          fallbackData[vName] = list.map((v) => prepareVoter(v, vName));
        }
      } catch (e) {}
    }

    setVillagesData(fallbackData);
    return fallbackData;
  }, [getStaticUrl]);

  // Listen for Firebase Auth state changes
  useEffect(() => {
    // Safety fallback timeout to prevent infinite spinner
    const authSafetyTimer = setTimeout(() => {
      setIsAuthChecking((prev) => {
        if (prev) {
          console.warn('Auth check safety fallback triggered');
          return false;
        }
        return false;
      });
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearTimeout(authSafetyTimer);
      if (user) {
        setCurrentUser(user);
        setAuthStatusText('ভোটার ডাটা লোড হচ্ছে...');

        // Register / validate device session
        let mySessionId = localStorage.getItem('voter_device_session_id');
        if (!mySessionId) {
          mySessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
          localStorage.setItem('voter_device_session_id', mySessionId);
        }

        if (user.email) {
          // Attempt session register only if API backend exists
          fetch('/api/session/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, sessionId: mySessionId }),
          })
            .then((res) => {
              if (res.ok) {
                // Poll validate session every 5 seconds if backend exists
                if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
                sessionIntervalRef.current = setInterval(async () => {
                  const currentSid = localStorage.getItem('voter_device_session_id');
                  if (!currentSid) return;
                  try {
                    const valRes = await fetch(
                      `/api/session/validate?email=${encodeURIComponent(
                        user.email!
                      )}&sessionId=${encodeURIComponent(currentSid)}`
                    );
                    const ct = valRes.headers.get('content-type') || '';
                    if (valRes.ok && ct.includes('application/json')) {
                      const data = await valRes.json();
                      if (data.isValid === false && data.reason === 'another_device_logged_in') {
                        if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
                        setIsAnotherDeviceOpen(true);
                      }
                    }
                  } catch (e) {}
                }, 5000);
              }
            })
            .catch(() => {});
        }

        const data = await loadVillages();

        // Restore saved app state if available
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
                setSavedSearch(state.search);
                setSavedSettings(state.settings);
                setActiveScreen('search');
              } else if (data[state.activeVillage]) {
                setSearchTitle(state.activeVillage);
                setActiveVillageKey(state.activeVillage);
                setCurrentVoters(data[state.activeVillage]);
                setSavedSearch(state.search);
                setSavedSettings(state.settings);
                setActiveScreen('search');
              }
            }
          } catch (e) {}
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
  }, [loadVillages]);

  // Handle browser popstate for back button
  useEffect(() => {
    const handlePopState = () => {
      if (activeScreen === 'search' || activeScreen === 'analytics') {
        setActiveScreen('home');
        setActiveVillageKey('');
        localStorage.removeItem('voterAppSavedState');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeScreen]);

  const handleSelectVillage = (village: string) => {
    const list = villagesData[village] || [];
    setSearchTitle(village);
    setActiveVillageKey(village);
    setCurrentVoters(list);
    setSavedSearch({
      serial: '',
      name: '',
      father: '',
      mother: '',
      dob: '',
      profession: '',
      gender: '',
    });
    setActiveScreen('search');
    window.history.pushState({ screen: 'search', village }, 'Search', '#search');

    const state: SavedAppState = {
      activeVillage: village,
      search: { serial: '', name: '', father: '', mother: '', dob: '', profession: '', gender: '' },
      settings: savedSettings,
    };
    localStorage.setItem('voterAppSavedState', JSON.stringify(state));
  };

  const handleOpenGlobalSearch = () => {
    const allList = Object.values(villagesData).flat();
    if (allList.length === 0) {
      showToast('দুঃখিত, এখনো কোনো গ্রামের তথ্য যুক্ত করা হয়নি!');
      return;
    }
    setSearchTitle('সকল গ্রাম');
    setActiveVillageKey('all');
    setCurrentVoters(allList);
    setSavedSearch({
      serial: '',
      name: '',
      father: '',
      mother: '',
      dob: '',
      profession: '',
      gender: '',
    });
    setActiveScreen('search');
    window.history.pushState({ screen: 'search', village: 'all' }, 'Search', '#search');

    const state: SavedAppState = {
      activeVillage: 'all',
      search: { serial: '', name: '', father: '', mother: '', dob: '', profession: '', gender: '' },
      settings: savedSettings,
    };
    localStorage.setItem('voterAppSavedState', JSON.stringify(state));
  };

  const handleOpenAnalytics = (village?: string) => {
    setAnalyticsVillage(village || 'all');
    setActiveScreen('analytics');
    window.history.pushState({ screen: 'analytics', village: village || 'all' }, 'Analytics', '#analytics');
  };

  const handleBackToHome = () => {
    setActiveScreen('home');
    setActiveVillageKey('');
    localStorage.removeItem('voterAppSavedState');
    if (window.location.hash) {
      window.history.replaceState({ screen: 'home' }, 'Home', window.location.pathname);
    }
  };

  const handleDockNavigate = (screen: 'home' | 'search' | 'analytics') => {
    if (screen === 'home') {
      handleBackToHome();
    } else if (screen === 'search') {
      if (activeVillageKey) {
        setActiveScreen('search');
      } else {
        handleOpenGlobalSearch();
      }
    } else if (screen === 'analytics') {
      handleOpenAnalytics(activeVillageKey || 'all');
    }
  };

  const handleStateChange = (search: AppSearchFilters, settings: AppSettings) => {
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
  };

  const executeLogout = async () => {
    setIsLoggingOut(true);
    if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);

    const email = currentUser?.email;
    const sessionId = localStorage.getItem('voter_device_session_id');

    localStorage.removeItem('voter_device_session_id');
    localStorage.removeItem('voterAppSavedState');

    if (email && sessionId) {
      try {
        await fetch('/api/session/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, sessionId }),
        });
      } catch (e) {}
    }

    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Sign out error:', e);
    }

    setIsLoggingOut(false);
    setIsLogoutOpen(false);
    setCurrentUser(null);
    setActiveScreen('home');
  };

  const handleKickedRedirect = () => {
    setIsAnotherDeviceOpen(false);
    localStorage.removeItem('voter_device_session_id');
    localStorage.removeItem('voterAppSavedState');
    signOut(auth).catch(() => {});
    setCurrentUser(null);
    setActiveScreen('home');
    setLoginAlert({
      text: '⚠️ আপনার অ্যাকাউন্টটি অন্য একটি মোবাইলে লগইন করা হয়েছে! এক সাথে কেবল একটি মোবাইলেই ব্যবহার করা যাবে, তাই এই ডিভাইসটি স্বয়ংক্রিয়ভাবে লগআউট করা হয়েছে।',
      isError: true,
    });
  };

  // Auth checking loading screen
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
        <h3 className="text-slate-800 text-lg font-bold mb-2">নিরাপত্তা যাচাই করা হচ্ছে...</h3>
        <p className="text-slate-500 text-sm">{authStatusText}</p>
      </div>
    );
  }

  // Login view if not authenticated
  if (!currentUser) {
    return (
      <LoginScreen
        initialMessage={loginAlert}
        onLoginSuccess={async (email) => {
          setLoginAlert(null);
          if (Object.keys(villagesData).length === 0) {
            await loadVillages();
          }
          setCurrentUser({ email } as any);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F3F8] p-2.5 sm:p-5 text-slate-800">
      {activeScreen === 'home' && (
        <HomeScreen
          userEmail={currentUser.email}
          villagesData={villagesData}
          onSelectVillage={handleSelectVillage}
          onOpenGlobalSearch={handleOpenGlobalSearch}
          onOpenAnalytics={handleOpenAnalytics}
          onOpenSlipModal={handleOpenSlipModal}
          onLogoutClick={() => setIsLogoutOpen(true)}
        />
      )}

      {activeScreen === 'search' && (
        <SearchScreen
          villageTitle={searchTitle}
          villageKey={activeVillageKey}
          voters={currentVoters}
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

      {activeScreen === 'analytics' && (
        <AnalyticsScreen
          villagesData={villagesData}
          initialVillage={analyticsVillage}
          onNavigateHome={handleBackToHome}
          onNavigateSearch={(village) => {
            if (village && villagesData[village]) {
              handleSelectVillage(village);
            } else {
              handleOpenGlobalSearch();
            }
          }}
        />
      )}

      {/* Floating Material Navigation Dock */}
      <NavigationDock
        activeScreen={activeScreen}
        onNavigate={handleDockNavigate}
        onOpenSlipModal={() => handleOpenSlipModal(null)}
        onLogoutClick={() => setIsLogoutOpen(true)}
      />

      {/* Logout Confirmation Modal */}
      <LogoutModal
        isOpen={isLogoutOpen}
        isLoading={isLoggingOut}
        onClose={() => setIsLogoutOpen(false)}
        onConfirm={executeLogout}
      />

      {/* Another Device Logged In Modal */}
      <AnotherDeviceModal
        isOpen={isAnotherDeviceOpen}
        onRedirect={handleKickedRedirect}
      />

      {/* Voter Slip Maker & Print Modal */}
      <VoterSlipModal
        isOpen={isSlipModalOpen}
        onClose={() => setIsSlipModalOpen(false)}
        voter={slipModalVoter}
        allVillages={villagesData}
      />

      {/* Toast Notification */}
      <Toast message={toastMessage} />

      {/* PWA In-App Install Prompt Banner */}
      <InstallPwaBanner />
    </div>
  );
};
