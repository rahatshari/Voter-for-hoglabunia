import { convertToBengaliNumbers } from './bengaliUtils';

export const LOGIN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
export const LAST_LOGIN_STORAGE_KEY = 'voter_last_login_timestamp_v1';

export interface LoginTimestampRecord {
  email: string;
  loggedInAt: number;
}

export interface LoginExpiryStatus {
  isExpired: boolean;
  loggedInAt: number | null;
  elapsedMs: number;
  remainingMs: number;
}

let memoryLoginRecord: LoginTimestampRecord | null = null;

function readRawLoginRecord(): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(LAST_LOGIN_STORAGE_KEY);
    }
  } catch {
    // ignore storage access issues
  }
  return memoryLoginRecord ? JSON.stringify(memoryLoginRecord) : null;
}

function writeRawLoginRecord(record: LoginTimestampRecord | null): void {
  memoryLoginRecord = record;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (record) {
        window.localStorage.setItem(LAST_LOGIN_STORAGE_KEY, JSON.stringify(record));
      } else {
        window.localStorage.removeItem(LAST_LOGIN_STORAGE_KEY);
      }
    }
  } catch {
    // ignore
  }
}

export function recordSuccessfulLoginTimestamp(
  email: string,
  now = Date.now()
): LoginTimestampRecord | null {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;
  const record: LoginTimestampRecord = {
    email: cleanEmail,
    loggedInAt: now,
  };
  writeRawLoginRecord(record);
  return record;
}

export function loadLoginTimestampRecord(): LoginTimestampRecord | null {
  try {
    const raw = readRawLoginRecord();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.email === 'string' &&
      typeof parsed.loggedInAt === 'number' &&
      !Number.isNaN(parsed.loggedInAt) &&
      parsed.loggedInAt > 0
    ) {
      return {
        email: parsed.email.trim().toLowerCase(),
        loggedInAt: parsed.loggedInAt,
      };
    }
  } catch {
    // ignore parse failure
  }
  return null;
}

export function clearLoginTimestamp(): void {
  writeRawLoginRecord(null);
}

/**
 * Evaluates whether the 24-hour login window has expired for a user.
 * - Uses stored login timestamp first; falls back to Firebase user metadata lastSignInTime if provided.
 * - If no record exists yet for an already signed-in legacy session without metadata, establishes baseline now.
 */
export function getLoginExpiryStatus(params: {
  email: string | null | undefined;
  fallbackSignInTimeMs?: number | null;
  now?: number;
}): LoginExpiryStatus {
  const { email, fallbackSignInTimeMs = null, now = Date.now() } = params;
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) {
    return {
      isExpired: true,
      loggedInAt: null,
      elapsedMs: LOGIN_MAX_AGE_MS,
      remainingMs: 0,
    };
  }

  const stored = loadLoginTimestampRecord();
  let effectiveLoggedInAt: number | null = null;

  if (stored && stored.email === cleanEmail) {
    effectiveLoggedInAt = stored.loggedInAt;
  } else if (
    typeof fallbackSignInTimeMs === 'number' &&
    !Number.isNaN(fallbackSignInTimeMs) &&
    fallbackSignInTimeMs > 0
  ) {
    effectiveLoggedInAt = fallbackSignInTimeMs;
    writeRawLoginRecord({ email: cleanEmail, loggedInAt: fallbackSignInTimeMs });
  } else {
    // Legacy upgraded user without metadata: start 24h clock from now
    effectiveLoggedInAt = now;
    writeRawLoginRecord({ email: cleanEmail, loggedInAt: now });
  }

  const elapsedMs = Math.max(0, now - effectiveLoggedInAt);
  const remainingMs = Math.max(0, LOGIN_MAX_AGE_MS - elapsedMs);
  const isExpired = elapsedMs >= LOGIN_MAX_AGE_MS;

  return {
    isExpired,
    loggedInAt: effectiveLoggedInAt,
    elapsedMs,
    remainingMs,
  };
}

export function formatRemainingSessionBengali(remainingMs: number): string {
  if (remainingMs <= 0) return 'মেয়াদ শেষ';
  const totalMinutes = Math.ceil(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) {
    return `${convertToBengaliNumbers(hours)} ঘণ্টা ${convertToBengaliNumbers(mins)} মিনিট`;
  }
  if (hours > 0) {
    return `${convertToBengaliNumbers(hours)} ঘণ্টা`;
  }
  return `${convertToBengaliNumbers(Math.max(1, mins))} মিনিট`;
}
