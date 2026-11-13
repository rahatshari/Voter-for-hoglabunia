import {
  AdminPanelData,
  AppGlobalConfig,
  AppUserRecord,
  UserSessionData,
  SessionHistoryItem,
} from '../types';
import { calculateAdminSummary, isEmailAdmin, mergeHistoryRecords } from './adminUtils';

export interface ClientSessionRecord {
  sessionId: string;
  email: string;
  deviceName?: string;
  registeredAt: number;
  lastActive: number;
}

const DEFAULT_ADMIN_EMAILS = [
  'rahatsharif10448@gmail.com',
  'rahatsharif504@gmail.com',
];

export const DEFAULT_APP_CONFIG: AppGlobalConfig = {
  maintenanceMode: false,
  maintenanceMessage: 'সিস্টেম রক্ষণাবেক্ষণের কাজ চলছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।',
  announcementEnabled: false,
  announcementText: '',
  enforceSingleDevice: true,
  allowSlipPrint: true,
};

const STORAGE_KEYS = {
  ADMIN_EMAILS: 'voter_gh_admin_emails',
  USERS: 'voter_gh_users',
  SESSIONS: 'voter_gh_sessions',
  HISTORY: 'voter_gh_history',
  APP_CONFIG: 'voter_gh_app_config',
  IS_STATIC_HOST: 'voter_is_static_host',
};

// Seed default users if empty
function getInitialUsers(): Record<string, AppUserRecord> {
  return {
    'rahatsharif10448@gmail.com': {
      email: 'rahatsharif10448@gmail.com',
      name: 'প্রধান অ্যাডমিন',
      role: 'admin',
      status: 'active',
      createdAt: Date.now() - 3600000 * 24,
      lastLoginAt: Date.now(),
      totalMinutesSpent: 45,
      lastPasswordChangedAt: null,
    },
    'rahatsharif504@gmail.com': {
      email: 'rahatsharif504@gmail.com',
      name: 'সহকারী অ্যাডমিন',
      role: 'admin',
      status: 'active',
      createdAt: Date.now() - 3600000 * 48,
      lastLoginAt: Date.now() - 3600000 * 2,
      totalMinutesSpent: 120,
      lastPasswordChangedAt: null,
    },
  };
}

const memoryStore: Record<string, string> = {};

function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

function setStorageItem(key: string, val: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, val);
    }
  } catch {}
  memoryStore[key] = val;
}

export function loadStoredAdminEmails(): string[] {
  try {
    const raw = getStorageItem(STORAGE_KEYS.ADMIN_EMAILS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_ADMIN_EMAILS;
}

export function saveStoredAdminEmails(emails: string[]): void {
  try {
    setStorageItem(STORAGE_KEYS.ADMIN_EMAILS, JSON.stringify(emails));
  } catch {}
}

export function loadStoredAppConfig(): AppGlobalConfig {
  try {
    const raw = getStorageItem(STORAGE_KEYS.APP_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_APP_CONFIG, ...parsed };
      }
    }
  } catch {}
  return { ...DEFAULT_APP_CONFIG };
}

export function saveStoredAppConfig(cfg: AppGlobalConfig): void {
  try {
    setStorageItem(STORAGE_KEYS.APP_CONFIG, JSON.stringify({ ...DEFAULT_APP_CONFIG, ...cfg }));
  } catch {}
}

export function loadStoredUsers(): Record<string, AppUserRecord> {
  try {
    const raw = getStorageItem(STORAGE_KEYS.USERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0) {
        return parsed;
      }
    }
  } catch {}
  return getInitialUsers();
}

export function saveStoredUsers(users: Record<string, AppUserRecord>): void {
  try {
    setStorageItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  } catch {}
}

export function loadStoredSessions(): Record<string, ClientSessionRecord> {
  try {
    const raw = getStorageItem(STORAGE_KEYS.SESSIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    }
  } catch {}
  return {};
}

export function saveStoredSessions(sessions: Record<string, ClientSessionRecord>): void {
  try {
    setStorageItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  } catch {}
}

export function loadStoredHistory(): SessionHistoryItem[] {
  try {
    const raw = getStorageItem(STORAGE_KEYS.HISTORY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveStoredHistory(history: SessionHistoryItem[]): void {
  try {
    // Preserve up to 5000 items so historical records are never truncated arbitrarily
    const clean = mergeHistoryRecords(history).slice(0, 5000);
    setStorageItem(STORAGE_KEYS.HISTORY, JSON.stringify(clean));
  } catch {}
}

export function replaceStoredHistoryExact(history: SessionHistoryItem[]): void {
  try {
    setStorageItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  } catch {}
}

// Generate client-side AdminPanelData when running on GitHub Pages / Static Hosting
export function buildClientAdminData(currentUserEmail: string): AdminPanelData {
  const adminEmails = loadStoredAdminEmails();
  const isAdmin = isEmailAdmin(currentUserEmail, adminEmails);
  const usersMap = loadStoredUsers();
  const sessionsMap = loadStoredSessions();
  const history = loadStoredHistory();
  const appConfig = loadStoredAppConfig();

  const now = Date.now();
  const activeSessions = Object.values(sessionsMap);
  const onlineCount = activeSessions.filter((s) => now - s.lastActive < 45000).length;

  // Map users with online status and active duration
  const enrichedUsers: AppUserRecord[] = Object.values(usersMap).map((u) => {
    const userSessions = activeSessions.filter(
      (s) => s.email.toLowerCase() === u.email.toLowerCase()
    );
    const active = userSessions.sort((a, b) => b.lastActive - a.lastActive)[0];
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
      lastActive: active?.lastActive || u.lastLoginAt || undefined,
    };
  });

  const summary = calculateAdminSummary(enrichedUsers, onlineCount);

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
    history,
    summary,
    appConfig,
    dataSource: 'local',
    cloudConnected: false,
    lastSyncedAt: now,
  };
}

// Register session on client
export function clientRegisterSession(
  email: string,
  sessionId: string,
  deviceName: string
): { success: boolean; isBlocked: boolean } {
  const users = loadStoredUsers();
  const cleanEmail = email.trim().toLowerCase();
  const user = users[cleanEmail];
  const cfg = loadStoredAppConfig();

  if (user && user.status === 'blocked') {
    return { success: false, isBlocked: true };
  }

  const now = Date.now();
  const sessions = loadStoredSessions();
  const history = loadStoredHistory();

  if (cfg.enforceSingleDevice !== false) {
    Object.entries(sessions).forEach(([oldSessId, s]) => {
      if (s.email.toLowerCase() === cleanEmail && oldSessId !== sessionId) {
        const idx = history.findIndex((h) => h.sessionId === oldSessId && h.endReason === 'active');
        if (idx >= 0) {
          history[idx] = {
            ...history[idx],
            logoutAt: now,
            durationMinutes: Math.max(1, Math.round((now - s.registeredAt) / 60000)),
            endReason: 'another_device',
          };
        } else {
          history.unshift({
            id: 'hist_' + now + '_' + Math.random().toString(36).substring(2, 7),
            email: s.email,
            sessionId: oldSessId,
            deviceName: s.deviceName,
            loginAt: s.registeredAt,
            logoutAt: now,
            durationMinutes: Math.max(1, Math.round((now - s.registeredAt) / 60000)),
            endReason: 'another_device',
          });
        }
        delete sessions[oldSessId];
      }
    });
  }

  // Record active entry if missing
  if (!sessions[sessionId]) {
    const existingActive = history.find((h) => h.sessionId === sessionId);
    if (!existingActive) {
      history.unshift({
        id: `hist_${now}_${sessionId.slice(-6)}`,
        email: cleanEmail,
        sessionId,
        deviceName,
        loginAt: now,
        durationMinutes: 1,
        endReason: 'active',
      });
    }
  }
  saveStoredHistory(history);

  sessions[sessionId] = {
    sessionId,
    email: cleanEmail,
    deviceName,
    registeredAt: sessions[sessionId]?.registeredAt || now,
    lastActive: now,
  };
  saveStoredSessions(sessions);

  if (user) {
    user.lastLoginAt = now;
    user.deviceName = deviceName;
    user.lastActive = now;
    users[cleanEmail] = user;
  } else {
    users[cleanEmail] = {
      email: cleanEmail,
      name: cleanEmail.split('@')[0],
      role: isEmailAdmin(cleanEmail, loadStoredAdminEmails()) ? 'admin' : 'user',
      status: 'active',
      createdAt: now,
      lastLoginAt: now,
      totalMinutesSpent: 0,
      lastPasswordChangedAt: null,
      deviceName,
      lastActive: now,
    };
  }
  saveStoredUsers(users);

  return { success: true, isBlocked: false };
}

// Client End Session (on manual logout)
export function clientEndSession(
  sessionId: string,
  email: string,
  reason: 'logout' | 'kicked' | 'another_device' = 'logout'
): void {
  const sessions = loadStoredSessions();
  const cleanEmail = email.trim().toLowerCase();
  const sess = sessions[sessionId];
  const now = Date.now();

  if (sess) {
    const duration = Math.max(1, Math.round((now - sess.registeredAt) / 60000));
    const history = loadStoredHistory();
    const idx = history.findIndex((h) => h.sessionId === sessionId);
    if (idx >= 0) {
      history[idx] = {
        ...history[idx],
        logoutAt: now,
        durationMinutes: duration,
        endReason: reason,
      };
    } else {
      history.unshift({
        id: 'hist_' + now + '_' + Math.random().toString(36).substring(2, 7),
        email: cleanEmail,
        sessionId,
        deviceName: sess.deviceName,
        loginAt: sess.registeredAt,
        logoutAt: now,
        durationMinutes: duration,
        endReason: reason,
      });
    }
    saveStoredHistory(history);
    delete sessions[sessionId];
    saveStoredSessions(sessions);
  }
}

// Client Heartbeat: updates lastActive and increments cumulative minutes
export function clientHeartbeat(sessionId: string): void {
  const sessions = loadStoredSessions();
  const sess = sessions[sessionId];
  if (!sess) return;

  const now = Date.now();
  const deltaSeconds = Math.max(0, (now - sess.lastActive) / 1000);
  sess.lastActive = now;
  sessions[sessionId] = sess;
  saveStoredSessions(sessions);

  if (deltaSeconds > 0 && deltaSeconds < 300) {
    const users = loadStoredUsers();
    const cleanEmail = sess.email.toLowerCase();
    if (users[cleanEmail]) {
      const addedMinutes = deltaSeconds / 60;
      users[cleanEmail].totalMinutesSpent =
        Math.round(((users[cleanEmail].totalMinutesSpent || 0) + addedMinutes) * 100) / 100;
      users[cleanEmail].lastActive = now;
      saveStoredUsers(users);
    }
  }
}

// Client Add User
export function clientAddUser(data: {
  email: string;
  name?: string;
  phone?: string;
  notes?: string;
  role?: 'user' | 'admin';
}): AppUserRecord {
  const users = loadStoredUsers();
  const cleanEmail = data.email.trim().toLowerCase();
  const now = Date.now();
  const existing = users[cleanEmail];

  const newUser: AppUserRecord = {
    email: cleanEmail,
    name: data.name?.trim() || existing?.name || cleanEmail.split('@')[0],
    phone: data.phone?.trim() ?? existing?.phone,
    notes: data.notes?.trim() ?? existing?.notes,
    role: data.role || existing?.role || 'user',
    status: existing?.status || 'active',
    createdAt: existing?.createdAt || now,
    lastLoginAt: existing?.lastLoginAt,
    totalMinutesSpent: existing?.totalMinutesSpent || 0,
    lastPasswordChangedAt: existing?.lastPasswordChangedAt || null,
  };

  users[cleanEmail] = newUser;
  saveStoredUsers(users);

  if (data.role === 'admin') {
    const adminEmails = loadStoredAdminEmails();
    if (!adminEmails.includes(cleanEmail)) {
      adminEmails.push(cleanEmail);
      saveStoredAdminEmails(adminEmails);
    }
  }

  return newUser;
}

// Client Update User profile / role / totalMinutes
export function clientUpdateUser(
  email: string,
  updates: Partial<Pick<AppUserRecord, 'name' | 'phone' | 'notes' | 'role' | 'status' | 'totalMinutesSpent'>>
): AppUserRecord | null {
  const users = loadStoredUsers();
  const cleanEmail = email.trim().toLowerCase();
  const existing = users[cleanEmail];
  if (!existing) return null;

  const updated: AppUserRecord = {
    ...existing,
    ...updates,
    email: cleanEmail,
  };
  users[cleanEmail] = updated;
  saveStoredUsers(users);

  if (updates.role === 'admin') {
    const admins = loadStoredAdminEmails();
    if (!admins.includes(cleanEmail)) {
      saveStoredAdminEmails([...admins, cleanEmail]);
    }
  } else if (updates.role === 'user') {
    const admins = loadStoredAdminEmails().filter((a) => a.toLowerCase() !== cleanEmail);
    if (admins.length > 0) saveStoredAdminEmails(admins);
  }

  return updated;
}

// Client Delete User
export function clientDeleteUser(email: string): void {
  const cleanEmail = email.trim().toLowerCase();
  const users = loadStoredUsers();
  delete users[cleanEmail];
  saveStoredUsers(users);

  const sessions = loadStoredSessions();
  Object.entries(sessions).forEach(([sId, s]) => {
    if (s.email.toLowerCase() === cleanEmail) delete sessions[sId];
  });
  saveStoredSessions(sessions);
}

// Client Delete single history entry or filtered entries
export function clientDeleteHistoryItems(ids: string[]): void {
  const idSet = new Set(ids);
  const history = loadStoredHistory().filter((h) => !idSet.has(h.id));
  replaceStoredHistoryExact(history);
}

// Client Toggle Block
export function clientToggleBlock(
  email: string,
  newStatus: 'active' | 'blocked'
): void {
  const users = loadStoredUsers();
  const cleanEmail = email.trim().toLowerCase();
  if (users[cleanEmail]) {
    users[cleanEmail].status = newStatus;
    saveStoredUsers(users);
  }

  if (newStatus === 'blocked') {
    clientKickSession(cleanEmail);
  }
}

// Client Kick Session
export function clientKickSession(email: string): void {
  const cleanEmail = email.trim().toLowerCase();
  const sessions = loadStoredSessions();
  const history = loadStoredHistory();
  const now = Date.now();

  Object.entries(sessions).forEach(([sId, s]) => {
    if (s.email.toLowerCase() === cleanEmail) {
      const idx = history.findIndex((h) => h.sessionId === sId);
      if (idx >= 0) {
        history[idx] = {
          ...history[idx],
          logoutAt: now,
          durationMinutes: Math.max(1, Math.round((now - s.registeredAt) / 60000)),
          endReason: 'kicked',
        };
      } else {
        history.unshift({
          id: 'hist_' + now + '_' + Math.random().toString(36).substring(2, 7),
          email: s.email,
          sessionId: sId,
          deviceName: s.deviceName,
          loginAt: s.registeredAt,
          logoutAt: now,
          durationMinutes: Math.max(1, Math.round((now - s.registeredAt) / 60000)),
          endReason: 'kicked',
        });
      }
      delete sessions[sId];
    }
  });

  saveStoredSessions(sessions);
  saveStoredHistory(history);
}

export function clientKickAllSessions(excludeEmail?: string): number {
  const sessions = loadStoredSessions();
  const history = loadStoredHistory();
  const now = Date.now();
  const exclude = (excludeEmail || '').trim().toLowerCase();
  let kicked = 0;

  Object.entries(sessions).forEach(([sId, s]) => {
    if (exclude && s.email.toLowerCase() === exclude) return;
    kicked++;
    const idx = history.findIndex((h) => h.sessionId === sId);
    if (idx >= 0) {
      history[idx] = {
        ...history[idx],
        logoutAt: now,
        durationMinutes: Math.max(1, Math.round((now - s.registeredAt) / 60000)),
        endReason: 'kicked',
      };
    } else {
      history.unshift({
        id: 'hist_' + now + '_' + Math.random().toString(36).substring(2, 7),
        email: s.email,
        sessionId: sId,
        deviceName: s.deviceName,
        loginAt: s.registeredAt,
        logoutAt: now,
        durationMinutes: Math.max(1, Math.round((now - s.registeredAt) / 60000)),
        endReason: 'kicked',
      });
    }
    delete sessions[sId];
  });

  saveStoredSessions(sessions);
  saveStoredHistory(history);
  return kicked;
}
