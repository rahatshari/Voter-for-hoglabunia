import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Award,
  BarChart3,
  Bookmark,
  Check,
  CheckCircle2,
  Clock,
  Download,
  History,
  LayoutGrid,
  List,
  LogOut,
  Mic,
  MicOff,
  MoreVertical,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  AgeGroupFilter,
  AppSearchFilters,
  AppSettings,
  CampaignStatusFilter,
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
import { VoterCard } from './VoterCard';
import { VoterDetailTab } from './VoterDetailSheet';

interface SearchScreenProps {
  villageTitle: string;
  villageKey: string;
  voters: Voter[];
  villageNames?: string[];
  onSwitchVillage?: (villageKey: string) => void;
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

const EMPTY_SEARCH: AppSearchFilters = {
  omni: '',
  serial: '',
  name: '',
  father: '',
  mother: '',
  dob: '',
  voterId: '',
  profession: '',
  gender: '',
  ageGroup: '',
  campaignFilter: '',
  sortBy: 'serial_asc',
};

export const SearchScreen: React.FC<SearchScreenProps> = ({
  villageTitle,
  villageKey,
  voters,
  villageNames = [],
  onSwitchVillage,
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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getRecentSearches());

  const [settings, setSettings] = useState<AppSettings>(() => ({
    fullList: initialSettings?.fullList ?? false,
    stats: initialSettings?.stats ?? false,
    migrated: initialSettings?.migrated ?? false,
    viewMode: initialSettings?.viewMode ?? 'card',
  }));

  const [search, setSearch] = useState<AppSearchFilters>(() => ({
    ...EMPTY_SEARCH,
    ...(initialSearch || {}),
  }));

  // Sync if parent updates initialSearch / initialSettings (e.g. from Home preset chips or Analytics drilldown)
  useEffect(() => {
    if (initialSearch) {
      setSearch((prev) => ({ ...EMPTY_SEARCH, ...prev, ...initialSearch }));
    }
  }, [initialSearch]);

  useEffect(() => {
    if (initialSettings) {
      setSettings((prev) => ({ ...prev, ...initialSettings }));
    }
  }, [initialSettings]);

  const [slipQueue, setSlipQueue] = useState<Voter[]>(() => getSlipQueue());
  const [renderedCount, setRenderedCount] = useState(RENDER_BATCH_SIZE);
  const observerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncQueue = () => setSlipQueue(getSlipQueue());
    window.addEventListener('focus', syncQueue);
    window.addEventListener('slip-queue-updated', syncQueue);
    return () => {
      window.removeEventListener('focus', syncQueue);
      window.removeEventListener('slip-queue-updated', syncQueue);
    };
  }, []);

  // Show Floating Scroll-to-Top FAB after scrolling down
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

  // Smart filtered & sorted voters
  const filteredVoters = useMemo(
    () => filterAndSortVoters(voters, search, settings, annotationsMap),
    [voters, search, settings, annotationsMap]
  );

  // Count of advanced specific filters active
  const advancedActiveCount = useMemo(() => {
    let c = 0;
    if (search.serial.trim()) c++;
    if (search.name.trim()) c++;
    if (search.father.trim()) c++;
    if (search.mother.trim()) c++;
    if (search.dob.trim()) c++;
    if (search.voterId?.trim()) c++;
    if (search.profession.trim()) c++;
    if (search.sortBy && search.sortBy !== 'serial_asc') c++;
    return c;
  }, [search]);

  useEffect(() => {
    setRenderedCount(RENDER_BATCH_SIZE);
  }, [filteredVoters]);

  // Save debounced recent search query
  useEffect(() => {
    const term = (search.omni || search.name || '').trim();
    if (term.length < 2) return;
    const t = setTimeout(() => {
      setRecentSearches(addRecentSearch(term));
    }, 1200);
    return () => clearTimeout(t);
  }, [search.omni, search.name]);

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

  const handleToggleQueue = (voter: Voter) => {
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
    setSearch({ ...EMPTY_SEARCH });
  };

  const handleVoiceSearch = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('এই ব্রাউজারে ভয়েস সার্চ সাপোর্ট নেই');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'bn-BD';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        setIsListening(false);
        if (transcript.trim()) {
          setSearch((prev) => ({ ...prev, omni: transcript.trim() }));
          setRecentSearches(addRecentSearch(transcript.trim()));
        }
      };
      recognition.onerror = () => {
        setIsListening(false);
        showToast('ভয়েস বুঝতে সমস্যা হয়েছে, আবার চেষ্টা করুন');
      };
      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch {
      setIsListening(false);
    }
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

  return (
    <div className="space-y-3.5 animate-slide-down pb-12">
      {/* 1. Material Design 3 Top Search Header Card */}
      <div className="m3-card-elevated p-3.5 sm:p-5 space-y-3.5">
        {/* Row 1: Back, Village Selector, Counts, View Mode & More Menu */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="m3-icon-btn-tonal shrink-0"
              title="হোমে ফিরুন"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {onSwitchVillage && villageNames.length > 0 ? (
                  <select
                    value={villageKey}
                    onChange={(e) => onSwitchVillage(e.target.value)}
                    aria-label="গ্রাম নির্বাচন করুন"
                    className="font-black text-base sm:text-lg bg-transparent text-[var(--md-on-surface)] focus:outline-none cursor-pointer pr-1 max-w-[190px] sm:max-w-xs truncate"
                  >
                    <option value="all">সকল গ্রাম (ইউনিয়ন)</option>
                    {villageNames.map((vn) => (
                      <option key={vn} value={vn}>
                        {vn}
                      </option>
                    ))}
                  </select>
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
          </div>

          {/* Right Toolbar */}
          <div className="flex items-center gap-1.5 ml-auto">
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
                className="m3-btn-tonal h-9 px-3 text-xs hidden md:inline-flex items-center gap-1.5"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>অ্যানালাইসিস</span>
              </button>
            )}

            {onOpenSlipModal && (
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
                    className="fixed inset-0 z-40"
                    onClick={() => setShowMoreMenu(false)}
                  />
                  <div className="absolute right-0 top-11 w-64 m3-card-elevated rounded-2xl p-2 z-50 shadow-xl space-y-1 animate-m3-scale">
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
                        className="w-full px-3 py-2.5 rounded-xl hover:bg-[var(--md-surface-container-high)] text-xs font-bold flex items-center gap-2 cursor-pointer md:hidden"
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

        {/* Row 2: Prominent M3 Pill Omni-Search Bar + Voice + Advanced Toggle */}
        <div className="m3-search-bar">
          <Search className="w-5 h-5 text-[var(--md-primary)] shrink-0 ml-0.5" />
          <input
            id="voter-omni-search-input"
            type="text"
            value={search.omni || ''}
            onChange={(e) => setSearch((prev) => ({ ...prev, omni: e.target.value }))}
            placeholder="নাম, পিতা, মাতা, ভোটার নং বা ক্রমিক (যেমন: ১-৫০)..."
            className="w-full bg-transparent text-sm font-medium focus:outline-none"
          />

          {search.omni && (
            <button
              type="button"
              onClick={() => setSearch((prev) => ({ ...prev, omni: '' }))}
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

          <button
            type="button"
            onClick={() => setShowAdvancedFilters((v) => !v)}
            className={`h-9 px-3 rounded-full text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition cursor-pointer ${
              showAdvancedFilters || advancedActiveCount > 0
                ? 'm3-tonal-container'
                : 'bg-[var(--md-surface-container-lowest)] text-[var(--md-on-surface-variant)] border border-[var(--md-outline-variant)]'
            }`}
            title="আলাদা ঘর ও সর্টিং ফিল্টার"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">ফিল্টার</span>
            {advancedActiveCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[var(--md-primary)] text-[var(--md-on-primary)] text-[10px] flex items-center justify-center">
                {convertToBengaliNumbers(advancedActiveCount)}
              </span>
            )}
          </button>
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

        {/* Collapsible Advanced Multi-Field Search & Sort Panel */}
        {showAdvancedFilters && (
          <div className="m3-card-filled p-3.5 space-y-3 animate-slide-down">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[var(--md-on-surface-variant)]">
                উন্নত ফিল্টার ও সর্টিং
              </span>
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="text-xs font-bold text-[var(--md-error)] inline-flex items-center gap-1 cursor-pointer hover:underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>সব ফিল্টার মুছুন</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <input
                type="text"
                value={search.serial}
                onChange={(e) => setSearch({ ...search, serial: e.target.value })}
                placeholder="ক্রমিক বা রেঞ্জ (যেমন: ১০০-১৫০)"
                className="m3-input w-full"
              />
              <input
                type="text"
                value={search.name}
                onChange={(e) => setSearch({ ...search, name: e.target.value })}
                placeholder="ভোটারের নাম"
                className="m3-input w-full"
              />
              <input
                type="text"
                value={search.father}
                onChange={(e) => setSearch({ ...search, father: e.target.value })}
                placeholder="পিতার নাম"
                className="m3-input w-full"
              />
              <input
                type="text"
                value={search.mother}
                onChange={(e) => setSearch({ ...search, mother: e.target.value })}
                placeholder="মাতার নাম"
                className="m3-input w-full"
              />
              <input
                type="text"
                value={search.dob}
                onChange={(e) =>
                  setSearch((prev) => ({ ...prev, dob: formatDobInput(e.target.value) }))
                }
                placeholder="জন্ম তারিখ (২৩/০২/২০০১)"
                className="m3-input w-full"
              />
              <input
                type="text"
                value={search.voterId || ''}
                onChange={(e) => setSearch({ ...search, voterId: e.target.value })}
                placeholder="ভোটার আইডি / এনআইডি নং"
                className="m3-input w-full"
              />
              <select
                value={search.profession}
                onChange={(e) => setSearch({ ...search, profession: e.target.value })}
                className="m3-input w-full cursor-pointer"
              >
                <option value="">সকল পেশা</option>
                {uniqueProfessions.map((p) => (
                  <option key={p} value={p}>
                    {p} ({convertToBengaliNumbers(professionStats[p] || 0)})
                  </option>
                ))}
              </select>

              <select
                value={search.sortBy || 'serial_asc'}
                onChange={(e) =>
                  setSearch({ ...search, sortBy: e.target.value as VoterSortOption })
                }
                className="m3-input w-full cursor-pointer font-bold"
              >
                <option value="serial_asc">সর্টিং: ক্রমিক (১ → ৯)</option>
                <option value="serial_desc">সর্টিং: ক্রমিক (৯ → ১)</option>
                <option value="name_asc">সর্টিং: নাম (অ → হ)</option>
                <option value="age_asc">সর্টিং: কম বয়স আগে</option>
                <option value="age_desc">সর্টিং: বেশি বয়স আগে</option>
              </select>
            </div>
          </div>
        )}

        {/* Interactive Profession Statistics Pills (Clickable!) */}
        {settings.stats && (
          <div className="m3-card-filled p-3.5 space-y-2 animate-slide-down">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[var(--md-primary)]">
                পেশা ভিত্তিক পরিসংখ্যান (ট্যাপ করে ফিল্টার করুন)
              </span>
              {search.profession && (
                <button
                  type="button"
                  onClick={() => setSearch((s) => ({ ...s, profession: '' }))}
                  className="text-[11px] font-bold text-[var(--md-error)] cursor-pointer"
                >
                  ফিল্টার সরান ✕
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(professionStats).map(([prof, count]) => {
                const selectable = prof !== 'পেশা দেওয়া নেই';
                const active = search.profession === prof;
                return (
                  <button
                    key={prof}
                    type="button"
                    disabled={!selectable}
                    onClick={() =>
                      selectable &&
                      setSearch((s) => ({
                        ...s,
                        profession: s.profession === prof ? '' : prof,
                      }))
                    }
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
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-[11px] font-bold text-[var(--md-on-surface-variant)] inline-flex items-center gap-1">
              <History className="w-3.5 h-3.5" />
              সাম্প্রতিক:
            </span>
            {recentSearches.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => setSearch((s) => ({ ...s, omni: term }))}
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
            ? 'অনুসন্ধান বক্সে লিখুন, ভয়েস সার্চ করুন অথবা ওপরের চিপ বাছাই করুন'
            : filteredVoters.length > 0
            ? `পাওয়া গেছে: ${convertToBengaliNumbers(filteredVoters.length)} জন ভোটার`
            : 'দুঃখিত, কোনো ভোটার পাওয়া যায়নি'}
        </div>

        {filteredVoters.length > 0 && filteredVoters.length <= 25 && (
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
            <Users className="w-3.5 h-3.5" />
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

      {/* 3. Multi-Voter / Family Slip Queue Banner */}
      {slipQueue.length > 0 && (
        <div className="m3-tonal-container rounded-3xl p-4 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="text-xs sm:text-sm font-black flex items-center gap-2 flex-wrap">
              <Users className="w-4 h-4 shrink-0" />
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

      {/* 4. Empty Prompt State (Friendly Quick Actions when nothing typed yet) */}
      {!isCriteriaActive && (
        <div className="m3-card-outlined p-8 sm:p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-3xl m3-tonal-container flex items-center justify-center mx-auto">
            <Search className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-extrabold">
              {villageTitle} — দ্রুত ভোটার অনুসন্ধান
            </h3>
            <p className="text-xs text-[var(--md-on-surface-variant)] leading-relaxed">
              ওপরের সার্চ বারে যেকোনো নাম, পিতার নাম, ভোটার নম্বর অথবা ক্রমিক রেঞ্জ (যেমন: ১-১০০) লিখুন কিংবা নিচের বাটনে ট্যাপ করুন।
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
              বানান পরিবর্তন করে বা ফিল্টার রিসেট করে আবার চেষ্টা করুন।
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
