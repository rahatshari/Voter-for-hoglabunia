import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Award,
  BarChart3,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Hash,
  Lock,
  LogOut,
  MapPin,
  Mic,
  MicOff,
  Palette,
  Printer,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  User,
  Users,
  Wifi,
} from 'lucide-react';
import {
  AgeGroupFilter,
  CampaignStatusFilter,
  SearchFieldMode,
  Voter,
  VoterAnnotation,
} from '../types';
import { convertToBengaliNumbers, isMigrated } from '../lib/bengaliUtils';
import { getVoterUniqueKey } from '../lib/voterSlipUtils';

interface HomeScreenProps {
  userEmail: string | null;
  villagesData: Record<string, Voter[]>;
  allVillagesData?: Record<string, Voter[]>;
  disabledVillages?: string[];
  allowSlipPrint?: boolean;
  annotationsMap?: Record<string, VoterAnnotation>;
  onSelectVillage: (villageName: string) => void;
  onOpenGlobalSearch: (preset?: {
    searchField?: SearchFieldMode;
    query?: string;
    omni?: string;
    ageGroup?: AgeGroupFilter;
    campaignFilter?: CampaignStatusFilter;
    fullList?: boolean;
  }) => void;
  onOpenSavedHub?: () => void;
  onOpenAnalytics: (villageName?: string) => void;
  onOpenSlipModal?: (voter?: Voter | null) => void;
  onOpenThemeSettings?: () => void;
  onOpenUserMonitoring?: () => void;
  isAdmin?: boolean;
  onOpenAdminPanel?: () => void;
  onOpenUpdateModal?: () => void;
  onLogoutClick: () => void;
  showToast?: (msg: string) => void;
}

const HOME_SEARCH_FIELDS: {
  id: SearchFieldMode;
  label: string;
  placeholder: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'name', label: 'নাম', placeholder: 'ভোটারের নাম লিখুন...', icon: User },
  {
    id: 'serial',
    label: 'ক্রমিক নং',
    placeholder: 'সঠিক ক্রমিক নং (যেমন: ১, ২০ বা ১-৫০)...',
    icon: Hash,
  },
  { id: 'father', label: 'পিতার নাম', placeholder: 'পিতার নাম লিখুন...', icon: User },
  { id: 'mother', label: 'মাতার নাম', placeholder: 'মাতার নাম লিখুন...', icon: User },
  { id: 'voterId', label: 'ভোটার নং', placeholder: 'ভোটার আইডি নম্বর লিখুন...', icon: CreditCard },
];

export const HomeScreen: React.FC<HomeScreenProps> = ({
  userEmail,
  villagesData,
  allVillagesData,
  disabledVillages = [],
  allowSlipPrint = true,
  annotationsMap = {},
  onSelectVillage,
  onOpenGlobalSearch,
  onOpenSavedHub,
  onOpenAnalytics,
  onOpenSlipModal,
  onOpenThemeSettings,
  isAdmin,
  onOpenAdminPanel,
  onOpenUpdateModal,
  onLogoutClick,
  showToast,
}) => {
  const [hasNewUpdate, setHasNewUpdate] = useState(false);
  const [quickField, setQuickField] = useState<SearchFieldMode>('name');
  const [quickQuery, setQuickQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [villageFilter, setVillageFilter] = useState('');
  const [sortVillagesByCount, setSortVillagesByCount] = useState(false);

  const disabledSet = useMemo(() => new Set(disabledVillages), [disabledVillages]);

  useEffect(() => {
    try {
      const raw = window.localStorage?.getItem('voter_pending_update_cache_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.versionName) {
          setHasNewUpdate(true);
        }
      }
    } catch {}

    const onAvail = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      setHasNewUpdate(Boolean(detail?.hasUpdate));
    };
    window.addEventListener('voter_update_availability', onAvail);
    return () => {
      window.removeEventListener('voter_update_availability', onAvail);
    };
  }, []);

  const summary = useMemo(() => {
    let active = 0;
    let migrated = 0;
    let males = 0;
    let females = 0;
    let voted = 0;
    let starred = 0;

    Object.values(villagesData).forEach((list) => {
      list.forEach((v) => {
        const isMig = v._isMigrated !== undefined ? v._isMigrated : isMigrated(v);
        const ann = annotationsMap[getVoterUniqueKey(v)];
        if (ann?.starred) starred++;
        if (isMig) {
          migrated++;
        } else {
          active++;
          if (ann?.voted) voted++;
          const g = v._gender || v.gender;
          if (g === 'পুরুষ') males++;
          else if (g === 'মহিলা') females++;
        }
      });
    });

    const malePct = active > 0 ? Math.round((males / active) * 100) : 0;
    const femalePct = active > 0 ? Math.round((females / active) * 100) : 0;
    const turnoutPct = active > 0 ? Math.round((voted / active) * 1000) / 10 : 0;

    return { active, migrated, males, females, malePct, femalePct, voted, starred, turnoutPct };
  }, [villagesData, annotationsMap]);

  const directorySource = allVillagesData || villagesData;

  const villageCardsData = useMemo(() => {
    const names = Object.keys(directorySource);
    const items = names.map((village) => {
      const isDisabledForUsers = disabledSet.has(village);
      const isLocked = isDisabledForUsers && !isAdmin;
      const voters = isLocked ? [] : directorySource[village] || [];

      let activeCount = 0;
      let malesCount = 0;
      let femalesCount = 0;
      let migratedCount = 0;
      let votedCount = 0;

      for (const v of voters) {
        const isMig = v._isMigrated !== undefined ? v._isMigrated : isMigrated(v);
        if (isMig) {
          migratedCount++;
        } else {
          activeCount++;
          const g = v._gender || v.gender;
          if (g === 'পুরুষ') malesCount++;
          else if (g === 'মহিলা') femalesCount++;
          if (annotationsMap[getVoterUniqueKey(v)]?.voted) votedCount++;
        }
      }

      const maleRatio = activeCount > 0 ? Math.round((malesCount / activeCount) * 100) : 50;

      return {
        village,
        isDisabledForUsers,
        isLocked,
        activeCount,
        malesCount,
        femalesCount,
        migratedCount,
        votedCount,
        maleRatio,
      };
    });

    const filtered = villageFilter.trim()
      ? items.filter((item) =>
          item.village.toLowerCase().includes(villageFilter.trim().toLowerCase())
        )
      : items;

    if (sortVillagesByCount) {
      return [...filtered].sort((a, b) => b.activeCount - a.activeCount);
    }
    return filtered;
  }, [directorySource, disabledSet, isAdmin, annotationsMap, villageFilter, sortVillagesByCount]);

  const activeFieldMeta =
    HOME_SEARCH_FIELDS.find((f) => f.id === quickField) || HOME_SEARCH_FIELDS[0];

  const handleQuickSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onOpenGlobalSearch({
      searchField: quickField,
      query: quickQuery.trim(),
    });
  };

  const handleVoiceSearch = () => {
    import('../lib/nativeBridge').then(({ startBengaliVoiceInput }) => {
      startBengaliVoiceInput({
        onStart: () => setIsListening(true),
        onEnd: () => setIsListening(false),
        onResult: (transcript) => {
          setQuickQuery(transcript);
          onOpenGlobalSearch({ searchField: quickField, query: transcript });
        },
        onError: (msg) => {
          setIsListening(false);
          if (showToast) showToast(msg);
        },
      });
    });
  };

  return (
    <div className="space-y-4 sm:space-y-5 animate-slide-down">
      {/* 1. Material Design 3 Top App Bar */}
      <header className="m3-card-elevated px-4 py-3.5 sm:px-5 sm:py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="./logo.png"
            alt="ইউনিয়ন ভোটার লোগো"
            className="w-11 h-11 sm:w-12 sm:h-12 object-cover rounded-2xl border border-[var(--md-outline-variant)] shadow-2xs shrink-0 bg-white"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-black tracking-tight truncate">
                হোগলাবুনিয়া ভোটার তালিকা
              </h1>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full m3-tonal-container">
                <Wifi className="w-2.5 h-2.5" />
                <span>অনলাইন সক্রিয়</span>
              </span>
            </div>
            <p className="text-xs text-[var(--md-on-surface-variant)] truncate mt-0.5">
              {userEmail || 'স্মার্ট ভোটার অনুসন্ধান ও নির্বাচনী স্লিপ'}
            </p>
          </div>
        </div>

        {/* Top Bar Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isAdmin && onOpenAdminPanel && (
            <button
              type="button"
              onClick={onOpenAdminPanel}
              className="m3-btn-tonal h-9 px-3 text-xs hidden sm:inline-flex items-center gap-1.5"
              title="অ্যাডমিন ড্যাশবোর্ড"
            >
              <Shield className="w-4 h-4" />
              <span>অ্যাডমিন</span>
            </button>
          )}

          {onOpenThemeSettings && (
            <button
              type="button"
              onClick={onOpenThemeSettings}
              className="m3-icon-btn-tonal"
              title="মেটেরিয়াল ইউ থিম, ডার্ক মোড ও ব্যাকআপ সেটিংস"
            >
              <Palette className="w-[18px] h-[18px]" />
            </button>
          )}

          {onOpenUpdateModal && (
            <button
              type="button"
              onClick={onOpenUpdateModal}
              className="m3-icon-btn-tonal relative"
              title="অ্যাপ আপডেট চেক করুন"
            >
              <RefreshCw className="w-[18px] h-[18px]" />
              {hasNewUpdate && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--md-surface-container-lowest)] animate-pulse" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onLogoutClick}
            className="w-10 h-10 rounded-full inline-flex items-center justify-center bg-[var(--md-error-container)]/70 hover:bg-[var(--md-error-container)] text-[var(--md-on-error-container)] transition cursor-pointer active:scale-90"
            title="লগআউট"
          >
            <LogOut className="w-[18px] h-[18px]" />
          </button>
        </div>
      </header>

      {/* 2. Hero Material 3 Single-Field Global Search Surface + Voice Search */}
      <section className="m3-card-elevated p-4 sm:p-5 space-y-3">
        {/* Search Mode Selector Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <span className="text-[11px] font-extrabold text-[var(--md-on-surface-variant)] shrink-0 mr-0.5">
            খুঁজুন:
          </span>
          {HOME_SEARCH_FIELDS.map((field) => {
            const Icon = field.icon;
            const selected = quickField === field.id;
            return (
              <button
                key={field.id}
                type="button"
                onClick={() => setQuickField(field.id)}
                className={`h-7.5 px-2.5 rounded-full text-xs font-bold inline-flex items-center gap-1 shrink-0 transition cursor-pointer ${
                  selected
                    ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)] shadow-2xs'
                    : 'bg-[var(--md-surface-container-high)] text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-container-highest)]'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{field.label}</span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleQuickSearchSubmit} className="m3-search-bar">
          <Search className="w-5 h-5 text-[var(--md-primary)] shrink-0 ml-1" />
          <input
            id="home-global-single-search"
            type="text"
            inputMode={quickField === 'voterId' ? 'numeric' : 'text'}
            value={quickQuery}
            onChange={(e) => setQuickQuery(e.target.value)}
            placeholder={`সকল গ্রামে ${activeFieldMeta.placeholder}`}
            className="w-full bg-transparent text-sm font-medium focus:outline-none"
          />
          <button
            type="button"
            onClick={handleVoiceSearch}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition cursor-pointer ${
              isListening
                ? 'bg-[var(--md-error)] text-[var(--md-on-error)] animate-pulse'
                : 'hover:bg-[var(--md-surface-container-highest)] text-[var(--md-on-surface-variant)]'
            }`}
            title="বাংলা ভয়েস সার্চ"
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button type="submit" className="m3-btn-filled h-9 px-4 text-xs shrink-0">
            খুঁজুন
          </button>
        </form>

        {/* Horizontal Scrollable M3 Assist Chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => onOpenGlobalSearch({ fullList: true })}
            className="m3-chip"
          >
            <Users className="w-3.5 h-3.5 text-[var(--md-primary)]" />
            <span>সম্পূর্ণ ইউনিয়ন তালিকা</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenGlobalSearch({ ageGroup: 'youth' })}
            className="m3-chip"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>নতুন ভোটার (১৮-২৫)</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenGlobalSearch({ ageGroup: 'senior' })}
            className="m3-chip"
          >
            <Award className="w-3.5 h-3.5 text-amber-600" />
            <span>প্রবীণ ভোটার (৬০+)</span>
          </button>

          {allowSlipPrint && onOpenSlipModal && (
            <button
              type="button"
              onClick={() => onOpenSlipModal(null)}
              className="m3-chip"
            >
              <Printer className="w-3.5 h-3.5 text-[var(--md-primary)]" />
              <span>ভোটার স্লিপ ও থার্মাল প্রিন্ট</span>
            </button>
          )}

          {onOpenSavedHub && (
            <button type="button" onClick={onOpenSavedHub} className="m3-chip">
              <Bookmark className="w-3.5 h-3.5 text-amber-600" />
              <span>বুকমার্ক ও ক্যাম্পেইন</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenAnalytics('all')}
            className="m3-chip"
          >
            <BarChart3 className="w-3.5 h-3.5 text-sky-600" />
            <span>পরিসংখ্যান ও চার্ট</span>
          </button>
        </div>
      </section>

      {/* 3. M3 Expressive KPI Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div
          onClick={() => onOpenGlobalSearch({ fullList: true })}
          className="m3-tonal-container rounded-3xl p-4 cursor-pointer transition active:scale-[0.98] shadow-2xs"
        >
          <span className="text-xs font-bold opacity-80 block">মোট সক্রিয় ভোটার</span>
          <span className="text-2xl sm:text-3xl font-black tracking-tight block mt-1">
            {convertToBengaliNumbers(summary.active)}
          </span>
          <span className="text-[11px] font-semibold opacity-75 block mt-1">
            কর্তিত বাদে সচল তালিকা
          </span>
        </div>

        <div className="m3-card-elevated rounded-3xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--md-on-surface-variant)]">
              পুরুষ ভোটার
            </span>
            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-sky-500/12 text-sky-700">
              {convertToBengaliNumbers(summary.malePct)}%
            </span>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-sky-700 block mt-1">
            {convertToBengaliNumbers(summary.males)}
          </span>
          <span className="text-[11px] text-[var(--md-on-surface-variant)] block mt-1">
            ইউনিয়নের মোট পুরুষ
          </span>
        </div>

        <div className="m3-card-elevated rounded-3xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--md-on-surface-variant)]">
              মহিলা ভোটার
            </span>
            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/12 text-rose-700">
              {convertToBengaliNumbers(summary.femalePct)}%
            </span>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-rose-600 block mt-1">
            {convertToBengaliNumbers(summary.females)}
          </span>
          <span className="text-[11px] text-[var(--md-on-surface-variant)] block mt-1">
            ইউনিয়নের মোট মহিলা
          </span>
        </div>

        <div
          onClick={onOpenSavedHub}
          className="m3-card-elevated rounded-3xl p-4 cursor-pointer hover:border-[var(--md-primary)] transition active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--md-on-surface-variant)]">
              ভোট ও বুকমার্ক
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl sm:text-3xl font-black text-emerald-600">
              {convertToBengaliNumbers(summary.voted)}
            </span>
            <span className="text-xs font-bold text-[var(--md-on-surface-variant)]">
              ভোট ({convertToBengaliNumbers(summary.turnoutPct)}%)
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[var(--md-surface-container-highest)] overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(summary.turnoutPct, summary.voted > 0 ? 4 : 0))}%`,
              }}
            />
          </div>
        </div>
      </section>

      {/* 4. Village Directory Section */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-0.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl m3-secondary-container flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-tight">
                গ্রামভিত্তিক ভোটার ডিরেক্টরি ({convertToBengaliNumbers(Object.keys(directorySource).length)} টি)
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-[var(--md-surface-container-high)] border border-[var(--md-outline-variant)]/50 flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 text-[var(--md-on-surface-variant)] shrink-0" />
              <input
                type="text"
                value={villageFilter}
                onChange={(e) => setVillageFilter(e.target.value)}
                placeholder="গ্রাম খুঁজুন..."
                className="w-full bg-transparent text-xs focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setSortVillagesByCount((v) => !v)}
              className={`m3-chip !h-9 !rounded-full ${
                sortVillagesByCount ? 'm3-chip-selected' : ''
              }`}
              title="ভোটার সংখ্যা অনুযায়ী সাজান"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortVillagesByCount ? 'বেশি ভোটার আগে' : 'ক্রমানুসারে'}</span>
            </button>
          </div>
        </div>

        {villageCardsData.length === 0 ? (
          <div className="m3-card-outlined p-12 text-center">
            <p className="text-xs font-semibold text-[var(--md-on-surface-variant)]">
              কোনো গ্রামের তথ্য পাওয়া যায়নি।
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {villageCardsData.map((item, idx) => {
              if (item.isLocked) {
                return (
                  <div
                    key={item.village}
                    onClick={() => {
                      if (showToast) {
                        showToast(
                          `"${item.village}" গ্রামের ভোটার তথ্য বর্তমানে অ্যাডমিন কর্তৃক বন্ধ রাখা হয়েছে।`
                        );
                      }
                    }}
                    className="m3-card-outlined p-4 opacity-75 cursor-not-allowed flex items-center justify-between gap-3 bg-[var(--md-surface-container-low)]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-[var(--md-error-container)] text-[var(--md-on-error-container)] flex items-center justify-center shrink-0">
                        <Lock className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-base leading-snug truncate">
                          {item.village}
                        </h3>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--md-error)] mt-0.5">
                          ভোটার তথ্য সাময়িকভাবে বন্ধ
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-[var(--md-error-container)] text-[var(--md-on-error-container)] shrink-0">
                      লক করা
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={item.village}
                  onClick={() => onSelectVillage(item.village)}
                  className="m3-card-elevated p-4 hover:border-[var(--md-primary)] active:scale-[0.99] transition cursor-pointer flex flex-col justify-between gap-3 group"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl m3-tonal-container flex items-center justify-center font-black text-sm shrink-0 group-hover:scale-105 transition-transform">
                        {convertToBengaliNumbers(idx + 1)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-extrabold text-base leading-snug truncate group-hover:text-[var(--md-primary)] transition-colors">
                            {item.village}
                          </h3>
                          {item.isDisabledForUsers && isAdmin && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--md-error-container)] text-[var(--md-on-error-container)] inline-flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" />
                              <span>ইউজারের জন্য বন্ধ</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[var(--md-on-surface-variant)] font-semibold mt-0.5 flex-wrap">
                          <span className="text-sky-700">
                            পুরুষ: {convertToBengaliNumbers(item.malesCount)}
                          </span>
                          <span>•</span>
                          <span className="text-rose-600">
                            মহিলা: {convertToBengaliNumbers(item.femalesCount)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="text-right">
                        <span className="block font-black text-base sm:text-lg text-[var(--md-primary)] leading-none">
                          {convertToBengaliNumbers(item.activeCount)}
                        </span>
                        <span className="text-[10px] font-semibold text-[var(--md-on-surface-variant)]">
                          ভোটার
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--md-outline)] group-hover:text-[var(--md-primary)] group-hover:translate-x-0.5 transition" />
                    </div>
                  </div>

                  {/* Gender Ratio Progress Bar & Mini Stats Footer */}
                  <div className="space-y-1.5">
                    <div className="w-full h-1.5 rounded-full bg-rose-200/80 overflow-hidden flex">
                      <div
                        className="h-full bg-sky-600 rounded-l-full"
                        style={{ width: `${item.maleRatio}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--md-on-surface-variant)]">
                      <div className="flex items-center gap-2">
                        {item.votedCount > 0 ? (
                          <span className="text-emerald-600 font-bold">
                            ভোট সম্পন্ন: {convertToBengaliNumbers(item.votedCount)} জন
                          </span>
                        ) : (
                          <span>
                            পুরুষ {convertToBengaliNumbers(item.maleRatio)}% • মহিলা{' '}
                            {convertToBengaliNumbers(100 - item.maleRatio)}%
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenAnalytics(item.village);
                        }}
                        className="text-[11px] font-bold text-[var(--md-primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <BarChart3 className="w-3 h-3" />
                        <span>চার্ট</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
