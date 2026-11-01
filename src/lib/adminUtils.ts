import { AppUserRecord, AdminPanelSummary } from '../types';
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
 * Filters user records by search keyword and status filter
 */
export function filterAppUsers(
  users: AppUserRecord[],
  query: string,
  statusFilter: 'all' | 'active' | 'blocked' | 'online' = 'all'
): AppUserRecord[] {
  if (!Array.isArray(users)) return [];
  const cleanQuery = (query || '').trim().toLowerCase();

  return users.filter((user) => {
    // Status filter
    if (statusFilter === 'active' && user.status !== 'active') return false;
    if (statusFilter === 'blocked' && user.status !== 'blocked') return false;
    if (statusFilter === 'online' && !user.isOnline) return false;

    // Search query filter
    if (!cleanQuery) return true;
    const matchEmail = (user.email || '').toLowerCase().includes(cleanQuery);
    const matchName = (user.name || '').toLowerCase().includes(cleanQuery);
    const matchDevice = (user.deviceName || '').toLowerCase().includes(cleanQuery);
    return matchEmail || matchName || matchDevice;
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
  const totalCumulativeMinutes = users.reduce((acc, u) => acc + (u.totalMinutesSpent || 0), 0);
  const avgMinutesPerUser =
    totalRegisteredUsers > 0 ? Math.round(totalCumulativeMinutes / totalRegisteredUsers) : 0;

  return {
    totalRegisteredUsers,
    onlineCount,
    blockedCount,
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
