import {
  AdminPanelData,
  AppUserRecord,
  UserSessionData,
  SessionHistoryItem,
} from '../types';
import { calculateAdminSummary, isEmailAdmin } from './adminUtils';

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

const STORAGE_KEYS = {
  ADMIN_EMAILS: 'voter_gh_admin_emails',
  USERS: 'voter_gh_users',
  SESSIONS: 'voter_gh_sessions',
  HISTORY: 'voter_gh_history',
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
    setStorageItem(STORAGE_KEYS.HISTORY, JSON.stringify(history.slice(0, 50)));
  } catch {}
}

// Generate client-side AdminPanelData when running on GitHub Pages / Static Hosting
export function buildClientAdminData(currentUserEmail: string): AdminPanelData {
  const adminEmails = loadStoredAdminEmails();
  const isAdmin = isEmailAdmin(currentUserEmail, adminEmails);
  const usersMap = loadStoredUsers();
  const sessionsMap = loadStoredSessions();
  const history = loadStoredHistory();

  const now = Date.now();
  const activeSessions = Object.values(sessionsMap);
  const onlineCount = activeSessions.filter((s) => now - s.lastActive < 45000).length;

  // Map users with online status and active duration
  const enrichedUsers: AppUserRecord[] = Object.values(usersMap).map((u) => {
    const active = activeSessions.find(
      (s) => s.email.toLowerCase() === u.email.toLowerCase()
    );
    const isOnline = Boolean(active && now - active.lastActive < 45000);
    const currentDuration = active
      ? Math.max(1, Math.round((now - active.registeredAt) / 60000))
      : 0;

    return {
      ...u,
      isOnline,
      currentSessionDuration: currentDuration,
      deviceName: active?.deviceName || undefined,
      lastActive: active?.lastActive || u.lastLoginAt,
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

  if (user && user.status === 'blocked') {
    return { success: false, isBlocked: true };
  }

  const now = Date.now();
  const sessions = loadStoredSessions();

  // Kick any prior sessions for this user to enforce single-device rule
  const history = loadStoredHistory();
  Object.entries(sessions).forEach(([oldSessId, s]) => {
    if (s.email.toLowerCase() === cleanEmail && oldSessId !== sessionId) {
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
      delete sessions[oldSessId];
    }
  });
  saveStoredHistory(history);

  // Register new session
  sessions[sessionId] = {
    sessionId,
    email: cleanEmail,
    deviceName,
    registeredAt: now,
    lastActive: now,
  };
  saveStoredSessions(sessions);

  // Update or insert user record
  if (user) {
    user.lastLoginAt = now;
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
    };
  }
  saveStoredUsers(users);

  return { success: true, isBlocked: false };
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

  // Add delta to user's cumulative minutes
  if (deltaSeconds > 0 && deltaSeconds < 300) {
    const users = loadStoredUsers();
    const cleanEmail = sess.email.toLowerCase();
    if (users[cleanEmail]) {
      const addedMinutes = deltaSeconds / 60;
      users[cleanEmail].totalMinutesSpent = Math.round(
        ((users[cleanEmail].totalMinutesSpent || 0) + addedMinutes) * 100
      ) / 100;
      saveStoredUsers(users);
    }
  }
}

// Client Add User
export function clientAddUser(data: {
  email: string;
  name?: string;
  role?: 'user' | 'admin';
}): AppUserRecord {
  const users = loadStoredUsers();
  const cleanEmail = data.email.trim().toLowerCase();
  const now = Date.now();

  const newUser: AppUserRecord = {
    email: cleanEmail,
    name: data.name?.trim() || cleanEmail.split('@')[0],
    role: data.role || 'user',
    status: 'active',
    createdAt: now,
    lastLoginAt: undefined,
    totalMinutesSpent: 0,
    lastPasswordChangedAt: null,
  };

  users[cleanEmail] = newUser;
  saveStoredUsers(users);
  return newUser;
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

  // If blocked, terminate active sessions
  if (newStatus === 'blocked') {
    const sessions = loadStoredSessions();
    const history = loadStoredHistory();
    const now = Date.now();

    Object.entries(sessions).forEach(([sId, s]) => {
      if (s.email.toLowerCase() === cleanEmail) {
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
        delete sessions[sId];
      }
    });

    saveStoredSessions(sessions);
    saveStoredHistory(history);
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
      delete sessions[sId];
    }
  });

  saveStoredSessions(sessions);
  saveStoredHistory(history);
}
