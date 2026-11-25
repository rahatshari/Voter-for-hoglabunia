import { M3ColorPalette, M3FontScale, M3ThemeMode, M3ThemePreferences } from '../types';

const THEME_STORAGE_KEY = 'voter_m3_theme_prefs_v1';

export const DEFAULT_M3_THEME: M3ThemePreferences = {
  palette: 'emerald',
  mode: 'light',
  fontScale: 'normal',
};

export interface PaletteMeta {
  id: M3ColorPalette;
  nameBn: string;
  subtitleBn: string;
  primaryHex: string;
  containerHex: string;
  darkPrimaryHex: string;
}

export const M3_PALETTES: PaletteMeta[] = [
  {
    id: 'emerald',
    nameBn: 'সবুজ বাংলা',
    subtitleBn: 'নাগরিক ও প্রাকৃতিক পান্না সবুজ',
    primaryHex: '#006B54',
    containerHex: '#A0F2D4',
    darkPrimaryHex: '#84D6B9',
  },
  {
    id: 'indigo',
    nameBn: 'নীল আকাশ',
    subtitleBn: 'আধুনিক রাজকীয় নীল টোন',
    primaryHex: '#2559B8',
    containerHex: '#D8E2FF',
    darkPrimaryHex: '#AEC6FF',
  },
  {
    id: 'ocean',
    nameBn: 'সাগর নীল',
    subtitleBn: 'প্রশান্ত সাগরীয় সায়ান-টিল',
    primaryHex: '#006780',
    containerHex: '#B8EAFF',
    darkPrimaryHex: '#8AD0EE',
  },
  {
    id: 'amber',
    nameBn: 'সোনালী মাটি',
    subtitleBn: 'উষ্ণ সোনালী ও টেরাকোটা',
    primaryHex: '#855300',
    containerHex: '#FFDDB6',
    darkPrimaryHex: '#FFB95A',
  },
];

const memoryStore: Record<string, string> = {};

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch {}
  return memoryStore[key] ?? null;
}

function safeSet(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
      return;
    }
  } catch {}
  memoryStore[key] = val;
}

export function loadThemePreferences(): M3ThemePreferences {
  try {
    const raw = safeGet(THEME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        palette: ['emerald', 'indigo', 'amber', 'ocean'].includes(parsed.palette)
          ? parsed.palette
          : DEFAULT_M3_THEME.palette,
        mode: ['light', 'dark', 'system'].includes(parsed.mode)
          ? parsed.mode
          : DEFAULT_M3_THEME.mode,
        fontScale: ['normal', 'large'].includes(parsed.fontScale)
          ? parsed.fontScale
          : DEFAULT_M3_THEME.fontScale,
      };
    }
  } catch {}
  return { ...DEFAULT_M3_THEME };
}

export function resolveEffectiveMode(mode: M3ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function applyThemeToDocument(prefs: M3ThemePreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const effectiveMode = resolveEffectiveMode(prefs.mode);

  root.setAttribute('data-theme', prefs.palette);
  root.setAttribute('data-mode', effectiveMode);
  root.setAttribute('data-font-scale', prefs.fontScale);

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    const pal = M3_PALETTES.find((p) => p.id === prefs.palette) || M3_PALETTES[0];
    metaTheme.setAttribute(
      'content',
      effectiveMode === 'dark' ? '#111417' : pal.primaryHex
    );
  }
}

export function saveThemePreferences(prefs: M3ThemePreferences): M3ThemePreferences {
  safeSet(THEME_STORAGE_KEY, JSON.stringify(prefs));
  applyThemeToDocument(prefs);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('voter_m3_theme_changed', { detail: prefs }));
  }
  return prefs;
}
