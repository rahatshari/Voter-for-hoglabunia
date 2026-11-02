import test from 'node:test';
import assert from 'node:assert';
import {
  encodeEmailKey,
  decodeEmailKey,
  DEFAULT_ADMIN_EMAILS,
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
