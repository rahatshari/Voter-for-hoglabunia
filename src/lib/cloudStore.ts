import {
  ref,
  get,
  set,
  update,
  remove,
  onValue,
  Unsubscribe,
} from 'firebase/database';
import { database, auth } from './firebase';
import {
  AdminPanelData,
  AppGlobalConfig,
  AppUserRecord,
  SessionHistoryItem,
} from '../types';
import {
  calculateAdminSummary,
  isEmailAdmin,
  mergeHistoryRecords,
  normalizeHistoryRecord,
} from './adminUtils';
import {
  DEFAULT_APP_CONFIG,
  loadStoredAdminEmails,
  loadStoredAppConfig,
  loadStoredSessions,
  loadStoredUsers,
  replaceStoredHistoryExact,
  saveStoredAdminEmails,
  saveStoredAppConfig,
  saveStoredSessions,
  saveStoredUsers,
} from './clientAdminStore';

export const DEFAULT_ADMIN_EMAILS = [
  'rahatsharif10448@gmail.com',
  'rahatsharif504@gmail.com',
];

/**
 * RTDB path keys cannot contain '.', '#', '$', '[', or ']'
 */
export function encodeEmailKey(email: string): string {
  return email.trim().toLowerCase().replace(/\./g, ',');
}

export function decodeEmailKey(key: string): string {
  return key.replace(/,/g, '.');
}

export interface CloudSessionDoc {
  sessionId: string;
  email: string;
  deviceName?: string;
  registeredAt: number;
  lastActive: number;
}

export interface CloudHistoryDoc {
  id: string;
  email: string;
  sessionId: string;
  deviceName?: string;
  loginAt: number;
  logoutAt?: number | null;
  durationMinutes: number;
  endReason: 'active' | 'logout' | 'another_device' | 'kicked';
  timestamp: number;
}

/**
 * Parses a raw RTDB `history` snapshot object into normalized SessionHistoryItem[].
 * Zero truncation — keeps all past & future dates intact.
 */
export function parseCloudHistorySnapshot(rawHistory: unknown): SessionHistoryItem[] {
  if (!rawHistory || typeof rawHistory !== 'object') return [];
  const items: SessionHistoryItem[] = [];
  Object.entries(rawHistory as Record<string, any>).forEach(([key, val]) => {
    const normalized = normalizeHistoryRecord(key, val);
    if (normalized) {
      items.push(normalized);
    }
  });
  return mergeHistoryRecords(items);
}

/**
 * Fetch all authorized admin emails from Firebase Realtime Database.
 * Always merges with hardcoded default super-admin emails.
 */
export async function getCloudAdminEmails(): Promise<string[]> {
  try {
    const adminRef = ref(database, 'admin_emails');
    const snapshot = await get(adminRef);
    const setAdmins = new Set<string>(DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()));

    if (snapshot.exists()) {
      const val = snapshot.val();
      if (typeof val === 'object' && val !== null) {
        Object.keys(val).forEach((k) => {
          if (val[k] !== false) {
            setAdmins.add(decodeEmailKey(k));
          }
        });
      }
    }
    const result = Array.from(setAdmins);
    saveStoredAdminEmails(result);
    return result;
  } catch (err) {
    console.warn('Could not fetch cloud admin emails, using local fallback:', err);
    return loadStoredAdminEmails();
  }
}

/**
 * Save updated admin emails list to Firebase Realtime Database
 */
export async function saveCloudAdminEmails(emails: string[]): Promise<void> {
  const cleanList = Array.from(
    new Set([...DEFAULT_ADMIN_EMAILS, ...emails].map((e) => e.trim().toLowerCase()).filter(Boolean))
  );
  saveStoredAdminEmails(cleanList);

  const payload: Record<string, boolean> = {};
  cleanList.forEach((email) => {
    payload[encodeEmailKey(email)] = true;
  });
  await set(ref(database, 'admin_emails'), payload);
}

/**
 * Fetch App Global Control configuration from Firebase RTDB
 */
export async function getCloudAppConfig(): Promise<AppGlobalConfig> {
  try {
    const snap = await get(ref(database, 'app_config'));
    if (snap.exists() && typeof snap.val() === 'object') {
      const merged = { ...DEFAULT_APP_CONFIG, ...snap.val() };
      saveStoredAppConfig(merged);
      return merged;
    }
  } catch {
    // fallback to stored
  }
  return loadStoredAppConfig();
}

/**
 * Save App Global Control configuration to Firebase RTDB + local cache
 */
export async function saveCloudAppConfig(
  cfg: AppGlobalConfig,
  updatedBy?: string
): Promise<AppGlobalConfig> {
  const cleanCfg: AppGlobalConfig = {
    ...DEFAULT_APP_CONFIG,
    ...cfg,
    updatedAt: Date.now(),
    updatedBy: updatedBy || cfg.updatedBy || '',
  };
  saveStoredAppConfig(cleanCfg);
  await set(ref(database, 'app_config'), cleanCfg);
  return cleanCfg;
}

/**
 * Real-time listener for App Global Control configuration (Maintenance mode, broadcast banner, etc.)
 */
export function subscribeAppGlobalConfig(
  onUpdate: (cfg: AppGlobalConfig) => void
): Unsubscribe {
  const configRef = ref(database, 'app_config');
  return onValue(
    configRef,
    (snap) => {
      if (snap.exists() && typeof snap.val() === 'object') {
        const merged = { ...DEFAULT_APP_CONFIG, ...snap.val() };
        saveStoredAppConfig(merged);
        onUpdate(merged);
      } else {
        onUpdate(loadStoredAppConfig());
      }
    },
    () => {
      onUpdate(loadStoredAppConfig());
    }
  );
}

/**
 * Check if a user is blocked or maintenance mode applies before allowing entry
 */
export async function checkCloudAccessForUser(email: string): Promise<{
  isBlocked: boolean;
  maintenanceBlocked: boolean;
  maintenanceMessage?: string;
}> {
  const cleanEmail = email.trim().toLowerCase();
  const emailKey = encodeEmailKey(cleanEmail);
  try {
    const [userRes, adminRes, cfgRes] = await Promise.allSettled([
      get(ref(database, `users/${emailKey}`)),
      getCloudAdminEmails(),
      getCloudAppConfig(),
    ]);

    let isBlocked = false;
    if (userRes.status === 'fulfilled' && userRes.value.exists()) {
      isBlocked = userRes.value.val()?.status === 'blocked';
    }

    const admins = adminRes.status === 'fulfilled' ? adminRes.value : loadStoredAdminEmails();
    const isAdmin = isEmailAdmin(cleanEmail, admins);
    const cfg = cfgRes.status === 'fulfilled' ? cfgRes.value : loadStoredAppConfig();

    const maintenanceBlocked = Boolean(cfg.maintenanceMode && !isAdmin);
    return {
      isBlocked,
      maintenanceBlocked,
      maintenanceMessage: cfg.maintenanceMessage,
    };
  } catch {
    return { isBlocked: false, maintenanceBlocked: false };
  }
}

/**
 * Register a user's session in Firebase Realtime Database.
 * - Enforces block & maintenance mode.
 * - Closes any stale/previous active sessions and orphaned 'active' history rows for that email.
 * - Writes permanent history entry in `history/{histId}`.
 * - Updates user profile while preserving custom fields (`name`, `phone`, `notes`, `totalMinutesSpent`, `loginCount`).
 */
export async function cloudRegisterSession(
  email: string,
  sessionId: string,
  deviceName: string
): Promise<{ success: boolean; isBlocked: boolean; maintenanceBlocked?: boolean; maintenanceMessage?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const emailKey = encodeEmailKey(cleanEmail);
  const now = Date.now();

  try {
    const [userSnap, admins, cfg] = await Promise.all([
      get(ref(database, `users/${emailKey}`)),
      getCloudAdminEmails(),
      getCloudAppConfig(),
    ]);

    const existingUserData: any = userSnap.exists() ? userSnap.val() : null;
    if (existingUserData && existingUserData.status === 'blocked') {
      return { success: false, isBlocked: true };
    }

    const isAdmin = isEmailAdmin(cleanEmail, admins);
    if (cfg.maintenanceMode && !isAdmin) {
      return {
        success: false,
        isBlocked: false,
        maintenanceBlocked: true,
        maintenanceMessage: cfg.maintenanceMessage,
      };
    }

    const sessionsSnap = await get(ref(database, 'sessions'));
    let existingSameSessionRegAt = 0;

    if (sessionsSnap.exists()) {
      const allSessions = sessionsSnap.val() as Record<string, CloudSessionDoc>;
      for (const [oldSid, s] of Object.entries(allSessions)) {
        if (!s || !s.email) continue;
        if (s.email.toLowerCase() === cleanEmail) {
          if (oldSid === sessionId) {
            existingSameSessionRegAt = s.registeredAt || now;
          } else if (cfg.enforceSingleDevice !== false) {
            const duration = Math.max(1, Math.round((now - (s.registeredAt || now)) / 60000));
            const histId = `hist_${s.registeredAt || now}_${oldSid.slice(-6)}`;
            await update(ref(database, `history/${histId}`), {
              id: histId,
              email: cleanEmail,
              sessionId: oldSid,
              deviceName: s.deviceName || 'Mobile',
              loginAt: s.registeredAt || now,
              logoutAt: now,
              durationMinutes: duration,
              endReason: 'another_device',
            }).catch(() => null);

            await remove(ref(database, `sessions/${oldSid}`)).catch(() => null);
          }
        }
      }
    }

    if (cfg.enforceSingleDevice !== false) {
      try {
        const histSnap = await get(ref(database, 'history'));
        if (histSnap.exists()) {
          const allHist = histSnap.val() as Record<string, any>;
          for (const [hKey, hVal] of Object.entries(allHist)) {
            if (
              hVal &&
              typeof hVal.email === 'string' &&
              hVal.email.toLowerCase() === cleanEmail &&
              hVal.endReason === 'active' &&
              hVal.sessionId !== sessionId
            ) {
              const closedAt = hVal.lastActive || hVal.loginAt || now;
              const dur = Math.max(1, Math.round((closedAt - (hVal.loginAt || closedAt)) / 60000));
              await update(ref(database, `history/${hKey}`), {
                logoutAt: closedAt,
                durationMinutes: dur,
                endReason: 'another_device',
              }).catch(() => null);
            }
          }
        }
      } catch {}
    }

    const regAt = existingSameSessionRegAt || now;
    const currentSessionData: CloudSessionDoc = {
      sessionId,
      email: cleanEmail,
      deviceName,
      registeredAt: regAt,
      lastActive: now,
    };
    await set(ref(database, `sessions/${sessionId}`), currentSessionData);

    const historyId = `hist_${regAt}_${sessionId.slice(-6)}`;
    const existingHistSnap = await get(ref(database, `history/${historyId}`)).catch(() => null);
    if (!existingHistSnap || !existingHistSnap.exists()) {
      const historyRecord: CloudHistoryDoc = {
        id: historyId,
        email: cleanEmail,
        sessionId,
        deviceName,
        loginAt: regAt,
        logoutAt: null,
        durationMinutes: 1,
        endReason: 'active',
        timestamp: regAt,
      };
      await set(ref(database, `history/${historyId}`), historyRecord);
    } else {
      await update(ref(database, `history/${historyId}`), {
        lastActive: now,
        deviceName,
      }).catch(() => null);
    }

    const updatedUser: AppUserRecord = {
      email: cleanEmail,
      name: existingUserData?.name || cleanEmail.split('@')[0],
      phone: existingUserData?.phone || '',
      notes: existingUserData?.notes || '',
      role: isAdmin ? 'admin' : existingUserData?.role || 'user',
      status: 'active',
      createdAt: existingUserData?.createdAt || now,
      lastLoginAt: now,
      totalMinutesSpent: existingUserData?.totalMinutesSpent || 0,
      lastPasswordChangedAt: existingUserData?.lastPasswordChangedAt || null,
      loginCount: (existingUserData?.loginCount || 0) + (existingSameSessionRegAt ? 0 : 1),
      deviceName,
      lastActive: now,
    };
    await set(ref(database, `users/${emailKey}`), updatedUser);

    return { success: true, isBlocked: false };
  } catch (err) {
    console.warn('Cloud session register error, falling back to local:', err);
    const localUsers = loadStoredUsers();
    const localUser = localUsers[cleanEmail];
    if (localUser && localUser.status === 'blocked') {
      return { success: false, isBlocked: true };
    }
    const localSessions = loadStoredSessions();
    localSessions[sessionId] = {
      sessionId,
      email: cleanEmail,
      deviceName,
      registeredAt: now,
      lastActive: now,
    };
    saveStoredSessions(localSessions);
    return { success: true, isBlocked: false };
  }
}

/**
 * Cloud Heartbeat: keeps session active and tracks cumulative user minutes in Cloud
 */
export async function cloudHeartbeat(sessionId: string, email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const emailKey = encodeEmailKey(cleanEmail);
  const now = Date.now();

  try {
    const sessionRef = ref(database, `sessions/${sessionId}`);
    const snap = await get(sessionRef);
    if (!snap.exists()) return;

    const sess = snap.val() as CloudSessionDoc;
    const deltaSeconds = Math.max(0, (now - sess.lastActive) / 1000);
    const totalSessionDuration = Math.max(1, Math.round((now - sess.registeredAt) / 60000));

    await update(sessionRef, { lastActive: now });

    const historyId = `hist_${sess.registeredAt}_${sessionId.slice(-6)}`;
    await update(ref(database, `history/${historyId}`), {
      durationMinutes: totalSessionDuration,
      lastActive: now,
    }).catch(() => null);

    if (deltaSeconds > 0 && deltaSeconds < 300) {
      const addedMinutes = deltaSeconds / 60;
      const userRef = ref(database, `users/${emailKey}`);
      const userSnap = await get(userRef);
      if (userSnap.exists()) {
        const u = userSnap.val();
        const currentTotal = u.totalMinutesSpent || 0;
        const newTotal = Math.round((currentTotal + addedMinutes) * 100) / 100;
        await update(userRef, {
          totalMinutesSpent: newTotal,
          lastActive: now,
        });
      }
    }
  } catch {
    // Silent catch on heartbeat network glitches
  }
}

/**
 * Terminate a session cleanly in Cloud
 */
export async function cloudEndSession(
  sessionId: string,
  email: string,
  reason: 'logout' | 'kicked' | 'another_device' = 'logout'
): Promise<void> {
  const now = Date.now();
  const cleanEmail = email.trim().toLowerCase();
  try {
    const sessionRef = ref(database, `sessions/${sessionId}`);
    const snap = await get(sessionRef);
    if (snap.exists()) {
      const sess = snap.val() as CloudSessionDoc;
      const duration = Math.max(1, Math.round((now - sess.registeredAt) / 60000));
      const histId = `hist_${sess.registeredAt}_${sessionId.slice(-6)}`;

      await update(ref(database, `history/${histId}`), {
        id: histId,
        email: cleanEmail,
        sessionId,
        deviceName: sess.deviceName || 'Mobile Web',
        loginAt: sess.registeredAt,
        logoutAt: now,
        durationMinutes: duration,
        endReason: reason,
      }).catch(() => null);

      await remove(sessionRef).catch(() => null);
    }
  } catch (err) {
    console.warn('Cloud end session error:', err);
  }
}

/**
 * Build unified AdminPanelData from raw Firebase RTDB snapshots
 */
export function buildAdminDataFromSnapshots(params: {
  currentUserEmail: string;
  adminEmailsRaw: Record<string, any> | null;
  usersRaw: Record<string, any> | null;
  sessionsRaw: Record<string, any> | null;
  historyRaw: Record<string, any> | null;
  appConfigRaw: AppGlobalConfig | null;
  cloudError?: string | null;
}): AdminPanelData {
  const now = Date.now();
  const cleanEmail = params.currentUserEmail.trim().toLowerCase();

  const setAdmins = new Set<string>(DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()));
  if (params.adminEmailsRaw && typeof params.adminEmailsRaw === 'object') {
    Object.entries(params.adminEmailsRaw).forEach(([k, v]) => {
      if (v !== false) setAdmins.add(decodeEmailKey(k).toLowerCase());
    });
  }
  const adminEmails = Array.from(setAdmins);
  const isAdmin = isEmailAdmin(cleanEmail, adminEmails);

  const cloudUsersMap: Record<string, AppUserRecord> = {};
  if (params.usersRaw && typeof params.usersRaw === 'object') {
    Object.entries(params.usersRaw).forEach(([key, val]: [string, any]) => {
      if (!val || typeof val !== 'object') return;
      const email = String(val.email || decodeEmailKey(key)).trim().toLowerCase();
      cloudUsersMap[email] = {
        ...val,
        email,
        role: isEmailAdmin(email, adminEmails) ? 'admin' : val.role || 'user',
        status: val.status === 'blocked' ? 'blocked' : 'active',
        totalMinutesSpent: Number(val.totalMinutesSpent || 0),
        createdAt: Number(val.createdAt || now),
      };
    });
  }

  DEFAULT_ADMIN_EMAILS.forEach((adm) => {
    const lower = adm.toLowerCase();
    if (!cloudUsersMap[lower]) {
      cloudUsersMap[lower] = {
        email: lower,
        name: lower.includes('10448') ? 'সুপার অ্যাডমিন' : 'সহকারী অ্যাডমিন',
        role: 'admin',
        status: 'active',
        createdAt: now - 3600000 * 48,
        lastLoginAt: null,
        totalMinutesSpent: 0,
        lastPasswordChangedAt: null,
      };
    }
  });

  const activeSessions: CloudSessionDoc[] = [];
  if (params.sessionsRaw && typeof params.sessionsRaw === 'object') {
    Object.entries(params.sessionsRaw).forEach(([sid, s]: [string, any]) => {
      if (s && s.email) {
        activeSessions.push({
          ...s,
          sessionId: s.sessionId || sid,
          email: String(s.email).trim().toLowerCase(),
          registeredAt: Number(s.registeredAt || now),
          lastActive: Number(s.lastActive || s.registeredAt || now),
        });
      }
    });
  }

  const historyList = parseCloudHistorySnapshot(params.historyRaw);

  historyList.forEach((h) => {
    const lower = h.email.toLowerCase();
    if (!cloudUsersMap[lower]) {
      cloudUsersMap[lower] = {
        email: lower,
        name: lower.split('@')[0],
        role: isEmailAdmin(lower, adminEmails) ? 'admin' : 'user',
        status: 'active',
        createdAt: h.loginAt,
        lastLoginAt: h.loginAt,
        totalMinutesSpent: h.durationMinutes || 0,
      };
    }
  });

  const onlineCount = activeSessions.filter((s) => now - s.lastActive < 45000).length;

  const enrichedUsers: AppUserRecord[] = Object.values(cloudUsersMap).map((u) => {
    const userSessions = activeSessions.filter(
      (s) => s.email.toLowerCase() === u.email.toLowerCase()
    );
    const active = [...userSessions].sort((a, b) => b.lastActive - a.lastActive)[0];
    const isOnline = userSessions.some((s) => now - s.lastActive < 45000);
    const currentDuration = active
      ? Math.max(1, Math.round((now - active.registeredAt) / 60000))
      : 0;

    return {
      ...u,
      isOnline,
      activeSessionId: active?.sessionId,
      activeSessionCount: userSessions.length,
      currentSessionDuration: currentDuration,
      deviceName: active?.deviceName || u.deviceName || undefined,
      lastActive: active?.lastActive || u.lastActive || u.lastLoginAt || undefined,
    };
  });

  enrichedUsers.sort((a, b) => {
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    if (a.status === 'blocked' && b.status !== 'blocked') return 1;
    if (a.status !== 'blocked' && b.status === 'blocked') return -1;
    return (b.totalMinutesSpent || 0) - (a.totalMinutesSpent || 0);
  });

  const summary = calculateAdminSummary(enrichedUsers, onlineCount);
  const appConfig: AppGlobalConfig = {
    ...DEFAULT_APP_CONFIG,
    ...(params.appConfigRaw || {}),
  };

  if (!params.cloudError) {
    saveStoredAdminEmails(adminEmails);
    saveStoredUsers(cloudUsersMap);
    replaceStoredHistoryExact(historyList);
    saveStoredAppConfig(appConfig);
  }

  return {
    success: true,
    isAdmin,
    adminEmails,
    users: enrichedUsers,
    activeUsers: activeSessions.map((s) => ({
      ...s,
      isOnline: now - s.lastActive < 45000,
      durationMinutes: Math.max(1, Math.round((now - s.registeredAt) / 60000)),
      lastSeenSecondsAgo: Math.max(0, Math.round((now - s.lastActive) / 1000)),
    })),
    history: historyList,
    summary,
    appConfig,
    dataSource: 'firebase',
    cloudConnected: !params.cloudError,
    cloudError: params.cloudError || null,
    lastSyncedAt: now,
  };
}

/**
 * Fetch complete shared admin data from Firebase Realtime Database (one-shot tolerant fetch)
 */
export async function fetchCloudAdminData(currentUserEmail: string): Promise<AdminPanelData> {
  const results = await Promise.allSettled([
    get(ref(database, 'admin_emails')),
    get(ref(database, 'users')),
    get(ref(database, 'sessions')),
    get(ref(database, 'history')),
    get(ref(database, 'app_config')),
  ]);

  const errors: string[] = [];
  const getVal = (idx: number, label: string) => {
    const r = results[idx];
    if (r.status === 'fulfilled') {
      return r.value.exists() ? r.value.val() : null;
    }
    errors.push(`${label}: ${r.reason?.message || 'Permission denied'}`);
    return null;
  };

  const adminEmailsRaw = getVal(0, 'admin_emails');
  const usersRaw = getVal(1, 'users');
  const sessionsRaw = getVal(2, 'sessions');
  const historyRaw = getVal(3, 'history');
  const appConfigRaw = getVal(4, 'app_config');

  if (results[1].status === 'rejected' && results[3].status === 'rejected') {
    const reason =
      results[3].reason?.message ||
      results[1].reason?.message ||
      'Firebase RTDB Permission denied';
    throw new Error(
      !auth.currentUser
        ? `Firebase Auth সাইন-ইন নেই (${reason})`
        : reason
    );
  }

  return buildAdminDataFromSnapshots({
    currentUserEmail,
    adminEmailsRaw,
    usersRaw,
    sessionsRaw,
    historyRaw,
    appConfigRaw,
    cloudError: errors.length > 0 ? errors.join(' | ') : null,
  });
}

/**
 * Real-time RTDB multi-node subscription for the Admin Panel.
 * Streams EVERY change across `history`, `users`, `sessions`, `admin_emails`, `app_config` live!
 */
export function subscribeCloudAdminData(
  currentUserEmail: string,
  onUpdate: (data: AdminPanelData) => void,
  onFatalError?: (errMessage: string) => void
): Unsubscribe {
  const state = {
    adminEmailsRaw: null as Record<string, any> | null,
    usersRaw: null as Record<string, any> | null,
    sessionsRaw: null as Record<string, any> | null,
    historyRaw: null as Record<string, any> | null,
    appConfigRaw: null as AppGlobalConfig | null,
  };

  const nodeErrors: Record<string, string | null> = {};
  const loadedNodes = new Set<string>();

  const emit = () => {
    if (loadedNodes.size === 0) return;

    const coreDenied = Boolean(nodeErrors.users && nodeErrors.history);
    if (coreDenied) {
      const msg = !auth.currentUser
        ? `Firebase Auth সাইন-ইন সক্রিয় নয় (${nodeErrors.history})`
        : String(nodeErrors.history || nodeErrors.users);
      if (onFatalError) onFatalError(msg);
      return;
    }

    const errMessages = Object.entries(nodeErrors)
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => `${k}: ${v}`);

    const data = buildAdminDataFromSnapshots({
      currentUserEmail,
      adminEmailsRaw: state.adminEmailsRaw,
      usersRaw: state.usersRaw,
      sessionsRaw: state.sessionsRaw,
      historyRaw: state.historyRaw,
      appConfigRaw: state.appConfigRaw,
      cloudError: errMessages.length > 0 ? errMessages.join(' | ') : null,
    });
    onUpdate(data);
  };

  const unsubs: Unsubscribe[] = [];

  const watchNode = (
    key: keyof typeof state,
    path: string
  ) => {
    const unsub = onValue(
      ref(database, path),
      (snap) => {
        nodeErrors[path] = null;
        loadedNodes.add(path);
        state[key] = snap.exists() ? snap.val() : null;
        emit();
      },
      (err) => {
        nodeErrors[path] = err?.message || 'Permission denied';
        loadedNodes.add(path);
        emit();
      }
    );
    unsubs.push(unsub);
  };

  watchNode('historyRaw', 'history');
  watchNode('usersRaw', 'users');
  watchNode('sessionsRaw', 'sessions');
  watchNode('adminEmailsRaw', 'admin_emails');
  watchNode('appConfigRaw', 'app_config');

  return () => {
    unsubs.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  };
}

/**
 * Add a new user in Cloud Database
 */
export async function cloudAddUser(data: {
  email: string;
  name?: string;
  phone?: string;
  notes?: string;
  role?: 'user' | 'admin';
}): Promise<AppUserRecord> {
  const cleanEmail = data.email.trim().toLowerCase();
  const emailKey = encodeEmailKey(cleanEmail);
  const now = Date.now();

  const userRef = ref(database, `users/${emailKey}`);
  const snap = await get(userRef);
  const existing = snap.exists() ? snap.val() : null;

  const newUser: AppUserRecord = {
    email: cleanEmail,
    name: data.name?.trim() || existing?.name || cleanEmail.split('@')[0],
    phone: data.phone?.trim() ?? existing?.phone ?? '',
    notes: data.notes?.trim() ?? existing?.notes ?? '',
    role: data.role || existing?.role || 'user',
    status: existing?.status || 'active',
    createdAt: existing?.createdAt || now,
    lastLoginAt: existing?.lastLoginAt || null,
    totalMinutesSpent: existing?.totalMinutesSpent || 0,
    lastPasswordChangedAt: existing?.lastPasswordChangedAt || null,
  };

  await set(userRef, newUser);

  if (data.role === 'admin') {
    await set(ref(database, `admin_emails/${emailKey}`), true);
  }

  return newUser;
}

/**
 * Update existing user profile, role, status, or reset minutes in Cloud Database
 */
export async function cloudUpdateUser(
  email: string,
  updates: Partial<Pick<AppUserRecord, 'name' | 'phone' | 'notes' | 'role' | 'status' | 'totalMinutesSpent'>>
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const emailKey = encodeEmailKey(cleanEmail);

  const patch: Record<string, any> = {};
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.phone !== undefined) patch.phone = updates.phone.trim();
  if (updates.notes !== undefined) patch.notes = updates.notes.trim();
  if (updates.role !== undefined) patch.role = updates.role;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.totalMinutesSpent !== undefined) {
    patch.totalMinutesSpent = Math.max(0, Number(updates.totalMinutesSpent) || 0);
  }

  await update(ref(database, `users/${emailKey}`), patch);

  if (updates.role === 'admin') {
    await set(ref(database, `admin_emails/${emailKey}`), true).catch(() => null);
  } else if (updates.role === 'user' && !DEFAULT_ADMIN_EMAILS.includes(cleanEmail)) {
    await remove(ref(database, `admin_emails/${emailKey}`)).catch(() => null);
  }

  if (updates.status === 'blocked') {
    await cloudKickSession(cleanEmail);
  }
}

/**
 * Delete a user record from Cloud RTDB & kick any active sessions
 */
export async function cloudDeleteUser(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const emailKey = encodeEmailKey(cleanEmail);
  await cloudKickSession(cleanEmail).catch(() => null);
  await remove(ref(database, `users/${emailKey}`));
  if (!DEFAULT_ADMIN_EMAILS.includes(cleanEmail)) {
    await remove(ref(database, `admin_emails/${emailKey}`)).catch(() => null);
  }
}

/**
 * Delete specific history record(s) permanently from Firebase RTDB
 */
export async function cloudDeleteHistoryItems(ids: string[]): Promise<void> {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const updates: Record<string, null> = {};
  ids.forEach((id) => {
    if (id) updates[`history/${id}`] = null;
  });
  await update(ref(database), updates);
}

/**
 * Clear ALL history records permanently from Firebase RTDB
 */
export async function cloudClearAllHistory(): Promise<void> {
  await remove(ref(database, 'history'));
}

/**
 * Toggle user block status in Cloud
 */
export async function cloudToggleBlock(
  email: string,
  newStatus: 'active' | 'blocked'
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const emailKey = encodeEmailKey(cleanEmail);

  await update(ref(database, `users/${emailKey}`), { status: newStatus });

  if (newStatus === 'blocked') {
    await cloudKickSession(cleanEmail);
  }
}

/**
 * Remotely kick a user's active sessions from Admin Panel
 */
export async function cloudKickSession(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const now = Date.now();

  const sessionsSnap = await get(ref(database, 'sessions'));
  if (sessionsSnap.exists()) {
    const allSessions = sessionsSnap.val() as Record<string, CloudSessionDoc>;
    for (const [sId, s] of Object.entries(allSessions)) {
      if (s && s.email && s.email.toLowerCase() === cleanEmail) {
        const histId = `hist_${s.registeredAt}_${sId.slice(-6)}`;
        await update(ref(database, `history/${histId}`), {
          logoutAt: now,
          durationMinutes: Math.max(1, Math.round((now - s.registeredAt) / 60000)),
          endReason: 'kicked',
        }).catch(() => null);

        await remove(ref(database, `sessions/${sId}`)).catch(() => null);
      }
    }
  }
}

/**
 * Remotely kick ALL active user sessions (optionally excluding current admin)
 */
export async function cloudKickAllSessions(excludeEmail?: string): Promise<number> {
  const now = Date.now();
  const exclude = (excludeEmail || '').trim().toLowerCase();
  const sessionsSnap = await get(ref(database, 'sessions'));
  if (!sessionsSnap.exists()) return 0;

  let kickedCount = 0;
  const allSessions = sessionsSnap.val() as Record<string, CloudSessionDoc>;
  for (const [sId, s] of Object.entries(allSessions)) {
    if (!s || !s.email) continue;
    if (exclude && s.email.toLowerCase() === exclude) continue;
    kickedCount++;
    const histId = `hist_${s.registeredAt}_${sId.slice(-6)}`;
    await update(ref(database, `history/${histId}`), {
      logoutAt: now,
      durationMinutes: Math.max(1, Math.round((now - s.registeredAt) / 60000)),
      endReason: 'kicked',
    }).catch(() => null);

    await remove(ref(database, `sessions/${sId}`)).catch(() => null);
  }
  return kickedCount;
}

/**
 * Real-time listener for current device's session AND live user block status.
 * If another device logs in, admin kicks this session, or admin blocks this user, triggers immediately.
 */
export function listenForSessionTermination(
  sessionId: string,
  onTerminated: (reason: 'session_removed' | 'user_blocked') => void,
  userEmail?: string
): Unsubscribe {
  const sessionRef = ref(database, `sessions/${sessionId}`);
  let hasEverExisted = false;

  const unsubSession = onValue(sessionRef, (snap) => {
    if (snap.exists()) {
      hasEverExisted = true;
    } else if (hasEverExisted) {
      onTerminated('session_removed');
    }
  });

  let unsubUser: Unsubscribe | null = null;
  if (userEmail) {
    const emailKey = encodeEmailKey(userEmail);
    unsubUser = onValue(ref(database, `users/${emailKey}/status`), (snap) => {
      if (snap.exists() && snap.val() === 'blocked') {
        onTerminated('user_blocked');
      }
    });
  }

  return () => {
    unsubSession();
    if (unsubUser) unsubUser();
  };
}
