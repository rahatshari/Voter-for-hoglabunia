import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearMemoryOfflineCacheForTest,
  hasValidVillagesData,
  loadVillagesFromOfflineCache,
  saveVillagesToOfflineCache,
  withTimeout,
} from './offlineVoterCache';
import { Voter } from '../types';

const sampleVoter: Voter = {
  serialNo: '0001',
  name: 'রহিম উদ্দিন',
  fatherName: 'করিম উদ্দিন',
  motherName: 'সখিনা বেগম',
  dob: '০১/০১/১৯৮৫',
  profession: 'কৃষক',
  gender: 'পুরুষ',
  villageName: 'পাঠামারা',
};

test('hasValidVillagesData validates non-empty village voter records', () => {
  assert.equal(hasValidVillagesData(null), false);
  assert.equal(hasValidVillagesData({}), false);
  assert.equal(hasValidVillagesData({ পাঠামারা: [] }), false);
  assert.equal(hasValidVillagesData({ পাঠামারা: [sampleVoter] }), true);
});

test('withTimeout resolves value promptly when promise settles before deadline', async () => {
  const result = await withTimeout(Promise.resolve('ok'), 500, 'fallback');
  assert.equal(result, 'ok');
});

test('withTimeout returns fallback value without hanging when promise stalls offline', async () => {
  const neverResolves = new Promise<string>(() => {});
  const start = Date.now();
  const result = await withTimeout(neverResolves, 40, 'offline-fallback');
  const elapsed = Date.now() - start;

  assert.equal(result, 'offline-fallback');
  assert.ok(elapsed < 400);
});

test('withTimeout returns fallback value when promise rejects', async () => {
  const result = await withTimeout(
    Promise.reject(new Error('network down')),
    500,
    'safe-fallback'
  );
  assert.equal(result, 'safe-fallback');
});

test('saveVillagesToOfflineCache and loadVillagesFromOfflineCache persist data via fallback store', async () => {
  clearMemoryOfflineCacheForTest();
  assert.equal(await loadVillagesFromOfflineCache(), null);

  const savedEmpty = await saveVillagesToOfflineCache({});
  assert.equal(savedEmpty, false);

  const payload = { পাঠামারা: [sampleVoter] };
  const saved = await saveVillagesToOfflineCache(payload);
  assert.equal(saved, true);

  const loaded = await loadVillagesFromOfflineCache();
  assert.deepEqual(loaded, payload);
});
