import test from 'node:test';
import assert from 'node:assert';
import {
  encodeEmailKey,
  decodeEmailKey,
  DEFAULT_ADMIN_EMAILS,
  parseCloudHistorySnapshot,
  buildAdminDataFromSnapshots,
} from './cloudStore';

test('encodeEmailKey replaces dots with commas for Firebase RTDB compliance', () => {
  assert.strictEqual(encodeEmailKey('rahatsharif10448@gmail.com'), 'rahatsharif10448@gmail,com');
  assert.strictEqual(encodeEmailKey('john.doe.test@company.co.uk'), 'john,doe,test@company,co,uk');
});

test('decodeEmailKey accurately reverses encoded email keys', () => {
  assert.strictEqual(decodeEmailKey('rahatsharif10448@gmail,com'), 'rahatsharif10448@gmail.com');
  assert.strictEqual(decodeEmailKey('john,doe,test@company,co,uk'), 'john.doe.test@company.co.uk');
});

test('DEFAULT_ADMIN_EMAILS contains primary admin emails', () => {
  assert.ok(DEFAULT_ADMIN_EMAILS.includes('rahatsharif10448@gmail.com'));
  assert.ok(DEFAULT_ADMIN_EMAILS.includes('rahatsharif504@gmail.com'));
});

test('parseCloudHistorySnapshot parses all historical Firebase RTDB records without truncation', () => {
  const raw: Record<string, any> = {};
  for (let i = 0; i < 150; i++) {
    raw[`hist_${i}`] = {
      id: `hist_${i}`,
      email: `worker${i}@gmail.com`,
      sessionId: `sess_${i}`,
      deviceName: 'Android Mobile',
      loginAt: 1700000000000 + i * 60000,
      logoutAt: 1700000000000 + i * 60000 + 300000,
      durationMinutes: 5,
      endReason: 'logout',
    };
  }
  const parsed = parseCloudHistorySnapshot(raw);
  assert.strictEqual(parsed.length, 150);
  assert.strictEqual(parsed[0].id, 'hist_149');
  assert.strictEqual(parsed[149].id, 'hist_0');
});

test('buildAdminDataFromSnapshots merges users, active sessions, unlimited history, and appConfig', () => {
  const now = Date.now();
  const data = buildAdminDataFromSnapshots({
    currentUserEmail: 'rahatsharif10448@gmail.com',
    adminEmailsRaw: { 'rahatsharif10448@gmail,com': true },
    usersRaw: {
      'worker1@gmail,com': {
        email: 'worker1@gmail.com',
        name: 'কর্মী ১',
        role: 'user',
        status: 'active',
        createdAt: now - 100000,
        totalMinutesSpent: 45,
      },
    },
    sessionsRaw: {
      sess_active: {
        sessionId: 'sess_active',
        email: 'worker1@gmail.com',
        deviceName: 'Android Mobile',
        registeredAt: now - 120000,
        lastActive: now - 5000,
      },
    },
    historyRaw: {
      h_old: {
        id: 'h_old',
        email: 'worker2@gmail.com',
        sessionId: 'sess_old',
        loginAt: now - 86400000 * 30,
        logoutAt: now - 86400000 * 30 + 600000,
        durationMinutes: 10,
        endReason: 'logout',
      },
      h_live: {
        id: 'h_live',
        email: 'worker1@gmail.com',
        sessionId: 'sess_active',
        loginAt: now - 120000,
        durationMinutes: 2,
        endReason: 'active',
      },
    },
    appConfigRaw: {
      maintenanceMode: false,
      maintenanceMessage: 'Test maint',
      announcementEnabled: true,
      announcementText: 'জরুরি বিজ্ঞপ্তি',
      enforceSingleDevice: true,
      allowSlipPrint: true,
    },
  });

  assert.strictEqual(data.isAdmin, true);
  assert.strictEqual(data.cloudConnected, true);
  assert.strictEqual(data.history.length, 2);
  assert.strictEqual(data.summary.onlineCount, 1);
  // worker2 from history is also surfaced in users so admins have control over everyone
  assert.ok(data.users.some((u) => u.email === 'worker2@gmail.com'));
  const w1 = data.users.find((u) => u.email === 'worker1@gmail.com');
  assert.strictEqual(w1?.isOnline, true);
  assert.strictEqual(data.appConfig?.announcementEnabled, true);
});

