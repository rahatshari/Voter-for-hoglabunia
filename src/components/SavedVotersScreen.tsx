import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  Download,
  LayoutGrid,
  List,
  Printer,
  Search,
  StickyNote,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { SupportTagType, Voter, VoterAnnotation, VoterViewMode } from '../types';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';
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
  toggleVoterVoted,
} from '../lib/voterTrackerStore';
import { VoterCard } from './VoterCard';
import { VoterDetailTab } from './VoterDetailSheet';

interface SavedVotersScreenProps {
  villagesData: Record<string, Voter[]>;
  annotationsMap: Record<string, VoterAnnotation>;
  slipQueue: Voter[];
  allowSlipPrint?: boolean;
  onAnnotationsChanged: () => void;
  onSlipQueueChanged: () => void;
  onBackHome: () => void;
  onOpenSlipModal: (voter?: Voter | null) => void;
  onOpenVoterDetail: (voter: Voter, tab?: VoterDetailTab) => void;
  showToast: (msg: string) => void;
}

type HubSection = 'starred' | 'voted' | 'tagged' | 'queue';

export const SavedVotersScreen: React.FC<SavedVotersScreenProps> = ({
  villagesData,
  annotationsMap,
  slipQueue,
  allowSlipPrint = true,
  onAnnotationsChanged,
  onSlipQueueChanged,
  onBackHome,
  onOpenSlipModal,
  onOpenVoterDetail,
  showToast,
}) => {
  const [section, setSection] = useState<HubSection>('starred');
  const [tagFilter, setTagFilter] = useState<SupportTagType>('');
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<VoterViewMode>('card');

  const allVoters = useMemo(() => Object.values(villagesData).flat(), [villagesData]);

  const categorized = useMemo(() => {
    const starred: Voter[] = [];
    const voted: Voter[] = [];
    const tagged: Voter[] = [];

    for (const v of allVoters) {
      const ann = annotationsMap[getVoterUniqueKey(v)];
      if (!ann) continue;
      if (ann.starred) starred.push(v);
      if (ann.voted) voted.push(v);
      if (
        ann.supportTag ||
        (ann.note && ann.note.trim()) ||
        (ann.phone && ann.phone.trim())
      ) {
        tagged.push(v);
      }
    }

    return { starred, voted, tagged };
  }, [allVoters, annotationsMap]);

  const activeList = useMemo(() => {
    let base: Voter[] = [];
    if (section === 'starred') base = categorized.starred;
    else if (section === 'voted') base = categorized.voted;
    else if (section === 'tagged') {
      base = tagFilter
        ? categorized.tagged.filter(
            (v) => annotationsMap[getVoterUniqueKey(v)]?.supportTag === tagFilter
          )
        : categorized.tagged;
    } else {
      base = slipQueue;
    }

    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (v) =>
        (v.name || '').toLowerCase().includes(q) ||
        (v.fatherName || '').toLowerCase().includes(q) ||
        (v.serialNo || '').includes(q) ||
        (v.voterId || '').includes(q) ||
        (v.villageName || '').toLowerCase().includes(q)
    );
  }, [section, categorized, slipQueue, tagFilter, annotationsMap, query]);

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

  return (
    <div className="space-y-4 animate-slide-down">
      {/* M3 Top Bar */}
      <div className="m3-card-elevated p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackHome}
            className="m3-icon-btn-tonal"
            title="হোমে ফিরুন"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight">
              সংরক্ষিত ও ক্যাম্পেইন হাব
            </h1>
            <p className="text-xs text-[var(--md-on-surface-variant)]">
              বুকমার্ক, পোলিং ডে ভোট ট্র্যাকার, নোট ও প্রিন্ট কিউ
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
                downloadVotersCsv(activeList, `campaign_${section}`);
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

      {/* Category Summary Cards / Segmented Selector */}
      <div
        className={`grid grid-cols-2 ${
          allowSlipPrint ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
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
                  count: slipQueue.length,
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
            placeholder="সংরক্ষিত তালিকায় খুঁজুন..."
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

        {allowSlipPrint && section === 'queue' && slipQueue.length > 0 && (
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
              onClick={() => onOpenSlipModal(slipQueue[0])}
              className="m3-btn-filled h-10 px-4 text-xs inline-flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>একসাথে স্লিপ প্রিন্ট</span>
            </button>
          </div>
        )}

        {allowSlipPrint && section !== 'queue' && activeList.length > 0 && activeList.length <= 30 && (
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

      {/* Voters List */}
      {activeList.length === 0 ? (
        <div className="m3-card-outlined p-10 text-center space-y-2">
          <Bookmark className="w-10 h-10 mx-auto text-[var(--md-outline)]" />
          <h3 className="text-sm font-extrabold">এই তালিকায় এখনো কোনো ভোটার নেই</h3>
          <p className="text-xs text-[var(--md-on-surface-variant)] max-w-sm mx-auto leading-relaxed">
            ভোটার অনুসন্ধান পেজ থেকে যেকোনো ভোটার কার্ডের বুকমার্ক আইকন, ভোট বাটন বা নোট অপশনে ট্যাপ করলে এখানে জমা হবে।
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {activeList.slice(0, 80).map((voter, idx) => {
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
                onToggleVoted={(v) => {
                  toggleVoterVoted(v);
                  onAnnotationsChanged();
                }}
                onOpenDetail={onOpenVoterDetail}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
