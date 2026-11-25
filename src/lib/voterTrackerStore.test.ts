import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addRecentSearch,
  buildVotersCsvContent,
  clearAllVoterAnnotations,
  clearRecentSearches,
  computeTrackerSummary,
  exportTrackerBackupJson,
  filterAndSortVoters,
  getRecentSearches,
  importTrackerBackupJson,
  matchesExactSerialOrRange,
  parseSerialRange,
  toggleVoterStarred,
  toggleVoterVoted,
  upsertVoterAnnotation,
} from './voterTrackerStore';
import { prepareVoter } from './bengaliUtils';
import { Voter } from '../types';

const sampleVoters: Voter[] = [
  prepareVoter(
    {
      serialNo: '০০১',
      name: 'আব্দুল জলিল শেখ',
      gender: 'পুরুষ',
      dob: '০৯/০৫/১৯৬০',
      fatherName: 'মো: নাজেম আলী শেখ',
      motherName: 'জামেনা বেগম',
      profession: 'কৃষক',
      voterId: '০১০৯৮৩৭৮৭৭২১',
      address: 'পাঠামারা',
    },
    'পাঠামারা'
  ),
  prepareVoter(
    {
      serialNo: '০২০',
      name: 'তানজিলা আক্তার',
      gender: 'মহিলা',
      dob: '১৫/০৩/২০০৪',
      fatherName: 'আব্দুল জলিল শেখ',
      motherName: 'রহিমা বেগম',
      profession: 'ছাত্রী',
      voterId: '০১০৯৮৩৭৮৭৭৯৯',
      address: 'পাঠামারা',
    },
    'পাঠামারা'
  ),
  prepareVoter(
    {
      serialNo: '১০০',
      name: 'মো: করিম উদ্দিন',
      gender: 'পুরুষ',
      dob: '১০/১০/১৯৮৫',
      fatherName: 'রহিম উদ্দিন',
      motherName: 'হালিমা বেগম',
      profession: 'ব্যবসা',
      voterId: '০১০৯৮৩৭৮৭৮১০',
      address: 'ছোট বাদুরা',
    },
    'ছোট বাদুরা'
  ),
  prepareVoter(
    {
      serialNo: '২০০',
      name: 'মো: সেলিম মিয়া',
      gender: 'পুরুষ',
      dob: '১২/১২/১৯৯০',
      fatherName: 'কাদের মিয়া',
      motherName: 'আছিয়া বেগম',
      profession: 'চাকরি',
      voterId: '০১০৯৮৩৭৮৭৯২০',
      address: 'ছোট বাদুরা',
    },
    'ছোট বাদুরা'
  ),
  prepareVoter(
    {
      serialNo: '০২৫',
      name: 'মো: রফিকুল ইসলাম (কর্তিত)',
      gender: 'পুরুষ',
      dob: '০১/০১/১৯৮০',
      fatherName: 'করিম শেখ',
      motherName: 'সালমা বেগম',
      profession: 'ব্যবসা',
      voterId: '০১০৯৮৩৭৮৭৮০০',
      address: 'ছোট বাদুরা',
    },
    'ছোট বাদুরা'
  ),
];

test('parseSerialRange parses Bengali and English serial ranges accurately', () => {
  assert.deepEqual(parseSerialRange('১-২০'), { min: 1, max: 20 });
  assert.deepEqual(parseSerialRange('10 - 50'), { min: 10, max: 50 });
  assert.equal(parseSerialRange('আব্দুল'), null);
});

test('Exact serial number search: ১ matches ONLY 1 (NOT 100), ২০ matches ONLY 20 (NOT 200)', () => {
  assert.equal(matchesExactSerialOrRange(sampleVoters[0], '১'), true);
  assert.equal(matchesExactSerialOrRange(sampleVoters[2], '১'), false); // ১০০ must NOT match ১!
  assert.equal(matchesExactSerialOrRange(sampleVoters[1], '২০'), true);
  assert.equal(matchesExactSerialOrRange(sampleVoters[3], '২০'), false); // ২০০ must NOT match ২০!

  const resOne = filterAndSortVoters(
    sampleVoters,
    {
      searchField: 'serial',
      query: '১',
      serial: '',
      name: '',
      father: '',
      mother: '',
      dob: '',
      profession: '',
      gender: '',
    },
    { fullList: false, stats: false, migrated: false }
  );
  assert.equal(resOne.length, 1);
  assert.equal(resOne[0].serialNo, '০০১');

  const resTwenty = filterAndSortVoters(
    sampleVoters,
    {
      searchField: 'serial',
      query: '২০',
      serial: '',
      name: '',
      father: '',
      mother: '',
      dob: '',
      profession: '',
      gender: '',
    },
    { fullList: false, stats: false, migrated: false }
  );
  assert.equal(resTwenty.length, 1);
  assert.equal(resTwenty[0].serialNo, '০২০');
});

test('Single-field search strictly searches only the selected field without cross-field confusion', () => {
  clearAllVoterAnnotations();

  // Searching fatherName "জলিল" in 'name' mode only matches আব্দুল জলিল শেখ (NOT daughter তানজিলা আক্তার)
  const byNameOnly = filterAndSortVoters(
    sampleVoters,
    {
      searchField: 'name',
      query: 'জলিল',
      serial: '',
      name: '',
      father: '',
      mother: '',
      dob: '',
      profession: '',
      gender: '',
    },
    { fullList: false, stats: false, migrated: false }
  );
  assert.equal(byNameOnly.length, 1);
  assert.equal(byNameOnly[0].name, 'আব্দুল জলিল শেখ');

  // Switching searchField to 'father' with "জলিল" matches ONLY daughter তানজিলা আক্তার
  const byFatherOnly = filterAndSortVoters(
    sampleVoters,
    {
      searchField: 'father',
      query: 'জলিল',
      serial: '',
      name: '',
      father: '',
      mother: '',
      dob: '',
      profession: '',
      gender: '',
    },
    { fullList: false, stats: false, migrated: false }
  );
  assert.equal(byFatherOnly.length, 1);
  assert.equal(byFatherOnly[0].name, 'তানজিলা আক্তার');
});

test('Voter annotations toggle, summarize, export/import JSON, and generate CSV with BOM', () => {
  clearAllVoterAnnotations();

  const starRes = toggleVoterStarred(sampleVoters[0]);
  assert.equal(starRes.starred, true);

  const voteRes = toggleVoterVoted(sampleVoters[1]);
  assert.equal(voteRes.voted, true);

  upsertVoterAnnotation(sampleVoters[0], {
    supportTag: 'supporter',
    phone: '01700112233',
    note: 'উত্তর পাড়া',
  });

  const summary = computeTrackerSummary(sampleVoters);
  assert.equal(summary.totalActive, 4);
  assert.equal(summary.starredCount, 1);
  assert.equal(summary.votedCount, 1);
  assert.equal(summary.supporterCount, 1);
  assert.equal(summary.turnoutPercent, 25);

  const backupJson = exportTrackerBackupJson();
  clearAllVoterAnnotations();
  assert.equal(computeTrackerSummary(sampleVoters).starredCount, 0);

  const restored = importTrackerBackupJson(backupJson);
  assert.equal(restored.success, true);
  assert.equal(restored.count, 2);
  assert.equal(computeTrackerSummary(sampleVoters).starredCount, 1);

  const csv = buildVotersCsvContent(sampleVoters.slice(0, 2));
  assert.equal(csv.startsWith('\uFEFF'), true);
  assert.equal(csv.includes('আব্দুল জলিল শেখ'), true);
  assert.equal(csv.includes('ভোট দিয়েছেন'), true);
});

test('Recent searches deduplicate and preserve order', () => {
  clearRecentSearches();
  addRecentSearch('জলিল');
  addRecentSearch('তানজিলা');
  addRecentSearch('জলিল');
  assert.deepEqual(getRecentSearches(), ['জলিল', 'তানজিলা']);
});
