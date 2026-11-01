import { convertToBengaliNumbers } from './bengaliUtils';
import { UserSessionData, SessionHistoryItem } from '../types';

/**
 * Formats a duration in minutes into clear Bengali human readable text.
 * e.g. 5 -> "৫ মিনিট"
 * e.g. 75 -> "১ ঘণ্টা ১৫ মিনিট"
 * e.g. 0 -> "১ মিনিটের কম"
 */
export function formatDurationBengali(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m === 0) {
    return '১ মিনিটের কম';
  }
  if (m < 60) {
    return `${convertToBengaliNumbers(m)} মিনিট`;
  }
  const hours = Math.floor(m / 60);
  const remainingMinutes = m % 60;
  if (remainingMinutes === 0) {
    return `${convertToBengaliNumbers(hours)} ঘণ্টা`;
  }
  return `${convertToBengaliNumbers(hours)} ঘণ্টা ${convertToBengaliNumbers(remainingMinutes)} মিনিট`;
}

/**
 * Formats a timestamp into Bengali date and time string.
 * e.g. 1730000000000 -> "৩১ অক্টো, ১০:৪৫ PM"
 */
export function formatBengaliDateTime(timestamp: number): string {
  if (!timestamp) return '-';
  try {
    const d = new Date(timestamp);
    const day = convertToBengaliNumbers(d.getDate());
    const months = [
      'জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
      'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'
    ];
    const month = months[d.getMonth()];
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${day} ${month}, ${convertToBengaliNumbers(hours)}:${convertToBengaliNumbers(minutes)} ${ampm}`;
  } catch {
    return '-';
  }
}

/**
 * Returns a human-friendly "X seconds/minutes ago" in Bengali.
 */
export function formatTimeAgo(timestamp: number, now: number = Date.now()): string {
  if (!timestamp) return 'অজানা';
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 15) {
    return 'এইমাত্র';
  }
  if (diffSec < 60) {
    return `${convertToBengaliNumbers(diffSec)} সেকেন্ড আগে`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${convertToBengaliNumbers(diffMin)} মিনিট আগে`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${convertToBengaliNumbers(diffHours)} ঘণ্টা আগে`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${convertToBengaliNumbers(diffDays)} দিন আগে`;
}

/**
 * Determines device icon and badge label
 */
export function getDeviceDetails(deviceName?: string): { icon: string; label: string } {
  if (!deviceName) return { icon: '📱', label: 'মোবাইল ওয়েব' };
  const d = deviceName.toLowerCase();
  if (d.includes('android')) return { icon: '🤖', label: 'অ্যান্ড্রয়েড ফোন' };
  if (d.includes('ios') || d.includes('iphone') || d.includes('ipad')) return { icon: '🍎', label: 'আইফোন / আইপ্যাড' };
  if (d.includes('windows')) return { icon: '💻', label: 'উইন্ডোজ পিসি' };
  if (d.includes('mac')) return { icon: '🍏', label: 'ম্যাক কম্পিউটার' };
  return { icon: '📱', label: deviceName };
}

/**
 * Computes statistics from active users and history
 */
export function computeSessionStats(
  activeUsers: UserSessionData[],
  history: SessionHistoryItem[]
) {
  const onlineCount = activeUsers.filter((u) => u.isOnline).length;
  const emailsSet = new Set<string>();
  activeUsers.forEach((u) => emailsSet.add(u.email.toLowerCase()));
  history.forEach((h) => emailsSet.add(h.email.toLowerCase()));

  let totalDurationMinutes = 0;
  let count = 0;
  activeUsers.forEach((u) => {
    totalDurationMinutes += u.durationMinutes;
    count++;
  });
  history.forEach((h) => {
    totalDurationMinutes += h.durationMinutes;
    count++;
  });

  const avgDurationMinutes = count > 0 ? Math.round(totalDurationMinutes / count) : 0;

  return {
    totalDistinctEmails: emailsSet.size,
    onlineCount,
    totalRegisteredSessions: activeUsers.length,
    totalHistoryCount: history.length,
    avgDurationMinutes,
  };
}
