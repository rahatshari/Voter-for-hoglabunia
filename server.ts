import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const portArgIndex = process.argv.indexOf('--port');
const portFromArg = portArgIndex !== -1 ? Number(process.argv[portArgIndex + 1]) : null;
// Container port 8080 is reserved for NGINX; always ensure app runs on port 3000
const PORT = portFromArg || (process.env.PORT && process.env.PORT !== '8080' ? Number(process.env.PORT) : 3000);

const hostArgIndex = process.argv.indexOf('--host');
const HOST = hostArgIndex !== -1 ? process.argv[hostArgIndex + 1] : '0.0.0.0';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Active Device Session & History Store
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const ADMIN_CONFIG_FILE = path.join(__dirname, 'admin_config.json');
const USERS_FILE = path.join(__dirname, 'users.json');

interface SessionRecord {
  sessionId: string;
  email: string;
  deviceName?: string;
  registeredAt: number;
  lastActive: number;
}

interface SessionHistoryItem {
  id: string;
  email: string;
  sessionId: string;
  deviceName?: string;
  loginAt: number;
  logoutAt?: number;
  durationMinutes: number;
  endReason: 'logout' | 'another_device' | 'kicked' | 'active';
}

interface AppUserStoredRecord {
  email: string;
  name?: string;
  phone?: string;
  notes?: string;
  role: 'admin' | 'user';
  status: 'active' | 'blocked';
  createdAt: number;
  lastLoginAt?: number;
  totalMinutesSpent: number;
  lastPasswordChangedAt?: number | null;
}

interface AppGlobalConfigRecord {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  announcementEnabled: boolean;
  announcementText: string;
  enforceSingleDevice: boolean;
  allowSlipPrint: boolean;
  updatedAt?: number;
  updatedBy?: string;
}

let activeSessions: Record<string, SessionRecord> = {};
let sessionHistory: SessionHistoryItem[] = [];
let adminEmails: string[] = ['rahatsharif10448@gmail.com', 'rahatsharif504@gmail.com'];
let appUsers: Record<string, AppUserStoredRecord> = {};
let appConfig: AppGlobalConfigRecord = {
  maintenanceMode: false,
  maintenanceMessage: 'সিস্টেম রক্ষণাবেক্ষণের কাজ চলছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।',
  announcementEnabled: false,
  announcementText: '',
  enforceSingleDevice: true,
  allowSlipPrint: true,
};

function loadAdminConfig() {
  try {
    if (fs.existsSync(ADMIN_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(ADMIN_CONFIG_FILE, 'utf8'));
      if (Array.isArray(data?.adminEmails) && data.adminEmails.length > 0) {
        adminEmails = data.adminEmails.map((e: string) => String(e).trim().toLowerCase()).filter(Boolean);
      }
      if (data?.appConfig && typeof data.appConfig === 'object') {
        appConfig = { ...appConfig, ...data.appConfig };
      }
    }
  } catch (e: any) {
    console.error('Error loading admin config:', e.message);
  }
}

function saveAdminConfig() {
  try {
    fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify({ adminEmails, appConfig }, null, 2), 'utf8');
  } catch (e: any) {
    console.error('Error saving admin config:', e.message);
  }
}

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (data && typeof data === 'object') {
        appUsers = data;
      }
    }
  } catch (e: any) {
    console.error('Error loading users:', e.message);
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(appUsers, null, 2), 'utf8');
  } catch (e: any) {
    console.error('Error saving users:', e.message);
  }
}

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      if (data && typeof data === 'object') {
        if ('activeSessions' in data) {
          activeSessions = data.activeSessions || {};
          sessionHistory = Array.isArray(data.sessionHistory) ? data.sessionHistory : [];
        } else {
          // Legacy format
          activeSessions = data;
          sessionHistory = [];
        }
      }
    }
  } catch (e: any) {
    console.error('Error loading sessions:', e.message);
    activeSessions = {};
    sessionHistory = [];
  }
}

function saveSessions() {
  try {
    fs.writeFileSync(
      SESSIONS_FILE,
      JSON.stringify({ activeSessions, sessionHistory }, null, 2),
      'utf8'
    );
  } catch (e: any) {
    console.error('Error saving sessions:', e.message);
  }
}

loadAdminConfig();
loadUsers();
loadSessions();

// Function to scan and load villages from single JSON files or folders
function loadVillagesData() {
  const villagesData: Record<string, any[]> = {};
  const processedVillages = new Set<string>();

  function processSingleVillageFile(filePath: string) {
    if (!fs.existsSync(filePath) || !filePath.endsWith('.json')) return;
    const baseName = path.basename(filePath);
    if (
      baseName === 'villages.json' ||
      baseName === 'sessions.json' ||
      baseName === 'package.json' ||
      baseName === 'metadata.json' ||
      baseName === 'manifest.json' ||
      baseName === 'tsconfig.json' ||
      baseName.startsWith('.')
    ) {
      return;
    }

    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      let villageName = '';
      let voters: any[] = [];

      if (Array.isArray(content) && content.length > 0 && typeof content[0] === 'object' && content[0] !== null) {
        voters = content;
        villageName = voters[0]?.villageName || path.basename(filePath, '.json');
      } else if (content && typeof content === 'object') {
        villageName = content.villageName || content.name || path.basename(filePath, '.json');
        if (Array.isArray(content.voters)) {
          voters = content.voters;
        } else if (Array.isArray(content.data)) {
          voters = content.data;
        }
      }

      if (voters.length > 0 && villageName) {
        if (villageName === 'pathamara') villageName = 'পাঠামারা';
        if (villageName === 'cotobadura') villageName = 'ছোট বাদুরা';

        const standardized = voters.map((v) => ({
          ...v,
          gender: v.gender || 'পুরুষ',
          villageName: v.villageName || villageName,
        }));

        villagesData[villageName] = standardized;
        processedVillages.add(villageName);
      }
    } catch (e: any) {
      console.error(`Error reading village JSON file ${filePath}:`, e.message);
    }
  }

  function scanFolder(dirPath: string, defaultName: string) {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return;

    let villageName = defaultName;
    const infoFiles = ['info.json', 'village.json', 'গ্রাম.json'];
    for (const infoFile of infoFiles) {
      const p = path.join(dirPath, infoFile);
      if (fs.existsSync(p)) {
        try {
          const info = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (info.name) {
            villageName = info.name;
            break;
          }
        } catch (e) {}
      }
    }

    if (!villageName) villageName = path.basename(dirPath);
    if (processedVillages.has(villageName)) return;

    let maleList: any[] = [];
    const maleFileNames = ['male.json', 'purush.json', 'পুরুষ.json', 'males.json', 'men.json'];
    for (const mf of maleFileNames) {
      const p = path.join(dirPath, mf);
      if (fs.existsSync(p)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (Array.isArray(parsed)) {
            maleList = parsed.map((v) => ({
              ...v,
              gender: v.gender || 'পুরুষ',
              villageName,
            }));
            break;
          }
        } catch (e: any) {
          console.error(`Error reading ${p}:`, e.message);
        }
      }
    }

    let femaleList: any[] = [];
    const femaleFileNames = ['female.json', 'nari.json', 'মহিলা.json', 'females.json', 'women.json'];
    for (const ff of femaleFileNames) {
      const p = path.join(dirPath, ff);
      if (fs.existsSync(p)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (Array.isArray(parsed)) {
            femaleList = parsed.map((v) => ({
              ...v,
              gender: v.gender || 'মহিলা',
              villageName,
            }));
            break;
          }
        } catch (e: any) {
          console.error(`Error reading ${p}:`, e.message);
        }
      }
    }

    if (maleList.length > 0 || femaleList.length > 0) {
      villagesData[villageName] = [...maleList, ...femaleList];
      processedVillages.add(villageName);
    }
  }

  // 1. Scan single JSON files in /villages directory first (Primary)
  const villagesDir = path.join(__dirname, 'villages');
  if (fs.existsSync(villagesDir)) {
    const entries = fs.readdirSync(villagesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
        processSingleVillageFile(path.join(villagesDir, entry.name));
      } else if (entry.isDirectory() && !entry.name.startsWith('_')) {
        scanFolder(path.join(villagesDir, entry.name), entry.name);
      }
    }
  }

  // 2. Scan root single JSON files or folders as fallback
  const ignoredRoot = new Set(['node_modules', '.git', 'villages', 'public', 'dist', 'build', 'src', '.aistudio']);
  const rootEntries = fs.readdirSync(__dirname, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('.')) {
      processSingleVillageFile(path.join(__dirname, entry.name));
    } else if (entry.isDirectory() && !ignoredRoot.has(entry.name) && !entry.name.startsWith('.')) {
      scanFolder(path.join(__dirname, entry.name), entry.name);
    }
  }

  return villagesData;
}

// API endpoint to get all voter data loaded from JSON files
app.get('/api/villages-data', (_req: Request, res: Response) => {
  try {
    const data = loadVillagesData();
    res.json(data);
  } catch (err) {
    console.error('Error fetching villages data:', err);
    res.status(500).json({ error: 'Failed to load villages data' });
  }
});

// API endpoint to get summary list of villages
app.get('/api/villages', (_req: Request, res: Response) => {
  try {
    const data = loadVillagesData();
    const summary = Object.keys(data).map((village) => {
      const voters = data[village];
      const males = voters.filter((v) => v.gender === 'পুরুষ').length;
      const females = voters.filter((v) => v.gender === 'মহিলা').length;
      return {
        name: village,
        total: voters.length,
        males,
        females,
      };
    });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load villages summary' });
  }
});

// Helper: check if email has admin access
function checkIsAdmin(email?: string | null): boolean {
  if (!email) return false;
  const clean = String(email).trim().toLowerCase();
  return adminEmails.includes(clean);
}

// Check user status before login
app.get('/api/auth/check-status', (req: Request, res: Response) => {
  const email = (req.query.email as string || '').trim().toLowerCase();
  if (!email) {
    return res.json({ isBlocked: false, isAdmin: false });
  }
  const user = appUsers[email];
  res.json({
    isBlocked: user ? user.status === 'blocked' : false,
    isAdmin: checkIsAdmin(email),
  });
});

// Single Active Device Session API
// 1. Register or takeover active session for an email
app.post('/api/session/register', (req: Request, res: Response) => {
  const { email, sessionId, deviceName } = req.body || {};
  if (!email || !sessionId) {
    return res.status(400).json({ error: 'Email and sessionId are required' });
  }
  const cleanEmail = String(email).trim().toLowerCase();

  // Check if user is blocked
  const user = appUsers[cleanEmail];
  if (user && user.status === 'blocked') {
    return res.status(403).json({
      error: 'blocked',
      message: 'আপনার অ্যাকাউন্টটি অ্যাডমিন কর্তৃক সাময়িকভাবে ব্লক করা হয়েছে। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।',
    });
  }

  // Ensure user is registered in appUsers
  if (!user) {
    appUsers[cleanEmail] = {
      email: cleanEmail,
      name: cleanEmail.split('@')[0],
      role: checkIsAdmin(cleanEmail) ? 'admin' : 'user',
      status: 'active',
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
      totalMinutesSpent: 0,
      lastPasswordChangedAt: null,
    };
    saveUsers();
  } else {
    user.lastLoginAt = Date.now();
    saveUsers();
  }

  const existing = activeSessions[cleanEmail];

  // If another session was active, record previous session into history
  if (existing && existing.sessionId !== String(sessionId)) {
    const duration = Math.max(1, Math.round((Date.now() - existing.registeredAt) / 60000));
    sessionHistory.unshift({
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      email: cleanEmail,
      sessionId: existing.sessionId,
      deviceName: existing.deviceName || 'Mobile',
      loginAt: existing.registeredAt,
      logoutAt: Date.now(),
      durationMinutes: duration,
      endReason: 'another_device',
    });
    // Keep up to 5000 historical items instead of truncating at 200
    if (sessionHistory.length > 5000) {
      sessionHistory = sessionHistory.slice(0, 5000);
    }
  }

  activeSessions[cleanEmail] = {
    sessionId: String(sessionId),
    email: cleanEmail,
    deviceName: deviceName || 'Mobile',
    registeredAt: Date.now(),
    lastActive: Date.now(),
  };
  saveSessions();
  res.json({ success: true, sessionId: String(sessionId) });
});

// 2. Validate whether current session is still the single active session + track cumulative minutes
app.get('/api/session/validate', (req: Request, res: Response) => {
  const email = req.query.email as string;
  const sessionId = req.query.sessionId as string;

  if (!email || !sessionId) {
    return res.status(400).json({ isValid: false, reason: 'missing_params' });
  }

  const cleanEmail = String(email).trim().toLowerCase();

  // If blocked, immediately terminate session
  const user = appUsers[cleanEmail];
  if (user && user.status === 'blocked') {
    delete activeSessions[cleanEmail];
    saveSessions();
    return res.json({
      isValid: false,
      reason: 'blocked',
      message: 'আপনার অ্যাকাউন্টটি অ্যাডমিন কর্তৃক ব্লক করা হয়েছে।',
    });
  }

  const current = activeSessions[cleanEmail];

  if (!current) {
    activeSessions[cleanEmail] = {
      sessionId: String(sessionId),
      email: cleanEmail,
      registeredAt: Date.now(),
      lastActive: Date.now(),
    };
    saveSessions();
    return res.json({ isValid: true });
  }

  if (current.sessionId === String(sessionId)) {
    const now = Date.now();
    const elapsedMs = now - current.lastActive;
    current.lastActive = now;

    // Increment cumulative minutes in user profile
    if (elapsedMs >= 2000 && elapsedMs <= 60000 && user) {
      const addedMinutes = elapsedMs / 60000;
      user.totalMinutesSpent = Math.round(((user.totalMinutesSpent || 0) + addedMinutes) * 100) / 100;
      // Debounce saving users to avoid excessive disk I/O
      if (Math.random() < 0.2) {
        saveUsers();
      }
    }

    return res.json({ isValid: true });
  }

  return res.json({
    isValid: false,
    reason: 'another_device_logged_in',
    registeredAt: current.registeredAt,
  });
});

// 3. Terminate session on manual logout
app.post('/api/session/logout', (req: Request, res: Response) => {
  const { email, sessionId } = req.body || {};
  if (email) {
    const cleanEmail = String(email).trim().toLowerCase();
    const existing = activeSessions[cleanEmail];
    if (existing && (!sessionId || existing.sessionId === String(sessionId))) {
      const duration = Math.max(1, Math.round((Date.now() - existing.registeredAt) / 60000));
      sessionHistory.unshift({
        id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        email: cleanEmail,
        sessionId: existing.sessionId,
        deviceName: existing.deviceName || 'Mobile',
        loginAt: existing.registeredAt,
        logoutAt: Date.now(),
        durationMinutes: duration,
        endReason: 'logout',
      });
      if (sessionHistory.length > 5000) {
        sessionHistory = sessionHistory.slice(0, 5000);
      }
      delete activeSessions[cleanEmail];
      saveSessions();
      saveUsers();
    }
  }
  res.json({ success: true });
});

// 4. Admin API: Check admin permission
app.get('/api/admin/check', (req: Request, res: Response) => {
  const email = (req.query.email as string || '').trim().toLowerCase();
  res.json({
    isAdmin: checkIsAdmin(email),
    email,
    adminCount: adminEmails.length,
  });
});

// 5. Admin API: Get all users, active sessions, total cumulative minutes, history, and metrics
// Restricted ONLY to authorized admin emails
app.get('/api/admin/data', (req: Request, res: Response) => {
  const requesterEmail = (
    (req.headers['x-admin-email'] as string) ||
    (req.query.adminEmail as string) ||
    ''
  ).trim().toLowerCase();

  if (!checkIsAdmin(requesterEmail)) {
    return res.status(403).json({
      success: false,
      error: 'অননুমোদিত অ্যাক্সেস: আপনার এই অ্যাডমিন প্যানেল দেখার অনুমতি নেই।',
    });
  }

  const now = Date.now();

  // Active sessions mapped
  const activeUsers = Object.values(activeSessions).map((sess) => {
    const lastSeenSec = Math.max(0, Math.round((now - sess.lastActive) / 1000));
    const isOnline = lastSeenSec < 45;
    const durationMinutes = Math.max(
      1,
      Math.round(((isOnline ? now : sess.lastActive) - sess.registeredAt) / 60000)
    );

    return {
      sessionId: sess.sessionId,
      email: sess.email,
      deviceName: sess.deviceName || 'Mobile',
      registeredAt: sess.registeredAt,
      lastActive: sess.lastActive,
      isOnline,
      durationMinutes,
      lastSeenSecondsAgo: lastSeenSec,
    };
  });

  // Ensure all emails from sessions & history are in appUsers
  activeUsers.forEach((u) => {
    if (!appUsers[u.email]) {
      appUsers[u.email] = {
        email: u.email,
        name: u.email.split('@')[0],
        role: checkIsAdmin(u.email) ? 'admin' : 'user',
        status: 'active',
        createdAt: u.registeredAt,
        lastLoginAt: u.registeredAt,
        totalMinutesSpent: u.durationMinutes,
        lastPasswordChangedAt: null,
      };
    }
  });

  sessionHistory.forEach((h) => {
    if (!appUsers[h.email]) {
      appUsers[h.email] = {
        email: h.email,
        name: h.email.split('@')[0],
        role: checkIsAdmin(h.email) ? 'admin' : 'user',
        status: 'active',
        createdAt: h.loginAt,
        lastLoginAt: h.loginAt,
        totalMinutesSpent: h.durationMinutes,
        lastPasswordChangedAt: null,
      };
    }
  });

  // Construct full user list with cumulative minutes & live state
  const userList = Object.values(appUsers).map((u) => {
    const active = activeSessions[u.email];
    let isOnline = false;
    let currentSessionDuration = 0;
    let deviceName = active?.deviceName;
    let lastActive = active?.lastActive;

    if (active) {
      const lastSeenSec = Math.max(0, Math.round((now - active.lastActive) / 1000));
      isOnline = lastSeenSec < 45;
      currentSessionDuration = Math.max(
        1,
        Math.round(((isOnline ? now : active.lastActive) - active.registeredAt) / 60000)
      );
    }

    return {
      email: u.email,
      name: u.name,
      role: checkIsAdmin(u.email) ? ('admin' as const) : u.role,
      status: u.status,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      totalMinutesSpent: Math.round(u.totalMinutesSpent || 0),
      currentSessionDuration,
      isOnline,
      activeSessionId: active?.sessionId,
      deviceName,
      lastActive,
      lastPasswordChangedAt: u.lastPasswordChangedAt,
    };
  });

  // Sort: Online first, then by totalMinutesSpent descending
  userList.sort((a, b) => {
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    return b.totalMinutesSpent - a.totalMinutesSpent;
  });

  const onlineCount = userList.filter((u) => u.isOnline).length;
  const blockedCount = userList.filter((u) => u.status === 'blocked').length;
  const totalCumulativeMinutes = userList.reduce((acc, u) => acc + u.totalMinutesSpent, 0);
  const avgMinutesPerUser =
    userList.length > 0 ? Math.round(totalCumulativeMinutes / userList.length) : 0;

  res.json({
    success: true,
    isAdmin: true,
    adminEmails,
    users: userList.map((u) => ({
      ...u,
      phone: appUsers[u.email]?.phone,
      notes: appUsers[u.email]?.notes,
    })),
    activeUsers,
    history: sessionHistory,
    summary: {
      totalRegisteredUsers: userList.length,
      onlineCount,
      blockedCount,
      adminCount: userList.filter((u) => u.role === 'admin').length,
      totalCumulativeMinutes,
      avgMinutesPerUser,
    },
    appConfig,
    dataSource: 'server',
    cloudConnected: false,
    lastSyncedAt: now,
  });
});

// Legacy backward-compatibility for active sessions
app.get('/api/admin/sessions', (req: Request, res: Response) => {
  const requesterEmail = (
    (req.headers['x-admin-email'] as string) ||
    (req.query.adminEmail as string) ||
    ''
  ).trim().toLowerCase();

  // Allow or default
  const now = Date.now();
  const activeUsers = Object.values(activeSessions).map((sess) => {
    const lastSeenSec = Math.max(0, Math.round((now - sess.lastActive) / 1000));
    const isOnline = lastSeenSec < 45;
    const durationMinutes = Math.max(
      1,
      Math.round(((isOnline ? now : sess.lastActive) - sess.registeredAt) / 60000)
    );

    return {
      sessionId: sess.sessionId,
      email: sess.email,
      deviceName: sess.deviceName || 'Mobile',
      registeredAt: sess.registeredAt,
      lastActive: sess.lastActive,
      isOnline,
      durationMinutes,
      lastSeenSecondsAgo: lastSeenSec,
    };
  });

  const distinctEmails = new Set<string>();
  activeUsers.forEach((u) => distinctEmails.add(u.email));
  sessionHistory.forEach((h) => distinctEmails.add(h.email));

  const onlineCount = activeUsers.filter((u) => u.isOnline).length;
  let totalMinutes = 0;
  let count = 0;
  activeUsers.forEach((u) => {
    totalMinutes += u.durationMinutes;
    count++;
  });
  sessionHistory.forEach((h) => {
    totalMinutes += h.durationMinutes;
    count++;
  });

  res.json({
    success: true,
    activeUsers,
    history: sessionHistory.slice(0, 50),
    summary: {
      totalDistinctEmails: distinctEmails.size,
      onlineCount,
      totalRegisteredSessions: activeUsers.length,
      totalHistoryCount: sessionHistory.length,
      avgDurationMinutes: count > 0 ? Math.round(totalMinutes / count) : 0,
    },
  });
});

// 6. Admin API: Add new Gmail user + create in Firebase Auth
app.post('/api/admin/users/add', async (req: Request, res: Response) => {
  const requesterEmail = (
    (req.headers['x-admin-email'] as string) ||
    req.body?.adminEmail ||
    ''
  ).trim().toLowerCase();

  if (!checkIsAdmin(requesterEmail)) {
    return res.status(403).json({ error: 'অননুমোদিত: আপনি অ্যাডমিন নন।' });
  }

  const { email, password, name, role } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'ইমেইল দেওয়া আবশ্যক' });
  }
  const cleanEmail = String(email).trim().toLowerCase();

  // Attempt creating user in Firebase Auth via Identity Toolkit REST API
  const FIREBASE_API_KEY =
    process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDSE5kxWXULnlTB2sOY7AE6MLFLmHuguWg';
  let firebaseResult: any = null;

  if (password) {
    try {
      const fbRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: cleanEmail,
            password: String(password),
            returnSecureToken: false,
          }),
        }
      );
      firebaseResult = await fbRes.json();
    } catch (fbErr: any) {
      console.warn('Firebase user create warning:', fbErr.message);
    }
  }

  const existingUser = appUsers[cleanEmail];
  const userRole = role === 'admin' ? 'admin' : 'user';

  appUsers[cleanEmail] = {
    email: cleanEmail,
    name: name ? String(name).trim() : existingUser?.name || cleanEmail.split('@')[0],
    role: userRole,
    status: 'active',
    createdAt: existingUser?.createdAt || Date.now(),
    lastLoginAt: existingUser?.lastLoginAt,
    totalMinutesSpent: existingUser?.totalMinutesSpent || 0,
    lastPasswordChangedAt: existingUser?.lastPasswordChangedAt || null,
  };
  saveUsers();

  // If role is admin, sync to adminEmails list
  if (userRole === 'admin' && !adminEmails.includes(cleanEmail)) {
    adminEmails.push(cleanEmail);
    saveAdminConfig();
  }

  res.json({
    success: true,
    user: appUsers[cleanEmail],
    firebaseCreated: !firebaseResult?.error,
    firebaseMessage: firebaseResult?.error?.message,
    wasAlreadyExisted: !!existingUser,
  });
});

// 7. Admin API: Toggle Block/Active status for a user
app.post('/api/admin/users/toggle-block', (req: Request, res: Response) => {
  const requesterEmail = (
    (req.headers['x-admin-email'] as string) ||
    req.body?.adminEmail ||
    ''
  ).trim().toLowerCase();

  if (!checkIsAdmin(requesterEmail)) {
    return res.status(403).json({ error: 'অননুমোদিত: আপনি অ্যাডমিন নন।' });
  }

  const { email, status } = req.body || {};
  const cleanEmail = String(email).trim().toLowerCase();

  if (!appUsers[cleanEmail]) {
    // If not found in appUsers, create record
    appUsers[cleanEmail] = {
      email: cleanEmail,
      name: cleanEmail.split('@')[0],
      role: checkIsAdmin(cleanEmail) ? 'admin' : 'user',
      status: 'active',
      createdAt: Date.now(),
      totalMinutesSpent: 0,
    };
  }

  // Prevent blocking super admin
  if (cleanEmail === adminEmails[0] && status === 'blocked') {
    return res.status(400).json({ error: 'মূল অ্যাডমিন অ্যাকাউন্টকে ব্লক করা যাবে না।' });
  }

  const newStatus = status === 'blocked' ? 'blocked' : 'active';
  appUsers[cleanEmail].status = newStatus;
  saveUsers();

  // If blocked, terminate active session immediately
  if (newStatus === 'blocked' && activeSessions[cleanEmail]) {
    const existing = activeSessions[cleanEmail];
    const duration = Math.max(1, Math.round((Date.now() - existing.registeredAt) / 60000));
    sessionHistory.unshift({
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      email: cleanEmail,
      sessionId: existing.sessionId,
      deviceName: existing.deviceName || 'Mobile',
      loginAt: existing.registeredAt,
      logoutAt: Date.now(),
      durationMinutes: duration,
      endReason: 'kicked',
    });
    delete activeSessions[cleanEmail];
    saveSessions();
  }

  res.json({ success: true, status: newStatus });
});

// 8. Admin API: Change user password / Trigger password reset
app.post('/api/admin/users/change-password', async (req: Request, res: Response) => {
  const requesterEmail = (
    (req.headers['x-admin-email'] as string) ||
    req.body?.adminEmail ||
    ''
  ).trim().toLowerCase();

  if (!checkIsAdmin(requesterEmail)) {
    return res.status(403).json({ error: 'অননুমোদিত: আপনি অ্যাডমিন নন।' });
  }

  const { email, newPassword } = req.body || {};
  const cleanEmail = String(email).trim().toLowerCase();

  if (!cleanEmail) {
    return res.status(400).json({ error: 'ইমেইল দেওয়া আবশ্যক' });
  }

  const FIREBASE_API_KEY =
    process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDSE5kxWXULnlTB2sOY7AE6MLFLmHuguWg';
  let fbMessage = '';
  let fbSuccess = false;

  // Send official password reset email to user's inbox
  try {
    const fbRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email: cleanEmail,
        }),
      }
    );
    const fbJson = await fbRes.json();
    if (fbJson.email) {
      fbSuccess = true;
      fbMessage = `"${cleanEmail}" ঠিকানায় অফিসিয়াল পাসওয়ার্ড পরিবর্তনের লিংক পাঠানো হয়েছে।`;
    } else if (fbJson.error) {
      fbMessage = fbJson.error.message;
    }
  } catch (err: any) {
    fbMessage = err.message;
  }

  if (appUsers[cleanEmail]) {
    appUsers[cleanEmail].lastPasswordChangedAt = Date.now();
    saveUsers();
  }

  res.json({
    success: true,
    email: cleanEmail,
    fbSuccess,
    message: fbSuccess
      ? fbMessage
      : `পাসওয়ার্ড পরিবর্তনের অনুরোধ রেকর্ড করা হয়েছে (${fbMessage || 'সম্পন্ন'})।`,
  });
});

// 9. Admin API: Delete user from registry
app.post('/api/admin/users/delete', (req: Request, res: Response) => {
  const requesterEmail = (
    (req.headers['x-admin-email'] as string) ||
    req.body?.adminEmail ||
    ''
  ).trim().toLowerCase();

  if (!checkIsAdmin(requesterEmail)) {
    return res.status(403).json({ error: 'অননুমোদিত: আপনি অ্যাডমিন নন।' });
  }

  const { email } = req.body || {};
  const cleanEmail = String(email).trim().toLowerCase();

  if (adminEmails.includes(cleanEmail)) {
    return res.status(400).json({ error: 'অ্যাডমিন অ্যাকাউন্ট মুছে ফেলা যাবে না।' });
  }

  delete appUsers[cleanEmail];
  delete activeSessions[cleanEmail];
  saveUsers();
  saveSessions();

  res.json({ success: true });
});

// 10. Admin API: Manage Admin Emails List (1 or 2 emails)
app.post('/api/admin/config/admins', (req: Request, res: Response) => {
  const requesterEmail = (
    (req.headers['x-admin-email'] as string) ||
    req.body?.adminEmail ||
    ''
  ).trim().toLowerCase();

  if (!checkIsAdmin(requesterEmail)) {
    return res.status(403).json({ error: 'অননুমোদিত: আপনি অ্যাডমিন নন।' });
  }

  const { newAdminEmails } = req.body || {};
  if (!Array.isArray(newAdminEmails) || newAdminEmails.length === 0) {
    return res.status(400).json({ error: 'কমপক্ষে ১টি অ্যাডমিন ইমেইল দেওয়া আবশ্যক।' });
  }

  adminEmails = newAdminEmails
    .map((e: string) => String(e).trim().toLowerCase())
    .filter(Boolean);

  // Update roles in appUsers
  adminEmails.forEach((admin) => {
    if (appUsers[admin]) {
      appUsers[admin].role = 'admin';
    }
  });

  saveAdminConfig();
  saveUsers();

  res.json({ success: true, adminEmails });
});

// 11. Admin API: Kick / terminate a session
app.post('/api/admin/kick', (req: Request, res: Response) => {
  const requesterEmail = (
    (req.headers['x-admin-email'] as string) ||
    req.body?.adminEmail ||
    ''
  ).trim().toLowerCase();

  if (requesterEmail && !checkIsAdmin(requesterEmail)) {
    return res.status(403).json({ error: 'অননুমোদিত: আপনি অ্যাডমিন নন।' });
  }

  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const existing = activeSessions[cleanEmail];
  if (existing) {
    const duration = Math.max(1, Math.round((Date.now() - existing.registeredAt) / 60000));
    sessionHistory.unshift({
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      email: cleanEmail,
      sessionId: existing.sessionId,
      deviceName: existing.deviceName || 'Mobile',
      loginAt: existing.registeredAt,
      logoutAt: Date.now(),
      durationMinutes: duration,
      endReason: 'kicked',
    });
    delete activeSessions[cleanEmail];
    saveSessions();
    return res.json({ success: true, message: 'Session terminated' });
  }
  res.json({ success: false, message: 'No active session found' });
});

// 12. Admin API: Update User Profile / Role / Minutes
app.post('/api/admin/users/update', (req: Request, res: Response) => {
  const requesterEmail = (
    (req.headers['x-admin-email'] as string) ||
    req.body?.adminEmail ||
    ''
  ).trim().toLowerCase();

  if (!checkIsAdmin(requesterEmail)) {
    return res.status(403).json({ error: 'অননুমোদিত: আপনি অ্যাডমিন নন।' });
  }

  const { email, updates } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !appUsers[cleanEmail]) {
    return res.status(404).json({ error: 'ব্যবহারকারী পাওয়া যায়নি।' });
  }

  const target = appUsers[cleanEmail];
  if (updates?.name !== undefined) target.name = String(updates.name).trim();
  if (updates?.phone !== undefined) target.phone = String(updates.phone).trim();
  if (updates?.notes !== undefined) target.notes = String(updates.notes).trim();
  if (updates?.role === 'admin' || updates?.role === 'user') {
    target.role = updates.role;
    if (updates.role === 'admin' && !adminEmails.includes(cleanEmail)) {
      adminEmails.push(cleanEmail);
      saveAdminConfig();
    } else if (updates.role === 'user' && cleanEmail !== 'rahatsharif10448@gmail.com') {
      adminEmails = adminEmails.filter((e) => e !== cleanEmail);
      saveAdminConfig();
    }
  }
  if (updates?.totalMinutesSpent !== undefined) {
    target.totalMinutesSpent = Math.max(0, Number(updates.totalMinutesSpent) || 0);
  }
  saveUsers();

  res.json({ success: true, user: target });
});

// 13. Admin API: Kick ALL active sessions
app.post('/api/admin/kick-all', (req: Request, res: Response) => {
  const requesterEmail = (
    (req.headers['x-admin-email'] as string) ||
    req.body?.adminEmail ||
    ''
  ).trim().toLowerCase();

  if (!checkIsAdmin(requesterEmail)) {
    return res.status(403).json({ error: 'অননুমোদিত: আপনি অ্যাডমিন নন।' });
  }

  const { excludeEmail } = req.body || {};
  const exclude = String(excludeEmail || '').trim().toLowerCase();
  let kicked = 0;

  Object.entries(activeSessions).forEach(([emailKey, existing]) => {
    if (exclude && emailKey === exclude) return;
    kicked++;
    const duration = Math.max(1, Math.round((Date.now() - existing.registeredAt) / 60000));
    sessionHistory.unshift({
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      email: emailKey,
      sessionId: existing.sessionId,
      deviceName: existing.deviceName || 'Mobile',
      loginAt: existing.registeredAt,
      logoutAt: Date.now(),
      durationMinutes: duration,
      endReason: 'kicked',
    });
    delete activeSessions[emailKey];
  });
  saveSessions();
  res.json({ success: true, kickedCount: kicked });
});

// 14. Admin API: Delete specific history items
app.post('/api/admin/delete-history', (req: Request, res: Response) => {
  const requesterEmail = (
    (req.headers['x-admin-email'] as string) ||
    req.body?.adminEmail ||
    ''
  ).trim().toLowerCase();

  if (!checkIsAdmin(requesterEmail)) {
    return res.status(403).json({ error: 'অননুমোদিত: আপনি অ্যাডমিন নন।' });
  }

  const { ids } = req.body || {};
  if (Array.isArray(ids) && ids.length > 0) {
    const idSet = new Set(ids.map(String));
    sessionHistory = sessionHistory.filter((h) => !idSet.has(h.id));
    saveSessions();
  }
  res.json({ success: true, remaining: sessionHistory.length });
});

// 15. Admin API: Clear session history
app.post('/api/admin/clear-history', (req: Request, res: Response) => {
  const requesterEmail = (
    (req.headers['x-admin-email'] as string) ||
    req.body?.adminEmail ||
    ''
  ).trim().toLowerCase();

  if (requesterEmail && !checkIsAdmin(requesterEmail)) {
    return res.status(403).json({ error: 'অননুমোদিত: আপনি অ্যাডমিন নন।' });
  }

  sessionHistory = [];
  saveSessions();
  res.json({ success: true });
});

// 16. Admin API: Global App Control Configuration
app.get('/api/admin/config/app', (_req: Request, res: Response) => {
  res.json({ success: true, appConfig });
});

app.post('/api/admin/config/app', (req: Request, res: Response) => {
  const requesterEmail = (
    (req.headers['x-admin-email'] as string) ||
    req.body?.adminEmail ||
    ''
  ).trim().toLowerCase();

  if (!checkIsAdmin(requesterEmail)) {
    return res.status(403).json({ error: 'অননুমোদিত: আপনি অ্যাডমিন নন।' });
  }

  const incoming = req.body?.appConfig || {};
  appConfig = {
    ...appConfig,
    ...incoming,
    updatedAt: Date.now(),
    updatedBy: requesterEmail,
  };
  saveAdminConfig();
  res.json({ success: true, appConfig });
});

// Serve static assets from public/ and villages/
app.use(express.static(path.join(__dirname, 'public')));
app.use('/villages', express.static(path.join(__dirname, 'villages')));
app.get('/logo.png', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'logo.png')));
app.get('/manifest.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});
app.get('/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

async function start() {
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.join(__dirname, 'dist'))) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    // Development mode: Vite middleware
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    // Serve Vite transformed index.html for any SPA route
    app.use('*', async (req: Request, res: Response, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });

  server.on('error', (err: any) => {
    console.error('Express server listen error:', err);
  });
}

start();
