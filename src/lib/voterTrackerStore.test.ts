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
      serialNo: '০১৫',
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

test('filterAndSortVoters supports omni-search, serial ranges, age groups, and sorting', () => {
  clearAllVoterAnnotations();

  // Omni multi-token search (father + profession)
  const omniRes = filterAndSortVoters(
    sampleVoters,
    {
      omni: 'জলিল ছাত্রী',
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
  assert.equal(omniRes.length, 1);
  assert.equal(omniRes[0].name, 'তানজিলা আক্তার');

  // Serial range filter
  const rangeRes = filterAndSortVoters(
    sampleVoters,
    {
      omni: '১-১০',
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
  assert.equal(rangeRes.length, 1);
  assert.equal(rangeRes[0].serialNo, '০০১');

  // Youth ageGroup filter (18-25)
  const youthRes = filterAndSortVoters(
    sampleVoters,
    {
      omni: '',
      serial: '',
      name: '',
      father: '',
      mother: '',
      dob: '',
      profession: '',
      gender: '',
      ageGroup: 'youth',
    },
    { fullList: false, stats: false, migrated: false }
  );
  assert.equal(youthRes.length, 1);
  assert.equal(youthRes[0].name, 'তানজিলা আক্তার');

  // Sort by serial_desc
  const sortedDesc = filterAndSortVoters(
    sampleVoters,
    {
      omni: '',
      serial: '',
      name: '',
      father: '',
      mother: '',
      dob: '',
      profession: '',
      gender: '',
      sortBy: 'serial_desc',
    },
    { fullList: true, stats: false, migrated: false }
  );
  assert.equal(sortedDesc.length, 2);
  assert.equal(sortedDesc[0].serialNo, '০১৫');
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
  assert.equal(summary.totalActive, 2);
  assert.equal(summary.starredCount, 1);
  assert.equal(summary.votedCount, 1);
  assert.equal(summary.supporterCount, 1);
  assert.equal(summary.turnoutPercent, 50);

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
