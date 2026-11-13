import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isEmailAdmin,
  formatCumulativeMinutesBengali,
  filterAppUsers,
  calculateAdminSummary,
  validateNewUserForm,
  normalizeHistoryRecord,
  mergeHistoryRecords,
  filterHistoryRecords,
  computeHistoryStats,
  exportHistoryToCsv,
} from './adminUtils';
import { AppUserRecord, SessionHistoryItem } from '../types';

test('isEmailAdmin properly checks admin permissions', () => {
  const admins = ['rahatsharif10448@gmail.com', 'admin2@gmail.com'];
  assert.equal(isEmailAdmin('rahatsharif10448@gmail.com', admins), true);
  assert.equal(isEmailAdmin('RAHATSHARIF10448@GMAIL.COM ', admins), true);
  assert.equal(isEmailAdmin('admin2@gmail.com', admins), true);
  assert.equal(isEmailAdmin('normaluser@gmail.com', admins), false);
  assert.equal(isEmailAdmin('', admins), false);
  assert.equal(isEmailAdmin(null, admins), false);
});

test('formatCumulativeMinutesBengali formats minutes and hours in Bengali', () => {
  assert.equal(formatCumulativeMinutesBengali(0), '০ মিনিট');
  assert.equal(formatCumulativeMinutesBengali(45), '৪৫ মিনিট');
  assert.equal(formatCumulativeMinutesBengali(60), '১ ঘন্টা (৬০ মিনিট)');
  assert.equal(formatCumulativeMinutesBengali(150), '২ ঘন্টা ৩০ মিনিট (১৫০ মিনিট)');
});

test('filterAppUsers filters by keyword, status, role, phone and notes', () => {
  const users: AppUserRecord[] = [
    {
      email: 'user1@gmail.com',
      name: 'হাসান',
      phone: '01711000111',
      notes: '৩ নং ওয়ার্ড',
      role: 'user',
      status: 'active',
      createdAt: 1000,
      totalMinutesSpent: 20,
      isOnline: true,
    },
    {
      email: 'user2@gmail.com',
      name: 'করিম',
      role: 'user',
      status: 'blocked',
      createdAt: 2000,
      totalMinutesSpent: 50,
      isOnline: false,
    },
    {
      email: 'admin@gmail.com',
      name: 'অ্যাডমিন',
      role: 'admin',
      status: 'active',
      createdAt: 3000,
      totalMinutesSpent: 100,
      isOnline: false,
    },
  ];

  assert.equal(filterAppUsers(users, '', 'all').length, 3);
  assert.equal(filterAppUsers(users, '', 'active').length, 2);
  assert.equal(filterAppUsers(users, '', 'blocked').length, 1);
  assert.equal(filterAppUsers(users, '', 'online').length, 1);
  assert.equal(filterAppUsers(users, '', 'admin').length, 1);
  assert.equal(filterAppUsers(users, 'হাসান', 'all').length, 1);
  assert.equal(filterAppUsers(users, '01711000111', 'all').length, 1);
  assert.equal(filterAppUsers(users, 'ওয়ার্ড', 'all').length, 1);
});

test('calculateAdminSummary calculates KPI metrics accurately', () => {
  const users: AppUserRecord[] = [
    {
      email: 'u1@gmail.com',
      role: 'admin',
      status: 'active',
      createdAt: 1,
      totalMinutesSpent: 30,
    },
    {
      email: 'u2@gmail.com',
      role: 'user',
      status: 'blocked',
      createdAt: 2,
      totalMinutesSpent: 70,
    },
  ];

  const summary = calculateAdminSummary(users, 1);
  assert.equal(summary.totalRegisteredUsers, 2);
  assert.equal(summary.blockedCount, 1);
  assert.equal(summary.adminCount, 1);
  assert.equal(summary.onlineCount, 1);
  assert.equal(summary.totalCumulativeMinutes, 100);
  assert.equal(summary.avgMinutesPerUser, 50);
});

test('validateNewUserForm validates email and password rules', () => {
  assert.equal(validateNewUserForm('').isValid, false);
  assert.equal(validateNewUserForm('not-an-email').isValid, false);
  assert.equal(validateNewUserForm('valid@gmail.com').isValid, true);
  assert.equal(validateNewUserForm('valid@gmail.com', '123').isValid, false);
  assert.equal(validateNewUserForm('valid@gmail.com', '123456').isValid, true);
});

test('normalizeHistoryRecord handles varied RTDB schemas and preserves records', () => {
  const rec = normalizeHistoryRecord('hist_legacy_1', {
    userEmail: 'TestUser@GMAIL.com',
    timestamp: '1700000000000',
    deviceName: 'Android Mobile',
  });
  assert.ok(rec);
  assert.equal(rec?.id, 'hist_legacy_1');
  assert.equal(rec?.email, 'testuser@gmail.com');
  assert.equal(rec?.loginAt, 1700000000000);
  assert.equal(rec?.endReason, 'active');

  assert.equal(normalizeHistoryRecord('bad', null), null);
  assert.equal(normalizeHistoryRecord('no_email', { loginAt: 1000 }), null);
});

test('mergeHistoryRecords deduplicates, prefers finalized rows, and keeps unlimited history', () => {
  const listA: SessionHistoryItem[] = Array.from({ length: 120 }, (_, i) => ({
    id: `old_${i}`,
    email: `user${i}@gmail.com`,
    sessionId: `sess_${i}`,
    loginAt: 1700000000000 + i * 10000,
    logoutAt: 1700000000000 + i * 10000 + 60000,
    durationMinutes: 1,
    endReason: 'logout',
  }));
  const listB: SessionHistoryItem[] = [
    {
      id: 'shared_1',
      email: 'dup@gmail.com',
      sessionId: 'sess_dup',
      loginAt: 1800000000000,
      durationMinutes: 1,
      endReason: 'active',
    },
  ];
  const listC: SessionHistoryItem[] = [
    {
      id: 'shared_1',
      email: 'dup@gmail.com',
      sessionId: 'sess_dup',
      loginAt: 1800000000000,
      logoutAt: 1800000600000,
      durationMinutes: 10,
      endReason: 'logout',
    },
  ];

  const merged = mergeHistoryRecords(listA, listB, listC);
  assert.equal(merged.length, 121);
  assert.equal(merged[0].id, 'shared_1');
  assert.equal(merged[0].endReason, 'logout');
  assert.equal(merged[0].durationMinutes, 10);
});

test('filterHistoryRecords filters by email, reason, date presets, and search query', () => {
  const now = new Date('2026-11-10T15:00:00Z').getTime();
  const records: SessionHistoryItem[] = [
    {
      id: 'h1',
      email: 'alice@gmail.com',
      sessionId: 's1',
      deviceName: 'Android Mobile',
      loginAt: now - 1000 * 60 * 30, // today
      durationMinutes: 30,
      endReason: 'active',
    },
    {
      id: 'h2',
      email: 'bob@gmail.com',
      sessionId: 's2',
      deviceName: 'Windows PC',
      loginAt: now - 1000 * 60 * 60 * 24 * 3, // 3 days ago
      logoutAt: now - 1000 * 60 * 60 * 24 * 3 + 600000,
      durationMinutes: 10,
      endReason: 'kicked',
    },
    {
      id: 'h3',
      email: 'alice@gmail.com',
      sessionId: 's3',
      deviceName: 'Android Mobile',
      loginAt: now - 1000 * 60 * 60 * 24 * 45, // 45 days ago
      logoutAt: now - 1000 * 60 * 60 * 24 * 45 + 1200000,
      durationMinutes: 20,
      endReason: 'logout',
    },
  ];

  assert.equal(filterHistoryRecords(records, { now }).length, 3);
  assert.equal(filterHistoryRecords(records, { emailFilter: 'alice@gmail.com', now }).length, 2);
  assert.equal(filterHistoryRecords(records, { reasonFilter: 'active', now }).length, 1);
  assert.equal(filterHistoryRecords(records, { reasonFilter: 'kicked', now }).length, 1);
  assert.equal(filterHistoryRecords(records, { datePreset: 'today', now }).length, 1);
  assert.equal(filterHistoryRecords(records, { datePreset: '7days', now }).length, 2);
  assert.equal(filterHistoryRecords(records, { query: 'windows', now }).length, 1);

  const stats = computeHistoryStats(records, now);
  assert.equal(stats.totalCount, 3);
  assert.equal(stats.todayCount, 1);
  assert.equal(stats.activeCount, 1);
  assert.equal(stats.distinctUsers, 2);
  assert.equal(stats.totalDurationMinutes, 60);

  const csv = exportHistoryToCsv(records);
  assert.ok(csv.startsWith('\uFEFFRecord ID,Email,Device'));
  assert.ok(csv.includes('alice@gmail.com'));
  assert.ok(csv.includes('বর্তমানে চলমান'));
});

