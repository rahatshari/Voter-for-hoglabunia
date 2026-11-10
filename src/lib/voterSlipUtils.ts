import { CandidateProfile, SlipDesignStyle, Voter, VoterInfoFillMode } from '../types';
import { normalizeBengaliText, convertToEnglishNumbers } from './bengaliUtils';

// Clean SVG Data URI builder for built-in election symbols
function svgSymbolDataUri(svgContent: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">${svgContent}</svg>`
  )}`;
}

export interface ElectionSymbolPreset {
  id: string;
  name: string;
  callout: string;
  imageUrl: string;
}

export const ELECTION_SYMBOLS_GALLERY: ElectionSymbolPreset[] = [
  {
    id: 'horse',
    name: 'ঘোড়া',
    callout: 'ঘোড়া মার্কায় ভোট দিন',
    imageUrl: './symbol-horse.png',
  },
  {
    id: 'lock',
    name: 'তালা',
    callout: 'তালা মার্কায় ভোট দিন',
    imageUrl: './symbol-default.png',
  },
  {
    id: 'pineapple',
    name: 'আনারস',
    callout: 'আনারস মার্কায় ভোট দিন',
    imageUrl: svgSymbolDataUri(`
      <g fill="none" stroke="#111" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M60 12 L52 34 M60 12 L68 34 M42 18 L55 35 M78 18 L65 35 M34 28 L52 37 M86 28 L68 37" stroke-width="4.5"/>
        <ellipse cx="60" cy="72" rx="28" ry="34" fill="#f8fafc" stroke="#111" stroke-width="4.5"/>
        <path d="M38 52 L82 92 M34 68 L68 102 M52 40 L86 74 M82 52 L38 92 M86 68 L52 102 M68 40 L34 74" stroke-width="2.8"/>
      </g>
    `),
  },
  {
    id: 'motorcycle',
    name: 'মোটরসাইকেল',
    callout: 'মোটরসাইকেল মার্কায় ভোট দিন',
    imageUrl: svgSymbolDataUri(`
      <g fill="none" stroke="#111" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="28" cy="82" r="18"/>
        <circle cx="28" cy="82" r="6" fill="#111"/>
        <circle cx="92" cy="82" r="18"/>
        <circle cx="92" cy="82" r="6" fill="#111"/>
        <path d="M28 82 L50 54 L76 54 L92 82 M50 54 L42 38 L30 38 M76 54 L84 36 L72 34 M46 78 L72 78 L64 54"/>
      </g>
    `),
  },
  {
    id: 'football',
    name: 'ফুটবল',
    callout: 'ফুটবল মার্কায় ভোট দিন',
    imageUrl: svgSymbolDataUri(`
      <g fill="none" stroke="#111" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="60" cy="60" r="44" fill="#fff"/>
        <polygon points="60,40 78,53 71,74 49,74 42,53" fill="#111"/>
        <path d="M60 40 L60 16 M78 53 L101 44 M71 74 L86 95 M49 74 L34 95 M42 53 L19 44"/>
      </g>
    `),
  },
  {
    id: 'rooster',
    name: 'মোরগ',
    callout: 'মোরগ মার্কায় ভোট দিন',
    imageUrl: svgSymbolDataUri(`
      <g fill="none" stroke="#111" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M46 78 C30 78 22 62 28 46 C18 48 14 64 20 76 C28 90 50 92 68 84 C82 76 88 56 82 40 C80 34 74 30 68 32 C62 34 62 46 54 50 C46 54 38 48 46 78 Z" fill="#f8fafc"/>
        <path d="M74 30 C74 20 82 18 84 24 C88 20 94 24 90 30" stroke-width="3.5"/>
        <polygon points="88,36 98,40 88,44" fill="#111"/>
        <circle cx="78" cy="36" r="2.5" fill="#111"/>
        <path d="M54 88 L50 104 M44 104 L58 104 M68 86 L72 104 M64 104 L78 104"/>
      </g>
    `),
  },
  {
    id: 'tubewell',
    name: 'টিউবওয়েল',
    callout: 'টিউবওয়েল মার্কায় ভোট দিন',
    imageUrl: svgSymbolDataUri(`
      <g fill="none" stroke="#111" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="46" y="34" width="24" height="64" rx="3" fill="#f8fafc"/>
        <path d="M36 98 L84 98 M46 52 L28 52 L28 62 L46 62 M70 44 L102 26 M58 34 L58 22"/>
        <path d="M24 72 C20 80 28 84 24 92" stroke-width="3"/>
      </g>
    `),
  },
  {
    id: 'fan',
    name: 'বৈদ্যুতিক পাখা',
    callout: 'বৈদ্যুতিক পাখা মার্কায় ভোট দিন',
    imageUrl: svgSymbolDataUri(`
      <g fill="none" stroke="#111" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="60" cy="60" r="44"/>
        <circle cx="60" cy="60" r="10" fill="#111"/>
        <path d="M60 50 C48 24 72 24 60 50 Z" fill="#111"/>
        <path d="M68 65 C94 55 82 82 68 65 Z" fill="#111"/>
        <path d="M52 65 C38 82 26 55 52 65 Z" fill="#111"/>
      </g>
    `),
  },
  {
    id: 'book',
    name: 'বই',
    callout: 'বই মার্কায় ভোট দিন',
    imageUrl: svgSymbolDataUri(`
      <g fill="none" stroke="#111" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M60 32 C46 24 26 24 16 30 L16 88 C26 82 46 82 60 90 C74 82 94 82 104 88 L104 30 C94 24 74 24 60 32 Z" fill="#fff"/>
        <path d="M60 32 L60 90"/>
        <path d="M26 44 L48 46 M26 58 L48 60 M72 46 L94 44 M72 60 L94 58" stroke-width="3"/>
      </g>
    `),
  },
  {
    id: 'umbrella',
    name: 'ছাতা',
    callout: 'ছাতা মার্কায় ভোট দিন',
    imageUrl: svgSymbolDataUri(`
      <g fill="none" stroke="#111" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 62 C16 32 40 18 60 18 C80 18 104 32 104 62 C88 54 74 56 60 62 C46 56 32 54 16 62 Z" fill="#111"/>
        <path d="M60 12 L60 92 C60 102 46 102 46 92"/>
      </g>
    `),
  },
];

export interface SlipDesignStyleMeta {
  id: SlipDesignStyle;
  title: string;
  subtitle: string;
  badge: string;
}

export const SLIP_DESIGN_STYLES: SlipDesignStyleMeta[] = [
  {
    id: 'classic_voter_card',
    title: '১. ক্লাসিক ভোটার কার্ড (বাম পাশে ছবি ও মার্কা)',
    subtitle: 'বামে প্রার্থী ও মার্কা, ডানে ভোটার তথ্য ও নিচে ৩-কলাম কালো বার',
    badge: 'জনপ্রিয় কার্ড',
  },
  {
    id: 'upazila_horizontal',
    title: '২. আধুনিক ডুয়াল ব্যানার কার্ড (ডানে ছবি ও বামে মার্কা)',
    subtitle: 'বামে মার্কা, মাঝে কেন্দ্র ও ভোটার তথ্য, ডানে প্রার্থীর ছবি',
    badge: 'আধুনিক',
  },
  {
    id: 'poster_banner_card',
    title: '৩. পোস্টার ব্যানার স্লিপ (কালো হাইলাইট হেডার)',
    subtitle: 'উপরে কালো ব্যানারে প্রার্থীর নাম ও নিচে স্পষ্ট ভোটার বক্স',
    badge: 'পোস্টার স্টাইল',
  },
  {
    id: 'royal_framed_slip',
    title: '৪. রাজকীয় ডাবল-বর্ডার স্লিপ (যৌথ হেডার ফ্রেম)',
    subtitle: 'চারপাশে ডাবল বর্ডার, উপরে ছবি-শিরোনাম-মার্কা ও নিচে ভোটার ছক',
    badge: 'রাজকীয়',
  },
  {
    id: 'official_table_grid',
    title: '৫. অফিসিয়াল ছক ও বক্স টেবিল ডিজাইন',
    subtitle: 'প্রতিটি ভোটার তথ্য আলাদা ছক-কাটা ঘরের ভেতরে সাজানো',
    badge: 'অফিসিয়াল ছক',
  },
  {
    id: 'compact_thermal_slip',
    title: '৬. মিনি পকেট ও থার্মাল রিসিট ডিজাইন',
    subtitle: '৫৮/৮০ মিমি ব্লুটুথ প্রিন্টার এবং পকেট স্লিপের জন্য বিশেষ ডিজাইন',
    badge: 'থার্মাল/মিনি',
  },
];

export const DEFAULT_CANDIDATES: CandidateProfile[] = [
  {
    id: 'cand_ataur_horse_card',
    templateTitle: '১. চেয়ারম্যান ভোটার কার্ড (ঘোড়া মার্কা - ক্লাসিক)',
    designStyle: 'classic_voter_card',
    voterInfoMode: 'auto',
    name: 'আলহাজ্ব শেখ মোঃ আতাউর রহমান',
    candidateName: 'আলহাজ্ব শেখ মোঃ আতাউর রহমান',
    candidateSuffix: 'কে',
    postTitle: 'চেয়ারম্যান পদপ্রার্থী',
    candidateBadge: 'চেয়ারম্যান পদপ্রার্থী',
    religiousHeader: 'আল্লাহ্ সর্বশক্তিমান',
    cardBadgeText: 'ভোটার কার্ড',
    electionTitle: "আগামী ৮ মে'২৪ বুধবার উপজেলা পরিষদ নির্বাচনে",
    constituencyText: 'মিরসরাই উপজেলা আসন হতে',
    electionSubtitle: 'পরিচ্ছন্ন রাজনীতিবিদ ও শিক্ষানুরাগী',
    candidatePhotoUrl: './candidate-ataur.jpg',
    symbolName: 'ঘোড়া',
    symbolPhotoUrl: './symbol-horse.png',
    symbolCallout: 'ঘোড়া মার্কায় ভোট দিন',
    sloganText: 'সন্ত্রাস, মাদকমুক্ত, স্মার্ট ও ডিজিটাল মিরসরাই গড়ার সুযোগ দিন',
    pollingCenter: 'দারুল কোরআন সিনিয়র মাদ্রাসা',
    voterArea: 'পাঠামারা',
    wardNo: '০৭',
    footerLeftText: 'প্রচারে: মিরসরাই উপজেলার জনসাধারণ',
    footerCenterText: 'ভোট কেন্দ্রে আসার সময় দয়া করে কার্ডটি সঙ্গে আনবেন',
    footerRightText: 'মুদ্রণে: তিলোত্তমা মুদ্রণালয়, চট্টগ্রাম। ০১৯৭৯২৪২২৭৪',
    isCustom: false,
  },
  {
    id: 'cand_ismail_classic_card',
    templateTitle: '২. মেম্বার ভোটার কার্ড (তালা মার্কা - ক্লাসিক বাম ছবি)',
    designStyle: 'classic_voter_card',
    voterInfoMode: 'auto',
    name: 'মাওলানা মোঃ ইসমাইল',
    candidateName: 'মাওলানা মোঃ ইসমাইল',
    candidateSuffix: 'কে',
    postTitle: 'মেম্বার পদপ্রার্থী',
    candidateBadge: 'মেম্বার পদপ্রার্থী',
    religiousHeader: 'বিসমিল্লাহির রাহমানির রাহিম',
    cardBadgeText: 'ভোটার কার্ড',
    electionTitle: 'আসন্ন ইউনিয়ন পরিষদ নির্বাচনে',
    constituencyText: '০৭ নং ওয়ার্ড (পাঠামারা-ছোট বাদুরা) আসন হতে',
    electionSubtitle: 'সততা ও নিষ্ঠার সাথে গণমানুষের প্রিয় ও নিবেদিতপ্রাণ সেবক',
    candidatePhotoUrl: './candidate-default.jpg',
    symbolName: 'তালা',
    symbolPhotoUrl: './symbol-default.png',
    symbolCallout: 'তালা মার্কায় ভোট দিন',
    sloganText: 'আধুনিক, দুর্নীতিমুক্ত ও আদর্শ ওয়ার্ড গড়ার সুযোগ দিন',
    pollingCenter: 'দারুল কোরআন সিনিয়র মাদ্রাসা',
    voterArea: 'পাঠামারা',
    wardNo: '০৭',
    footerLeftText: 'প্রচারে: ০৭ নং ওয়ার্ডের সর্বস্তরের জনসাধারণ',
    footerCenterText: 'ভোট কেন্দ্রে আসার সময় দয়া করে কার্ডটি সঙ্গে আনবেন',
    footerRightText: 'সৌজন্যে: নির্বাচনী প্রচারণা কমিটি',
    isCustom: false,
  },
  {
    id: 'cand_ismail_pathamara',
    templateTitle: '৩. আধুনিক ডুয়াল ব্যানার স্লিপ (তালা মার্কা - ডানে ছবি)',
    designStyle: 'upazila_horizontal',
    voterInfoMode: 'auto',
    name: 'মাওলানা মোঃ ইসমাইল',
    candidateName: 'মাওলানা মোঃ ইসমাইল',
    candidateSuffix: 'কে',
    postTitle: 'মেম্বার পদপ্রার্থী',
    candidateBadge: 'মেম্বার প্রার্থী',
    religiousHeader: 'বিসমিল্লাহির রাহমানির রাহিম',
    cardBadgeText: 'ভোটার স্লিপ',
    electionTitle: 'আসন্ন ইউনিয়ন পরিষদ নির্বাচনে',
    constituencyText: '০৭ নং ওয়ার্ড আসন হতে',
    electionSubtitle: 'সততা ও নিষ্ঠার সাথে গণমানুষের প্রিয় মেম্বার প্রার্থী',
    candidatePhotoUrl: './candidate-default.jpg',
    symbolName: 'তালা',
    symbolPhotoUrl: './symbol-default.png',
    symbolCallout: 'তালা মার্কায় ভোট দিন',
    sloganText: 'আপনার মূল্যবান ভোট দিয়ে সেবা করার সুযোগ দিন',
    pollingCenter: 'দারুল কোরআন সিনিয়র মাদ্রাসা',
    voterArea: 'পাঠামারা',
    wardNo: '০৭',
    footerLeftText: 'প্রচারে: এলাকাবাসী',
    footerCenterText: 'ভোট কেন্দ্রে আসার সময় স্লিপটি সঙ্গে আনবেন',
    footerRightText: 'ওয়ার্ড নং: ০৭',
    isCustom: false,
  },
  {
    id: 'cand_pineapple_poster',
    templateTitle: '৪. পোস্টার ব্যানার স্লিপ (আনারস মার্কা - কালো ব্যানার)',
    designStyle: 'poster_banner_card',
    voterInfoMode: 'auto',
    name: 'আলহাজ্ব মোঃ রফিকুল ইসলাম',
    candidateName: 'আলহাজ্ব মোঃ রফিকুল ইসলাম',
    candidateSuffix: 'কে',
    postTitle: 'চেয়ারম্যান পদপ্রার্থী',
    candidateBadge: 'চেয়ারম্যান পদপ্রার্থী',
    religiousHeader: 'বিসমিল্লাহির রাহমানির রাহিম',
    cardBadgeText: 'ভোটার কার্ড',
    electionTitle: 'আসন্ন ইউনিয়ন পরিষদ সাধারণ নির্বাচনে',
    constituencyText: 'আদর্শ ইউনিয়ন পরিষদ আসন হতে',
    electionSubtitle: 'গরীব-দুঃখী মানুষের অকৃত্রিম বন্ধু ও সমাজসেবক',
    candidatePhotoUrl: './candidate-ataur.jpg',
    symbolName: 'আনারস',
    symbolPhotoUrl: ELECTION_SYMBOLS_GALLERY[2].imageUrl,
    symbolCallout: 'আনারস মার্কায় ভোট দিন',
    sloganText: 'উন্নয়ন ও শান্তির লক্ষ্যে আনারস মার্কায় আপনার মূল্যবান ভোট দিন',
    pollingCenter: 'দারুল কোরআন সিনিয়র মাদ্রাসা',
    voterArea: 'পাঠামারা',
    wardNo: '০৭',
    footerLeftText: 'প্রচারে: ইউনিয়নের সর্বস্তরের জনসাধারণ',
    footerCenterText: 'ভোট কেন্দ্রে আসার সময় কার্ডটি সঙ্গে আনবেন',
    footerRightText: 'নির্বাচনী প্রচার সেল',
    isCustom: false,
  },
  {
    id: 'cand_motorcycle_table',
    templateTitle: '৫. অফিসিয়াল ছক ভোটার কার্ড (মোটরসাইকেল মার্কা)',
    designStyle: 'official_table_grid',
    voterInfoMode: 'auto',
    name: 'মোঃ দেলোয়ার হোসেন',
    candidateName: 'মোঃ দেলোয়ার হোসেন',
    candidateSuffix: 'কে',
    postTitle: 'ভাইস চেয়ারম্যান পদপ্রার্থী',
    candidateBadge: 'ভাইস চেয়ারম্যান প্রার্থী',
    religiousHeader: 'আল্লাহ্ সর্বশক্তিমান',
    cardBadgeText: 'ভোটার স্লিপ',
    electionTitle: 'আসন্ন উপজেলা পরিষদ নির্বাচনে',
    constituencyText: 'উপজেলা ভাইস চেয়ারম্যান আসন হতে',
    electionSubtitle: 'তরুণ প্রজন্মের অহংকার ও শিক্ষানুরাগী ব্যক্তিত্ব',
    candidatePhotoUrl: './candidate-default.jpg',
    symbolName: 'মোটরসাইকেল',
    symbolPhotoUrl: ELECTION_SYMBOLS_GALLERY[3].imageUrl,
    symbolCallout: 'মোটরসাইকেল মার্কায় ভোট দিন',
    sloganText: 'স্মার্ট ও আধুনিক এলাকা গড়তে মোটরসাইকেল মার্কায় ভোট দিন',
    pollingCenter: 'দারুল কোরআন সিনিয়র মাদ্রাসা',
    voterArea: 'পাঠামারা',
    wardNo: '০৭',
    footerLeftText: 'প্রচারে: সর্বস্তরের জনসাধারণ',
    footerCenterText: 'ভোট কেন্দ্রে আসার সময় স্লিপটি সঙ্গে আনবেন',
    footerRightText: 'ওয়ার্ড নং: ০৭',
    isCustom: false,
  },
  {
    id: 'cand_football_royal',
    templateTitle: '৬. রাজকীয় ফ্রেম ভোটার স্লিপ (ফুটবল মার্কা)',
    designStyle: 'royal_framed_slip',
    voterInfoMode: 'auto',
    name: 'মোঃ শফিকুল আলম',
    candidateName: 'মোঃ শফিকুল আলম',
    candidateSuffix: 'কে',
    postTitle: 'মেম্বার পদপ্রার্থী',
    candidateBadge: 'মেম্বার পদপ্রার্থী',
    religiousHeader: 'বিসমিল্লাহির রাহমানির রাহিম',
    cardBadgeText: 'ভোটার কার্ড',
    electionTitle: 'আসন্ন ইউনিয়ন পরিষদ নির্বাচনে',
    constituencyText: '০৭ নং ওয়ার্ড আসন হতে',
    electionSubtitle: 'ন্যায়পরায়ণ ও জনদরদী সমাজসেবক',
    candidatePhotoUrl: './candidate-default.jpg',
    symbolName: 'ফুটবল',
    symbolPhotoUrl: ELECTION_SYMBOLS_GALLERY[4].imageUrl,
    symbolCallout: 'ফুটবল মার্কায় ভোট দিন',
    sloganText: 'সন্ত্রাস ও দুর্নীতিমুক্ত সমাজ গড়ার লক্ষ্যে ফুটবল মার্কায় ভোট দিন',
    pollingCenter: 'দারুল কোরআন সিনিয়র মাদ্রাসা',
    voterArea: 'পাঠামারা',
    wardNo: '০৭',
    footerLeftText: 'প্রচারে: ওয়ার্ডের সর্বস্তরের জনগণ',
    footerCenterText: 'ভোট কেন্দ্রে আসার সময় কার্ডটি সঙ্গে আনবেন',
    footerRightText: 'নির্বাচনী পরিচালনা কমিটি',
    isCustom: false,
  },
];

export const DEFAULT_SLIP_CONFIG = DEFAULT_CANDIDATES[0];

const CANDIDATES_STORAGE_KEY = 'union_candidates_list_v4';
const ACTIVE_CANDIDATE_ID_KEY = 'union_active_candidate_id_v4';
const SLIP_QUEUE_STORAGE_KEY = 'union_multi_voter_slip_queue_v1';

// Helper for safe localStorage in both browser and Node unit tests
const memoryFallback: Record<string, string> = {};
function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch {}
  return memoryFallback[key] ?? null;
}

function safeSetItem(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
      return;
    }
  } catch {}
  memoryFallback[key] = val;
}

export function getAllCandidates(): CandidateProfile[] {
  try {
    const raw = safeGetItem(CANDIDATES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse candidates list:', e);
  }
  safeSetItem(CANDIDATES_STORAGE_KEY, JSON.stringify(DEFAULT_CANDIDATES));
  safeSetItem(ACTIVE_CANDIDATE_ID_KEY, DEFAULT_CANDIDATES[0].id);
  return DEFAULT_CANDIDATES;
}

export function saveAllCandidates(candidates: CandidateProfile[]): void {
  try {
    safeSetItem(CANDIDATES_STORAGE_KEY, JSON.stringify(candidates));
  } catch (e) {
    console.warn('Failed to save candidates list:', e);
  }
}

export function getActiveCandidate(): CandidateProfile {
  const all = getAllCandidates();
  try {
    const activeId = safeGetItem(ACTIVE_CANDIDATE_ID_KEY);
    if (activeId) {
      const found = all.find((c) => c.id === activeId);
      if (found) return found;
    }
  } catch {}
  return all[0] || DEFAULT_SLIP_CONFIG;
}

export function setActiveCandidateId(id: string): void {
  try {
    safeSetItem(ACTIVE_CANDIDATE_ID_KEY, id);
  } catch {}
}

export function saveCandidateProfile(candidate: CandidateProfile): CandidateProfile[] {
  const all = getAllCandidates();
  const index = all.findIndex((c) => c.id === candidate.id);
  let updated: CandidateProfile[];
  if (index >= 0) {
    updated = [...all];
    updated[index] = candidate;
  } else {
    updated = [candidate, ...all];
  }
  saveAllCandidates(updated);
  setActiveCandidateId(candidate.id);
  return updated;
}

export function createNewCandidateTemplate(base?: CandidateProfile): CandidateProfile {
  const source = base || getActiveCandidate();
  const newId = `custom_slip_${Date.now()}`;
  const created: CandidateProfile = {
    ...source,
    id: newId,
    templateTitle: `${source.templateTitle || source.name} (কাস্টম)`,
    isCustom: true,
  };
  saveCandidateProfile(created);
  return created;
}

export function deleteCandidateProfile(id: string): CandidateProfile[] {
  const all = getAllCandidates();
  const updated = all.filter((c) => c.id !== id);
  const finalUpdated = updated.length > 0 ? updated : DEFAULT_CANDIDATES;
  saveAllCandidates(finalUpdated);
  setActiveCandidateId(finalUpdated[0].id);
  return finalUpdated;
}

export function resetDefaultCandidates(): CandidateProfile[] {
  saveAllCandidates(DEFAULT_CANDIDATES);
  setActiveCandidateId(DEFAULT_CANDIDATES[0].id);
  return DEFAULT_CANDIDATES;
}

// ============================================================================
// FAMILY & MULTI-VOTER SLIP QUEUE SYSTEM (একসাথে একাধিক ভোটার / পরিবারের স্লিপ)
// ============================================================================

export function getVoterUniqueKey(voter: Voter): string {
  return `${voter.villageName || 'v'}_${voter.voterId || ''}_${voter.serialNo || ''}_${voter.name || ''}`;
}

export function getSlipQueue(): Voter[] {
  try {
    const raw = safeGetItem(SLIP_QUEUE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveSlipQueue(queue: Voter[]): void {
  safeSetItem(SLIP_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('slip-queue-updated', { detail: queue }));
  }
}

export function isVoterInSlipQueue(voter: Voter, queue?: Voter[]): boolean {
  const list = queue || getSlipQueue();
  const key = getVoterUniqueKey(voter);
  return list.some((v) => getVoterUniqueKey(v) === key);
}

export function addToSlipQueue(voterOrVoters: Voter | Voter[]): Voter[] {
  const current = [...getSlipQueue()];
  const items = Array.isArray(voterOrVoters) ? voterOrVoters : [voterOrVoters];
  let changed = false;
  for (const voter of items) {
    if (!isVoterInSlipQueue(voter, current)) {
      current.push(voter);
      changed = true;
    }
  }
  if (changed) {
    saveSlipQueue(current);
  }
  return current;
}

export function removeFromSlipQueue(voter: Voter): Voter[] {
  const key = getVoterUniqueKey(voter);
  const updated = getSlipQueue().filter((v) => getVoterUniqueKey(v) !== key);
  saveSlipQueue(updated);
  return updated;
}

export function toggleVoterInSlipQueue(voter: Voter): { queue: Voter[]; added: boolean } {
  const current = getSlipQueue();
  if (isVoterInSlipQueue(voter, current)) {
    const updated = removeFromSlipQueue(voter);
    return { queue: updated, added: false };
  } else {
    const updated = addToSlipQueue(voter);
    return { queue: updated, added: true };
  }
}

export function clearSlipQueue(): Voter[] {
  saveSlipQueue([]);
  return [];
}

/**
 * Find potential family members of a target voter across a voter list.
 */
export function findFamilyMembers(target: Voter, allVoters: Voter[]): Voter[] {
  if (!target || !allVoters || allVoters.length === 0) return [];

  const targetKey = getVoterUniqueKey(target);
  const cleanName = normalizeBengaliText((target.name || '').trim().toLowerCase());
  const cleanFather = normalizeBengaliText((target.fatherName || '').trim().toLowerCase());
  const cleanMother = normalizeBengaliText((target.motherName || '').trim().toLowerCase());

  const isValidRef = (s: string) => s.length >= 3 && s !== '-' && s !== 'nan';

  return allVoters.filter((v) => {
    if (v._isMigrated) return false;
    if (getVoterUniqueKey(v) === targetKey) return false;

    const vName = normalizeBengaliText((v.name || '').trim().toLowerCase());
    const vFather = normalizeBengaliText((v.fatherName || '').trim().toLowerCase());
    const vMother = normalizeBengaliText((v.motherName || '').trim().toLowerCase());

    if (isValidRef(cleanFather) && vFather === cleanFather) return true;
    if (isValidRef(cleanMother) && vMother === cleanMother) return true;
    if (isValidRef(cleanName) && (vFather === cleanName || vMother === cleanName)) return true;
    if (
      (isValidRef(cleanFather) && vName === cleanFather) ||
      (isValidRef(cleanMother) && vName === cleanMother)
    ) {
      return true;
    }

    return false;
  });
}

/**
 * Search voters across pool by query (Name, Father, Mother, Serial, Voter ID)
 */
export function searchVotersForSlipQueue(query: string, pool: Voter[], limit = 30): Voter[] {
  const q = query.trim();
  if (!q) return [];

  const qNorm = normalizeBengaliText(q.toLowerCase());
  const qEng = convertToEnglishNumbers(q);

  const results: Voter[] = [];
  for (const v of pool) {
    if (v._isMigrated) continue;
    const serial = v._normSerial ?? convertToEnglishNumbers(v.serialNo || '');
    const voterId = convertToEnglishNumbers(v.voterId || '');
    const name = v._normName ?? normalizeBengaliText((v.name || '').toLowerCase());
    const father = v._normFather ?? normalizeBengaliText((v.fatherName || '').toLowerCase());
    const mother = v._normMother ?? normalizeBengaliText((v.motherName || '').toLowerCase());

    if (
      (qEng && (serial === qEng || serial.includes(qEng) || voterId.includes(qEng))) ||
      (qNorm && (name.includes(qNorm) || father.includes(qNorm) || mother.includes(qNorm)))
    ) {
      results.push(v);
      if (results.length >= limit) break;
    }
  }
  return results;
}

// ============================================================================
// MULTI-TEMPLATE PRINTING ENGINE (6 DISTINCT DESIGNS - NO QR CODE)
// ============================================================================

export type PrintLayoutMode = 'single' | 'sheet4' | 'sheet6' | 'sheet8' | 'thermal58' | 'thermal80';

function resolveAssetUrl(src: string): string {
  if (!src) return '';
  if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
    return src;
  }
  const clean = src.replace(/^\.?\//, '');
  try {
    if (typeof window !== 'undefined' && window.location) {
      const base = window.location.href.split('#')[0].split('?')[0];
      const baseDir = base.endsWith('/') ? base : base.substring(0, base.lastIndexOf('/') + 1);
      return `${baseDir}${clean}`;
    }
  } catch {}
  return `./${clean}`;
}

function renderVoterDetailsBlockHTML(
  voter: Voter,
  config: CandidateProfile,
  fillMode: VoterInfoFillMode = 'auto'
): string {
  const serial = voter.serialNo || '-';
  const name = voter.name || '-';
  const voterId = voter.voterId || '-';
  const father = voter.fatherName || '-';
  const mother = voter.motherName || '-';
  const dob = voter.dob || '-';
  const address = voter.address || voter.villageName || config.voterArea || '-';
  const area = voter.villageName || config.voterArea || '-';

  if (fillMode === 'blank') {
    return `
      <div class="vc-voter-blank">
        <div class="vc-blank-row"><span>ভোটারের নাম :</span><span class="vc-dotted-line"></span><span>ক্রমিক নং :</span><span class="vc-dotted-short"></span></div>
        <div class="vc-blank-row"><span>পিতা / স্বামীর নাম :</span><span class="vc-dotted-line"></span></div>
        <div class="vc-blank-row"><span>মাতার নাম :</span><span class="vc-dotted-line"></span><span>জন্ম তারিখ :</span><span class="vc-dotted-short"></span></div>
        <div class="vc-blank-row"><span>ভোটার আইডি নং :</span><span class="vc-dotted-line"></span><span>ওয়ার্ড নং :</span><span class="vc-dotted-short">${config.wardNo || ''}</span></div>
        <div class="vc-blank-row"><span>ভোট কেন্দ্র :</span><span class="vc-dotted-line">${config.pollingCenter || ''}</span></div>
        <div class="vc-blank-row"><span>গ্রাম / ঠিকানা :</span><span class="vc-dotted-line">${area !== '-' ? area : ''}</span></div>
      </div>
    `;
  }

  const lineClass = fillMode === 'lined' ? 'vc-info-row lined' : 'vc-info-row';

  return `
    <div class="vc-voter-filled">
      <div class="vc-top-meta-strip">
        <span><b>ক্রমিক নং:</b> ${serial}</span>
        <span><b>ওয়ার্ড নং:</b> ${config.wardNo || '-'}</span>
        <span><b>এলাকা:</b> ${area}</span>
      </div>
      <div class="${lineClass} vc-main-name">
        <span class="vc-lbl">ভোটারের নাম:</span>
        <span class="vc-val vc-bold-name">${name}</span>
      </div>
      <div class="${lineClass}">
        <span class="vc-lbl">পিতা/স্বামীর নাম:</span>
        <span class="vc-val">${father}</span>
      </div>
      <div class="${lineClass}">
        <span class="vc-lbl">মাতার নাম:</span>
        <span class="vc-val">${mother}</span>
      </div>
      <div class="${lineClass} vc-two-col">
        <div><span class="vc-lbl">ভোটার আইডি:</span> <span class="vc-val vc-mono">${voterId}</span></div>
        <div><span class="vc-lbl">জন্ম তারিখ:</span> <span class="vc-val">${dob}</span></div>
      </div>
      <div class="${lineClass}">
        <span class="vc-lbl">ভোট কেন্দ্র:</span>
        <span class="vc-val vc-center-highlight">${config.pollingCenter || '-'}</span>
      </div>
      <div class="${lineClass}">
        <span class="vc-lbl">ঠিকানা:</span>
        <span class="vc-val">${address}</span>
      </div>
    </div>
  `;
}

export function renderSlipCardByStyleHTML(
  voter: Voter,
  config: CandidateProfile,
  colorMode: 'color' | 'bw' = 'bw'
): string {
  const style: SlipDesignStyle = config.designStyle || 'classic_voter_card';
  const fillMode: VoterInfoFillMode = config.voterInfoMode || 'auto';
  const candidateImg = resolveAssetUrl(config.candidatePhotoUrl || './candidate-ataur.jpg');
  const symbolImg = resolveAssetUrl(config.symbolPhotoUrl || './symbol-horse.png');
  const bwClass = colorMode === 'bw' ? 'bw-filter' : '';
  const suffix = config.candidateSuffix ?? 'কে';
  const voterDetailsHTML = renderVoterDetailsBlockHTML(voter, config, fillMode);

  // STYLE 1: CLASSIC VOTER CARD (Exact match to uploaded reference card!)
  if (style === 'classic_voter_card') {
    return `
      <div class="slip-card style-classic-card ${bwClass}">
        <div class="classic-main-grid">
          <!-- Left Sidebar: Candidate Photo + Symbol + Vote Callout + Slogan -->
          <div class="classic-left-col">
            <div class="classic-photo-wrap">
              <img src="${candidateImg}" alt="প্রার্থী" class="classic-cand-img" />
            </div>
            <div class="classic-symbol-wrap">
              <img src="${symbolImg}" alt="মার্কা" class="classic-sym-img" />
            </div>
            <div class="classic-vote-callout">${config.symbolCallout || `${config.symbolName} মার্কায় ভোট দিন`}</div>
            ${
              config.sloganText
                ? `<div class="classic-slogan">${config.sloganText}</div>`
                : ''
            }
          </div>

          <!-- Right Area: Header + Candidate Name + Dashed Divider + Voter Info -->
          <div class="classic-right-col">
            <div class="classic-top-bar">
              <div class="classic-bismillah">${config.religiousHeader || 'আল্লাহ্ সর্বশক্তিমান'}</div>
              <div class="classic-vertical-ribbon">${config.cardBadgeText || 'ভোটার কার্ড'}</div>
            </div>

            <div class="classic-election-block">
              <div class="classic-election-line1">${config.electionTitle || ''}</div>
              ${
                config.constituencyText
                  ? `<div class="classic-election-line2">${config.constituencyText}</div>`
                  : ''
              }
            </div>

            <div class="classic-position-row">
              <span class="classic-black-post">${config.candidateBadge || config.postTitle || 'চেয়ারম্যান পদপ্রার্থী'}</span>
              <span class="classic-qual-text">${config.electionSubtitle || ''}</span>
            </div>

            <div class="classic-candidate-name-row">
              <span class="classic-cand-name">${config.candidateName || config.name}</span>
              ${suffix ? `<span class="classic-cand-suffix">${suffix}</span>` : ''}
            </div>

            <div class="classic-dashed-hr"></div>

            <!-- Voter Details or Blank Card Space -->
            <div class="classic-voter-zone">
              ${voterDetailsHTML}
            </div>
          </div>
        </div>

        <!-- Bottom 3-Column Solid Black Footer Bar -->
        <div class="classic-bottom-footer">
          <div class="classic-foot-col">${config.footerLeftText || `প্রচারে: ${config.voterArea || 'এলাকাবাসী'}`}</div>
          <div class="classic-foot-col classic-foot-center">${config.footerCenterText || 'ভোট কেন্দ্রে আসার সময় দয়া করে কার্ডটি সঙ্গে আনবেন'}</div>
          <div class="classic-foot-col classic-foot-right">${config.footerRightText || `ওয়ার্ড নং: ${config.wardNo || '-'}`}</div>
        </div>
      </div>
    `;
  }

  // STYLE 2: MODERN SPLIT BANNER (Symbol Left, Voter Center, Photo Right)
  if (style === 'upazila_horizontal') {
    return `
      <div class="slip-card style-modern-split ${bwClass}">
        <div class="ms-top-header">${config.religiousHeader || 'বিসমিল্লাহির রাহমানির রাহিম'}</div>
        <div class="ms-title-row">
          <div>
            <div class="ms-el-title">${config.electionTitle} ${config.constituencyText ? `— ${config.constituencyText}` : ''}</div>
            <div class="ms-el-sub">${config.electionSubtitle}</div>
          </div>
          <div class="ms-post-badge">${config.candidateBadge || config.postTitle || 'পদপ্রার্থী'}</div>
        </div>
        <div class="ms-cand-banner">${config.candidateName || config.name}${suffix ? `-${suffix}` : ''}</div>
        <div class="ms-body-row">
          <div class="ms-sym-col">
            <img src="${symbolImg}" alt="মার্কা" class="ms-sym-img" />
            <div class="ms-sym-label">মার্কা: ${config.symbolName}</div>
            <div class="ms-sym-callout">${config.symbolCallout}</div>
          </div>
          <div class="ms-voter-col">
            ${voterDetailsHTML}
          </div>
          <div class="ms-photo-col">
            <img src="${candidateImg}" alt="প্রার্থী" class="ms-cand-img" />
            <div class="ms-photo-cap">${config.postTitle || 'প্রার্থী'}</div>
          </div>
        </div>
        <div class="classic-bottom-footer">
          <div class="classic-foot-col">${config.footerLeftText || 'প্রচারে: সর্বস্তরের জনগণ'}</div>
          <div class="classic-foot-col classic-foot-center">${config.footerCenterText || 'ভোট কেন্দ্রে আসার সময় কার্ডটি সঙ্গে আনবেন'}</div>
          <div class="classic-foot-col classic-foot-right">${config.footerRightText || `ওয়ার্ড: ${config.wardNo}`}</div>
        </div>
      </div>
    `;
  }

  // STYLE 3: POSTER BANNER CARD (High-impact dark candidate bar)
  if (style === 'poster_banner_card') {
    return `
      <div class="slip-card style-poster-banner ${bwClass}">
        <div class="pb-header">
          <div class="pb-photo-box">
            <img src="${candidateImg}" alt="প্রার্থী" class="pb-img" />
          </div>
          <div class="pb-center-head">
            <div class="pb-rel">${config.religiousHeader || 'বিসমিল্লাহির রাহমানির রাহিম'}</div>
            <div class="pb-el">${config.electionTitle}</div>
            ${config.constituencyText ? `<div class="pb-const">${config.constituencyText}</div>` : ''}
            <div class="pb-post-pill">${config.candidateBadge || config.postTitle}</div>
            <div class="pb-black-name">${config.candidateName || config.name} ${suffix}</div>
          </div>
          <div class="pb-sym-box">
            <img src="${symbolImg}" alt="মার্কা" class="pb-sym-img" />
            <div class="pb-sym-call">${config.symbolCallout}</div>
          </div>
        </div>
        <div class="pb-voter-section">
          ${voterDetailsHTML}
        </div>
        <div class="classic-bottom-footer">
          <div class="classic-foot-col">${config.footerLeftText || 'প্রচারে: এলাকাবাসী'}</div>
          <div class="classic-foot-col classic-foot-center">${config.sloganText || config.footerCenterText || 'ভোট কেন্দ্রে কার্ডটি সঙ্গে আনবেন'}</div>
          <div class="classic-foot-col classic-foot-right">${config.footerRightText || `ওয়ার্ড: ${config.wardNo}`}</div>
        </div>
      </div>
    `;
  }

  // STYLE 4: ROYAL FRAMED SLIP
  if (style === 'royal_framed_slip') {
    return `
      <div class="slip-card style-royal-frame ${bwClass}">
        <div class="rf-inner">
          <div class="rf-top-strip">
            <span>${config.religiousHeader || 'বিসমিল্লাহির রাহমানির রাহিম'}</span>
            <span class="rf-tag">${config.cardBadgeText || 'ভোটার কার্ড'}</span>
          </div>
          <div class="rf-hero">
            <img src="${candidateImg}" alt="প্রার্থী" class="rf-cand-img" />
            <div class="rf-hero-text">
              <div class="rf-el">${config.electionTitle}</div>
              <div class="rf-sub">${config.electionSubtitle}</div>
              <div class="rf-name">${config.candidateName || config.name} ${suffix}</div>
              <div class="rf-call">${config.symbolCallout} (${config.postTitle || config.candidateBadge})</div>
            </div>
            <img src="${symbolImg}" alt="মার্কা" class="rf-sym-img" />
          </div>
          <div class="rf-voter-wrap">
            ${voterDetailsHTML}
          </div>
          <div class="rf-footer">
            <span>${config.footerLeftText || 'প্রচারে: সর্বস্তরের জনগণ'}</span>
            <span>•</span>
            <span>${config.footerCenterText || 'ভোট কেন্দ্রে কার্ডটি সঙ্গে আনবেন'}</span>
          </div>
        </div>
      </div>
    `;
  }

  // STYLE 5: OFFICIAL TABLE GRID SLIP
  if (style === 'official_table_grid') {
    const area = voter.villageName || config.voterArea || '-';
    return `
      <div class="slip-card style-table-grid ${bwClass}">
        <div class="tg-head">
          <img src="${candidateImg}" alt="প্রার্থী" class="tg-thumb" />
          <div class="tg-head-mid">
            <div class="tg-rel">${config.religiousHeader}</div>
            <div class="tg-title">${config.electionTitle} ${config.constituencyText ? `(${config.constituencyText})` : ''}</div>
            <div class="tg-cand">${config.candidateBadge}: <b>${config.candidateName || config.name}</b> — <span class="tg-call">${config.symbolCallout}</span></div>
          </div>
          <img src="${symbolImg}" alt="মার্কা" class="tg-sym" />
        </div>
        <table class="tg-table">
          <tbody>
            <tr>
              <td class="tg-lbl">ভোটারের নাম</td>
              <td class="tg-val tg-bold">${fillMode === 'blank' ? '' : voter.name || '-'}</td>
              <td class="tg-lbl">ক্রমিক নং</td>
              <td class="tg-val tg-bold">${fillMode === 'blank' ? '' : voter.serialNo || '-'}</td>
            </tr>
            <tr>
              <td class="tg-lbl">পিতা/স্বামী</td>
              <td class="tg-val">${fillMode === 'blank' ? '' : voter.fatherName || '-'}</td>
              <td class="tg-lbl">ওয়ার্ড নং</td>
              <td class="tg-val">${config.wardNo || '-'}</td>
            </tr>
            <tr>
              <td class="tg-lbl">মাতার নাম</td>
              <td class="tg-val">${fillMode === 'blank' ? '' : voter.motherName || '-'}</td>
              <td class="tg-lbl">জন্ম তারিখ</td>
              <td class="tg-val">${fillMode === 'blank' ? '' : voter.dob || '-'}</td>
            </tr>
            <tr>
              <td class="tg-lbl">ভোটার আইডি</td>
              <td class="tg-val tg-mono">${fillMode === 'blank' ? '' : voter.voterId || '-'}</td>
              <td class="tg-lbl">এলাকা/গ্রাম</td>
              <td class="tg-val">${area}</td>
            </tr>
            <tr>
              <td class="tg-lbl">ভোট কেন্দ্র</td>
              <td class="tg-val tg-bold" colspan="3">${config.pollingCenter || '-'}</td>
            </tr>
          </tbody>
        </table>
        <div class="classic-bottom-footer">
          <div class="classic-foot-col">${config.footerLeftText || 'প্রচারে: এলাকাবাসী'}</div>
          <div class="classic-foot-col classic-foot-center">${config.footerCenterText || 'ভোট কেন্দ্রে কার্ডটি সঙ্গে আনবেন'}</div>
          <div class="classic-foot-col classic-foot-right">${config.footerRightText || ''}</div>
        </div>
      </div>
    `;
  }

  // STYLE 6: COMPACT / POCKET SLIP
  return `
    <div class="slip-card style-compact-pocket ${bwClass}">
      <div class="cp-top">${config.religiousHeader}</div>
      <div class="cp-el">${config.electionTitle}</div>
      <div class="cp-cand-row">
        <img src="${candidateImg}" alt="প্রার্থী" class="cp-img" />
        <div class="cp-cand-mid">
          <div class="cp-badge">${config.candidateBadge}</div>
          <div class="cp-name">${config.candidateName || config.name}</div>
          <div class="cp-call">${config.symbolCallout}</div>
        </div>
        <img src="${symbolImg}" alt="মার্কা" class="cp-sym" />
      </div>
      <div class="cp-voter">
        ${voterDetailsHTML}
      </div>
    </div>
  `;
}

export async function printVoterSlips(
  voters: Voter[],
  config: CandidateProfile,
  mode: PrintLayoutMode = 'sheet4',
  colorMode: 'color' | 'bw' = 'bw'
) {
  if (!voters || voters.length === 0) return;

  const isThermal = mode === 'thermal58' || mode === 'thermal80';
  const thermalWidth = mode === 'thermal80' ? '80mm' : '58mm';
  const isSheet = mode === 'sheet4' || mode === 'sheet6' || mode === 'sheet8';

  const candidateImg = resolveAssetUrl(config.candidatePhotoUrl || './candidate-ataur.jpg');
  const symbolImg = resolveAssetUrl(config.symbolPhotoUrl || './symbol-horse.png');

  // 1. Render for Mini Bluetooth POS Thermal Printer (58mm / 80mm) - NO QR CODE
  if (isThermal) {
    const thermalSlipsHTML = voters
      .map((voter) => {
        return `
        <div class="thermal-ticket">
          <div class="th-religious">${config.religiousHeader || 'বিসমিল্লাহির রাহমানির রাহিম'}</div>
          <div class="th-election">${config.electionTitle}</div>
          ${config.constituencyText ? `<div class="th-subtitle">${config.constituencyText}</div>` : ''}
          <div class="th-subtitle">${config.electionSubtitle}</div>
          <div class="th-dashed">--------------------------------</div>

          <div class="th-candidate-box">
            <div class="th-cand-row">
              <div class="th-symbol-col">
                <img src="${symbolImg}" alt="মার্কা" class="th-symbol-img" />
                <div class="th-symbol-name">${config.symbolName}</div>
                <div class="th-symbol-btn">${config.symbolCallout || 'ভোট দিন'}</div>
              </div>

              <div class="th-cand-center">
                <div class="th-badge">${config.candidateBadge || 'পদপ্রার্থী'}</div>
                <div class="th-candidate-name">${config.candidateName || config.name} ${config.candidateSuffix || 'কে'}</div>
                <div class="th-post-title">${config.postTitle || ''}</div>
              </div>

              <div class="th-photo-col">
                <img src="${candidateImg}" alt="প্রার্থী" class="th-cand-img" />
                <div class="th-photo-label">প্রার্থী</div>
              </div>
            </div>
          </div>

          <div class="th-dashed">================================</div>

          <div class="th-center-box">
            <div><b>ভোট কেন্দ্র:</b> ${config.pollingCenter}</div>
            <div class="th-flex">
              <div><b>এলাকা:</b> ${voter.villageName || config.voterArea}</div>
              <div><b>ওয়ার্ড নং:</b> ${config.wardNo}</div>
            </div>
          </div>

          <div class="th-dashed">--------------------------------</div>

          <div class="th-voter-info">
            <div class="th-name-row">
              <span class="th-serial">ক্রমিক: ${voter.serialNo || '-'}</span> | 
              <span class="th-name">${voter.name || '-'}</span>
            </div>
            <div><b>ভোটার আইডি:</b> <span class="th-mono">${voter.voterId || '-'}</span></div>
            <div><b>পিতা/স্বামী:</b> ${voter.fatherName || '-'}</div>
            <div><b>মাতা:</b> ${voter.motherName || '-'}</div>
            <div><b>পেশা:</b> ${voter.profession || '-'} | <b>জন্ম:</b> ${voter.dob || '-'}</div>
            <div class="th-address"><b>ঠিকানা:</b> ${voter.address || voter.villageName || '-'}</div>
          </div>

          <div class="th-dashed">================================</div>
          <div class="th-footer">${config.footerCenterText || 'ভোট কেন্দ্রে আসার সময় কার্ডটি সঙ্গে আনবেন'}</div>
          <div class="th-cut-space">.</div>
        </div>
      `;
      })
      .join('<div class="thermal-page-break"></div>');

    const thermalDoc = `
      <!DOCTYPE html>
      <html lang="bn">
      <head>
        <meta charset="UTF-8">
        <title>থার্মাল ভোটার স্লিপ - ${voters[0]?.name || 'স্লিপ'}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Noto Sans Bengali', system-ui, sans-serif;
            background: #fff;
            color: #000;
            width: ${thermalWidth};
            margin: 0 auto;
          }
          @page { size: ${thermalWidth} auto; margin: 0; }
          .thermal-ticket { width: ${thermalWidth}; padding: 2mm 3mm 4mm 3mm; text-align: center; font-size: 11px; line-height: 1.3; color: #000; background: #fff; }
          .thermal-page-break { page-break-after: always; border-bottom: 2px dashed #000; margin: 4mm 0; }
          .th-religious { font-size: 10px; font-weight: 700; margin-bottom: 2px; }
          .th-election { font-size: 11.5px; font-weight: 900; line-height: 1.15; }
          .th-subtitle { font-size: 9.5px; font-weight: 700; line-height: 1.15; margin-top: 1px; }
          .th-dashed { font-family: monospace; font-size: 10px; font-weight: bold; overflow: hidden; white-space: nowrap; margin: 2px 0; }
          .th-candidate-box { padding: 3px 0; }
          .th-cand-row { display: flex; align-items: center; justify-content: space-between; gap: 4px; padding: 2px 0; }
          .th-symbol-col { width: 58px; display: flex; flex-direction: column; align-items: center; text-align: center; flex-shrink: 0; }
          .th-symbol-img { width: 48px; height: 48px; object-fit: contain; filter: contrast(140%) grayscale(100%); }
          .th-symbol-name { font-size: 10px; font-weight: 900; line-height: 1.1; margin-top: 1px; }
          .th-symbol-btn { border: 1px solid #000; font-size: 8px; font-weight: 800; padding: 1px 3px; margin-top: 1px; line-height: 1; }
          .th-cand-center { flex: 1; text-align: center; min-width: 0; padding: 0 2px; }
          .th-badge { display: inline-block; border: 1px solid #000; padding: 0 6px; font-size: 8.5px; font-weight: 800; background: #000; color: #fff; }
          .th-candidate-name { font-size: 14px; font-weight: 900; margin: 2px 0; line-height: 1.15; }
          .th-post-title { font-size: 9.5px; font-weight: 700; color: #111; }
          .th-photo-col { width: 54px; display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
          .th-cand-img { width: 50px; height: 60px; object-fit: cover; border: 1.2px solid #000; filter: contrast(130%) grayscale(100%); }
          .th-photo-label { font-size: 8px; font-weight: 700; margin-top: 1px; }
          .th-center-box { text-align: left; font-size: 10px; line-height: 1.3; }
          .th-flex { display: flex; justify-content: space-between; margin-top: 1px; }
          .th-voter-info { text-align: left; font-size: 11px; line-height: 1.35; padding: 2px 0; }
          .th-name-row { font-size: 12.5px; font-weight: 900; margin-bottom: 3px; }
          .th-serial { font-size: 12.5px; }
          .th-mono { font-family: monospace; font-weight: 900; font-size: 11.5px; }
          .th-address { font-size: 10px; line-height: 1.25; }
          .th-footer { font-size: 9.5px; font-weight: 800; margin-top: 3px; }
          .th-cut-space { color: transparent; height: 10mm; }
        </style>
      </head>
      <body>
        ${thermalSlipsHTML}
      </body>
      </html>
    `;

    executePrintHtml(thermalDoc, `Thermal_Slip_${voters.length}`);
    return;
  }

  // 2. Standard A4 / Multi-Voter Normal Print across all 6 Slip Design Styles
  const slipsHTML = voters.map((v) => renderSlipCardByStyleHTML(v, config, colorMode)).join('');
  const isCompactGrid = mode === 'sheet6' || mode === 'sheet8';

  const printDocument = `
    <!DOCTYPE html>
    <html lang="bn">
    <head>
      <meta charset="UTF-8">
      <title>ভোটার কার্ড (${voters.length} জন) - ${config.candidateName || config.name}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Noto Sans Bengali', system-ui, -apple-system, sans-serif;
          background: #fff;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          padding: ${isSheet ? '3mm' : '8mm'};
        }
        @page {
          size: A4 portrait;
          margin: 5mm;
        }
        .slips-container {
          display: ${isSheet || voters.length > 1 ? 'grid' : 'flex'};
          ${
            isSheet || voters.length > 1
              ? `
            grid-template-columns: ${voters.length === 1 && !isSheet ? '1fr' : '1fr 1fr'};
            grid-gap: ${isCompactGrid ? '3mm 3mm' : '4.5mm 4mm'};
            width: 100%;
          `
              : `
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
          `
          }
        }
        .slip-card {
          border: 2px solid #000;
          background: #fff;
          width: 100%;
          max-width: ${isSheet || voters.length > 1 ? '100%' : '620px'};
          font-size: ${isCompactGrid ? '9.5px' : '11px'};
          line-height: 1.25;
          position: relative;
          page-break-inside: avoid;
          break-inside: avoid;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .bw-filter img {
          filter: grayscale(100%) contrast(118%);
        }

        /* ==============================================================
           STYLE 1: CLASSIC VOTER CARD (Matches Uploaded Reference Card)
           ============================================================== */
        .style-classic-card {
          border: 2.2px solid #000;
          border-radius: 2px;
        }
        .classic-main-grid {
          display: flex;
          align-items: stretch;
          width: 100%;
          flex: 1;
        }
        .classic-left-col {
          width: 31%;
          border-right: 1.5px dashed #222;
          padding: ${isCompactGrid ? '4px' : '6px'};
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          text-align: center;
          background: #fff;
          flex-shrink: 0;
        }
        .classic-photo-wrap {
          width: 100%;
          display: flex;
          justify-content: center;
        }
        .classic-cand-img {
          width: 100%;
          max-width: ${isCompactGrid ? '82px' : '108px'};
          height: ${isCompactGrid ? '78px' : '102px'};
          object-fit: cover;
          object-position: top center;
          border-bottom: 1.5px solid #000;
        }
        .classic-symbol-wrap {
          width: 100%;
          display: flex;
          justify-content: center;
          padding: 2px 0;
        }
        .classic-sym-img {
          width: 100%;
          max-width: ${isCompactGrid ? '76px' : '96px'};
          height: ${isCompactGrid ? '56px' : '74px'};
          object-fit: contain;
        }
        .classic-vote-callout {
          font-size: ${isCompactGrid ? '11px' : '13.5px'};
          font-weight: 900;
          color: #000;
          line-height: 1.1;
          margin-top: 1px;
        }
        .classic-slogan {
          font-size: ${isCompactGrid ? '7.5px' : '8.8px'};
          font-weight: 700;
          color: #111;
          line-height: 1.18;
          margin-top: 2px;
        }
        .classic-right-col {
          flex: 1;
          padding: ${isCompactGrid ? '4px 6px' : '6px 8px'};
          display: flex;
          flex-direction: column;
          position: relative;
          min-width: 0;
        }
        .classic-top-bar {
          display: flex;
          justify-content: center;
          align-items: center;
          position: relative;
          margin-bottom: 2px;
        }
        .classic-bismillah {
          font-size: ${isCompactGrid ? '8.5px' : '9.5px'};
          font-weight: 700;
          color: #000;
        }
        .classic-vertical-ribbon {
          position: absolute;
          right: -4px;
          top: -4px;
          background: #e2e8f0;
          border: 1.2px solid #000;
          padding: 3px 2px;
          writing-mode: vertical-rl;
          text-orientation: mixed;
          transform: rotate(180deg);
          font-size: ${isCompactGrid ? '8px' : '9.5px'};
          font-weight: 900;
          color: #000;
          line-height: 1;
        }
        .classic-election-block {
          border-left: 3.5px solid #000;
          padding-left: 5px;
          margin-bottom: 3px;
          padding-right: 18px;
        }
        .classic-election-line1 {
          font-size: ${isCompactGrid ? '10px' : '12px'};
          font-weight: 800;
          color: #000;
          line-height: 1.15;
        }
        .classic-election-line2 {
          font-size: ${isCompactGrid ? '10px' : '11.5px'};
          font-weight: 800;
          color: #000;
          line-height: 1.15;
        }
        .classic-position-row {
          display: flex;
          align-items: baseline;
          gap: 5px;
          flex-wrap: wrap;
          margin-bottom: 3px;
        }
        .classic-black-post {
          background: #000;
          color: #fff;
          font-size: ${isCompactGrid ? '10.5px' : '13px'};
          font-weight: 900;
          padding: 1px 6px;
          display: inline-block;
          line-height: 1.15;
        }
        .classic-qual-text {
          font-size: ${isCompactGrid ? '8.2px' : '9.5px'};
          font-weight: 700;
          color: #000;
        }
        .classic-candidate-name-row {
          border-left: 3.5px solid #000;
          padding-left: 5px;
          margin-bottom: 4px;
          display: flex;
          align-items: baseline;
          gap: 4px;
          flex-wrap: wrap;
        }
        .classic-cand-name {
          font-size: ${isCompactGrid ? '13.5px' : '17px'};
          font-weight: 900;
          color: #000;
          line-height: 1.1;
          letter-spacing: -0.2px;
        }
        .classic-cand-suffix {
          font-size: ${isCompactGrid ? '10px' : '12px'};
          font-weight: 800;
        }
        .classic-dashed-hr {
          border-bottom: 1.4px dashed #222;
          margin: 2px 0 4px 0;
        }
        .classic-voter-zone {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .classic-bottom-footer {
          background: #000;
          color: #fff;
          display: grid;
          grid-template-columns: 1fr 1.25fr 1fr;
          font-size: ${isCompactGrid ? '7.5px' : '8.8px'};
          font-weight: 800;
          border-top: 1.5px solid #000;
        }
        .classic-foot-col {
          padding: 2.5px 5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .classic-foot-center {
          border-left: 1.2px solid #fff;
          border-right: 1.2px solid #fff;
          text-align: center;
        }
        .classic-foot-right {
          text-align: right;
        }

        /* ==============================================================
           VOTER DETAILS BLOCK (Auto-Filled, Lined, or Blank)
           ============================================================== */
        .vc-voter-filled {
          display: flex;
          flex-direction: column;
          gap: 1.5px;
          font-size: ${isCompactGrid ? '9.2px' : '10.5px'};
        }
        .vc-top-meta-strip {
          display: flex;
          justify-content: space-between;
          background: #f1f5f9;
          border: 1px solid #000;
          padding: 1.5px 5px;
          font-size: ${isCompactGrid ? '8.8px' : '10px'};
          margin-bottom: 2px;
        }
        .vc-info-row {
          display: flex;
          align-items: baseline;
          gap: 4px;
          line-height: 1.28;
        }
        .vc-info-row.lined {
          border-bottom: 1px dotted #64748b;
          padding-bottom: 1px;
        }
        .vc-two-col {
          display: flex;
          justify-content: space-between;
          gap: 6px;
        }
        .vc-lbl {
          font-weight: 700;
          color: #111;
          flex-shrink: 0;
        }
        .vc-val {
          font-weight: 600;
          color: #000;
        }
        .vc-bold-name {
          font-size: ${isCompactGrid ? '10.5px' : '12px'};
          font-weight: 900;
        }
        .vc-mono {
          font-family: monospace, sans-serif;
          font-weight: 800;
        }
        .vc-center-highlight {
          font-weight: 800;
        }
        .vc-voter-blank {
          display: flex;
          flex-direction: column;
          gap: ${isCompactGrid ? '5px' : '7px'};
          padding: 4px 0;
          font-size: ${isCompactGrid ? '9px' : '10.5px'};
          font-weight: 700;
        }
        .vc-blank-row {
          display: flex;
          align-items: baseline;
          gap: 4px;
        }
        .vc-dotted-line {
          flex: 1;
          border-bottom: 1.2px dotted #000;
          min-height: 12px;
          padding-left: 4px;
        }
        .vc-dotted-short {
          width: 55px;
          border-bottom: 1.2px dotted #000;
          min-height: 12px;
          padding-left: 4px;
        }

        /* ==============================================================
           STYLE 2: MODERN SPLIT BANNER
           ============================================================== */
        .style-modern-split { padding: 0; }
        .ms-top-header { text-align: center; font-size: 9px; font-weight: 700; padding: 2px; border-bottom: 1px dotted #444; }
        .ms-title-row { display: flex; justify-content: space-between; align-items: center; padding: 3px 8px; }
        .ms-el-title { font-size: 11px; font-weight: 800; }
        .ms-el-sub { font-size: 8.5px; font-weight: 600; }
        .ms-post-badge { background: #000; color: #fff; padding: 1.5px 7px; font-size: 9.5px; font-weight: 900; }
        .ms-cand-banner { text-align: center; font-size: 15px; font-weight: 900; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 2px; background: #f8fafc; }
        .ms-body-row { display: flex; align-items: stretch; padding: 5px 7px; gap: 6px; flex: 1; }
        .ms-sym-col { width: 72px; border-right: 1px dashed #444; padding-right: 5px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; flex-shrink: 0; }
        .ms-sym-img { width: 58px; height: 54px; object-fit: contain; }
        .ms-sym-label { font-size: 9.5px; font-weight: 900; margin-top: 2px; }
        .ms-sym-callout { border: 1px solid #000; font-size: 8px; font-weight: 800; padding: 1px 3px; margin-top: 2px; }
        .ms-voter-col { flex: 1; min-width: 0; }
        .ms-photo-col { width: 74px; border: 1.2px solid #000; display: flex; flex-direction: column; align-items: center; justify-content: space-between; flex-shrink: 0; }
        .ms-cand-img { width: 100%; height: 92px; object-fit: cover; }
        .ms-photo-cap { background: #000; color: #fff; width: 100%; text-align: center; font-size: 8px; font-weight: 800; padding: 1px 0; }

        /* ==============================================================
           STYLE 3: POSTER BANNER CARD
           ============================================================== */
        .pb-header { display: flex; align-items: center; gap: 6px; padding: 5px 7px; border-bottom: 2px solid #000; background: #f8fafc; }
        .pb-photo-box { width: 72px; height: 86px; border: 1.5px solid #000; flex-shrink: 0; overflow: hidden; }
        .pb-img { width: 100%; height: 100%; object-fit: cover; }
        .pb-center-head { flex: 1; text-align: center; min-width: 0; }
        .pb-rel { font-size: 8.5px; font-weight: 700; }
        .pb-el { font-size: 10.5px; font-weight: 800; }
        .pb-const { font-size: 9.5px; font-weight: 700; }
        .pb-post-pill { display: inline-block; border: 1.2px solid #000; padding: 0 6px; font-size: 9px; font-weight: 900; margin: 1px 0; }
        .pb-black-name { background: #000; color: #fff; font-size: 13.5px; font-weight: 900; padding: 2px 6px; margin-top: 2px; }
        .pb-sym-box { width: 72px; text-align: center; flex-shrink: 0; }
        .pb-sym-img { width: 58px; height: 56px; object-fit: contain; margin: 0 auto; display: block; }
        .pb-sym-call { font-size: 8.5px; font-weight: 900; margin-top: 2px; border: 1px solid #000; padding: 1px; }
        .pb-voter-section { padding: 6px 8px; flex: 1; }

        /* ==============================================================
           STYLE 4: ROYAL FRAMED SLIP
           ============================================================== */
        .style-royal-frame { padding: 3px; border: 2.5px solid #000; }
        .rf-inner { border: 1.2px solid #000; padding: 5px 7px; display: flex; flex-direction: column; height: 100%; justify-content: space-between; }
        .rf-top-strip { display: flex; justify-content: space-between; font-size: 8.5px; font-weight: 700; border-bottom: 1px dashed #444; padding-bottom: 2px; }
        .rf-tag { background: #000; color: #fff; padding: 0 5px; font-weight: 800; }
        .rf-hero { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1.5px solid #000; }
        .rf-cand-img { width: 64px; height: 76px; object-fit: cover; border: 1.2px solid #000; flex-shrink: 0; }
        .rf-hero-text { flex: 1; text-align: center; }
        .rf-el { font-size: 10px; font-weight: 800; }
        .rf-sub { font-size: 8.5px; }
        .rf-name { font-size: 14px; font-weight: 900; margin: 1px 0; }
        .rf-call { background: #000; color: #fff; font-size: 9.5px; font-weight: 800; padding: 1px 6px; display: inline-block; }
        .rf-sym-img { width: 62px; height: 62px; object-fit: contain; flex-shrink: 0; }
        .rf-voter-wrap { padding: 4px 0; flex: 1; }
        .rf-footer { border-top: 1px solid #000; padding-top: 2px; font-size: 8px; font-weight: 800; display: flex; justify-content: space-between; }

        /* ==============================================================
           STYLE 5: OFFICIAL TABLE GRID
           ============================================================== */
        .tg-head { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-bottom: 1.5px solid #000; }
        .tg-thumb { width: 54px; height: 62px; object-fit: cover; border: 1px solid #000; flex-shrink: 0; }
        .tg-head-mid { flex: 1; text-align: center; }
        .tg-rel { font-size: 8px; font-weight: 700; }
        .tg-title { font-size: 10px; font-weight: 800; }
        .tg-cand { font-size: 11px; margin-top: 2px; }
        .tg-call { background: #000; color: #fff; padding: 0 4px; font-weight: 800; }
        .tg-sym { width: 54px; height: 54px; object-fit: contain; flex-shrink: 0; }
        .tg-table { width: 100%; border-collapse: collapse; font-size: 9.5px; flex: 1; }
        .tg-table td { border: 1px solid #000; padding: 2.5px 5px; }
        .tg-lbl { font-weight: 800; background: #f1f5f9; width: 22%; }
        .tg-val { width: 28%; }
        .tg-bold { font-weight: 900; }
        .tg-mono { font-family: monospace; font-weight: 800; }

        /* ==============================================================
           STYLE 6: COMPACT POCKET SLIP
           ============================================================== */
        .style-compact-pocket { padding: 6px; }
        .cp-top { text-align: center; font-size: 8.5px; font-weight: 700; }
        .cp-el { text-align: center; font-size: 10.5px; font-weight: 800; border-bottom: 1px dashed #000; padding-bottom: 2px; }
        .cp-cand-row { display: flex; align-items: center; justify-content: space-between; gap: 5px; padding: 4px 0; border-bottom: 1.5px solid #000; }
        .cp-img { width: 52px; height: 62px; object-fit: cover; border: 1px solid #000; }
        .cp-cand-mid { flex: 1; text-align: center; }
        .cp-badge { background: #000; color: #fff; font-size: 8.5px; font-weight: 800; padding: 0 5px; display: inline-block; }
        .cp-name { font-size: 13px; font-weight: 900; }
        .cp-call { font-size: 9.5px; font-weight: 800; }
        .cp-sym { width: 52px; height: 52px; object-fit: contain; }
        .cp-voter { padding-top: 4px; }
      </style>
    </head>
    <body>
      <div class="slips-container">
        ${slipsHTML}
      </div>
    </body>
    </html>
  `;

  executePrintHtml(printDocument, `Voter_Slips_${voters.length}`);
}

/**
 * Reliable Cross-Platform Print Executor:
 * 1. If running in Android Native APK (`window.AndroidNative.printHtml`), invokes Android's native PrintManager.
 * 2. Otherwise on Web/Desktop/Mobile Browser, renders into a dedicated hidden iframe, waits for images to load, and triggers `contentWindow.print()`.
 */
export function executePrintHtml(html: string, jobName = 'Voter_Slip_Print') {
  if (typeof window === 'undefined') return;

  const androidBridge = (window as any).AndroidNative;
  if (androidBridge && typeof androidBridge.printHtml === 'function') {
    try {
      androidBridge.printHtml(html, jobName);
      return;
    } catch (e) {
      console.warn('AndroidNative.printHtml failed, falling back to iframe print:', e);
    }
  }

  const existingIframe = document.getElementById('voter-slip-print-iframe') as HTMLIFrameElement | null;
  if (existingIframe && existingIframe.parentNode) {
    existingIframe.parentNode.removeChild(existingIframe);
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'voter-slip-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(html);
  doc.close();

  const triggerIframePrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.warn('Iframe print error:', err);
      window.print();
    }
  };

  const images = Array.from(doc.images || []);
  if (images.length === 0) {
    setTimeout(triggerIframePrint, 250);
  } else {
    let loadedCount = 0;
    let printed = false;
    const checkDone = () => {
      loadedCount++;
      if (!printed && loadedCount >= images.length) {
        printed = true;
        setTimeout(triggerIframePrint, 200);
      }
    };

    images.forEach((img) => {
      if (img.complete) {
        checkDone();
      } else {
        img.addEventListener('load', checkDone, { once: true });
        img.addEventListener('error', checkDone, { once: true });
      }
    });

    setTimeout(() => {
      if (!printed) {
        printed = true;
        triggerIframePrint();
      }
    }, 1500);
  }
}
