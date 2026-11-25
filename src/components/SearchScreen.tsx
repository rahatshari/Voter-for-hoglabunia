import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Award,
  BarChart3,
  Bookmark,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Hash,
  History,
  LayoutGrid,
  List,
  LogOut,
  MapPin,
  Mic,
  MicOff,
  MoreVertical,
  Printer,
  Search,
  Sparkles,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  AgeGroupFilter,
  AppSearchFilters,
  AppSettings,
  CampaignStatusFilter,
  SearchFieldMode,
  Voter,
  VoterAnnotation,
  VoterSortOption,
} from '../types';
import {
  calculateAge,
  convertToBengaliNumbers,
  formatDobInput,
  isMigrated,
} from '../lib/bengaliUtils';
import {
  addToSlipQueue,
  clearSlipQueue,
  getSlipQueue,
  getVoterUniqueKey,
  isVoterInSlipQueue,
  toggleVoterInSlipQueue,
} from '../lib/voterSlipUtils';
import {
  addRecentSearch,
  clearRecentSearches,
  downloadVotersCsv,
  filterAndSortVoters,
  formatVoterShareText,
  getRecentSearches,
  hasActiveSearchCriteria,
  toggleVoterStarred,
  toggleVoterVoted,
} from '../lib/voterTrackerStore';
import { useLockBodyScroll } from '../lib/useLockBodyScroll';
import { VillageDropdownMenu, VillageMenuOption } from './VillageDropdownMenu';
import { VoterCard } from './VoterCard';
import { VoterDetailTab } from './VoterDetailSheet';

interface SearchScreenProps {
  villageTitle: string;
  villageKey: string;
  voters: Voter[];
  villageNames?: string[];
  villageOptions?: VillageMenuOption[];
  onSwitchVillage?: (villageKey: string) => void;
  allowSlipPrint?: boolean;
  annotationsMap?: Record<string, VoterAnnotation>;
  onAnnotationsChanged?: () => void;
  onOpenVoterDetail?: (voter: Voter, tab?: VoterDetailTab) => void;
  initialSearch?: AppSearchFilters;
  initialSettings?: AppSettings;
  onBack: () => void;
  onOpenAnalytics?: (village?: string) => void;
  onOpenSlipModal?: (voter?: Voter | null) => void;
  onLogoutClick: () => void;
  showToast: (msg: string) => void;
  onStateChange?: (search: AppSearchFilters, settings: AppSettings) => void;
}

const RENDER_BATCH_SIZE = 40;

interface SearchFieldMeta {
  id: SearchFieldMode;
  label: string;
  placeholder: string;
  hint?: string;
  icon: React.FC<{ className?: string }>;
}

export const SEARCH_FIELD_MODES: SearchFieldMeta[] = [
  {
    id: 'name',
    label: 'নাম',
    placeholder: 'ভোটারের নাম লিখুন...',
    icon: User,
  },
  {
    id: 'serial',
    label: 'ক্রমিক নং',
    placeholder: 'ক্রমিক নং লিখুন (যেমন: ১, ২০ বা ১-৫০)...',
    hint: 'সঠিক ক্রমিক ম্যাচ সক্রিয়: ১ লিখলে শুধুই ১ নং ক্রমিক আসবে (১০ বা ১০০ আসবে না)',
    icon: Hash,
  },
  {
    id: 'father',
    label: 'পিতার নাম',
    placeholder: 'পিতা বা স্বামীর নাম লিখুন...',
    icon: User,
  },
  {
    id: 'mother',
    label: 'মাতার নাম',
    placeholder: 'মাতার নাম লিখুন...',
    icon: User,
  },
  {
    id: 'voterId',
    label: 'ভোটার নং',
    placeholder: 'ভোটার আইডি / এনআইডি নম্বর লিখুন...',
    icon: CreditCard,
  },
  {
    id: 'dob',
    label: 'জন্ম তারিখ',
    placeholder: 'জন্ম তারিখ লিখুন (যেমন: ২৩/০২/২০০১)...',
    icon: Calendar,
  },
  {
    id: 'profession',
    label: 'পেশা',
    placeholder: 'পেশা লিখুন বা নিচের তালিকা থেকে বেছে নিন...',
    icon: Briefcase,
  },
  {
    id: 'address',
    label: 'ঠিকানা',
    placeholder: 'বাড়ি বা ঠিকানার অংশ লিখুন...',
    icon: MapPin,
  },
];

function normalizeInitialSearch(init?: AppSearchFilters): AppSearchFilters {
  const base: AppSearchFilters = {
    searchField: 'name',
    query: '',
    omni: '',
    serial: '',
    name: '',
    father: '',
    mother: '',
    dob: '',
    voterId: '',
    address: '',
    profession: '',
    gender: '',
    ageGroup: '',
    campaignFilter: '',
    sortBy: 'serial_asc',
  };
  if (!init) return base;

  let searchField: SearchFieldMode = init.searchField || 'name';
  let query = init.query ?? '';

  if (!query) {
    if (init.serial?.trim()) {
      searchField = 'serial';
      query = init.serial.trim();
    } else if (init.name?.trim()) {
      searchField = 'name';
      query = init.name.trim();
    } else if (init.father?.trim()) {
      searchField = 'father';
      query = init.father.trim();
    } else if (init.mother?.trim()) {
      searchField = 'mother';
      query = init.mother.trim();
    } else if (init.voterId?.trim()) {
      searchField = 'voterId';
      query = init.voterId.trim();
    } else if (init.dob?.trim()) {
      searchField = 'dob';
      query = init.dob.trim();
    } else if (init.profession?.trim()) {
      searchField = 'profession';
      query = init.profession.trim();
    } else if (init.address?.trim()) {
      searchField = 'address';
      query = init.address.trim();
    } else if (init.omni?.trim()) {
      query = init.omni.trim();
    }
  }

  return {
    ...base,
    gender: init.gender || '',
    ageGroup: init.ageGroup || '',
    campaignFilter: init.campaignFilter || '',
    sortBy: init.sortBy || 'serial_asc',
    searchField,
    query,
  };
}

export const SearchScreen: React.FC<SearchScreenProps> = ({
  villageTitle,
  villageKey,
  voters,
  villageNames = [],
  villageOptions,
  onSwitchVillage,
  allowSlipPrint = true,
  annotationsMap = {},
  onAnnotationsChanged,
  onOpenVoterDetail,
  initialSearch,
  initialSettings,
  onBack,
  onOpenAnalytics,
  onOpenSlipModal,
  onLogoutClick,
  showToast,
  onStateChange,
}) => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getRecentSearches());

  useLockBodyScroll(showMoreMenu || showSortMenu);

  const [settings, setSettings] = useState<AppSettings>(() => ({
    fullList: initialSettings?.fullList ?? false,
    stats: initialSettings?.stats ?? false,
    migrated: initialSettings?.migrated ?? false,
    viewMode: initialSettings?.viewMode ?? 'card',
  }));

  const [search, setSearch] = useState<AppSearchFilters>(() =>
    normalizeInitialSearch(initialSearch)
  );

  const [slipQueue, setSlipQueue] = useState<Voter[]>(() => getSlipQueue());
  const [renderedCount, setRenderedCount] = useState(RENDER_BATCH_SIZE);
  const observerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activeField: SearchFieldMode = search.searchField || 'name';
  const activeFieldMeta =
    SEARCH_FIELD_MODES.find((m) => m.id === activeField) || SEARCH_FIELD_MODES[0];

  useEffect(() => {
    const syncQueue = () => setSlipQueue(getSlipQueue());
    window.addEventListener('focus', syncQueue);
    window.addEventListener('slip-queue-updated', syncQueue);
    return () => {
      window.removeEventListener('focus', syncQueue);
      window.removeEventListener('slip-queue-updated', syncQueue);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 450);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (onStateChange) {
      onStateChange(search, settings);
    }
  }, [search, settings, onStateChange]);

  const totalActive = useMemo(
    () => voters.filter((v) => (v._isMigrated !== undefined ? !v._isMigrated : !isMigrated(v))).length,
    [voters]
  );
  const totalMigrated = useMemo(
    () => voters.filter((v) => (v._isMigrated !== undefined ? v._isMigrated : isMigrated(v))).length,
    [voters]
  );

  const computedVillageOptions: VillageMenuOption[] = useMemo(() => {
    if (villageOptions && villageOptions.length > 0) return villageOptions;
    return [
      { key: 'all', label: 'সকল গ্রাম (ইউনিয়ন)' },
      ...villageNames.map((vn) => ({ key: vn, label: vn })),
    ];
  }, [villageOptions, villageNames]);

  const professionStats = useMemo(() => {
    const activeData = voters.filter((v) =>
      v._isMigrated !== undefined ? !v._isMigrated : !isMigrated(v)
    );
    const counts: Record<string, number> = {};
    activeData.forEach((v) => {
      const prof = (v._profession || v.profession || '').trim();
      const label = prof === '' || prof === 'nan' ? 'পেশা দেওয়া নেই' : prof;
      counts[label] = (counts[label] || 0) + 1;
    });
    return counts;
  }, [voters]);

  const uniqueProfessions = useMemo(() => {
    return Object.keys(professionStats)
      .filter((p) => p !== 'পেশা দেওয়া নেই')
      .sort((a, b) => a.localeCompare(b, 'bn'));
  }, [professionStats]);

  const filteredVoters = useMemo(
    () => filterAndSortVoters(voters, search, settings, annotationsMap),
    [voters, search, settings, annotationsMap]
  );

  useEffect(() => {
    setRenderedCount(RENDER_BATCH_SIZE);
  }, [filteredVoters]);

  // Save debounced recent search query
  useEffect(() => {
    const term = (search.query || '').trim();
    if (term.length < 2) return;
    const t = setTimeout(() => {
      setRecentSearches(addRecentSearch(term));
    }, 1200);
    return () => clearTimeout(t);
  }, [search.query]);

  // Infinite scroll observer
  useEffect(() => {
    if (!observerRef.current || renderedCount >= filteredVoters.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setRenderedCount((prev) => Math.min(prev + RENDER_BATCH_SIZE, filteredVoters.length));
        }
      },
      { rootMargin: '320px' }
    );
    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [renderedCount, filteredVoters.length]);

  const displayedVoters = useMemo(
    () => filteredVoters.slice(0, renderedCount),
    [filteredVoters, renderedCount]
  );

  const handleSelectSearchField = (mode: SearchFieldMode) => {
    setSearch((prev) => {
      let nextQuery = prev.query || '';
      if (mode === 'dob' && nextQuery) {
        nextQuery = formatDobInput(nextQuery);
      }
      return {
        ...prev,
        searchField: mode,
        query: nextQuery,
        omni: '',
        serial: '',
        name: '',
        father: '',
        mother: '',
        dob: '',
        voterId: '',
        address: '',
        profession: '',
      };
    });
    setTimeout(() => inputRef.current?.focus(), 40);
  };

  const handleQueryInputChange = (rawVal: string) => {
    const val = activeField === 'dob' ? formatDobInput(rawVal) : rawVal;
    setSearch((prev) => ({
      ...prev,
      searchField: activeField,
      query: val,
      omni: '',
      serial: '',
      name: '',
      father: '',
      mother: '',
      dob: '',
      voterId: '',
      address: '',
      profession: '',
    }));
  };

  const handleToggleQueue = (voter: Voter) => {
    if (!allowSlipPrint) return;
    const res = toggleVoterInSlipQueue(voter);
    setSlipQueue(res.queue);
    if (res.added) {
      showToast(
        `"${voter.name}" প্রিন্ট কিউতে যুক্ত হয়েছে (${convertToBengaliNumbers(res.queue.length)} জন)`
      );
    } else {
      showToast(`"${voter.name}" কিউ থেকে সরানো হয়েছে`);
    }
  };

  const handleClearQueue = () => {
    clearSlipQueue();
    setSlipQueue([]);
    showToast('একসাথে প্রিন্ট কিউ খালি করা হয়েছে');
  };

  const handleClearAllFilters = () => {
    setSearch((prev) => ({
      searchField: prev.searchField || 'name',
      query: '',
      omni: '',
      serial: '',
      name: '',
      father: '',
      mother: '',
      dob: '',
      voterId: '',
      address: '',
      profession: '',
      gender: '',
      ageGroup: '',
      campaignFilter: '',
      sortBy: 'serial_asc',
    }));
  };

  const handleVoiceSearch = () => {
    import('../lib/nativeBridge').then(({ startBengaliVoiceInput }) => {
      startBengaliVoiceInput({
        onStart: () => setIsListening(true),
        onEnd: () => setIsListening(false),
        onResult: (transcript) => {
          handleQueryInputChange(transcript);
          setRecentSearches(addRecentSearch(transcript));
        },
        onError: (msg) => {
          setIsListening(false);
          showToast(msg);
        },
      });
    });
  };

  const copyToClipboard = (txt: string, successMsg: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(txt)
        .then(() => showToast(successMsg))
        .catch(() => fallbackCopy(txt, successMsg));
    } else {
      fallbackCopy(txt, successMsg);
    }
  };

  const fallbackCopy = (text: string, successMsg: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy')
        ? showToast(successMsg)
        : showToast('কপি করা সম্ভব হয়নি!');
    } catch {
      showToast('কপি সাপোর্ট করছে না!');
    }
    document.body.removeChild(textArea);
  };

  const handleCopy = (voter: Voter) => {
    copyToClipboard(formatVoterShareText(voter), 'ভোটার তথ্য কপি হয়েছে!');
  };

  const handleCopyVoterId = (voterId: string) => {
    copyToClipboard(voterId, `ভোটার নং (${voterId}) কপি হয়েছে!`);
  };

  const handlePrint = (voter: Voter) => {
    if (!allowSlipPrint) {
      showToast('ভোটার স্লিপ প্রিন্ট অপশনটি বর্তমানে অ্যাডমিন কর্তৃক বন্ধ রয়েছে।');
      return;
    }
    if (onOpenSlipModal) {
      onOpenSlipModal(voter);
      return;
    }
    const ageText = calculateAge(voter.dob) ? ` <b>${calculateAge(voter.dob)}</b>` : '';
    const printHTML = `<!DOCTYPE html><html lang="bn"><head><meta charset="UTF-8"><title>প্রিন্ট - ${
      voter.name || 'Voter'
    }</title><style>body{font-family:'Noto Sans Bengali',sans-serif;padding:20px}.print-card{border:2px solid #1e293b;border-radius:12px;padding:20px;max-width:400px;margin:auto}table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px dashed #cbd5e1}</style></head><body><div class="print-card"><h3>ভোটার তথ্য</h3><table><tr><td>ক্রমিক:</td><td><b>${
      voter.serialNo || '-'
    }</b></td></tr><tr><td>নাম:</td><td><b>${voter.name || '-'}</b></td></tr><tr><td>জন্ম:</td><td>${
      voter.dob || '-'
    }${ageText}</td></tr><tr><td>পিতা:</td><td>${voter.fatherName || '-'}</td></tr><tr><td>ভোটার নং:</td><td><b>${
      voter.voterId || '-'
    }</b></td></tr></table></div><script>window.onload=function(){window.print();}<\/script></body></html>`;
    let printIframe = document.getElementById('printIframe') as HTMLIFrameElement;
    if (!printIframe) {
      printIframe = document.createElement('iframe');
      printIframe.id = 'printIframe';
      printIframe.style.position = 'absolute';
      printIframe.style.width = '0px';
      printIframe.style.height = '0px';
      printIframe.style.border = 'none';
      document.body.appendChild(printIframe);
    }
    const iframeDoc = printIframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(printHTML);
      iframeDoc.close();
    }
  };

  const toggleGenderChip = (g: string) => {
    setSearch((prev) => ({
      ...prev,
      gender: prev.gender === g ? '' : g,
    }));
    if (!hasActiveSearchCriteria({ ...search, gender: g }, settings)) {
      setSettings((s) => ({ ...s, fullList: true }));
    }
  };

  const toggleAgeChip = (ag: AgeGroupFilter) => {
    setSearch((prev) => ({
      ...prev,
      ageGroup: prev.ageGroup === ag ? '' : ag,
    }));
  };

  const toggleCampaignChip = (cf: CampaignStatusFilter) => {
    setSearch((prev) => ({
      ...prev,
      campaignFilter: prev.campaignFilter === cf ? '' : cf,
    }));
  };

  const isCriteriaActive = hasActiveSearchCriteria(search, settings);
  const ActiveFieldIcon = activeFieldMeta.icon;

  const sortLabels: Record<VoterSortOption, string> = {
    serial_asc: 'ক্রমিক (১→৯)',
    serial_desc: 'ক্রমিক (৯→১)',
    name_asc: 'নাম (অ→হ)',
    age_asc: 'কম বয়স আগে',
    age_desc: 'বেশি বয়স আগে',
  };

  return (
    <div className="space-y-3.5 animate-slide-down pb-12">
      {/* 1. Material Design 3 Top Search Header Card */}
      <div className="m3-card-elevated p-3.5 sm:p-5 space-y-3">
        {/* Row 1: Back, Compact Village Selector Popup, Counts, View Mode & More Menu */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="m3-icon-btn-tonal shrink-0"
              title="হোমে ফিরুন"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              {onSwitchVillage && computedVillageOptions.length > 1 ? (
                <VillageDropdownMenu
                  selectedKey={villageKey}
                  options={computedVillageOptions}
                  onSelect={(vk) => onSwitchVillage(vk)}
                />
              ) : (
                <h2 className="text-base sm:text-lg font-black truncate">
                  {villageTitle}
                </h2>
              )}

              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full m3-tonal-container">
                সক্রিয়: {convertToBengaliNumbers(totalActive)}
              </span>
              {totalMigrated > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--md-error-container)] text-[var(--md-on-error-container)]">
                  কর্তিত: {convertToBengaliNumbers(totalMigrated)}
                </span>
              )}
            </div>
          </div>

          {/* Right Toolbar */}
          <div className="flex items-center gap-1.5 ml-auto">
            {/* Sort Popover Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSortMenu((v) => !v)}
                className={`h-9 px-2.5 rounded-full text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer ${
                  search.sortBy && search.sortBy !== 'serial_asc'
                    ? 'm3-tonal-container'
                    : 'bg-[var(--md-surface-container-high)] text-[var(--md-on-surface-variant)]'
                }`}
                title="সর্টিং পরিবর্তন করুন"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span className="hidden md:inline">
                  {sortLabels[search.sortBy || 'serial_asc']}
                </span>
              </button>

              {showSortMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/15"
                    onClick={() => setShowSortMenu(false)}
                  />
                  <div className="absolute right-0 top-11 w-48 m3-card-elevated rounded-2xl p-1.5 z-50 shadow-xl space-y-0.5 overscroll-contain animate-m3-scale">
                    <div className="px-2.5 py-1 text-[10px] font-extrabold text-[var(--md-on-surface-variant)] border-b border-[var(--md-outline-variant)]/40 mb-1">
                      সর্টিং ধরন
                    </div>
                    {(Object.keys(sortLabels) as VoterSortOption[]).map((opt) => {
                      const active = (search.sortBy || 'serial_asc') === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setSearch((s) => ({ ...s, sortBy: opt }));
                            setShowSortMenu(false);
                          }}
                          className={`w-full px-2.5 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer ${
                            active
                              ? 'm3-tonal-container font-extrabold'
                              : 'hover:bg-[var(--md-surface-container-high)] font-semibold'
                          }`}
                        >
                          <span>{sortLabels[opt]}</span>
                          {active && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Card vs Compact View Switcher */}
            <button
              type="button"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  viewMode: s.viewMode === 'compact' ? 'card' : 'compact',
                }))
              }
              className="m3-icon-btn-tonal"
              title={
                settings.viewMode === 'compact'
                  ? 'বিস্তারিত কার্ড ভিউ দেখুন'
                  : 'কমপ্যাক্ট লিস্ট ভিউ দেখুন'
              }
            >
              {settings.viewMode === 'compact' ? (
                <LayoutGrid className="w-[18px] h-[18px]" />
              ) : (
                <List className="w-[18px] h-[18px]" />
              )}
            </button>

            {filteredVoters.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  downloadVotersCsv(filteredVoters, villageTitle || 'voters');
                  showToast('CSV ফাইল ডাউনলোড হচ্ছে...');
                }}
                className="m3-icon-btn-tonal"
                title="তালিকাটি Excel / CSV ফাইলে ডাউনলোড করুন"
              >
                <Download className="w-[18px] h-[18px]" />
              </button>
            )}

            {onOpenAnalytics && (
              <button
                type="button"
                onClick={() => onOpenAnalytics(villageKey)}
                className="m3-btn-tonal h-9 px-3 text-xs hidden lg:inline-flex items-center gap-1.5"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>অ্যানালাইসিস</span>
              </button>
            )}

            {allowSlipPrint && onOpenSlipModal && (
              <button
                type="button"
                onClick={() => onOpenSlipModal(null)}
                className="m3-btn-filled h-9 px-3 text-xs hidden sm:inline-flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>স্লিপ মেকার</span>
              </button>
            )}

            {/* More Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMoreMenu((v) => !v)}
                className="m3-icon-btn-tonal"
                title="আরও অপশন"
              >
                <MoreVertical className="w-[18px] h-[18px]" />
              </button>

              {showMoreMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/15"
                    onClick={() => setShowMoreMenu(false)}
                  />
                  <div className="absolute right-0 top-11 w-64 m3-card-elevated rounded-2xl p-2 z-50 shadow-xl space-y-1 overscroll-contain animate-m3-scale">
                    <button
                      type="button"
                      onClick={() => {
                        setSettings((p) => ({ ...p, fullList: !p.fullList }));
                        setShowMoreMenu(false);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl hover:bg-[var(--md-surface-container-high)] text-xs font-bold flex items-center justify-between cursor-pointer"
                    >
                      <span>সম্পূর্ণ ভোটার তালিকা দেখান</span>
                      {settings.fullList && <Check className="w-4 h-4 text-[var(--md-primary)]" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSettings((p) => ({ ...p, stats: !p.stats }));
                        setShowMoreMenu(false);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl hover:bg-[var(--md-surface-container-high)] text-xs font-bold flex items-center justify-between cursor-pointer"
                    >
                      <span>পেশা ভিত্তিক পরিসংখ্যান</span>
                      {settings.stats && <Check className="w-4 h-4 text-[var(--md-primary)]" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSettings((p) => ({ ...p, migrated: !p.migrated }));
                        setShowMoreMenu(false);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl hover:bg-[var(--md-error-container)]/40 text-xs font-bold text-[var(--md-error)] flex items-center justify-between cursor-pointer"
                    >
                      <span>কর্তিত / স্থানান্তরিত ভোটার</span>
                      {settings.migrated && <Check className="w-4 h-4" />}
                    </button>

                    {onOpenAnalytics && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreMenu(false);
                          onOpenAnalytics(villageKey);
                        }}
                        className="w-full px-3 py-2.5 rounded-xl hover:bg-[var(--md-surface-container-high)] text-xs font-bold flex items-center gap-2 cursor-pointer lg:hidden"
                      >
                        <BarChart3 className="w-4 h-4 text-[var(--md-primary)]" />
                        <span>গ্রামের ডাটা অ্যানালাইসিস</span>
                      </button>
                    )}

                    <hr className="border-[var(--md-outline-variant)]/50 my-1" />

                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreMenu(false);
                        onLogoutClick();
                      }}
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--md-error-container)]/60 hover:bg-[var(--md-error-container)] text-[var(--md-on-error-container)] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>লগআউট করুন</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Modern Single-Field Search Mode Selector */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            <span className="text-[11px] font-extrabold text-[var(--md-on-surface-variant)] shrink-0 mr-0.5">
              খুঁজুন:
            </span>
            {SEARCH_FIELD_MODES.map((mode) => {
              const Icon = mode.icon;
              const selected = activeField === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleSelectSearchField(mode.id)}
                  className={`h-8 px-3 rounded-full text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition cursor-pointer active:scale-95 ${
                    selected
                      ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)] shadow-xs'
                      : 'bg-[var(--md-surface-container-high)] text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-container-highest)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          {/* Focused Single Search Input for the Selected Mode */}
          <div className="m3-search-bar">
            <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full m3-tonal-container inline-flex items-center gap-1 shrink-0">
              <ActiveFieldIcon className="w-3.5 h-3.5" />
              <span>{activeFieldMeta.label}</span>
            </span>

            <input
              ref={inputRef}
              id="voter-single-field-search-input"
              type="text"
              inputMode={
                activeField === 'voterId'
                  ? 'numeric'
                  : 'text'
              }
              value={search.query || ''}
              onChange={(e) => handleQueryInputChange(e.target.value)}
              placeholder={activeFieldMeta.placeholder}
              className="w-full bg-transparent text-sm font-medium focus:outline-none"
            />

            {search.query && (
              <button
                type="button"
                onClick={() => handleQueryInputChange('')}
                className="m3-icon-btn !w-8 !h-8 shrink-0"
                title="লেখা মুছুন"
              >
                <X className="w-4 h-4" />
              </button>
            )}

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
          </div>

          {activeFieldMeta.hint && (
            <p className="text-[11px] font-semibold text-[var(--md-primary)] px-1">
              ✨ {activeFieldMeta.hint}
            </p>
          )}

          {/* Quick Profession Selector Chips when Profession mode is chosen */}
          {activeField === 'profession' && uniqueProfessions.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {uniqueProfessions.map((prof) => {
                const isProfSelected = (search.query || '').trim() === prof;
                return (
                  <button
                    key={prof}
                    type="button"
                    onClick={() => handleQueryInputChange(isProfSelected ? '' : prof)}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 transition cursor-pointer ${
                      isProfSelected
                        ? 'm3-tonal-container ring-1 ring-[var(--md-primary)]'
                        : 'bg-[var(--md-surface-container-low)] border border-[var(--md-outline-variant)]'
                    }`}
                  >
                    {prof} ({convertToBengaliNumbers(professionStats[prof] || 0)})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Row 3: Horizontal Scrollable M3 Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => setSettings((s) => ({ ...s, fullList: !s.fullList, migrated: false }))}
            className={`m3-chip ${settings.fullList && !settings.migrated ? 'm3-chip-selected' : ''}`}
          >
            {settings.fullList && !settings.migrated && <Check className="w-3.5 h-3.5" />}
            <span>সম্পূর্ণ তালিকা</span>
          </button>

          <button
            type="button"
            onClick={() => toggleGenderChip('পুরুষ')}
            className={`m3-chip ${search.gender === 'পুরুষ' ? 'm3-chip-selected' : ''}`}
          >
            <span>পুরুষ</span>
          </button>

          <button
            type="button"
            onClick={() => toggleGenderChip('মহিলা')}
            className={`m3-chip ${search.gender === 'মহিলা' ? 'm3-chip-selected' : ''}`}
          >
            <span>মহিলা</span>
          </button>

          <button
            type="button"
            onClick={() => toggleAgeChip('youth')}
            className={`m3-chip ${search.ageGroup === 'youth' ? 'm3-chip-selected' : ''}`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>নতুন (১৮-২৫)</span>
          </button>

          <button
            type="button"
            onClick={() => toggleAgeChip('senior')}
            className={`m3-chip ${search.ageGroup === 'senior' ? 'm3-chip-selected' : ''}`}
          >
            <Award className="w-3.5 h-3.5 text-amber-600" />
            <span>প্রবীণ (৬০+)</span>
          </button>

          <button
            type="button"
            onClick={() => toggleCampaignChip('starred')}
            className={`m3-chip ${search.campaignFilter === 'starred' ? 'm3-chip-selected' : ''}`}
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-500" />
            <span>বুকমার্ক</span>
          </button>

          <button
            type="button"
            onClick={() => toggleCampaignChip('voted')}
            className={`m3-chip ${search.campaignFilter === 'voted' ? 'm3-chip-selected' : ''}`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>ভোট সম্পন্ন</span>
          </button>

          <button
            type="button"
            onClick={() => {
              toggleCampaignChip('unvoted');
              if (!settings.fullList) setSettings((s) => ({ ...s, fullList: true }));
            }}
            className={`m3-chip ${search.campaignFilter === 'unvoted' ? 'm3-chip-selected' : ''}`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>ভোট বাকি</span>
          </button>

          <button
            type="button"
            onClick={() => setSettings((s) => ({ ...s, stats: !s.stats }))}
            className={`m3-chip ${settings.stats ? 'm3-chip-selected' : ''}`}
          >
            <span>পেশা পরিসংখ্যান</span>
          </button>

          <button
            type="button"
            onClick={() => setSettings((s) => ({ ...s, migrated: !s.migrated }))}
            className={`m3-chip ${
              settings.migrated
                ? '!bg-[var(--md-error-container)] !text-[var(--md-on-error-container)] !border-transparent font-bold'
                : ''
            }`}
          >
            <span>কর্তিত ({convertToBengaliNumbers(totalMigrated)})</span>
          </button>
        </div>

        {/* Interactive Profession Statistics Pills */}
        {settings.stats && (
          <div className="m3-card-filled p-3.5 space-y-2 animate-slide-down">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[var(--md-primary)]">
                পেশা ভিত্তিক পরিসংখ্যান (ট্যাপ করে ফিল্টার করুন)
              </span>
              {activeField === 'profession' && search.query && (
                <button
                  type="button"
                  onClick={() => handleQueryInputChange('')}
                  className="text-[11px] font-bold text-[var(--md-error)] cursor-pointer"
                >
                  ফিল্টার সরান ✕
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(professionStats).map(([prof, count]) => {
                const selectable = prof !== 'পেশা দেওয়া নেই';
                const active = activeField === 'profession' && search.query === prof;
                return (
                  <button
                    key={prof}
                    type="button"
                    disabled={!selectable}
                    onClick={() => {
                      if (!selectable) return;
                      setSearch((s) => ({
                        ...s,
                        searchField: 'profession',
                        query: active ? '' : prof,
                      }));
                    }}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition ${
                      active
                        ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)] shadow-xs'
                        : 'bg-[var(--md-surface-container-lowest)] text-[var(--md-on-surface)] border border-[var(--md-outline-variant)]'
                    } ${selectable ? 'cursor-pointer hover:border-[var(--md-primary)]' : 'opacity-70'}`}
                  >
                    {prof}: {convertToBengaliNumbers(count)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Searches Row (shown when search is empty) */}
        {!isCriteriaActive && recentSearches.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            <span className="text-[11px] font-bold text-[var(--md-on-surface-variant)] inline-flex items-center gap-1">
              <History className="w-3.5 h-3.5" />
              সাম্প্রতিক:
            </span>
            {recentSearches.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => handleQueryInputChange(term)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[var(--md-surface-container)] hover:bg-[var(--md-surface-container-high)] transition cursor-pointer"
              >
                {term}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                clearRecentSearches();
                setRecentSearches([]);
              }}
              className="text-[11px] text-[var(--md-on-surface-variant)] hover:text-[var(--md-error)] underline ml-auto cursor-pointer"
            >
              মুছুন
            </button>
          </div>
        )}
      </div>

      {/* 2. Status Bar & Batch Action Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap px-0.5">
        <div
          className={`text-xs font-bold px-3.5 py-2 rounded-2xl flex-1 border ${
            !isCriteriaActive
              ? 'm3-card-filled border-transparent text-[var(--md-on-surface-variant)]'
              : filteredVoters.length > 0
              ? 'm3-tonal-container border-transparent'
              : 'bg-[var(--md-error-container)] text-[var(--md-on-error-container)] border-transparent'
          }`}
        >
          {!isCriteriaActive
            ? `${activeFieldMeta.label} দিয়ে খুঁজতে উপরে লিখুন অথবা চিপ বাছাই করুন`
            : filteredVoters.length > 0
            ? `পাওয়া গেছে: ${convertToBengaliNumbers(filteredVoters.length)} জন ভোটার`
            : 'দুঃখিত, কোনো ভোটার পাওয়া যায়নি'}
        </div>

        {allowSlipPrint && filteredVoters.length > 0 && filteredVoters.length <= 25 && (
          <button
            type="button"
            onClick={() => {
              const updated = addToSlipQueue(filteredVoters);
              setSlipQueue(updated);
              showToast(
                `${convertToBengaliNumbers(filteredVoters.length)} জন ভোটার একসাথে প্রিন্ট কিউতে যুক্ত হয়েছে!`
              );
            }}
            className="m3-btn-tonal h-9 px-3.5 text-xs inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>সবাইকে প্রিন্ট কিউতে নিন</span>
          </button>
        )}

        {isCriteriaActive && (
          <button
            type="button"
            onClick={() => {
              handleClearAllFilters();
              setSettings((s) => ({ ...s, fullList: false, migrated: false }));
            }}
            className="m3-btn-outlined h-9 px-3.5 text-xs text-[var(--md-error)] inline-flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>রিসেট</span>
          </button>
        )}
      </div>

      {/* 3. Multi-Voter Slip Queue Banner */}
      {allowSlipPrint && slipQueue.length > 0 && (
        <div className="m3-tonal-container rounded-3xl p-4 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="text-xs sm:text-sm font-black flex items-center gap-2 flex-wrap">
              <Printer className="w-4 h-4 shrink-0" />
              <span>
                একসাথে স্লিপ প্রিন্ট কিউতে{' '}
                <strong className="underline">
                  {convertToBengaliNumbers(slipQueue.length)} জন
                </strong>{' '}
                যুক্ত আছেন
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {slipQueue.slice(0, 5).map((qv, idx) => (
                <span
                  key={idx}
                  className="text-[11px] bg-black/10 px-2 py-0.5 rounded-lg font-semibold"
                >
                  #{qv.serialNo} {qv.name}
                </span>
              ))}
              {slipQueue.length > 5 && (
                <span className="text-[11px] bg-black/15 px-2 py-0.5 rounded-lg font-bold">
                  +{convertToBengaliNumbers(slipQueue.length - 5)} জন
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleClearQueue}
              className="h-9 px-3 rounded-full bg-black/10 hover:bg-black/20 text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>খালি করুন</span>
            </button>
            {onOpenSlipModal && (
              <button
                type="button"
                onClick={() => onOpenSlipModal(slipQueue[0])}
                className="m3-btn-filled h-9 px-4 text-xs inline-flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>একসাথে প্রিন্ট করুন</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. Empty Prompt State */}
      {!isCriteriaActive && (
        <div className="m3-card-outlined p-8 sm:p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-3xl m3-tonal-container flex items-center justify-center mx-auto">
            <Search className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-extrabold">
              {villageTitle} — আধুনিক একক-ফিল্ড অনুসন্ধান
            </h3>
            <p className="text-xs text-[var(--md-on-surface-variant)] leading-relaxed">
              ওপরে যেকোনো একটি মাধ্যম (নাম, ক্রমিক নং, পিতার নাম, মাতার নাম বা ভোটার নং) বেছে নিয়ে নির্ভুলভাবে খুঁজুন।
            </p>
          </div>
          <div className="flex items-center justify-center gap-2.5 flex-wrap pt-1">
            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, fullList: true }))}
              className="m3-btn-filled py-2.5 px-5 text-xs inline-flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              <span>সম্পূর্ণ তালিকা দেখুন ({convertToBengaliNumbers(totalActive)} জন)</span>
            </button>
            <button
              type="button"
              onClick={() => toggleAgeChip('youth')}
              className="m3-btn-tonal py-2.5 px-4 text-xs inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>নতুন ভোটার (১৮-২৫)</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. Voter Cards List */}
      <div className="flex flex-col gap-2.5">
        {displayedVoters.map((voter, index) => {
          const vKey = getVoterUniqueKey(voter);
          return (
            <VoterCard
              key={`${vKey}_${index}`}
              voter={voter}
              viewMode={settings.viewMode || 'card'}
              annotation={annotationsMap[vKey]}
              allowSlipPrint={allowSlipPrint}
              onCopy={handleCopy}
              onCopyVoterId={handleCopyVoterId}
              onPrint={handlePrint}
              isQueued={isVoterInSlipQueue(voter, slipQueue)}
              onToggleQueue={handleToggleQueue}
              onToggleStar={(v) => {
                const res = toggleVoterStarred(v);
                if (onAnnotationsChanged) onAnnotationsChanged();
                showToast(
                  res.starred ? 'বুকমার্ক তালিকায় যুক্ত হয়েছে' : 'বুকমার্ক সরানো হয়েছে'
                );
              }}
              onToggleVoted={(v) => {
                const res = toggleVoterVoted(v);
                if (onAnnotationsChanged) onAnnotationsChanged();
                showToast(
                  res.voted
                    ? 'ভোট সম্পন্ন হিসেবে চিহ্নিত!'
                    : 'ভোট মার্ক মুছে ফেলা হয়েছে'
                );
              }}
              onOpenDetail={onOpenVoterDetail}
            />
          );
        })}

        {displayedVoters.length === 0 && isCriteriaActive && (
          <div className="m3-card-outlined p-10 text-center space-y-2">
            <p className="text-sm font-extrabold text-[var(--md-error)]">
              কোনো ভোটার তথ্য পাওয়া যায়নি
            </p>
            <p className="text-xs text-[var(--md-on-surface-variant)]">
              সার্চের ধরন ({activeFieldMeta.label}) ঠিক আছে কিনা দেখুন অথবা রিসেট করুন।
            </p>
          </div>
        )}

        {/* Load More Sentinel */}
        {renderedCount < filteredVoters.length && (
          <div ref={observerRef} className="text-center py-4">
            <button
              type="button"
              onClick={() =>
                setRenderedCount((prev) =>
                  Math.min(prev + RENDER_BATCH_SIZE, filteredVoters.length)
                )
              }
              className="m3-btn-primary-tonal py-2.5 px-6 text-xs"
            >
              আরও দেখুন (বাকি{' '}
              {convertToBengaliNumbers(filteredVoters.length - renderedCount)} জন)
            </button>
          </div>
        )}
      </div>

      {/* Floating Scroll-to-Top Material 3 FAB */}
      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-24 right-4 sm:right-6 z-30 m3-fab w-12 h-12 !rounded-2xl"
          title="উপরে যান"
          aria-label="উপরে যান"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
