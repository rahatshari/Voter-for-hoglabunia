import React from 'react';
import {
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  MapPin,
  Phone,
  Plus,
  Printer,
  QrCode,
  StickyNote,
} from 'lucide-react';
import { Voter, VoterAnnotation, VoterViewMode } from '../types';
import { calculateAge, convertToEnglishNumbers, isMigrated } from '../lib/bengaliUtils';
import { SUPPORT_TAGS_META } from '../lib/voterTrackerStore';
import { VoterDetailTab } from './VoterDetailSheet';

interface VoterCardProps {
  voter: Voter;
  onCopy: (voter: Voter) => void;
  onPrint: (voter: Voter) => void;
  isQueued?: boolean;
  onToggleQueue?: (voter: Voter) => void;
  allowSlipPrint?: boolean;
  viewMode?: VoterViewMode;
  annotation?: VoterAnnotation;
  onToggleStar?: (voter: Voter) => void;
  onToggleVoted?: (voter: Voter) => void;
  onOpenDetail?: (voter: Voter, tab?: VoterDetailTab) => void;
  onCopyVoterId?: (voterId: string) => void;
}

export const VoterCard: React.FC<VoterCardProps> = ({
  voter,
  onCopy,
  onPrint,
  isQueued = false,
  onToggleQueue,
  allowSlipPrint = true,
  viewMode = 'card',
  annotation,
  onToggleStar,
  onToggleVoted,
  onOpenDetail,
  onCopyVoterId,
}) => {
  const isMig = isMigrated(voter);
  const calculatedAge = voter._age || calculateAge(voter.dob);
  const displayName = voter.name || (isMig ? 'মাইগ্রেট হয়েছে' : '-');
  const isFemale = (voter._gender || voter.gender) === 'মহিলা';
  const tagMeta = SUPPORT_TAGS_META.find((t) => t.id === annotation?.supportTag);

  if (viewMode === 'compact') {
    return (
      <div
        className={`m3-card-elevated px-3.5 py-2.5 flex items-center justify-between gap-2.5 transition ${
          isMig
            ? 'border-[var(--md-error)]/40 bg-[var(--md-error-container)]/20'
            : isQueued && allowSlipPrint
            ? 'ring-2 ring-[var(--md-primary)]'
            : ''
        }`}
      >
        <div
          className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
          onClick={() => onOpenDetail && onOpenDetail(voter, 'info')}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
              isMig
                ? 'bg-[var(--md-error-container)] text-[var(--md-on-error-container)]'
                : isFemale
                ? 'bg-rose-100 text-rose-800'
                : 'm3-tonal-container'
            }`}
          >
            {voter.serialNo || '#'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`text-sm font-extrabold truncate ${
                  isMig ? 'line-through text-[var(--md-error)]' : ''
                }`}
              >
                {displayName}
              </span>
              {annotation?.voted && (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              )}
              {annotation?.starred && (
                <Bookmark className="w-3.5 h-3.5 text-amber-500 fill-current shrink-0" />
              )}
            </div>
            <p className="text-[11px] text-[var(--md-on-surface-variant)] truncate">
              পিতা: {voter.fatherName || '-'} • {voter.voterId || '-'}
              {voter.villageName ? ` • ${voter.villageName}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onToggleVoted && !isMig && (
            <button
              type="button"
              onClick={() => onToggleVoted(voter)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer ${
                annotation?.voted
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[var(--md-surface-container-high)] text-[var(--md-on-surface-variant)]'
              }`}
              title="ভোট মার্ক"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}
          {allowSlipPrint && onToggleQueue && (
            <button
              type="button"
              onClick={() => onToggleQueue(voter)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer ${
                isQueued
                  ? 'm3-tonal-container'
                  : 'bg-[var(--md-surface-container-high)] text-[var(--md-on-surface-variant)]'
              }`}
              title="একসাথে প্রিন্ট লিস্টে নিন"
            >
              {isQueued ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </button>
          )}
          {allowSlipPrint && (
            <button
              type="button"
              onClick={() => onPrint(voter)}
              className="m3-btn-filled h-8 px-2.5 text-[11px] flex items-center gap-1"
              title="ভোটার স্লিপ"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">স্লিপ</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <article
      className={`m3-card-elevated p-4 sm:p-4.5 relative overflow-hidden transition ${
        isMig
          ? 'border-[var(--md-error)]/50 bg-[var(--md-error-container)]/15'
          : isQueued && allowSlipPrint
          ? 'ring-2 ring-[var(--md-primary)] bg-[var(--md-primary-container)]/10'
          : ''
      }`}
    >
      {/* Top Header Row */}
      <div className="flex items-start justify-between gap-2.5 pb-3 mb-3 border-b border-[var(--md-outline-variant)]/50">
        <div
          className="flex items-start gap-3 min-w-0 flex-1 cursor-pointer group"
          onClick={() => onOpenDetail && onOpenDetail(voter, 'info')}
        >
          <div
            className={`min-w-[44px] h-11 px-2 rounded-2xl flex flex-col items-center justify-center shrink-0 font-black leading-none shadow-2xs ${
              isMig
                ? 'bg-[var(--md-error-container)] text-[var(--md-on-error-container)]'
                : isFemale
                ? 'bg-rose-100 text-rose-900'
                : 'm3-tonal-container'
            }`}
          >
            <span className="text-[9px] font-bold opacity-75 mb-0.5">ক্রমিক</span>
            <span className="text-xs sm:text-sm">{voter.serialNo || '-'}</span>
          </div>

          <div className="min-w-0 flex-1">
            <h3
              className={`font-extrabold text-base sm:text-[17px] leading-snug group-hover:text-[var(--md-primary)] transition ${
                isMig ? 'text-[var(--md-error)] line-through' : ''
              }`}
            >
              {displayName}
            </h3>

            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                  isFemale
                    ? 'bg-rose-500/15 text-rose-600'
                    : 'bg-sky-500/15 text-sky-600'
                }`}
              >
                {voter.gender || '-'}
              </span>

              {voter.villageName && (
                <span className="text-[11px] px-2 py-0.5 rounded-full m3-secondary-container font-bold inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {voter.villageName}
                </span>
              )}

              {isMig && (
                <span className="text-[11px] bg-[var(--md-error-container)] text-[var(--md-on-error-container)] px-2.5 py-0.5 rounded-full font-bold">
                  স্থানান্তরিত/কর্তিত
                </span>
              )}

              {tagMeta && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${tagMeta.badgeClass}`}
                >
                  {tagMeta.shortLabel}
                </span>
              )}

              {isQueued && allowSlipPrint && (
                <span className="text-[10px] px-2 py-0.5 rounded-full m3-tonal-container font-bold">
                  প্রিন্ট কিউতে যুক্ত
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Top-Right Quick Bookmark & Voted Toggle */}
        <div className="flex items-center gap-1 shrink-0">
          {onToggleVoted && !isMig && (
            <button
              type="button"
              onClick={() => onToggleVoted(voter)}
              className={`h-8 px-2.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer active:scale-95 ${
                annotation?.voted
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-[var(--md-surface-container-high)] text-[var(--md-on-surface-variant)] hover:text-[var(--md-on-surface)]'
              }`}
              title="ভোট প্রদান স্ট্যাটাস মার্ক করুন"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">
                {annotation?.voted ? 'ভোট সম্পন্ন' : 'ভোট'}
              </span>
            </button>
          )}

          {onToggleStar && (
            <button
              type="button"
              onClick={() => onToggleStar(voter)}
              className={`w-8 h-8 rounded-full inline-flex items-center justify-center transition cursor-pointer active:scale-90 ${
                annotation?.starred
                  ? 'bg-amber-400/20 text-amber-500'
                  : 'bg-[var(--md-surface-container-high)] text-[var(--md-on-surface-variant)]'
              }`}
              title="বুকমার্ক করুন"
            >
              <Bookmark
                className={`w-4 h-4 ${annotation?.starred ? 'fill-current' : ''}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Metadata Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <div className="flex justify-between sm:justify-start sm:gap-2">
          <span className="text-[var(--md-on-surface-variant)] font-medium shrink-0">
            পিতার নাম:
          </span>
          <span className="font-bold text-right sm:text-left">
            {voter.fatherName || '-'}
          </span>
        </div>

        <div className="flex justify-between sm:justify-start sm:gap-2">
          <span className="text-[var(--md-on-surface-variant)] font-medium shrink-0">
            মাতার নাম:
          </span>
          <span className="font-bold text-right sm:text-left">
            {voter.motherName || '-'}
          </span>
        </div>

        <div className="flex justify-between sm:justify-start sm:gap-2 items-center">
          <span className="text-[var(--md-on-surface-variant)] font-medium shrink-0">
            জন্ম তারিখ:
          </span>
          <span className="font-bold flex items-center gap-1.5 flex-wrap justify-end sm:justify-start">
            <span>{voter.dob || '-'}</span>
            {calculatedAge && (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--md-surface-container-high)] text-[var(--md-primary)]">
                {calculatedAge}
              </span>
            )}
          </span>
        </div>

        <div className="flex justify-between sm:justify-start sm:gap-2">
          <span className="text-[var(--md-on-surface-variant)] font-medium shrink-0">
            পেশা:
          </span>
          <span className="font-semibold text-right sm:text-left">
            {voter.profession || '-'}
          </span>
        </div>

        <div className="flex justify-between sm:justify-start sm:gap-2 items-center">
          <span className="text-[var(--md-on-surface-variant)] font-medium shrink-0">
            ভোটার নং:
          </span>
          <button
            type="button"
            onClick={() =>
              voter.voterId &&
              (onCopyVoterId ? onCopyVoterId(voter.voterId) : onCopy(voter))
            }
            className="inline-flex items-center gap-1.5 font-black tracking-wide text-[var(--md-primary)] bg-[var(--md-primary-container)]/35 hover:bg-[var(--md-primary-container)]/60 px-2 py-0.5 rounded-lg transition cursor-pointer"
            title="ভোটার নম্বর কপি করতে ট্যাপ করুন"
          >
            <span>{voter.voterId || '-'}</span>
            {voter.voterId && <Copy className="w-3 h-3 opacity-75" />}
          </button>
        </div>

        <div className="flex justify-between sm:justify-start sm:gap-2">
          <span className="text-[var(--md-on-surface-variant)] font-medium shrink-0">
            ঠিকানা:
          </span>
          <span className="font-medium text-right sm:text-left truncate">
            {voter.address || '-'}
          </span>
        </div>
      </div>

      {(annotation?.note || annotation?.phone) && (
        <div className="mt-2.5 px-3 py-2 rounded-xl bg-[var(--md-surface-container)] flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <StickyNote className="w-3.5 h-3.5 text-[var(--md-primary)] shrink-0" />
            <span className="truncate font-medium">
              {annotation.note || `মোবাইল: ${annotation.phone}`}
            </span>
          </div>
          {annotation.phone && (
            <a
              href={`tel:${convertToEnglishNumbers(annotation.phone)}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full m3-tonal-container text-[11px] font-bold shrink-0"
            >
              <Phone className="w-3 h-3" />
              <span>কল</span>
            </a>
          )}
        </div>
      )}

      {/* M3 Action Bar (Family option removed per requirement) */}
      <div className="flex items-center justify-between gap-1.5 mt-3.5 pt-3 border-t border-[var(--md-outline-variant)]/50 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {onOpenDetail && (
            <button
              type="button"
              onClick={() => onOpenDetail(voter, 'info')}
              className="m3-btn-tonal h-8 px-3 text-xs inline-flex items-center gap-1.5"
              title="বিস্তারিত, নোট, শেয়ার ও QR কোড"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>বিস্তারিত / QR</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onCopy(voter)}
            className="m3-btn-outlined h-8 px-3 text-xs inline-flex items-center gap-1"
            title="সম্পূর্ণ তথ্য কপি"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>কপি</span>
          </button>
        </div>

        {allowSlipPrint && (
          <div className="flex items-center gap-1.5 ml-auto">
            {onToggleQueue && (
              <button
                type="button"
                onClick={() => onToggleQueue(voter)}
                className={`h-8 px-3 rounded-full text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer active:scale-95 ${
                  isQueued ? 'm3-tonal-container' : 'm3-btn-outlined'
                }`}
                title="একসাথে একাধিক ভোটার স্লিপ প্রিন্ট লিস্টে যোগ করুন"
              >
                {isQueued ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>যুক্ত</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>একসাথে</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => onPrint(voter)}
              className="m3-btn-filled h-8 px-3.5 text-xs inline-flex items-center gap-1.5 shadow-2xs"
              title="ভোটার স্লিপ তৈরি ও প্রিন্ট"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>ভোটার স্লিপ</span>
            </button>
          </div>
        )}
      </div>
    </article>
  );
};
