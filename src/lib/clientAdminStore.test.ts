import test from 'node:test';
import assert from 'node:assert';
import {
  buildClientAdminData,
  clientAddUser,
  clientToggleBlock,
  clientRegisterSession,
  loadStoredAdminEmails,
} from './clientAdminStore';

test('loadStoredAdminEmails contains default admin emails', () => {
  const emails = loadStoredAdminEmails();
  assert.ok(emails.includes('rahatsharif10448@gmail.com'));
  assert.ok(emails.includes('rahatsharif504@gmail.com'));
});

test('buildClientAdminData creates valid AdminPanelData for admin email', () => {
  const data = buildClientAdminData('rahatsharif10448@gmail.com');
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.isAdmin, true);
  assert.ok(data.users.length >= 2);
  assert.ok(data.summary.totalRegisteredUsers >= 2);
});

test('clientAddUser adds a new user correctly', () => {
  const newUser = clientAddUser({
    email: 'newworker@gmail.com',
    name: 'Worker 1',
    role: 'user',
  });
  assert.strictEqual(newUser.email, 'newworker@gmail.com');
  assert.strictEqual(newUser.role, 'user');
  assert.strictEqual(newUser.status, 'active');
});

test('clientToggleBlock changes user status', () => {
  clientToggleBlock('newworker@gmail.com', 'blocked');
  const data = buildClientAdminData('rahatsharif10448@gmail.com');
  const worker = data.users.find((u) => u.email === 'newworker@gmail.com');
  assert.ok(worker);
  assert.strictEqual(worker?.status, 'blocked');
});
