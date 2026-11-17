import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOGIN_MAX_AGE_MS,
  clearLoginTimestamp,
  formatRemainingSessionBengali,
  getLoginExpiryStatus,
  loadLoginTimestampRecord,
  recordSuccessfulLoginTimestamp,
} from './sessionExpiryUtils';

test('recordSuccessfulLoginTimestamp stores email and timestamp and clears cleanly', () => {
  clearLoginTimestamp();
  assert.equal(loadLoginTimestampRecord(), null);

  const now = 1_700_000_000_000;
  const rec = recordSuccessfulLoginTimestamp('User@Example.com', now);
  assert.deepEqual(rec, { email: 'user@example.com', loggedInAt: now });
  assert.deepEqual(loadLoginTimestampRecord(), { email: 'user@example.com', loggedInAt: now });

  clearLoginTimestamp();
  assert.equal(loadLoginTimestampRecord(), null);
});

test('getLoginExpiryStatus keeps session active before 24 hours and expires at 24 hours', () => {
  clearLoginTimestamp();
  const t0 = 1_700_000_000_000;
  recordSuccessfulLoginTimestamp('voter@example.com', t0);

  // 10 hours later: still active (14 hours left)
  const tenHoursLater = t0 + 10 * 60 * 60 * 1000;
  const activeStatus = getLoginExpiryStatus({
    email: 'voter@example.com',
    now: tenHoursLater,
  });
  assert.equal(activeStatus.isExpired, false);
  assert.equal(activeStatus.remainingMs, 14 * 60 * 60 * 1000);

  // Exactly 24 hours later: expired
  const exactly24h = t0 + LOGIN_MAX_AGE_MS;
  const expiredAt24 = getLoginExpiryStatus({
    email: 'voter@example.com',
    now: exactly24h,
  });
  assert.equal(expiredAt24.isExpired, true);
  assert.equal(expiredAt24.remainingMs, 0);

  // 26 hours later: expired
  const later26h = t0 + 26 * 60 * 60 * 1000;
  const expiredAfter26 = getLoginExpiryStatus({
    email: 'voter@example.com',
    now: later26h,
  });
  assert.equal(expiredAfter26.isExpired, true);
});

test('getLoginExpiryStatus honors Firebase lastSignInTime fallback when local record missing', () => {
  clearLoginTimestamp();
  const now = 1_700_100_000_000;
  const oldSignIn = now - 25 * 60 * 60 * 1000; // 25h ago
  const status = getLoginExpiryStatus({
    email: 'legacy@example.com',
    fallbackSignInTimeMs: oldSignIn,
    now,
  });
  assert.equal(status.isExpired, true);
  assert.equal(status.loggedInAt, oldSignIn);
});

test('formatRemainingSessionBengali formats Bengali duration strings accurately', () => {
  assert.equal(formatRemainingSessionBengali(0), 'মেয়াদ শেষ');
  assert.equal(formatRemainingSessionBengali(2 * 60 * 60 * 1000 + 15 * 60 * 1000), '২ ঘণ্টা ১৫ মিনিট');
  assert.equal(formatRemainingSessionBengali(45 * 60 * 1000), '৪৫ মিনিট');
});
