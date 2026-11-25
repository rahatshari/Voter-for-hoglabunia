import {
  AppSearchFilters,
  AppSettings,
  SupportTagType,
  Voter,
  VoterAnnotation,
  VoterSortOption,
} from '../types';
import {
  calculateAge,
  convertToBengaliNumbers,
  convertToEnglishNumbers,
  isMigrated,
  normalizeBengaliText,
} from './bengaliUtils';
import { getVoterUniqueKey } from './voterSlipUtils';

const TRACKER_STORAGE_KEY = 'union_voter_campaign_tracker_v1';
const RECENT_SEARCHES_KEY = 'union_voter_recent_searches_v1';

export interface SupportTagMeta {
  id: Exclude<SupportTagType, ''>;
  label: string;
  shortLabel: string;
  badgeClass: string;
}

export const SUPPORT_TAGS_META: SupportTagMeta[] = [
  {
    id: 'supporter',
    label: 'নিশ্চিত সমর্থক',
    shortLabel: 'সমর্থক',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  {
    id: 'followup',
    label: 'যোগাযোগ প্রয়োজন',
    shortLabel: 'যোগাযোগ',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  {
    id: 'neutral',
    label: 'নিরপেক্ষ / অনিশ্চিত',
    shortLabel: 'নিরপেক্ষ',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-300',
  },
  {
    id: 'away',
    label: 'প্রবাসী / এলাকার বাইরে',
    shortLabel: 'প্রবাসী/বাইরে',
    badgeClass: 'bg-slate-200 text-slate-800 border-slate-300',
  },
  {
    id: 'elderly_care',
    label: 'প্রবীণ / বিশেষ সহায়তা',
    shortLabel: 'বিশেষ সহায়তা',
    badgeClass: 'bg-rose-100 text-rose-900 border-rose-300',
  },
];

const memoryFallback: Record<string, string> = {};

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch {}
  return memoryFallback[key] ?? null;
}

function safeSet(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
      return;
    }
  } catch {}
  memoryFallback[key] = val;
}

export function loadVoterAnnotations(): Record<string, VoterAnnotation> {
  try {
    const raw = safeGet(TRACKER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {}
  return {};
}

export function saveVoterAnnotations(map: Record<string, VoterAnnotation>): void {
  safeSet(TRACKER_STORAGE_KEY, JSON.stringify(map));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('voter_tracker_updated', { detail: map }));
  }
}

export function getVoterAnnotation(
  voter: Voter,
  map?: Record<string, VoterAnnotation>
): VoterAnnotation | undefined {
  const store = map || loadVoterAnnotations();
  return store[getVoterUniqueKey(voter)];
}

export function upsertVoterAnnotation(
  voter: Voter,
  patch: Partial<Omit<VoterAnnotation, 'key' | 'updatedAt'>>
): Record<string, VoterAnnotation> {
  const map = { ...loadVoterAnnotations() };
  const key = getVoterUniqueKey(voter);
  const existing = map[key] || { key, updatedAt: Date.now() };
  const merged: VoterAnnotation = {
    ...existing,
    ...patch,
    key,
    updatedAt: Date.now(),
  };

  // Clean up empty records so storage stays lean
  const isEmpty =
    !merged.starred &&
    !merged.voted &&
    !merged.supportTag &&
    !(merged.phone && merged.phone.trim()) &&
    !(merged.note && merged.note.trim());

  if (isEmpty) {
    delete map[key];
  } else {
    map[key] = merged;
  }

  saveVoterAnnotations(map);
  return map;
}

export function toggleVoterStarred(voter: Voter): {
  map: Record<string, VoterAnnotation>;
  starred: boolean;
} {
  const map = loadVoterAnnotations();
  const key = getVoterUniqueKey(voter);
  const next = !Boolean(map[key]?.starred);
  const updated = upsertVoterAnnotation(voter, { starred: next });
  return { map: updated, starred: next };
}

export function toggleVoterVoted(voter: Voter): {
  map: Record<string, VoterAnnotation>;
  voted: boolean;
} {
  const map = loadVoterAnnotations();
  const key = getVoterUniqueKey(voter);
  const next = !Boolean(map[key]?.voted);
  const updated = upsertVoterAnnotation(voter, {
    voted: next,
    votedAt: next ? Date.now() : null,
  });
  return { map: updated, voted: next };
}

export function clearAllVoterAnnotations(): void {
  saveVoterAnnotations({});
}

export function exportTrackerBackupJson(): string {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    annotations: loadVoterAnnotations(),
  };
  return JSON.stringify(payload, null, 2);
}

export function importTrackerBackupJson(jsonText: string): {
  success: boolean;
  count: number;
  error?: string;
} {
  try {
    const parsed = JSON.parse(jsonText);
    const source = parsed?.annotations ?? parsed;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return { success: false, count: 0, error: 'অবৈধ ব্যাকআপ ফাইল ফরম্যাট' };
    }
    const existing = loadVoterAnnotations();
    const merged: Record<string, VoterAnnotation> = { ...existing };
    let count = 0;
    for (const [key, val] of Object.entries(source)) {
      if (val && typeof val === 'object') {
        merged[key] = {
          ...(val as VoterAnnotation),
          key,
          updatedAt: (val as VoterAnnotation).updatedAt || Date.now(),
        };
        count++;
      }
    }
    saveVoterAnnotations(merged);
    return { success: true, count };
  } catch {
    return { success: false, count: 0, error: 'ফাইলটি পড়া সম্ভব হয়নি' };
  }
}

export function computeTrackerSummary(
  allVoters: Voter[],
  annotationsMap?: Record<string, VoterAnnotation>
) {
  const map = annotationsMap || loadVoterAnnotations();
  let starredCount = 0;
  let votedCount = 0;
  let notesCount = 0;
  let supporterCount = 0;
  let followupCount = 0;
  let totalActive = 0;

  for (const v of allVoters) {
    const isMig = v._isMigrated !== undefined ? v._isMigrated : isMigrated(v);
    if (!isMig) totalActive++;
    const ann = map[getVoterUniqueKey(v)];
    if (!ann) continue;
    if (ann.starred) starredCount++;
    if (ann.voted) votedCount++;
    if ((ann.note && ann.note.trim()) || (ann.phone && ann.phone.trim())) notesCount++;
    if (ann.supportTag === 'supporter') supporterCount++;
    if (ann.supportTag === 'followup') followupCount++;
  }

  const turnoutPercent =
    totalActive > 0 ? Math.round((votedCount / totalActive) * 1000) / 10 : 0;

  return {
    totalActive,
    starredCount,
    votedCount,
    notesCount,
    supporterCount,
    followupCount,
    turnoutPercent,
  };
}

// ============================================================================
// RECENT SEARCHES
// ============================================================================

export function getRecentSearches(): string[] {
  try {
    const raw = safeGet(RECENT_SEARCHES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 8);
    }
  } catch {}
  return [];
}

export function addRecentSearch(term: string): string[] {
  const clean = term.trim();
  if (clean.length < 2) return getRecentSearches();
  const current = getRecentSearches().filter((item) => item !== clean);
  const updated = [clean, ...current].slice(0, 8);
  safeSet(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  return updated;
}

export function clearRecentSearches(): void {
  safeSet(RECENT_SEARCHES_KEY, JSON.stringify([]));
}

// ============================================================================
// NUMERIC AGE, SERIAL RANGE & SMART FILTERING / SORTING
// ============================================================================

export function getVoterNumericAge(dobStr: string | undefined | null): number | null {
  if (!dobStr || dobStr === '-') return null;
  const engDob = convertToEnglishNumbers(dobStr);
  const parts = engDob.split('/');
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  const birthDate = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  if (isNaN(age) || age < 0 || age > 130) return null;
  return age;
}

export function parseSerialRange(input: string): { min: number; max: number } | null {
  const eng = convertToEnglishNumbers(input.trim());
  const match = eng.match(/^(\d+)\s*[-–to]+\s*(\d+)$/i);
  if (!match) return null;
  const a = parseInt(match[1], 10);
  const b = parseInt(match[2], 10);
  if (isNaN(a) || isNaN(b)) return null;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

export function getNumericSerial(voter: Voter): number {
  const eng = voter._normSerial ?? convertToEnglishNumbers(voter.serialNo || '');
  const num = parseInt(eng.replace(/\D/g, ''), 10);
  return isNaN(num) ? -1 : num;
}

export function matchesExactSerialOrRange(voter: Voter, rawSerialQuery: string): boolean {
  const trimmed = rawSerialQuery.trim();
  if (!trimmed) return true;

  const range = parseSerialRange(trimmed);
  const voterNum = getNumericSerial(voter);
  if (voterNum < 0) return false;

  if (range) {
    return voterNum >= range.min && voterNum <= range.max;
  }

  const engDigits = convertToEnglishNumbers(trimmed).replace(/\D/g, '');
  if (!engDigits) return false;
  const targetNum = parseInt(engDigits, 10);
  if (isNaN(targetNum)) return false;

  // STRICT exact integer match: '১' (1) matches ONLY serial 1 (e.g. '০০১'), NEVER 10 or 100; '২০' matches ONLY 20, NEVER 200!
  return voterNum === targetNum;
}

export function hasActiveSearchCriteria(
  search: AppSearchFilters,
  settings: AppSettings
): boolean {
  return Boolean(
    (search.query && search.query.trim()) ||
      (search.omni && search.omni.trim()) ||
      search.serial.trim() ||
      search.name.trim() ||
      search.father.trim() ||
      search.mother.trim() ||
      search.dob.trim() ||
      (search.voterId && search.voterId.trim()) ||
      (search.address && search.address.trim()) ||
      search.profession.trim() ||
      search.gender.trim() ||
      search.ageGroup ||
      search.campaignFilter ||
      settings.fullList ||
      settings.migrated
  );
}

export function filterAndSortVoters(
  voters: Voter[],
  search: AppSearchFilters,
  settings: AppSettings,
  annotationsMap?: Record<string, VoterAnnotation>
): Voter[] {
  const activeField = search.searchField || 'name';
  const rawSingleQuery = (search.query || '').trim();

  // Map single-field mode cleanly to the chosen field ONLY
  const qSerialRaw =
    activeField === 'serial' && rawSingleQuery ? rawSingleQuery : search.serial.trim();
  const qName =
    activeField === 'name' && rawSingleQuery
      ? normalizeBengaliText(rawSingleQuery.toLowerCase())
      : normalizeBengaliText(search.name.trim().toLowerCase());
  const qFather =
    activeField === 'father' && rawSingleQuery
      ? normalizeBengaliText(rawSingleQuery.toLowerCase())
      : normalizeBengaliText(search.father.trim().toLowerCase());
  const qMother =
    activeField === 'mother' && rawSingleQuery
      ? normalizeBengaliText(rawSingleQuery.toLowerCase())
      : normalizeBengaliText(search.mother.trim().toLowerCase());
  const qDob =
    activeField === 'dob' && rawSingleQuery
      ? convertToEnglishNumbers(rawSingleQuery)
      : convertToEnglishNumbers(search.dob.trim());
  const qVoterId =
    activeField === 'voterId' && rawSingleQuery
      ? convertToEnglishNumbers(rawSingleQuery).replace(/\s+/g, '')
      : convertToEnglishNumbers((search.voterId || '').trim()).replace(/\s+/g, '');
  const qAddress =
    activeField === 'address' && rawSingleQuery
      ? normalizeBengaliText(rawSingleQuery.toLowerCase())
      : normalizeBengaliText((search.address || '').trim().toLowerCase());
  const qProf =
    activeField === 'profession' && rawSingleQuery
      ? rawSingleQuery
      : search.profession.trim();

  const qOmniRaw = (search.omni || '').trim();
  const qGender = search.gender.trim();
  const qAgeGroup = search.ageGroup || '';
  const qCampaign = search.campaignFilter || '';
  const sortBy: VoterSortOption = search.sortBy || 'serial_asc';

  const isEmpty =
    !qOmniRaw &&
    !qSerialRaw &&
    !qName &&
    !qFather &&
    !qMother &&
    !qDob &&
    !qVoterId &&
    !qAddress &&
    !qProf &&
    !qGender &&
    !qAgeGroup &&
    !qCampaign;

  if (isEmpty && !settings.fullList && !settings.migrated) {
    return [];
  }

  const annStore = annotationsMap || (qCampaign ? loadVoterAnnotations() : {});
  const omniSerialRange = qOmniRaw ? parseSerialRange(qOmniRaw) : null;
  const omniTokens =
    qOmniRaw && !omniSerialRange
      ? qOmniRaw
          .split(/\s+/)
          .filter(Boolean)
          .map((tok) => ({
            norm: normalizeBengaliText(tok.toLowerCase()),
            eng: convertToEnglishNumbers(tok).toLowerCase(),
          }))
      : [];

  const filtered = voters.filter((voter) => {
    const vMig = voter._isMigrated !== undefined ? voter._isMigrated : isMigrated(voter);
    if (settings.migrated && !vMig) return false;
    if (!settings.migrated && vMig) return false;

    // Campaign status filter
    if (qCampaign) {
      const ann = annStore[getVoterUniqueKey(voter)];
      if (qCampaign === 'starred' && !ann?.starred) return false;
      if (qCampaign === 'voted' && !ann?.voted) return false;
      if (qCampaign === 'unvoted' && ann?.voted) return false;
      if (
        qCampaign === 'has_note' &&
        !((ann?.note && ann.note.trim()) || (ann?.phone && ann.phone.trim()) || ann?.supportTag)
      ) {
        return false;
      }
      if (qCampaign === 'supporter' && ann?.supportTag !== 'supporter') return false;
      if (qCampaign === 'followup' && ann?.supportTag !== 'followup') return false;
    }

    // Age group filter
    if (qAgeGroup) {
      const age = getVoterNumericAge(voter.dob);
      if (age === null) return false;
      if (qAgeGroup === 'youth' && (age < 18 || age > 25)) return false;
      if (qAgeGroup === 'working' && (age < 26 || age > 40)) return false;
      if (qAgeGroup === 'middle' && (age < 41 || age > 60)) return false;
      if (qAgeGroup === 'senior' && age <= 60) return false;
    }

    // Exact serial or explicit range (e.g. 1-20)
    if (qSerialRaw) {
      if (!matchesExactSerialOrRange(voter, qSerialRaw)) return false;
    } else if (omniSerialRange) {
      const numSerial = getNumericSerial(voter);
      if (numSerial < omniSerialRange.min || numSerial > omniSerialRange.max) return false;
    }

    // Legacy omni fallback if ever passed
    if (omniTokens.length > 0) {
      const vVoterId = convertToEnglishNumbers(voter.voterId || '').toLowerCase();
      const vDob = (voter._normDob ?? convertToEnglishNumbers(voter.dob || '')).toLowerCase();
      const vName = voter._normName ?? normalizeBengaliText((voter.name || '').toLowerCase());
      const vFather = voter._normFather ?? normalizeBengaliText((voter.fatherName || '').toLowerCase());
      const vMother = voter._normMother ?? normalizeBengaliText((voter.motherName || '').toLowerCase());
      const vVillage = normalizeBengaliText((voter.villageName || '').toLowerCase());
      const vProf = normalizeBengaliText((voter._profession || voter.profession || '').toLowerCase());
      const vAddr = normalizeBengaliText((voter.address || '').toLowerCase());

      for (const tok of omniTokens) {
        const isPureDigits = /^\d+$/.test(tok.eng);
        const serialExact = isPureDigits && getNumericSerial(voter) === parseInt(tok.eng, 10);
        const matched =
          serialExact ||
          (tok.eng && (vVoterId.includes(tok.eng) || vDob.includes(tok.eng))) ||
          (tok.norm &&
            (vName.includes(tok.norm) ||
              vFather.includes(tok.norm) ||
              vMother.includes(tok.norm) ||
              vVillage.includes(tok.norm) ||
              vProf.includes(tok.norm) ||
              vAddr.includes(tok.norm)));
        if (!matched) return false;
      }
    }

    if (qName) {
      const vName = voter._normName ?? normalizeBengaliText((voter.name || '').toLowerCase());
      if (!vName.includes(qName)) return false;
    }
    if (qFather) {
      const vFather = voter._normFather ?? normalizeBengaliText((voter.fatherName || '').toLowerCase());
      if (!vFather.includes(qFather)) return false;
    }
    if (qMother) {
      const vMother = voter._normMother ?? normalizeBengaliText((voter.motherName || '').toLowerCase());
      if (!vMother.includes(qMother)) return false;
    }
    if (qDob) {
      const vDob = voter._normDob ?? convertToEnglishNumbers(voter.dob || '');
      if (!vDob.includes(qDob)) return false;
    }
    if (qVoterId) {
      const vId = convertToEnglishNumbers(voter.voterId || '').replace(/\s+/g, '');
      if (!vId.includes(qVoterId)) return false;
    }
    if (qAddress) {
      const vAddr = normalizeBengaliText(
        `${voter.address || ''} ${voter.villageName || ''}`.toLowerCase()
      );
      if (!vAddr.includes(qAddress)) return false;
    }
    if (qProf) {
      const vProf = (voter._profession || voter.profession || '').trim();
      if (vProf !== qProf && !normalizeBengaliText(vProf.toLowerCase()).includes(normalizeBengaliText(qProf.toLowerCase()))) {
        return false;
      }
    }
    if (qGender) {
      const vGender = (voter._gender || voter.gender || '').trim();
      if (vGender !== qGender) return false;
    }

    return true;
  });

  if (sortBy === 'serial_asc') {
    return filtered;
  }

  const sorted = [...filtered];
  if (sortBy === 'serial_desc') {
    sorted.sort((a, b) => getNumericSerial(b) - getNumericSerial(a));
  } else if (sortBy === 'name_asc') {
    sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'bn'));
  } else if (sortBy === 'age_asc') {
    sorted.sort(
      (a, b) => (getVoterNumericAge(a.dob) ?? 999) - (getVoterNumericAge(b.dob) ?? 999)
    );
  } else if (sortBy === 'age_desc') {
    sorted.sort(
      (a, b) => (getVoterNumericAge(b.dob) ?? -1) - (getVoterNumericAge(a.dob) ?? -1)
    );
  }
  return sorted;
}

// ============================================================================
// SHARE FORMATTER & CSV EXPORTER
// ============================================================================

export function formatVoterShareText(voter: Voter): string {
  const ageText = calculateAge(voter.dob) ? ` ${calculateAge(voter.dob)}` : '';
  const lines = [
    `🗳️ *ইউনিয়ন ভোটার তথ্য*`,
    `━━━━━━━━━━━━━━━━━━`,
    `🔢 ক্রমিক নং: ${voter.serialNo || '-'}`,
    `👤 নাম: ${voter.name || '-'} (${voter.gender || '-'})`,
    `🪪 ভোটার নং: ${voter.voterId || '-'}`,
    `👨 পিতার নাম: ${voter.fatherName || '-'}`,
    `👩 মাতার নাম: ${voter.motherName || '-'}`,
    `📅 জন্ম তারিখ: ${voter.dob || '-'}${ageText}`,
    `💼 পেশা: ${voter.profession || '-'}`,
  ];
  if (voter.villageName) lines.push(`🏡 গ্রাম: ${voter.villageName}`);
  if (voter.address) lines.push(`📍 ঠিকানা: ${voter.address}`);
  if (isMigrated(voter)) lines.push(`🚫 স্ট্যাটাস: স্থানান্তরিত/কর্তিত`);
  return lines.join('\n');
}

function escapeCsvCell(val: string | undefined | null): string {
  const s = String(val ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

export function buildVotersCsvContent(
  voters: Voter[],
  annotationsMap?: Record<string, VoterAnnotation>
): string {
  const map = annotationsMap || loadVoterAnnotations();
  const header = [
    'ক্রমিক নং',
    'নাম',
    'লিঙ্গ',
    'ভোটার নং',
    'পিতার নাম',
    'মাতার নাম',
    'জন্ম তারিখ',
    'বয়স',
    'পেশা',
    'গ্রাম',
    'ঠিকানা',
    'ভোট স্ট্যাটাস',
    'ক্যাম্পেইন ট্যাগ',
    'মোবাইল নম্বর',
    'নোট',
  ];

  const rows = voters.map((v) => {
    const ann = map[getVoterUniqueKey(v)];
    const age = getVoterNumericAge(v.dob);
    const tagMeta = SUPPORT_TAGS_META.find((t) => t.id === ann?.supportTag);
    return [
      v.serialNo || '',
      v.name || '',
      v.gender || '',
      v.voterId || '',
      v.fatherName || '',
      v.motherName || '',
      v.dob || '',
      age !== null ? convertToBengaliNumbers(age) : '',
      v.profession || '',
      v.villageName || '',
      v.address || '',
      ann?.voted ? 'ভোট দিয়েছেন' : 'বাকি',
      tagMeta ? tagMeta.shortLabel : '',
      ann?.phone || '',
      ann?.note || '',
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  return '\uFEFF' + [header.map(escapeCsvCell).join(','), ...rows].join('\r\n');
}

export function downloadVotersCsv(voters: Voter[], titleLabel = 'voter-list'): void {
  const csv = buildVotersCsvContent(voters);
  const safeTitle = titleLabel.replace(/[^\u0980-\u09FFa-zA-Z0-9_-]+/g, '_');
  const fileName = `${safeTitle}_${voters.length}.csv`;
  import('./nativeBridge')
    .then(({ saveTextFileCrossPlatform }) => {
      saveTextFileCrossPlatform(csv, fileName, 'text/csv;charset=utf-8;');
    })
    .catch(() => {
      if (typeof document === 'undefined') return;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
}
