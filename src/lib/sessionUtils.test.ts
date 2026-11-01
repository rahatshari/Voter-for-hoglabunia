import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDurationBengali,
  formatTimeAgo,
  getDeviceDetails,
  computeSessionStats,
} from './sessionUtils';

test('formatDurationBengali formats zero or under 1 minute', () => {
  assert.equal(formatDurationBengali(0), '১ মিনিটের কম');
});

test('formatDurationBengali formats minutes under 1 hour in Bengali', () => {
  assert.equal(formatDurationBengali(5), '৫ মিনিট');
  assert.equal(formatDurationBengali(45), '৪৫ মিনিট');
});

test('formatDurationBengali formats exact hours and mixed hours-minutes', () => {
  assert.equal(formatDurationBengali(60), '১ ঘণ্টা');
  assert.equal(formatDurationBengali(120), '২ ঘণ্টা');
  assert.equal(formatDurationBengali(75), '১ ঘণ্টা ১৫ মিনিট');
});

test('formatTimeAgo returns expected Bengali strings for recent activity', () => {
  const now = 1000000;
  assert.equal(formatTimeAgo(now - 5000, now), 'এইমাত্র');
  assert.equal(formatTimeAgo(now - 30000, now), '৩০ সেকেন্ড আগে');
  assert.equal(formatTimeAgo(now - 300000, now), '৫ মিনিট আগে');
});

test('getDeviceDetails categorizes Android and iPhone properly', () => {
  const android = getDeviceDetails('Android Mobile');
  assert.equal(android.icon, '🤖');
  assert.equal(android.label, 'অ্যান্ড্রয়েড ফোন');

  const iphone = getDeviceDetails('iOS Device');
  assert.equal(iphone.icon, '🍎');
});

test('computeSessionStats calculates summary properly', () => {
  const activeUsers = [
    {
      sessionId: 's1',
      email: 'user1@gmail.com',
      registeredAt: 1000,
      lastActive: 2000,
      isOnline: true,
      durationMinutes: 10,
    },
    {
      sessionId: 's2',
      email: 'user2@gmail.com',
      registeredAt: 1000,
      lastActive: 2000,
      isOnline: false,
      durationMinutes: 20,
    },
  ];
  const history = [
    {
      id: 'h1',
      email: 'user1@gmail.com',
      sessionId: 's0',
      loginAt: 500,
      logoutAt: 900,
      durationMinutes: 30,
      endReason: 'logout' as const,
    },
  ];

  const stats = computeSessionStats(activeUsers, history);
  assert.equal(stats.totalDistinctEmails, 2);
  assert.equal(stats.onlineCount, 1);
  assert.equal(stats.totalRegisteredSessions, 2);
  assert.equal(stats.totalHistoryCount, 1);
  assert.equal(stats.avgDurationMinutes, 20); // (10 + 20 + 30) / 3 = 20
});
