import React, { useRef } from 'react';
import {
  Check,
  Download,
  LogOut,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sun,
  Type,
  Upload,
  X,
} from 'lucide-react';
import {
  M3ColorPalette,
  M3FontScale,
  M3ThemeMode,
  M3ThemePreferences,
} from '../types';
import { M3_PALETTES } from '../lib/themeStore';
import {
  clearAllVoterAnnotations,
  exportTrackerBackupJson,
  importTrackerBackupJson,
} from '../lib/voterTrackerStore';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';

interface ThemeSettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  prefs: M3ThemePreferences;
  onChangePrefs: (next: M3ThemePreferences) => void;
  trackerStats: {
    starredCount: number;
    votedCount: number;
    notesCount: number;
  };
  onTrackerChanged: () => void;
  showToast: (msg: string) => void;
  onOpenUpdateModal?: () => void;
  onLogoutClick?: () => void;
  userEmail?: string | null;
}

export const ThemeSettingsSheet: React.FC<ThemeSettingsSheetProps> = ({
  isOpen,
  onClose,
  prefs,
  onChangePrefs,
  trackerStats,
  onTrackerChanged,
  showToast,
  onOpenUpdateModal,
  onLogoutClick,
  userEmail,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const setPalette = (palette: M3ColorPalette) => {
    onChangePrefs({ ...prefs, palette });
  };

  const setMode = (mode: M3ThemeMode) => {
    onChangePrefs({ ...prefs, mode });
  };

  const setFontScale = (fontScale: M3FontScale) => {
    onChangePrefs({ ...prefs, fontScale });
  };

  const handleExportBackup = () => {
    const json = exportTrackerBackupJson();
    const fileName = `voter_campaign_backup_${new Date().toISOString().slice(0, 10)}.json`;
    import('../lib/nativeBridge')
      .then(({ saveTextFileCrossPlatform }) => {
        saveTextFileCrossPlatform(json, fileName, 'application/json;charset=utf-8;');
        showToast('ক্যাম্পেইন ডাটা ব্যাকআপ ডাউনলোড হয়েছে');
      })
      .catch(() => {
        showToast('ব্যাকআপ সংরক্ষণে ত্রুটি হয়েছে');
      });
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const res = importTrackerBackupJson(text);
      if (res.success) {
        onTrackerChanged();
        showToast(`${convertToBengaliNumbers(res.count)} টি ভোটার নোট/মার্ক পুনরুদ্ধার হয়েছে!`);
      } else {
        showToast(res.error || 'ব্যাকআপ ইমপোর্ট ব্যর্থ হয়েছে');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleResetTracker = () => {
    if (
      window.confirm(
        'আপনি কি নিশ্চিতভাবে সকল বুকমার্ক, ভোট মার্ক ও ব্যক্তিগত নোট মুছে ফেলতে চান?'
      )
    ) {
      clearAllVoterAnnotations();
      onTrackerChanged();
      showToast('সকল ক্যাম্পেইন মার্ক রিসেট করা হয়েছে');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 m3-sheet-backdrop flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="m3-sheet w-full sm:max-w-lg max-h-[90vh] overflow-y-auto animate-sheet-up bottom-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden m3-drag-handle" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--md-outline-variant)]/50">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl m3-tonal-container flex items-center justify-center">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight">
                মেটেরিয়াল ইউ থিম ও সেটিংস
              </h2>
              <p className="text-xs text-[var(--md-on-surface-variant)]">
                রঙ, ডার্ক মোড, অক্ষরের আকার ও ব্যাকআপ নিয়ন্ত্রণ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="m3-icon-btn"
            aria-label="বন্ধ করুন"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 1. Display Mode Segmented Control */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--md-on-surface-variant)] uppercase tracking-wider block">
              ডিসপ্লে মোড (Display Mode)
            </label>
            <div className="grid grid-cols-3 rounded-full border border-[var(--md-outline-variant)] p-1 bg-[var(--md-surface-container-low)]">
              {[
                { id: 'light' as M3ThemeMode, label: 'হালকা', icon: Sun },
                { id: 'dark' as M3ThemeMode, label: 'গাঢ় (ডার্ক)', icon: Moon },
                { id: 'system' as M3ThemeMode, label: 'অটো', icon: Smartphone },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = prefs.mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMode(opt.id)}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs font-bold transition cursor-pointer ${
                      active
                        ? 'bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] shadow-xs'
                        : 'text-[var(--md-on-surface-variant)] hover:text-[var(--md-on-surface)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Dynamic Color Palettes (Material You) */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-[var(--md-on-surface-variant)] uppercase tracking-wider block">
              মেটেরিয়াল ইউ কালার প্যালেট (Dynamic Color)
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {M3_PALETTES.map((pal) => {
                const selected = prefs.palette === pal.id;
                return (
                  <button
                    key={pal.id}
                    type="button"
                    onClick={() => setPalette(pal.id)}
                    className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition cursor-pointer ${
                      selected
                        ? 'border-[var(--md-primary)] bg-[var(--md-primary-container)]/35 ring-1 ring-[var(--md-primary)]'
                        : 'border-[var(--md-outline-variant)] bg-[var(--md-surface-container-low)] hover:bg-[var(--md-surface-container)]'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center shadow-xs border-2 border-white/80 relative overflow-hidden"
                      style={{
                        background: `linear-gradient(135deg, ${pal.primaryHex} 50%, ${pal.containerHex} 50%)`,
                      }}
                    >
                      {selected && (
                        <span className="w-5 h-5 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-sm">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold truncate">{pal.nameBn}</div>
                      <div className="text-[11px] text-[var(--md-on-surface-variant)] truncate">
                        {pal.subtitleBn}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Font Scale Accessibility */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--md-on-surface-variant)] uppercase tracking-wider flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" />
              <span>লেখার আকার (পড়ার সুবিধা)</span>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setFontScale('normal')}
                className={`py-2.5 px-3 rounded-2xl border text-xs font-bold transition cursor-pointer ${
                  prefs.fontScale === 'normal'
                    ? 'm3-tonal-container border-transparent'
                    : 'border-[var(--md-outline-variant)] bg-[var(--md-surface-container-low)]'
                }`}
              >
                স্বাভাবিক ফন্ট (Default)
              </button>
              <button
                type="button"
                onClick={() => setFontScale('large')}
                className={`py-2.5 px-3 rounded-2xl border text-sm font-bold transition cursor-pointer ${
                  prefs.fontScale === 'large'
                    ? 'm3-tonal-container border-transparent'
                    : 'border-[var(--md-outline-variant)] bg-[var(--md-surface-container-low)]'
                }`}
              >
                বড় ও স্পষ্ট ফন্ট (Large)
              </button>
            </div>
          </div>

          {/* 4. Campaign Data Backup & Restore */}
          <div className="m3-card-filled p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold">
                ক্যাম্পেইন ও বুকমার্ক ডাটা ব্যাকআপ
              </span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full m3-secondary-container">
                অফলাইন সংরক্ষিত
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-[var(--md-surface-container-lowest)] rounded-xl p-2 border border-[var(--md-outline-variant)]/50">
                <span className="text-sm font-black text-[var(--md-primary)] block">
                  {convertToBengaliNumbers(trackerStats.starredCount)}
                </span>
                <span className="text-[10px] text-[var(--md-on-surface-variant)] font-semibold">
                  বুকমার্ক
                </span>
              </div>
              <div className="bg-[var(--md-surface-container-lowest)] rounded-xl p-2 border border-[var(--md-outline-variant)]/50">
                <span className="text-sm font-black text-emerald-600 block">
                  {convertToBengaliNumbers(trackerStats.votedCount)}
                </span>
                <span className="text-[10px] text-[var(--md-on-surface-variant)] font-semibold">
                  ভোট সম্পন্ন
                </span>
              </div>
              <div className="bg-[var(--md-surface-container-lowest)] rounded-xl p-2 border border-[var(--md-outline-variant)]/50">
                <span className="text-sm font-black text-amber-600 block">
                  {convertToBengaliNumbers(trackerStats.notesCount)}
                </span>
                <span className="text-[10px] text-[var(--md-on-surface-variant)] font-semibold">
                  নোট/ফোন
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleExportBackup}
                className="flex-1 m3-btn-primary-tonal py-2 px-3 text-xs flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ব্যাকআপ সেভ</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 m3-btn-tonal py-2 px-3 text-xs flex items-center justify-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>রিস্টোর করুন</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportBackup}
                className="hidden"
              />

              {(trackerStats.starredCount > 0 ||
                trackerStats.votedCount > 0 ||
                trackerStats.notesCount > 0) && (
                <button
                  type="button"
                  onClick={handleResetTracker}
                  className="m3-btn-outlined py-2 px-3 text-xs text-[var(--md-error)] flex items-center justify-center gap-1"
                  title="সকল মার্ক রিসেট"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 5. Account & Update Footer Actions */}
          <div className="pt-1 flex flex-col gap-2.5">
            {userEmail && (
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-[var(--md-surface-container-low)] border border-[var(--md-outline-variant)]/60 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-[var(--md-primary)] shrink-0" />
                  <span className="truncate font-semibold">{userEmail}</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 shrink-0">সক্রিয়</span>
              </div>
            )}

            <div className="flex gap-2.5">
              {onOpenUpdateModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenUpdateModal();
                  }}
                  className="flex-1 m3-btn-outlined py-2.5 px-3 text-xs flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>অ্যাপ আপডেট</span>
                </button>
              )}
              {onLogoutClick && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogoutClick();
                  }}
                  className="flex-1 py-2.5 px-3 rounded-full bg-[var(--md-error-container)] text-[var(--md-on-error-container)] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>লগআউট</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
