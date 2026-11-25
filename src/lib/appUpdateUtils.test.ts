import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_UPDATE_PREFS,
  MANDATORY_UPDATE_GRACE_MS,
  clearUpdateGraceRecord,
  compareVersionStrings,
  formatBytesBengali,
  formatRemainingGraceBengali,
  getUpdateGraceStatus,
  isRemoteVersionNewer,
  loadPendingUpdateCache,
  loadUpdateFirstSeen,
  loadUpdatePrefs,
  normalizeGitHubRelease,
  normalizeVersionJson,
  parseVersionCodeFromTag,
  savePendingUpdateCache,
  saveUpdatePrefs,
  shouldShowAutoUpdatePopup,
} from './appUpdateUtils';

test('parseVersionCodeFromTag parses patch and minor tags accurately', () => {
  assert.equal(parseVersionCodeFromTag('v1.0.0'), 100);
  assert.equal(parseVersionCodeFromTag('v1.0.15'), 115);
  assert.equal(parseVersionCodeFromTag('v1.2.3'), 10203);
});

test('isRemoteVersionNewer detects newer versions and avoids downgrades', () => {
  assert.equal(isRemoteVersionNewer(105, '1.0.5', 100, '1.0.0'), true);
  assert.equal(isRemoteVersionNewer(20000, '2.0.0', 115, '1.0.15'), true);
  assert.equal(isRemoteVersionNewer(100, '1.0.0', 105, '1.0.5'), false);
  assert.equal(isRemoteVersionNewer(105, '1.0.5', 105, '1.0.5'), false);
  assert.equal(compareVersionStrings('1.1.0', '1.0.99'), 1);
});

test('shouldShowAutoUpdatePopup respects user auto-update toggles, skip list, and global admin lock', () => {
  const remote = {
    versionCode: 108,
    versionName: '1.0.8',
    apkUrl: 'https://example.com/app.apk',
    releaseNotes: 'Bug fixes',
  };

  assert.equal(
    shouldShowAutoUpdatePopup({
      remote,
      prefs: { ...DEFAULT_UPDATE_PREFS, autoCheckEnabled: true, autoNotifyEnabled: true },
      globalAutoUpdateEnabled: true,
    }),
    true
  );

  // User turned off auto-check
  assert.equal(
    shouldShowAutoUpdatePopup({
      remote,
      prefs: { ...DEFAULT_UPDATE_PREFS, autoCheckEnabled: false, autoNotifyEnabled: true },
      globalAutoUpdateEnabled: true,
    }),
    false
  );

  // User turned off auto-notification popup
  assert.equal(
    shouldShowAutoUpdatePopup({
      remote,
      prefs: { ...DEFAULT_UPDATE_PREFS, autoCheckEnabled: true, autoNotifyEnabled: false },
      globalAutoUpdateEnabled: true,
    }),
    false
  );

  // Admin disabled global auto-update
  assert.equal(
    shouldShowAutoUpdatePopup({
      remote,
      prefs: { ...DEFAULT_UPDATE_PREFS, autoCheckEnabled: true, autoNotifyEnabled: true },
      globalAutoUpdateEnabled: false,
    }),
    false
  );

  // Skipped specific version
  assert.equal(
    shouldShowAutoUpdatePopup({
      remote,
      prefs: { ...DEFAULT_UPDATE_PREFS, skippedVersion: '1.0.8' },
      globalAutoUpdateEnabled: true,
    }),
    false
  );

  // Dismissed in current session
  assert.equal(
    shouldShowAutoUpdatePopup({
      remote,
      prefs: DEFAULT_UPDATE_PREFS,
      globalAutoUpdateEnabled: true,
      sessionDismissedVersion: '1.0.8',
    }),
    false
  );
});

test('saveUpdatePrefs and loadUpdatePrefs persist preferences safely', () => {
  saveUpdatePrefs({ autoCheckEnabled: false, autoNotifyEnabled: false, skippedVersion: '1.0.9' }, true);
  const loaded = loadUpdatePrefs();
  assert.equal(loaded.autoCheckEnabled, false);
  assert.equal(loaded.autoNotifyEnabled, false);
  assert.equal(loaded.skippedVersion, '1.0.9');

  // Restore defaults
  saveUpdatePrefs(DEFAULT_UPDATE_PREFS, true);
  assert.equal(loadUpdatePrefs().autoCheckEnabled, true);
});

test('normalizeGitHubRelease and normalizeVersionJson handle release payloads cleanly', () => {
  const gh = normalizeGitHubRelease({
    tag_name: 'v1.0.12',
    body: 'New features added',
    assets: [{ name: 'Union-Voter-App.apk', browser_download_url: 'https://gh.test/app.apk' }],
  });
  assert.ok(gh);
  assert.equal(gh.versionCode, 112);
  assert.equal(gh.versionName, '1.0.12');
  assert.equal(gh.apkUrl, 'https://gh.test/app.apk');

  const jsonVer = normalizeVersionJson({
    versionCode: 114,
    versionName: '1.0.14',
    releaseNotes: 'Hotfix',
  });
  assert.ok(jsonVer);
  assert.equal(jsonVer.versionCode, 114);
  assert.equal(jsonVer.versionName, '1.0.14');
});

test('getUpdateGraceStatus allows 3 hours grace then enforces mandatory update', () => {
  clearUpdateGraceRecord();
  const remote = {
    versionCode: 120,
    versionName: '1.0.20',
    apkUrl: 'https://gh.test/v1.0.20.apk',
    releaseNotes: 'Mandatory update after 3h',
  };

  const t0 = 1_700_000_000_000;
  const firstCheck = getUpdateGraceStatus({
    remote,
    installedCode: 100,
    installedName: '1.0.0',
    now: t0,
  });
  assert.equal(firstCheck.hasUpdate, true);
  assert.equal(firstCheck.isMandatory, false);
  assert.equal(firstCheck.remainingMs, MANDATORY_UPDATE_GRACE_MS);

  // Check at +2h 30m: still allowed
  const after2h30 = getUpdateGraceStatus({
    remote,
    installedCode: 100,
    installedName: '1.0.0',
    now: t0 + (2 * 60 + 30) * 60 * 1000,
  });
  assert.equal(after2h30.isMandatory, false);
  assert.equal(after2h30.remainingMs, 30 * 60 * 1000);

  // Check at +3h 1m: mandatory update triggered
  const after3h1m = getUpdateGraceStatus({
    remote,
    installedCode: 100,
    installedName: '1.0.0',
    now: t0 + MANDATORY_UPDATE_GRACE_MS + 60 * 1000,
  });
  assert.equal(after3h1m.hasUpdate, true);
  assert.equal(after3h1m.isMandatory, true);
  assert.equal(after3h1m.remainingMs, 0);

  // Verify pending update cache is persisted and clears cleanly
  assert.equal(loadPendingUpdateCache()?.versionName, '1.0.20');
  assert.equal(loadUpdateFirstSeen()?.firstDetectedAt, t0);
  clearUpdateGraceRecord();
  savePendingUpdateCache(null);
  assert.equal(loadPendingUpdateCache(), null);
  assert.equal(loadUpdateFirstSeen(), null);
});

test('formatRemainingGraceBengali and formatBytesBengali render clear Bengali labels', () => {
  assert.equal(formatRemainingGraceBengali(0), 'সময় শেষ (বাধ্যতামূলক)');
  assert.equal(formatRemainingGraceBengali(2 * 60 * 60 * 1000 + 45 * 60 * 1000), '২ ঘণ্টা ৪৫ মিনিট বাকি');
  assert.equal(formatBytesBengali(0), '০ KB');
  assert.equal(formatBytesBengali(5 * 1024 * 1024), '৫.০ MB');
});


test('normalizeApkDownloadUrl converts Google Drive and Dropbox share links into direct binary download URLs', async () => {
  const { normalizeApkDownloadUrl } = await import('./appUpdateUtils');
  assert.equal(
    normalizeApkDownloadUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing'),
    'https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOpQrStUv&export=download&confirm=t'
  );
  assert.equal(
    normalizeApkDownloadUrl('https://drive.google.com/open?id=9XyZ12345'),
    'https://drive.usercontent.google.com/download?id=9XyZ12345&export=download&confirm=t'
  );
  assert.equal(
    normalizeApkDownloadUrl('https://www.dropbox.com/scl/fi/abc/Hoglabunia-Voter-App.apk?rlkey=xyz&dl=0'),
    'https://www.dropbox.com/scl/fi/abc/Hoglabunia-Voter-App.apk?rlkey=xyz&dl=1'
  );
});
