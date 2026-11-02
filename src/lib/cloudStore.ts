import {
  ref,
  get,
  set,
  update,
  remove,
  onValue,
  Unsubscribe,
} from 'firebase/database';
import { database } from './firebase';
import {
  AdminPanelData,
  AppUserRecord,
  SessionHistoryItem,
} from '../types';
import { calculateAdminSummary, isEmailAdmin } from './adminUtils';
import {
  loadStoredAdminEmails,
  loadStoredHistory,
  loadStoredSessions,
  loadStoredUsers,
  saveStoredAdminEmails,
  saveStoredHistory,
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
 * Fetch all authorized admin emails from Firebase Realtime Database
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
          setAdmins.add(decodeEmailKey(k));
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
    new Set([...DEFAULT_ADMIN_EMAILS, ...emails].map((e) => e.trim().toLowerCase()))
  );
  saveStoredAdminEmails(cleanList);

  try {
    const payload: Record<string, boolean> = {};
    cleanList.forEach((email) => {
      payload[encodeEmailKey(email)] = true;
    });
    await set(ref(database, 'admin_emails'), payload);
  } catch (err) {
    console.warn('Could not save cloud admin emails:', err);
  }
}

/**
 * Register a user's session in the Cloud (Firebase Realtime Database)
 * 1. Closes any previous session for the same user on another device (Single device per Gmail policy).
 * 2. Writes an append-only, immutable history record in `history/{histId}`.
 * 3. Registers `sessions/{sessionId}`.
 * 4. Updates or creates `users/{sanitizedEmail}`.
 */
export async function cloudRegisterSession(
  email: string,
  sessionId: string,
  deviceName: string
): Promise<{ success: boolean; isBlocked: boolean }> {
  const cleanEmail = email.trim().toLowerCase();
  const emailKey = encodeEmailKey(cleanEmail);
  const now = Date.now();

  try {
    // 1. Check if user is blocked in Cloud
    const userRef = ref(database, `users/${emailKey}`);
    const userSnap = await get(userRef);
    let existingUserData: any = userSnap.exists() ? userSnap.val() : null;

    if (existingUserData && existingUserData.status === 'blocked') {
      return { success: false, isBlocked: true };
    }

    // 2. Query all existing active sessions to terminate any previous session for this email
    const sessionsRef = ref(database, 'sessions');
    const sessionsSnap = await get(sessionsRef);
    if (sessionsSnap.exists()) {
      const allSessions = sessionsSnap.val() as Record<string, CloudSessionDoc>;
      for (const [oldSid, s] of Object.entries(allSessions)) {
        if (s.email && s.email.toLowerCase() === cleanEmail && oldSid !== sessionId) {
          // Record session termination in History
          const duration = Math.max(1, Math.round((now - s.registeredAt) / 60000));
          const histId = `hist_${s.registeredAt}_${oldSid.slice(-6)}`;
          await update(ref(database, `history/${histId}`), {
            logoutAt: now,
            durationMinutes: duration,
            endReason: 'another_device',
          }).catch(() => null);

          // Remove old active session
          await remove(ref(database, `sessions/${oldSid}`)).catch(() => null);
        }
      }
    }

    // 3. Register current active session
    const currentSessionData: CloudSessionDoc = {
      sessionId,
      email: cleanEmail,
      deviceName,
      registeredAt: now,
      lastActive: now,
    };
    await set(ref(database, `sessions/${sessionId}`), currentSessionData);

    // 4. Create an immutable append-only history record
    const historyId = `hist_${now}_${sessionId.slice(-6)}`;
    const historyRecord: CloudHistoryDoc = {
      id: historyId,
      email: cleanEmail,
      sessionId,
      deviceName,
      loginAt: now,
      logoutAt: null,
      durationMinutes: 1,
      endReason: 'active',
      timestamp: now,
    };
    await set(ref(database, `history/${historyId}`), historyRecord);

    // 5. Update user record in Cloud
    const admins = await getCloudAdminEmails();
    const isAdmin = isEmailAdmin(cleanEmail, admins);

    const updatedUser: AppUserRecord = {
      email: cleanEmail,
      name: existingUserData?.name || cleanEmail.split('@')[0],
      role: isAdmin ? 'admin' : (existingUserData?.role || 'user'),
      status: 'active',
      createdAt: existingUserData?.createdAt || now,
      lastLoginAt: now,
      totalMinutesSpent: existingUserData?.totalMinutesSpent || 0,
      lastPasswordChangedAt: existingUserData?.lastPasswordChangedAt || null,
      deviceName,
      lastActive: now,
    };
    await set(userRef, updatedUser);

    return { success: true, isBlocked: false };
  } catch (err) {
    console.warn('Cloud session register error, falling back to local:', err);
    // Fallback to local storage
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
 * Cloud Heartbeat:
 * Keeps session active, tracks cumulative user minutes in Cloud
 */
export async function cloudHeartbeat(sessionId: string, email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const emailKey = encodeEmailKey(cleanEmail);
  const now = Date.now();

  try {
    const sessionRef = ref(database, `sessions/${sessionId}`);
    const snap = await get(sessionRef);
    if (!snap.exists()) {
      return;
    }
    const sess = snap.val() as CloudSessionDoc;
    const deltaSeconds = Math.max(0, (now - sess.lastActive) / 1000);
    const totalSessionDuration = Math.max(1, Math.round((now - sess.registeredAt) / 60000));

    // Update session
    await update(sessionRef, { lastActive: now });

    // Update active history entry duration
    const historyId = `hist_${sess.registeredAt}_${sessionId.slice(-6)}`;
    await update(ref(database, `history/${historyId}`), {
      durationMinutes: totalSessionDuration,
      lastActive: now,
    }).catch(() => null);

    // Increment user cumulative minutes
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
  } catch (err) {
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
  try {
    const sessionRef = ref(database, `sessions/${sessionId}`);
    const snap = await get(sessionRef);
    if (snap.exists()) {
      const sess = snap.val() as CloudSessionDoc;
      const duration = Math.max(1, Math.round((now - sess.registeredAt) / 60000));
      const histId = `hist_${sess.registeredAt}_${sessionId.slice(-6)}`;

      await update(ref(database, `history/${histId}`), {
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
 * Fetch complete shared admin data from Firebase Realtime Database
 * All admins on any device see the exact same real-time cloud data.
 */
export async function fetchCloudAdminData(currentUserEmail: string): Promise<AdminPanelData> {
  const cleanEmail = currentUserEmail.trim().toLowerCase();
  const now = Date.now();

  try {
    // 1. Fetch admin emails
    const adminEmails = await getCloudAdminEmails();
    const isAdmin = isEmailAdmin(cleanEmail, adminEmails);

    // 2. Fetch users
    const usersSnap = await get(ref(database, 'users'));
    const cloudUsersMap: Record<string, AppUserRecord> = {};
    if (usersSnap.exists()) {
      const rawUsers = usersSnap.val();
      Object.entries(rawUsers).forEach(([key, val]: [string, any]) => {
        const email = val.email || decodeEmailKey(key);
        cloudUsersMap[email.toLowerCase()] = {
          ...val,
          email,
        };
      });
    }

    // Ensure default admins exist in user list
    DEFAULT_ADMIN_EMAILS.forEach((adm) => {
      const lower = adm.toLowerCase();
      if (!cloudUsersMap[lower]) {
        cloudUsersMap[lower] = {
          email: lower,
          name: lower.includes('10448') ? 'সুপার অ্যাডমিন' : 'সহকারী অ্যাডমিন',
          role: 'admin',
          status: 'active',
          createdAt: now - 3600000 * 48,
          lastLoginAt: now - 3600000,
          totalMinutesSpent: 60,
          lastPasswordChangedAt: null,
        };
      }
    });

    // 3. Fetch active sessions
    const sessionsSnap = await get(ref(database, 'sessions'));
    const activeSessions: CloudSessionDoc[] = [];
    if (sessionsSnap.exists()) {
      const rawSessions = sessionsSnap.val() as Record<string, CloudSessionDoc>;
      Object.values(rawSessions).forEach((s) => {
        activeSessions.push(s);
      });
    }

    // 4. Fetch history (IMMUTABLE, ALL HISTORICAL RECORDS)
    const historySnap = await get(ref(database, 'history'));
    const historyList: SessionHistoryItem[] = [];
    if (historySnap.exists()) {
      const rawHistory = historySnap.val() as Record<string, CloudHistoryDoc>;
      Object.values(rawHistory).forEach((h) => {
        historyList.push({
          id: h.id,
          email: h.email,
          sessionId: h.sessionId,
          deviceName: h.deviceName,
          loginAt: h.loginAt,
          logoutAt: h.logoutAt || undefined,
          durationMinutes: h.durationMinutes || 1,
          endReason: h.endReason,
        });
      });
    }

    // Sort history by loginAt descending (newest first)
    historyList.sort((a, b) => b.loginAt - a.loginAt);

    // Calculate online count (sessions updated within last 45 seconds)
    const onlineCount = activeSessions.filter((s) => now - s.lastActive < 45000).length;

    // Enrich users with active status
    const enrichedUsers: AppUserRecord[] = Object.values(cloudUsersMap).map((u) => {
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
        deviceName: active?.deviceName || u.deviceName || undefined,
        lastActive: active?.lastActive || u.lastActive || u.lastLoginAt,
      };
    });

    // Save local cache for offline resilience
    saveStoredUsers(cloudUsersMap);
    saveStoredHistory(historyList);

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
      history: historyList,
      summary,
    };
  } catch (err) {
    console.error('fetchCloudAdminData error:', err);
    throw err;
  }
}

/**
 * Add a new user in Cloud Database
 */
export async function cloudAddUser(data: {
  email: string;
  name?: string;
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
    role: data.role || existing?.role || 'user',
    status: 'active',
    createdAt: existing?.createdAt || now,
    lastLoginAt: existing?.lastLoginAt || null,
    totalMinutesSpent: existing?.totalMinutesSpent || 0,
    lastPasswordChangedAt: existing?.lastPasswordChangedAt || null,
  };

  await set(userRef, newUser);

  // If role is admin, ensure added to admin_emails in Cloud
  if (data.role === 'admin') {
    await set(ref(database, `admin_emails/${emailKey}`), true);
  }

  return newUser;
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
  const now = Date.now();

  await update(ref(database, `users/${emailKey}`), { status: newStatus });

  // If blocked, terminate any active sessions
  if (newStatus === 'blocked') {
    const sessionsSnap = await get(ref(database, 'sessions'));
    if (sessionsSnap.exists()) {
      const allSessions = sessionsSnap.val() as Record<string, CloudSessionDoc>;
      for (const [sId, s] of Object.entries(allSessions)) {
        if (s.email && s.email.toLowerCase() === cleanEmail) {
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
}

/**
 * Remotely kick a user session from Admin Panel
 */
export async function cloudKickSession(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const now = Date.now();

  const sessionsSnap = await get(ref(database, 'sessions'));
  if (sessionsSnap.exists()) {
    const allSessions = sessionsSnap.val() as Record<string, CloudSessionDoc>;
    for (const [sId, s] of Object.entries(allSessions)) {
      if (s.email && s.email.toLowerCase() === cleanEmail) {
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
 * Real-time listener for current device's session.
 * If another device logs in or admin kicks this session, triggers callback.
 */
export function listenForSessionTermination(
  sessionId: string,
  onTerminated: (reason: string) => void
): Unsubscribe {
  const sessionRef = ref(database, `sessions/${sessionId}`);
  return onValue(sessionRef, (snap) => {
    // If the session was deleted from Cloud, check history to find why
    if (!snap.exists()) {
      onTerminated('session_removed');
    }
  });
}
