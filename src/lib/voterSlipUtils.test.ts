import test from 'node:test';
import assert from 'node:assert';
import {
  clearSlipQueue,
  addToSlipQueue,
  removeFromSlipQueue,
  toggleVoterInSlipQueue,
  getSlipQueue,
  isVoterInSlipQueue,
  findFamilyMembers,
  searchVotersForSlipQueue,
  getAllCandidates,
  createNewCandidateTemplate,
  resetDefaultCandidates,
  renderSlipCardByStyleHTML,
  ELECTION_SYMBOLS_GALLERY,
  SLIP_DESIGN_STYLES,
  getDefaultPrintPrefs,
  saveDefaultPrintPrefs,
  DEFAULT_SLIP_FOOTER_TEXT,
} from './voterSlipUtils';
import { Voter, SlipDesignStyle } from '../types';

const sampleFamilyVoters: Voter[] = [
  {
    serialNo: '১০',
    name: 'মোঃ আব্দুল করিম হাওলাদার',
    fatherName: 'মৃত রমজান হাওলাদার',
    motherName: 'ফাতেমা বেগম',
    voterId: '1001',
    villageName: 'পাঠামারা',
    gender: 'পুরুষ',
  },
  {
    serialNo: '১৪৫',
    name: 'মোসাঃ রহিমা বেগম',
    fatherName: 'মোঃ আব্দুল করিম হাওলাদার',
    motherName: 'আয়শা খাতুন',
    voterId: '1002',
    villageName: 'পাঠামারা',
    gender: 'মহিলা',
  },
  {
    serialNo: '২৮৯',
    name: 'মোঃ রফিকুল ইসলাম',
    fatherName: 'মোঃ আব্দুল করিম হাওলাদার',
    motherName: 'মোসাঃ রহিমা বেগম',
    voterId: '1003',
    villageName: 'পাঠামারা',
    gender: 'পুরুষ',
  },
  {
    serialNo: '৪১২',
    name: 'মোঃ শফিকুল ইসলাম',
    fatherName: 'মৃত রমজান হাওলাদার',
    motherName: 'ফাতেমা বেগম',
    voterId: '1004',
    villageName: 'পাঠামারা',
    gender: 'পুরুষ',
  },
  {
    serialNo: '৫০০',
    name: 'জসিম উদ্দিন',
    fatherName: 'কাদের মোল্লা',
    motherName: 'সালমা বেগম',
    voterId: '2001',
    villageName: 'পাঠামারা',
    gender: 'পুরুষ',
  },
];

test('Slip Queue adds, checks, toggles, and removes voters accurately', () => {
  clearSlipQueue();
  assert.strictEqual(getSlipQueue().length, 0);

  addToSlipQueue(sampleFamilyVoters[0]);
  addToSlipQueue(sampleFamilyVoters[1]);
  assert.strictEqual(getSlipQueue().length, 2);
  assert.strictEqual(isVoterInSlipQueue(sampleFamilyVoters[0]), true);
  assert.strictEqual(isVoterInSlipQueue(sampleFamilyVoters[4]), false);

  // Toggle existing voter removes it
  const toggled = toggleVoterInSlipQueue(sampleFamilyVoters[0]);
  assert.strictEqual(toggled.added, false);
  assert.strictEqual(toggled.queue.length, 1);

  // Remove remaining
  removeFromSlipQueue(sampleFamilyVoters[1]);
  assert.strictEqual(getSlipQueue().length, 0);
});

test('findFamilyMembers discovers scattered family members by father, mother, or spouse/parent name', () => {
  const family = findFamilyMembers(sampleFamilyVoters[0], sampleFamilyVoters);
  assert.strictEqual(family.length, 3);
  const ids = family.map((f) => f.voterId);
  assert.ok(ids.includes('1002'));
  assert.ok(ids.includes('1003'));
  assert.ok(ids.includes('1004'));
  assert.ok(!ids.includes('2001'));
});

test('searchVotersForSlipQueue finds voters by serial, name, or father name', () => {
  const bySerial = searchVotersForSlipQueue('২৮৯', sampleFamilyVoters);
  assert.strictEqual(bySerial.length, 1);
  assert.strictEqual(bySerial[0].voterId, '1003');

  const byFather = searchVotersForSlipQueue('করিম হাওলাদার', sampleFamilyVoters);
  assert.ok(byFather.length >= 3);
});

test('Voter Card Studio provides 6 ready-made templates including Mirsharai Upazila Horse Card and supports custom creation', () => {
  const defaults = resetDefaultCandidates();
  assert.strictEqual(defaults.length, 6);
  assert.strictEqual(SLIP_DESIGN_STYLES.length, 6);
  assert.ok(ELECTION_SYMBOLS_GALLERY.length >= 10);

  const horseCard = defaults[0];
  assert.ok((horseCard.candidateName || '').includes('আতাউর রহমান'));
  assert.ok((horseCard.symbolName || '').includes('ঘোড়া'));
  assert.strictEqual(horseCard.designStyle, 'classic_voter_card');

  for (const cand of defaults) {
    assert.strictEqual(cand.footerCenterText, DEFAULT_SLIP_FOOTER_TEXT);
    assert.notStrictEqual(cand.cardBadgeText, 'ভোটার স্লিপ');
  }

  const created = createNewCandidateTemplate(horseCard);
  assert.ok(created.id.startsWith('custom_slip_'));
  assert.ok(getAllCandidates().length >= 6);
});

test('renderSlipCardByStyleHTML renders all 6 design styles with required footer text and no forced slip top badge', () => {
  const defaults = resetDefaultCandidates();
  const voter = sampleFamilyVoters[0];
  const allStyles: SlipDesignStyle[] = [
    'classic_voter_card',
    'upazila_horizontal',
    'poster_banner_card',
    'royal_framed_slip',
    'official_table_grid',
    'compact_thermal_slip',
  ];

  for (const cand of defaults) {
    const cName = cand.candidateName || cand.name || '';
    const vName = voter.name || '';
    const htmlAuto = renderSlipCardByStyleHTML(voter, { ...cand, voterInfoMode: 'auto' }, 'bw');
    assert.ok(htmlAuto.includes(vName));
    assert.ok(htmlAuto.includes(cName));
    assert.ok(htmlAuto.includes(DEFAULT_SLIP_FOOTER_TEXT));

    const htmlBlank = renderSlipCardByStyleHTML(voter, { ...cand, voterInfoMode: 'blank' }, 'bw');
    assert.ok(htmlBlank.includes(cName));
    assert.ok(htmlBlank.includes(DEFAULT_SLIP_FOOTER_TEXT));
  }

  for (const style of allStyles) {
    const html = renderSlipCardByStyleHTML(
      voter,
      { ...defaults[0], designStyle: style, cardBadgeText: '', footerCenterText: '' },
      'bw'
    );
    assert.ok(
      html.includes('ভোটকেন্দ্র আসার সময় স্লিপটি সঙ্গে আনবেন।'),
      `Style ${style} must include footer instruction`
    );
    assert.ok(!html.includes('classic-vertical-ribbon'), `Style ${style} must omit ribbon when empty`);
    assert.ok(!html.includes('rf-tag'), `Style ${style} must omit rf-tag when empty`);
  }
});

test('getDefaultPrintPrefs and saveDefaultPrintPrefs persist default print page preferences', () => {
  const initial = getDefaultPrintPrefs();
  assert.strictEqual(initial.pageLayoutMode, 'sheet4');
  assert.strictEqual(initial.colorMode, 'bw');

  saveDefaultPrintPrefs({ pageLayoutMode: 'sheet6', colorMode: 'color' });
  const updated = getDefaultPrintPrefs();
  assert.strictEqual(updated.pageLayoutMode, 'sheet6');
  assert.strictEqual(updated.colorMode, 'color');
});
