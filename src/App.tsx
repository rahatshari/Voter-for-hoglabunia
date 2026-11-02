import React, { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { Voter, AppSearchFilters, AppSettings, SavedAppState } from './types';
import { prepareVoter } from './lib/bengaliUtils';
import { LoginScreen } from './components/LoginScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { HomeScreen } from './components/HomeScreen';
import { SearchScreen } from './components/SearchScreen';
import { AnalyticsScreen } from './components/AnalyticsScreen';
import { NavigationDock } from './components/NavigationDock';
import { LogoutModal } from './components/LogoutModal';
import { AnotherDeviceModal } from './components/AnotherDeviceModal';
import { Toast } from './components/Toast';
import { InstallPwaBanner } from './components/InstallPwaBanner';
import { VoterSlipModal } from './components/VoterSlipModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import {
  clientRegisterSession,
  clientHeartbeat,
  clientEndSession,
  loadStoredAdminEmails,
} from './lib/clientAdminStore';
import {
  cloudRegisterSession,
  cloudHeartbeat,
  cloudEndSession,
  getCloudAdminEmails,
  listenForSessionTermination,
} from './lib/cloudStore';
import { isEmailAdmin } from './lib/adminUtils';

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loginAlert, setLoginAlert] = useState<{ text: string; isError: boolean } | null>(null);

  const handleOpenSlipModal = (voter?: Voter | null) => {
    setSlipModalVoter(voter || null);
    setIsSlipModalOpen(true);
  };

  const sessionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionListenerUnsubRef = useRef<(() => void) | null>(null);
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

  // Verify Admin Permissions for currentUser (Cloud Database first + Local Store fallback)
  useEffect(() => {
    if (!currentUser?.email) {
      setIsAdmin(false);
      return;
    }
    const cleanEmail = currentUser.email.trim().toLowerCase();

    // Check Cloud Admin Database
    getCloudAdminEmails()
      .then((admins) => {
        const userIsAdmin = isEmailAdmin(cleanEmail, admins);
        setIsAdmin(userIsAdmin);
      })
      .catch(() => {
        // Fallback for offline or local store
        const storedAdmins = loadStoredAdminEmails();
        const userIsAdmin = isEmailAdmin(cleanEmail, storedAdmins);
        setIsAdmin(userIsAdmin);
      });
  }, [currentUser]);

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

  // Browser testing helper to verify UI flows
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__SET_DEV_USER__ = async (email: string) => {
        if (Object.keys(villagesData).length === 0) {
          await loadVillages();
        }
        setCurrentUser({ email } as any);
      };
    }
  }, [loadVillages, villagesData]);

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
          const ua = navigator.userAgent;
          let detectedDevice = 'Mobile Web';
          if (/Android/i.test(ua)) detectedDevice = 'Android Mobile';
          else if (/iPhone|iPad|iPod/i.test(ua)) detectedDevice = 'iOS Device';
          else if (/Windows/i.test(ua)) detectedDevice = 'Windows PC';
          else if (/Macintosh/i.test(ua)) detectedDevice = 'Mac Computer';

          // Clean up any existing listeners before setting up new ones
          if (sessionListenerUnsubRef.current) {
            sessionListenerUnsubRef.current();
            sessionListenerUnsubRef.current = null;
          }
          if (sessionIntervalRef.current) {
            clearInterval(sessionIntervalRef.current);
            sessionIntervalRef.current = null;
          }

          // 1. Central Firebase Cloud Session Registration (Permanent history + real-time multi-admin visibility)
          try {
            const res = await cloudRegisterSession(user.email, mySessionId, detectedDevice);
            if (res.isBlocked) {
              await signOut(auth);
              showToast('🚫 আপনার অ্যাকাউন্টটি অ্যাডমিন কর্তৃক ব্লক করা হয়েছে।');
              return;
            }
          } catch (err) {
            console.warn('Notice: cloudRegisterSession fallback:', err);
          }

          // 2. Client store backup for offline resilience
          clientRegisterSession(user.email, mySessionId, detectedDevice);

          // 3. Server API registration if backend dev server is running
          fetch('/api/session/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, sessionId: mySessionId, deviceName: detectedDevice }),
          }).catch(() => null);

          // 4. Set up periodic heartbeat (every 8 seconds) and session validation
          sessionIntervalRef.current = setInterval(async () => {
            const currentSid = localStorage.getItem('voter_device_session_id');
            if (!currentSid || !user.email) return;

            // Cloud heartbeat & lifetime duration tracker
            cloudHeartbeat(currentSid, user.email);

            // Client backup heartbeat
            clientHeartbeat(currentSid);

            // Server heartbeat if running
            try {
              const valRes = await fetch(
                `/api/session/validate?email=${encodeURIComponent(user.email)}&sessionId=${encodeURIComponent(currentSid)}`
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
            } catch (e) {}
          }, 8000);

          // 5. Real-time Firebase Cloud listener for remote kicks or another device login
          try {
            sessionListenerUnsubRef.current = listenForSessionTermination(mySessionId, () => {
              // Check if session was terminated in cloud
              const currentSid = localStorage.getItem('voter_device_session_id');
              if (currentSid === mySessionId && !isLoggingOut) {
                // Another device logged in or admin kicked this session
                if (sessionIntervalRef.current) {
                  clearInterval(sessionIntervalRef.current);
                  sessionIntervalRef.current = null;
                }
                setIsAnotherDeviceOpen(true);
              }
            });
          } catch (e) {}
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
    // Unsubscribe from session listener and stop heartbeat
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

    localStorage.removeItem('voter_device_session_id');
    localStorage.removeItem('voterAppSavedState');

    if (email && sessionId) {
      try {
        await cloudEndSession(sessionId, email, 'logout');
      } catch (e) {}

      try {
        clientEndSession(sessionId, email, 'logout');
      } catch (e) {}

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
    setIsAnotherDeviceOpen(false);
    setLoginAlert(null); // Clear any old login alerts
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
    return <LoadingScreen statusText={authStatusText} />;
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
    <div className="min-h-screen w-full bg-[#F0F3F8] flex flex-col justify-start text-slate-800 antialiased selection:bg-indigo-500 selection:text-white">
      {/* Responsive Viewport Container: Fits mobile perfectly & expands beautifully on PC */}
      <div className="w-full max-w-6xl mx-auto px-2.5 sm:px-6 lg:px-8 py-3 sm:py-6 flex-1 flex flex-col">
        {/* Main Content Viewport */}
        <main className="flex-1 pb-20 sm:pb-24">
          {activeScreen === 'home' && (
            <HomeScreen
              userEmail={currentUser.email}
              villagesData={villagesData}
              onSelectVillage={handleSelectVillage}
              onOpenGlobalSearch={handleOpenGlobalSearch}
              onOpenAnalytics={handleOpenAnalytics}
              onOpenSlipModal={handleOpenSlipModal}
              isAdmin={isAdmin}
              onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
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
        </main>
      </div>

      {/* Floating Bottom Navigation Bar */}
      <NavigationDock
        activeScreen={activeScreen}
        onNavigate={handleDockNavigate}
        onOpenSlipModal={() => handleOpenSlipModal(null)}
        isAdmin={isAdmin}
        onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
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

        {/* Super Admin Dashboard Modal (Protected: Only rendered/accessible for Admins) */}
        {isAdmin && (
          <AdminPanelModal
            isOpen={isAdminPanelOpen}
            onClose={() => setIsAdminPanelOpen(false)}
            currentUserEmail={currentUser.email || ''}
          />
        )}

        {/* Toast Notification */}
        <Toast message={toastMessage} />

        {/* PWA In-App Install Prompt Banner */}
        <InstallPwaBanner />
      </div>
  );
};
