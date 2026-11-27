import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  Globe,
  Heart,
  LayoutGrid,
  List,
  MapPin,
  Printer,
  Search,
  StickyNote,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { SupportTagType, Voter, VoterAnnotation, VoterViewMode } from '../types';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';
import { SECURE_RTDB_RULES_JSON } from '../lib/cloudStore';
import {
  addToSlipQueue,
  clearSlipQueue,
  getVoterUniqueKey,
  isVoterInSlipQueue,
  toggleVoterInSlipQueue,
} from '../lib/voterSlipUtils';
import {
  SUPPORT_TAGS_META,
  downloadVotersCsv,
  formatVoterShareText,
  toggleVoterStarred,
  toggleVoterSupporter,
  toggleVoterVoted,
} from '../lib/voterTrackerStore';
import { VoterCard } from './VoterCard';
import { VoterDetailTab } from './VoterDetailSheet';

interface SavedVotersScreenProps {
  villagesData: Record<string, Voter[]>;
  annotationsMap: Record<string, VoterAnnotation>;
  slipQueue: Voter[];
  allowSlipPrint?: boolean;
  isAdmin?: boolean;
  sharedRulesNeeded?: boolean;
  sharedSyncSource?: 'firebase' | 'server' | 'local';
  onAnnotationsChanged: () => void;
  onSlipQueueChanged: () => void;
  onBackHome: () => void;
  onOpenSlipModal: (voter?: Voter | null) => void;
  onOpenVoterDetail: (voter: Voter, tab?: VoterDetailTab) => void;
  showToast: (msg: string) => void;
}

type HubSection = 'starred' | 'supporter' | 'voted' | 'tagged' | 'queue';
type VillageGroupingMode = 'separate' | 'combined';

function hasAnyAnnotation(ann?: VoterAnnotation): boolean {
  if (!ann) return false;
  return Boolean(
    ann.starred ||
      ann.voted ||
      ann.supportTag ||
      (ann.note && ann.note.trim()) ||
      (ann.phone && ann.phone.trim())
  );
}

export const SavedVotersScreen: React.FC<SavedVotersScreenProps> = ({
  villagesData,
  annotationsMap,
  slipQueue,
  allowSlipPrint = true,
  isAdmin = false,
  sharedRulesNeeded = false,
  sharedSyncSource = 'local',
  onAnnotationsChanged,
  onSlipQueueChanged,
  onBackHome,
  onOpenSlipModal,
  onOpenVoterDetail,
  showToast,
}) => {
  const [section, setSection] = useState<HubSection>('starred');
  const [villageGroupingMode, setVillageGroupingMode] =
    useState<VillageGroupingMode>('separate');
  const [selectedVillage, setSelectedVillage] = useState<string>('');
  const [tagFilter, setTagFilter] = useState<SupportTagType>('');
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<VoterViewMode>('card');

  const villageNames = useMemo(() => Object.keys(villagesData), [villagesData]);

  // Per-village counts of marked/saved voters + slipQueue so user sees each village's activity immediately
  const perVillageStats = useMemo(() => {
    const stats: Record<
      string,
      {
        totalMarked: number;
        starred: number;
        supporter: number;
        voted: number;
        tagged: number;
        queued: number;
      }
    > = {};

    for (const vName of villageNames) {
      const list = villagesData[vName] || [];
      let totalMarked = 0;
      let starred = 0;
      let supporter = 0;
      let voted = 0;
      let tagged = 0;

      for (const v of list) {
        const ann = annotationsMap[getVoterUniqueKey(v)];
        if (!hasAnyAnnotation(ann)) continue;
        totalMarked++;
        if (ann?.starred) starred++;
        if (ann?.supportTag === 'supporter') supporter++;
        if (ann?.voted) voted++;
        if (
          (ann?.supportTag && ann.supportTag !== 'supporter') ||
          (ann?.note && ann.note.trim()) ||
          (ann?.phone && ann.phone.trim())
        ) {
          tagged++;
        }
      }

      const queued = slipQueue.filter((qv) => qv.villageName === vName).length;
      stats[vName] = { totalMarked, starred, supporter, voted, tagged, queued };
    }
    return stats;
  }, [villagesData, villageNames, annotationsMap, slipQueue]);

  // Keep selectedVillage valid & default to the first village that has saved voters (or first village)
  useEffect(() => {
    if (villageNames.length === 0) {
      setSelectedVillage('');
      return;
    }
    if (selectedVillage && villageNames.includes(selectedVillage)) {
      return;
    }
    const firstWithData = villageNames.find(
      (vn) =>
        (perVillageStats[vn]?.totalMarked || 0) > 0 ||
        (perVillageStats[vn]?.queued || 0) > 0
    );
    setSelectedVillage(firstWithData || villageNames[0]);
  }, [villageNames, selectedVillage, perVillageStats]);

  // Scoped voters depending on Village Separation ('separate') vs Combined ('combined')
  const scopedVoters = useMemo(() => {
    if (villageGroupingMode === 'separate') {
      if (!selectedVillage) return [];
      return villagesData[selectedVillage] || [];
    }
    return Object.values(villagesData).flat();
  }, [villagesData, villageGroupingMode, selectedVillage]);

  const scopedSlipQueue = useMemo(() => {
    if (villageGroupingMode === 'separate') {
      if (!selectedVillage) return [];
      return slipQueue.filter((v) => v.villageName === selectedVillage);
    }
    return slipQueue;
  }, [slipQueue, villageGroupingMode, selectedVillage]);

  const categorized = useMemo(() => {
    const starred: Voter[] = [];
    const supporter: Voter[] = [];
    const voted: Voter[] = [];
    const tagged: Voter[] = [];

    for (const v of scopedVoters) {
      const ann = annotationsMap[getVoterUniqueKey(v)];
      if (!ann) continue;
      if (ann.starred) starred.push(v);
      if (ann.supportTag === 'supporter') supporter.push(v);
      if (ann.voted) voted.push(v);
      if (
        ann.supportTag ||
        (ann.note && ann.note.trim()) ||
        (ann.phone && ann.phone.trim())
      ) {
        tagged.push(v);
      }
    }

    return { starred, supporter, voted, tagged };
  }, [scopedVoters, annotationsMap]);

  const activeList = useMemo(() => {
    let base: Voter[] = [];
    if (section === 'starred') base = categorized.starred;
    else if (section === 'supporter') base = categorized.supporter;
    else if (section === 'voted') base = categorized.voted;
    else if (section === 'tagged') {
      base = tagFilter
        ? categorized.tagged.filter(
            (v) => annotationsMap[getVoterUniqueKey(v)]?.supportTag === tagFilter
          )
        : categorized.tagged;
    } else {
      base = scopedSlipQueue;
    }

    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (v) =>
        (v.name || '').toLowerCase().includes(q) ||
        (v.fatherName || '').toLowerCase().includes(q) ||
        (v.serialNo || '').includes(q) ||
        (v.voterId || '').includes(q) ||
        (v.villageName || '').toLowerCase().includes(q) ||
        (annotationsMap[getVoterUniqueKey(v)]?.updatedBy || '').toLowerCase().includes(q)
    );
  }, [section, categorized, scopedSlipQueue, tagFilter, annotationsMap, query]);

  // Group combined list by village so even in "সব গ্রাম একসাথে" mode each village has a crisp header
  const groupedByVillage = useMemo(() => {
    const groups: Array<{ village: string; voters: Voter[] }> = [];
    const map = new Map<string, Voter[]>();
    for (const v of activeList) {
      const vn = v.villageName || 'অন্যান্য';
      if (!map.has(vn)) map.set(vn, []);
      map.get(vn)!.push(v);
    }
    for (const [village, voters] of map.entries()) {
      groups.push({ village, voters });
    }
    return groups;
  }, [activeList]);

  const handleCopy = (voter: Voter) => {
    const txt = formatVoterShareText(voter);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(txt).then(() => showToast('ভোটার তথ্য কপি হয়েছে!'));
    }
  };

  const handleCopyVoterId = (id: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(id).then(() => showToast('ভোটার নম্বর কপি হয়েছে!'));
    }
  };

  const handleCopyFirebaseRules = (openConsole = false) => {
    const fallbackCopy = () => {
      const ta = document.createElement('textarea');
      ta.value = SECURE_RTDB_RULES_JSON;
      ta.style.position = 'fixed';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {}
      document.body.removeChild(ta);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(SECURE_RTDB_RULES_JSON).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }

    showToast(
      '✅ Firebase Rules কপি হয়েছে! খোলা পেজে আগের কোড মুছে Paste করে Publish বাটনে চাপ দিন।'
    );

    if (openConsole) {
      window.open(
        'https://console.firebase.google.com/project/voter-ba30b/database/voter-ba30b-default-rtdb/rules',
        '_blank',
        'noopener,noreferrer'
      );
    }
  };

  const renderVoterCardItem = (voter: Voter, idx: number) => {
    const vKey = getVoterUniqueKey(voter);
    return (
      <VoterCard
        key={`${vKey}_${idx}`}
        voter={voter}
        viewMode={viewMode}
        annotation={annotationsMap[vKey]}
        allowSlipPrint={allowSlipPrint}
        onCopy={handleCopy}
        onCopyVoterId={handleCopyVoterId}
        onPrint={(v) => onOpenSlipModal(v)}
        isQueued={isVoterInSlipQueue(voter, slipQueue)}
        onToggleQueue={(v) => {
          toggleVoterInSlipQueue(v);
          onSlipQueueChanged();
        }}
        onToggleStar={(v) => {
          toggleVoterStarred(v);
          onAnnotationsChanged();
        }}
        onToggleSupporter={(v) => {
          toggleVoterSupporter(v);
          onAnnotationsChanged();
        }}
        onToggleVoted={(v) => {
          toggleVoterVoted(v);
          onAnnotationsChanged();
        }}
        onOpenDetail={onOpenVoterDetail}
      />
    );
  };

  return (
    <div className="space-y-4 animate-slide-down">
      {/* M3 Top Bar */}
      <div className="m3-card-elevated p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackHome}
            className="m3-icon-btn-tonal shrink-0"
            title="হোমে ফিরুন"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-black tracking-tight">
                শেয়ার্ড বুকমার্ক ও সমর্থক হাব
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
                <Cloud className="w-3 h-3" />
                <span>
                  {sharedSyncSource === 'firebase'
                    ? 'সকল অ্যাকাউন্টে লাইভ শেয়ার্ড'
                    : 'টিম শেয়ার্ড মোড'}
                </span>
              </span>
            </div>
            <p className="text-xs text-[var(--md-on-surface-variant)] mt-0.5">
              যেকোনো অ্যাকাউন্ট থেকে যুক্ত বুকমার্ক, আমাদের সমর্থক ও ভোট সম্পন্ন ভোটার সবাই একসাথে দেখতে পারবেন
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode((m) => (m === 'card' ? 'compact' : 'card'))}
            className="m3-icon-btn-tonal"
            title={viewMode === 'card' ? 'কমপ্যাক্ট ভিউ' : 'কার্ড ভিউ'}
          >
            {viewMode === 'card' ? (
              <List className="w-4 h-4" />
            ) : (
              <LayoutGrid className="w-4 h-4" />
            )}
          </button>

          {activeList.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const suffix =
                  villageGroupingMode === 'separate' && selectedVillage
                    ? `${selectedVillage}_${section}`
                    : `all_villages_${section}`;
                downloadVotersCsv(activeList, suffix);
                showToast('CSV ফাইল ডাউনলোড শুরু হয়েছে!');
              }}
              className="m3-btn-primary-tonal h-9 px-3.5 text-xs inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV ডাউনলোড</span>
            </button>
          )}
        </div>
      </div>

      {/* Admin Helper if Firebase RTDB shared_annotations rule hasn't been published yet */}
      {isAdmin && sharedRulesNeeded && (
        <div className="m3-card-outlined border-amber-300 bg-amber-50/80 text-amber-950 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="space-y-0.5 max-w-2xl">
            <div className="font-black">
              ⚡ ফায়ারবেস ক্লাউডে সকল মোবাইলের লাইভ বুকমার্ক শেয়ারিং সক্রিয় করতে Rules আপডেট করুন
            </div>
            <p className="text-[11px] opacity-85">
              নিচের বাটনে ক্লিক করে নতুন Rules কপি করুন এবং Firebase Console → Realtime Database → Rules এ পেস্ট করে Publish দিন।
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleCopyFirebaseRules(false)}
              className="px-3 py-2 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Rules কপি করুন</span>
            </button>
            <button
              type="button"
              onClick={() => handleCopyFirebaseRules(true)}
              className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>কপি করে Rules পেজ খুলুন ↗</span>
            </button>
          </div>
        </div>
      )}

      {/* Village Separation vs Combined Mode Switcher + Village Tabs */}
      <div className="m3-card-elevated p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <span className="text-xs sm:text-sm font-black block">
              গ্রাম দেখার ধরন নির্বাচন করুন
            </span>
            <span className="text-[11px] text-[var(--md-on-surface-variant)]">
              {villageGroupingMode === 'separate'
                ? 'প্রত্যেক গ্রামের বুকমার্ক ও সমর্থক সম্পূর্ণ আলাদা রাখা হয়েছে (একটির সাথে আরেকটি মিশবে না)'
                : 'সকল গ্রামের বুকমার্ক ও সমর্থক একসাথে গ্রামভিত্তিক শিরোনামে দেখানো হচ্ছে'}
            </span>
          </div>

          <div className="inline-flex rounded-2xl p-1 bg-[var(--md-surface-container-high)] gap-1">
            <button
              type="button"
              onClick={() => setVillageGroupingMode('separate')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer ${
                villageGroupingMode === 'separate'
                  ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)] shadow-xs'
                  : 'text-[var(--md-on-surface-variant)] hover:text-[var(--md-on-surface)]'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>গ্রাম অনুযায়ী আলাদা</span>
            </button>

            <button
              type="button"
              onClick={() => setVillageGroupingMode('combined')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer ${
                villageGroupingMode === 'combined'
                  ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)] shadow-xs'
                  : 'text-[var(--md-on-surface-variant)] hover:text-[var(--md-on-surface)]'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>সব গ্রাম একসাথে</span>
            </button>
          </div>
        </div>

        {/* Strict Per-Village Selector when in 'separate' mode */}
        {villageGroupingMode === 'separate' && villageNames.length > 0 && (
          <div className="pt-2 border-t border-[var(--md-outline-variant)]/50">
            <div className="text-[11px] font-bold text-[var(--md-on-surface-variant)] mb-2">
              📍 গ্রাম বেছে নিন (শুধুমাত্র নির্বাচিত গ্রামের তালিকা নিচে দেখাবে):
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {villageNames.map((vName) => {
                const isSelected = selectedVillage === vName;
                const st = perVillageStats[vName] || {
                  totalMarked: 0,
                  starred: 0,
                  supporter: 0,
                  voted: 0,
                  tagged: 0,
                  queued: 0,
                };
                const badgeNum =
                  section === 'queue' ? st.queued : st.totalMarked;
                return (
                  <button
                    key={vName}
                    type="button"
                    onClick={() => setSelectedVillage(vName)}
                    className={`px-3.5 py-2 rounded-2xl text-xs font-extrabold shrink-0 inline-flex items-center gap-2 border transition cursor-pointer ${
                      isSelected
                        ? 'm3-tonal-container border-[var(--md-primary)] ring-1 ring-[var(--md-primary)] shadow-2xs'
                        : 'bg-[var(--md-surface-container-low)] border-[var(--md-outline-variant)] hover:border-[var(--md-primary)]/50'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>{vName}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                        badgeNum > 0
                          ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                          : 'bg-[var(--md-surface-container-highest)] text-[var(--md-on-surface-variant)]'
                      }`}
                    >
                      {convertToBengaliNumbers(badgeNum)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Category Summary Cards / Segmented Selector */}
      <div
        className={`grid grid-cols-2 ${
          allowSlipPrint ? 'sm:grid-cols-5' : 'sm:grid-cols-4'
        } gap-2.5`}
      >
        {[
          {
            id: 'starred' as HubSection,
            title: 'বুকমার্ককৃত',
            count: categorized.starred.length,
            icon: Bookmark,
            accent: 'text-amber-600',
          },
          {
            id: 'supporter' as HubSection,
            title: 'আমাদের সমর্থক',
            count: categorized.supporter.length,
            icon: Heart,
            accent: 'text-teal-600',
          },
          {
            id: 'voted' as HubSection,
            title: 'ভোট দিয়েছেন',
            count: categorized.voted.length,
            icon: CheckCircle2,
            accent: 'text-emerald-600',
          },
          {
            id: 'tagged' as HubSection,
            title: 'ট্যাগ ও নোট',
            count: categorized.tagged.length,
            icon: StickyNote,
            accent: 'text-[var(--md-primary)]',
          },
          ...(allowSlipPrint
            ? [
                {
                  id: 'queue' as HubSection,
                  title: 'প্রিন্ট কিউ',
                  count: scopedSlipQueue.length,
                  icon: Users,
                  accent: 'text-sky-600',
                },
              ]
            : []),
        ].map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`p-3.5 rounded-2xl text-left transition cursor-pointer border ${
                active
                  ? 'm3-tonal-container border-transparent shadow-xs'
                  : 'm3-card-elevated hover:border-[var(--md-primary)]/40'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <Icon className={`w-4 h-4 ${active ? '' : item.accent}`} />
                <span className="text-lg font-black">
                  {convertToBengaliNumbers(item.count)}
                </span>
              </div>
              <span className="text-xs font-bold block truncate">{item.title}</span>
            </button>
          );
        })}
      </div>

      {/* Sub-filter chips for Tagged tab */}
      {section === 'tagged' && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => setTagFilter('')}
            className={`m3-chip ${tagFilter === '' ? 'm3-chip-selected' : ''}`}
          >
            সকল নোট ও ট্যাগ
          </button>
          {SUPPORT_TAGS_META.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTagFilter(t.id)}
              className={`m3-chip ${tagFilter === t.id ? 'm3-chip-selected' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Search & Batch Actions */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
        <div className="m3-search-bar flex-1 !min-h-[2.85rem]">
          <Search className="w-4 h-4 text-[var(--md-on-surface-variant)] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              villageGroupingMode === 'separate' && selectedVillage
                ? `"${selectedVillage}" গ্রামের সংরক্ষিত তালিকায় খুঁজুন...`
                : 'সকল গ্রামের সংরক্ষিত তালিকায় খুঁজুন...'
            }
            className="w-full bg-transparent text-xs sm:text-sm focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="m3-icon-btn !w-7 !h-7"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {allowSlipPrint && section === 'queue' && scopedSlipQueue.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                clearSlipQueue();
                onSlipQueueChanged();
                showToast('প্রিন্ট কিউ খালি করা হয়েছে');
              }}
              className="m3-btn-outlined h-10 px-3.5 text-xs inline-flex items-center gap-1.5 text-[var(--md-error)]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>খালি করুন</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenSlipModal(scopedSlipQueue[0])}
              className="m3-btn-filled h-10 px-4 text-xs inline-flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>একসাথে স্লিপ প্রিন্ট</span>
            </button>
          </div>
        )}

        {allowSlipPrint &&
          section !== 'queue' &&
          activeList.length > 0 &&
          activeList.length <= 30 && (
            <button
              type="button"
              onClick={() => {
                addToSlipQueue(activeList);
                onSlipQueueChanged();
                showToast(
                  `${convertToBengaliNumbers(activeList.length)} জন ভোটার প্রিন্ট কিউতে যুক্ত হয়েছে!`
                );
              }}
              className="m3-btn-tonal h-10 px-4 text-xs inline-flex items-center justify-center gap-1.5 shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>সবাইকে প্রিন্ট কিউতে নিন</span>
            </button>
          )}
      </div>

      {/* Voters List (Strictly single village in 'separate' mode, or grouped by village headers in 'combined' mode) */}
      {activeList.length === 0 ? (
        <div className="m3-card-outlined p-10 text-center space-y-2">
          <Bookmark className="w-10 h-10 mx-auto text-[var(--md-outline)]" />
          <h3 className="text-sm font-extrabold">
            {villageGroupingMode === 'separate' && selectedVillage
              ? `"${selectedVillage}" গ্রামে এই তালিকায় এখনো কোনো ভোটার নেই`
              : 'এই তালিকায় এখনো কোনো ভোটার নেই'}
          </h3>
          <p className="text-xs text-[var(--md-on-surface-variant)] max-w-md mx-auto leading-relaxed">
            ভোটার অনুসন্ধান পেজ থেকে যেকোনো অ্যাকাউন্ট দিয়ে বুকমার্ক (⭐), আমাদের সমর্থক (💚) বা ভোট সম্পন্ন (✅) মার্ক করলে সবাই এখানে গ্রাম অনুযায়ী আলাদা বা একসাথে দেখতে পাবেন।
          </p>
        </div>
      ) : villageGroupingMode === 'separate' ? (
        <div className="space-y-2.5">
          <div className="px-3.5 py-2 rounded-2xl m3-tonal-container text-xs font-black flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              <span>নির্বাচিত গ্রাম: {selectedVillage}</span>
            </span>
            <span>মোট {convertToBengaliNumbers(activeList.length)} জন</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {activeList.slice(0, 120).map((voter, idx) => renderVoterCardItem(voter, idx))}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedByVillage.map((group) => (
            <div key={group.village} className="space-y-2.5">
              <div className="px-3.5 py-2 rounded-2xl m3-secondary-container text-xs font-black flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  <span>গ্রাম: {group.village}</span>
                </span>
                <span>{convertToBengaliNumbers(group.voters.length)} জন</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {group.voters
                  .slice(0, 80)
                  .map((voter, idx) => renderVoterCardItem(voter, idx))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
