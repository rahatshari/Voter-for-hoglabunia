import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_UPDATE_PREFS,
  compareVersionStrings,
  isRemoteVersionNewer,
  loadUpdatePrefs,
  normalizeGitHubRelease,
  normalizeVersionJson,
  parseVersionCodeFromTag,
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
