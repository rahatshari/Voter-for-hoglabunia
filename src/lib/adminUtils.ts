import { AppUserRecord, AdminPanelSummary, SessionHistoryItem } from '../types';
import { convertToBengaliNumbers } from './bengaliUtils';

/**
 * Checks whether an email has admin privileges
 */
export function isEmailAdmin(email: string | null | undefined, adminEmails: string[]): boolean {
  if (!email || !Array.isArray(adminEmails)) return false;
  const cleanEmail = email.trim().toLowerCase();
  return adminEmails.some((admin) => admin.trim().toLowerCase() === cleanEmail);
}

/**
 * Formats cumulative total minutes into a clear Bengali breakdown
 * e.g. "২ ঘন্টা ৩০ মিনিট (১৫০ মিনিট)"
 */
export function formatCumulativeMinutesBengali(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes || 0));
  if (m === 0) return '০ মিনিট';
  if (m < 60) return `${convertToBengaliNumbers(m)} মিনিট`;

  const hours = Math.floor(m / 60);
  const remainingMinutes = m % 60;
  const hoursStr = `${convertToBengaliNumbers(hours)} ঘন্টা`;
  const minutesStr = remainingMinutes > 0 ? ` ${convertToBengaliNumbers(remainingMinutes)} মিনিট` : '';
  return `${hoursStr}${minutesStr} (${convertToBengaliNumbers(m)} মিনিট)`;
}

/**
 * Filters user records by search keyword and status/role filter
 */
export function filterAppUsers(
  users: AppUserRecord[],
  query: string,
  statusFilter: 'all' | 'active' | 'blocked' | 'online' | 'admin' = 'all'
): AppUserRecord[] {
  if (!Array.isArray(users)) return [];
  const cleanQuery = (query || '').trim().toLowerCase();

  return users.filter((user) => {
    if (statusFilter === 'active' && user.status !== 'active') return false;
    if (statusFilter === 'blocked' && user.status !== 'blocked') return false;
    if (statusFilter === 'online' && !user.isOnline) return false;
    if (statusFilter === 'admin' && user.role !== 'admin') return false;

    if (!cleanQuery) return true;
    const matchEmail = (user.email || '').toLowerCase().includes(cleanQuery);
    const matchName = (user.name || '').toLowerCase().includes(cleanQuery);
    const matchDevice = (user.deviceName || '').toLowerCase().includes(cleanQuery);
    const matchPhone = (user.phone || '').toLowerCase().includes(cleanQuery);
    const matchNotes = (user.notes || '').toLowerCase().includes(cleanQuery);
    return matchEmail || matchName || matchDevice || matchPhone || matchNotes;
  });
}

/**
 * Computes summary KPI metrics from users and online count
 */
export function calculateAdminSummary(
  users: AppUserRecord[],
  onlineCount: number
): AdminPanelSummary {
  const totalRegisteredUsers = users.length;
  const blockedCount = users.filter((u) => u.status === 'blocked').length;
  const adminCount = users.filter((u) => u.role === 'admin').length;
  const totalCumulativeMinutes = users.reduce((acc, u) => acc + (u.totalMinutesSpent || 0), 0);
  const avgMinutesPerUser =
    totalRegisteredUsers > 0 ? Math.round(totalCumulativeMinutes / totalRegisteredUsers) : 0;

  return {
    totalRegisteredUsers,
    onlineCount,
    blockedCount,
    adminCount,
    totalCumulativeMinutes,
    avgMinutesPerUser,
  };
}

/**
 * Validates new user input fields
 */
export function validateNewUserForm(
  email: string,
  password?: string
): { isValid: boolean; error?: string } {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) {
    return { isValid: false, error: 'দয়া করে জিমেইল আইডি লিখুন।' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return { isValid: false, error: 'সঠিক ইমেইল ফরম্যাট দিন (যেমন: user@gmail.com)।' };
  }
  if (password !== undefined) {
    if (password.length < 6) {
      return { isValid: false, error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' };
    }
  }
  return { isValid: true };
}

/**
 * Parses arbitrary date/number timestamp safely into epoch ms
 */
function parseTimestampMs(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) return val;
  if (typeof val === 'string' && val.trim()) {
    const num = Number(val);
    if (Number.isFinite(num) && num > 0) return num;
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

/**
 * Normalizes any Firebase RTDB / local history entry into a valid SessionHistoryItem.
 * Ensures older or partially written records never get dropped.
 */
export function normalizeHistoryRecord(
  rawKey: string,
  rawVal: Record<string, any> | null | undefined
): SessionHistoryItem | null {
  if (!rawVal || typeof rawVal !== 'object') return null;

  const email = String(rawVal.email || rawVal.userEmail || '').trim().toLowerCase();
  if (!email) return null;

  const loginAt =
    parseTimestampMs(rawVal.loginAt) ||
    parseTimestampMs(rawVal.registeredAt) ||
    parseTimestampMs(rawVal.timestamp) ||
    parseTimestampMs(rawVal.createdAt) ||
    Date.now();

  const logoutAtRaw = parseTimestampMs(rawVal.logoutAt);
  const lastActiveRaw = parseTimestampMs(rawVal.lastActive);
  const logoutAt = logoutAtRaw > 0 ? logoutAtRaw : undefined;

  let endReason: SessionHistoryItem['endReason'] = rawVal.endReason;
  if (
    endReason !== 'active' &&
    endReason !== 'logout' &&
    endReason !== 'another_device' &&
    endReason !== 'kicked'
  ) {
    endReason = logoutAt ? 'logout' : 'active';
  }

  let durationMinutes = Number(rawVal.durationMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    const endTime = logoutAt || lastActiveRaw || loginAt;
    durationMinutes = Math.max(1, Math.round((endTime - loginAt) / 60000));
  }

  return {
    id: String(rawVal.id || rawKey || `hist_${loginAt}_${email}`),
    email,
    sessionId: String(rawVal.sessionId || rawKey || ''),
    deviceName: rawVal.deviceName ? String(rawVal.deviceName) : undefined,
    loginAt,
    logoutAt,
    durationMinutes,
    endReason,
  };
}

/**
 * Merges multiple history lists (e.g. Firebase + active fallback) without duplicates.
 * Never truncates old dates — returns complete sorted timeline (newest first).
 */
export function mergeHistoryRecords(...lists: SessionHistoryItem[][]): SessionHistoryItem[] {
  const byId = new Map<string, SessionHistoryItem>();

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || !item.email) continue;
      const dedupeKey = item.id || `${item.email.toLowerCase()}_${item.sessionId}_${item.loginAt}`;
      const existing = byId.get(dedupeKey);
      if (!existing) {
        byId.set(dedupeKey, item);
      } else {
        // Prefer finalized record (logoutAt / non-active endReason) or longer duration
        const existingFinalized = Boolean(existing.logoutAt && existing.endReason !== 'active');
        const nextFinalized = Boolean(item.logoutAt && item.endReason !== 'active');
        if (nextFinalized && !existingFinalized) {
          byId.set(dedupeKey, item);
        } else if (nextFinalized === existingFinalized && item.durationMinutes >= existing.durationMinutes) {
          byId.set(dedupeKey, item);
        }
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) => (b.loginAt || 0) - (a.loginAt || 0));
}

export type HistoryDatePreset = 'all' | 'today' | '7days' | '30days' | 'custom';
export type HistoryReasonFilter = 'all' | 'active' | 'logout' | 'another_device' | 'kicked';

export interface HistoryFilterOptions {
  query?: string;
  emailFilter?: string;
  reasonFilter?: HistoryReasonFilter;
  datePreset?: HistoryDatePreset;
  customFromDate?: string; // YYYY-MM-DD
  customToDate?: string; // YYYY-MM-DD
  now?: number;
}

/**
 * Filters login history by keyword, user email, end reason, and date range
 */
export function filterHistoryRecords(
  history: SessionHistoryItem[],
  options: HistoryFilterOptions = {}
): SessionHistoryItem[] {
  if (!Array.isArray(history)) return [];
  const {
    query = '',
    emailFilter = 'all',
    reasonFilter = 'all',
    datePreset = 'all',
    customFromDate = '',
    customToDate = '',
    now = Date.now(),
  } = options;

  const cleanQuery = query.trim().toLowerCase();
  const cleanEmailFilter = emailFilter.trim().toLowerCase();

  let startBound = 0;
  let endBound = Number.POSITIVE_INFINITY;

  if (datePreset === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    startBound = d.getTime();
  } else if (datePreset === '7days') {
    startBound = now - 7 * 24 * 60 * 60 * 1000;
  } else if (datePreset === '30days') {
    startBound = now - 30 * 24 * 60 * 60 * 1000;
  } else if (datePreset === 'custom') {
    if (customFromDate) {
      const fromTs = new Date(`${customFromDate}T00:00:00`).getTime();
      if (Number.isFinite(fromTs)) startBound = fromTs;
    }
    if (customToDate) {
      const toTs = new Date(`${customToDate}T23:59:59.999`).getTime();
      if (Number.isFinite(toTs)) endBound = toTs;
    }
  }

  return history.filter((item) => {
    if (cleanEmailFilter && cleanEmailFilter !== 'all') {
      if ((item.email || '').toLowerCase() !== cleanEmailFilter) return false;
    }

    const reason = item.endReason || (item.logoutAt ? 'logout' : 'active');
    if (reasonFilter !== 'all' && reason !== reasonFilter) return false;

    const ts = item.loginAt || 0;
    if (ts < startBound || ts > endBound) return false;

    if (!cleanQuery) return true;
    const matchEmail = (item.email || '').toLowerCase().includes(cleanQuery);
    const matchDevice = (item.deviceName || '').toLowerCase().includes(cleanQuery);
    const matchSession = (item.sessionId || '').toLowerCase().includes(cleanQuery);
    return matchEmail || matchDevice || matchSession;
  });
}

export interface HistoryStatsSummary {
  totalCount: number;
  todayCount: number;
  activeCount: number;
  distinctUsers: number;
  totalDurationMinutes: number;
  oldestLoginAt: number | null;
  newestLoginAt: number | null;
}

/**
 * Computes rich summary statistics for any history slice
 */
export function computeHistoryStats(
  history: SessionHistoryItem[],
  now: number = Date.now()
): HistoryStatsSummary {
  if (!Array.isArray(history) || history.length === 0) {
    return {
      totalCount: 0,
      todayCount: 0,
      activeCount: 0,
      distinctUsers: 0,
      totalDurationMinutes: 0,
      oldestLoginAt: null,
      newestLoginAt: null,
    };
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  const users = new Set<string>();
  let todayCount = 0;
  let activeCount = 0;
  let totalDurationMinutes = 0;
  let oldestLoginAt = Number.POSITIVE_INFINITY;
  let newestLoginAt = 0;

  for (const h of history) {
    if (h.email) users.add(h.email.toLowerCase());
    const ts = h.loginAt || 0;
    if (ts >= todayStartMs) todayCount++;
    if (h.endReason === 'active' || (!h.logoutAt && !h.endReason)) activeCount++;
    totalDurationMinutes += Math.max(0, h.durationMinutes || 0);
    if (ts > 0 && ts < oldestLoginAt) oldestLoginAt = ts;
    if (ts > newestLoginAt) newestLoginAt = ts;
  }

  return {
    totalCount: history.length,
    todayCount,
    activeCount,
    distinctUsers: users.size,
    totalDurationMinutes,
    oldestLoginAt: oldestLoginAt === Number.POSITIVE_INFINITY ? null : oldestLoginAt,
    newestLoginAt: newestLoginAt === 0 ? null : newestLoginAt,
  };
}

function escapeCsvCell(value: string): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats login history records into a UTF-8 BOM CSV string for Excel download
 */
export function exportHistoryToCsv(history: SessionHistoryItem[]): string {
  const header = ['Record ID', 'Email', 'Device', 'Login Time', 'Logout Time', 'Duration (Minutes)', 'Status / End Reason'];
  const reasonMap: Record<string, string> = {
    active: 'বর্তমানে চলমান',
    logout: 'স্বাভাবিক লগআউট',
    another_device: 'অন্য ডিভাইসে লগইন',
    kicked: 'অ্যাডমিন কর্তৃক বন্ধ',
  };

  const rows = history.map((h) => {
    const reasonKey = h.endReason || (h.logoutAt ? 'logout' : 'active');
    const loginStr = h.loginAt ? new Date(h.loginAt).toISOString() : '';
    const logoutStr = h.logoutAt ? new Date(h.logoutAt).toISOString() : 'চলমান';
    return [
      escapeCsvCell(h.id),
      escapeCsvCell(h.email),
      escapeCsvCell(h.deviceName || 'Mobile Web'),
      escapeCsvCell(loginStr),
      escapeCsvCell(logoutStr),
      escapeCsvCell(String(h.durationMinutes || 1)),
      escapeCsvCell(reasonMap[reasonKey] || reasonKey),
    ].join(',');
  });

  return '\uFEFF' + [header.join(','), ...rows].join('\n');
}
