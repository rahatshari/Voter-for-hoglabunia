import { Voter } from '../types';

export function normalizeBengaliText(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .normalize('NFC')
    .replace(/য\u09BC/g, 'য়')
    .replace(/ড\u09BC/g, 'ড়')
    .replace(/ঢ\u09BC/g, 'ঢ়');
}

export function convertToEnglishNumbers(str: string | number | undefined | null): string {
  if (str === undefined || str === null) return '';
  const numMap: Record<string, string> = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
  };
  return String(str).replace(/[০-৯]/g, match => numMap[match] || match);
}

export function convertToBengaliNumbers(str: string | number | undefined | null): string {
  if (str === undefined || str === null) return '';
  const numMap: Record<string, string> = {
    '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
    '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯'
  };
  return String(str).replace(/[0-9]/g, match => numMap[match] || match);
}

export function formatDobInput(input: string): string {
  const bengaliInput = convertToBengaliNumbers(input);
  const cleaned = bengaliInput.replace(/[^০-৯]/g, '');
  let formatted = '';

  if (cleaned.length > 0) formatted += cleaned.substring(0, 2);
  if (cleaned.length > 2) formatted += '/' + cleaned.substring(2, 4);
  if (cleaned.length > 4) formatted += '/' + cleaned.substring(4, 8);

  return formatted;
}

export function calculateAge(dobStr: string | undefined | null): string {
  if (!dobStr || dobStr === '-') return '';
  const engDob = convertToEnglishNumbers(dobStr);
  const parts = engDob.split('/');
  if (parts.length !== 3) return '';

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return '';

  const birthDate = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  if (isNaN(age) || age < 0) return '';
  return `(বয়স: ${convertToBengaliNumbers(age)} বছর)`;
}

export function isMigrated(voter: Voter): boolean {
  if (!voter) return false;
  if (voter._isMigrated !== undefined) return voter._isMigrated;

  const name = String(voter.name || '').toLowerCase();
  if (
    name.includes('মাইগ্রেট') ||
    name.includes('মাইগ্রেটেড') ||
    name.includes('কর্তন') ||
    name.includes('কর্তিত')
  ) {
    return true;
  }

  const text = (
    name + ' ' +
    (voter.fatherName || '') + ' ' +
    (voter.address || '') + ' ' +
    (voter.profession || '') + ' ' +
    (voter.remarks || '')
  ).toLowerCase();

  return (
    text.includes('মাইগ্রেট') ||
    text.includes('মাইগ্রেটেড') ||
    text.includes('কর্তিত') ||
    text.includes('কর্তন')
  );
}

export function prepareVoter(voter: Voter, villageFallback = ''): Voter {
  if (voter._prepared) return voter;

  const villageName = voter.villageName || villageFallback;
  const migrated = isMigrated(voter);

  const rawDisplayName = voter.name || (migrated ? 'মাইগ্রেট হয়েছে' : '');
  const normName = normalizeBengaliText(rawDisplayName.toLowerCase());
  const normFather = normalizeBengaliText((voter.fatherName || '').toLowerCase());
  const normMother = normalizeBengaliText((voter.motherName || '').toLowerCase());
  const normDob = convertToEnglishNumbers(voter.dob || '');
  const normSerial = convertToEnglishNumbers(voter.serialNo || '');
  const age = calculateAge(voter.dob);
  const profession = (voter.profession || '').trim();
  const gender = (voter.gender || 'পুরুষ').trim();

  return {
    ...voter,
    villageName,
    _isMigrated: migrated,
    _normName: normName,
    _normFather: normFather,
    _normMother: normMother,
    _normDob: normDob,
    _normSerial: normSerial,
    _age: age,
    _profession: profession,
    _gender: gender,
    _prepared: true,
  };
}
