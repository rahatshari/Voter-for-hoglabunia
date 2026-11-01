import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isEmailAdmin,
  formatCumulativeMinutesBengali,
  filterAppUsers,
  calculateAdminSummary,
  validateNewUserForm,
} from './adminUtils';
import { AppUserRecord } from '../types';

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

test('filterAppUsers filters by keyword and status', () => {
  const users: AppUserRecord[] = [
    {
      email: 'user1@gmail.com',
      name: 'হাসান',
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
  assert.equal(filterAppUsers(users, 'হাসান', 'all').length, 1);
  assert.equal(filterAppUsers(users, 'user2', 'all').length, 1);
});

test('calculateAdminSummary calculates KPI metrics accurately', () => {
  const users: AppUserRecord[] = [
    {
      email: 'u1@gmail.com',
      role: 'user',
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
