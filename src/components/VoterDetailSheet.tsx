import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Bookmark,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  MessageCircle,
  MessageSquare,
  Phone,
  Printer,
  QrCode,
  Save,
  Share2,
  UserCheck,
  X,
} from 'lucide-react';
import { SupportTagType, Voter, VoterAnnotation } from '../types';
import {
  calculateAge,
  convertToEnglishNumbers,
  isMigrated,
} from '../lib/bengaliUtils';
import { useLockBodyScroll } from '../lib/useLockBodyScroll';
import {
  SUPPORT_TAGS_META,
  formatVoterShareText,
  getVoterAnnotation,
  toggleVoterStarred,
  toggleVoterVoted,
  upsertVoterAnnotation,
} from '../lib/voterTrackerStore';

export type VoterDetailTab = 'info' | 'campaign' | 'qr';

interface VoterDetailSheetProps {
  voter: Voter | null;
  initialTab?: VoterDetailTab;
  annotationsMap: Record<string, VoterAnnotation>;
  allowSlipPrint?: boolean;
  onAnnotationsChanged: () => void;
  onClose: () => void;
  onOpenSlipModal?: (voter: Voter) => void;
  showToast: (msg: string) => void;
}

export const VoterDetailSheet: React.FC<VoterDetailSheetProps> = ({
  voter,
  initialTab = 'info',
  annotationsMap,
  allowSlipPrint = true,
  onAnnotationsChanged,
  onClose,
  onOpenSlipModal,
  showToast,
}) => {
  useLockBodyScroll(Boolean(voter));

  const [activeTab, setActiveTab] = useState<VoterDetailTab>(initialTab);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [noteInput, setNoteInput] = useState<string>('');
  const [tagInput, setTagInput] = useState<SupportTagType>('');

  const annotation = useMemo(
    () => (voter ? getVoterAnnotation(voter, annotationsMap) : undefined),
    [voter, annotationsMap]
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, voter]);

  useEffect(() => {
    if (!voter) return;
    setPhoneInput(annotation?.phone || '');
    setNoteInput(annotation?.note || '');
    setTagInput(annotation?.supportTag || '');
  }, [voter, annotation]);

  useEffect(() => {
    if (!voter) return;
    const qrPayload = [
      `ক্রমিক: ${voter.serialNo || '-'}`,
      `নাম: ${voter.name || '-'}`,
      `ভোটার নং: ${voter.voterId || '-'}`,
      `পিতা: ${voter.fatherName || '-'}`,
      `মাতা: ${voter.motherName || '-'}`,
      `জন্ম: ${voter.dob || '-'}`,
      `গ্রাম: ${voter.villageName || '-'}`,
    ].join('\n');

    QRCode.toDataURL(qrPayload, {
      width: 260,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [voter]);

  if (!voter) return null;

  const isMig = isMigrated(voter);
  const ageText = voter._age || calculateAge(voter.dob);
  const shareText = formatVoterShareText(voter);

  const copyText = (txt: string, label: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(txt)
        .then(() => showToast(`${label} কপি হয়েছে!`))
        .catch(() => showToast('কপি করা সম্ভব হয়নি'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showToast(`${label} কপি হয়েছে!`);
      } catch {}
      document.body.removeChild(ta);
    }
  };

  const handleWhatsAppShare = () => {
    const cleanPhone = convertToEnglishNumbers(phoneInput).replace(/\D/g, '');
    const waPhone =
      cleanPhone.length === 11 && cleanPhone.startsWith('01')
        ? `88${cleanPhone}`
        : cleanPhone.length >= 11
        ? cleanPhone
        : '';
    const url = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(shareText)}`
      : `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    import('../lib/nativeBridge').then(({ openExternalLink }) => {
      openExternalLink(url);
    });
  };

  const handleSmsShare = () => {
    const cleanPhone = convertToEnglishNumbers(phoneInput).replace(/\D/g, '');
    const smsUrl = cleanPhone
      ? `sms:${cleanPhone}?body=${encodeURIComponent(shareText)}`
      : `sms:?body=${encodeURIComponent(shareText)}`;
    import('../lib/nativeBridge').then(({ openExternalLink }) => {
      openExternalLink(smsUrl);
    });
  };

  const handleSystemShare = async () => {
    const { shareTextCrossPlatform } = await import('../lib/nativeBridge');
    await shareTextCrossPlatform(`ভোটার তথ্য - ${voter.name || ''}`, shareText, () =>
      copyText(shareText, 'ভোটার তথ্য')
    );
  };

  const handleSaveCampaignDetails = () => {
    upsertVoterAnnotation(voter, {
      phone: phoneInput.trim(),
      note: noteInput.trim(),
      supportTag: tagInput,
    });
    onAnnotationsChanged();
    showToast('ভোটার নোট ও ক্যাম্পেইন তথ্য সংরক্ষিত হয়েছে!');
  };

  return (
    <div
      className="fixed inset-0 z-50 m3-sheet-backdrop flex items-end sm:items-center justify-center sm:p-4 touch-none"
      onClick={onClose}
    >
      <div
        className="m3-sheet w-full sm:max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-sheet-up bottom-safe touch-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden m3-drag-handle shrink-0" />

        {/* Header */}
        <div className="px-5 pt-3.5 pb-3 border-b border-[var(--md-outline-variant)]/50 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-base shrink-0 ${
                isMig
                  ? 'bg-[var(--md-error-container)] text-[var(--md-on-error-container)]'
                  : voter.gender === 'মহিলা'
                  ? 'bg-rose-100 text-rose-800'
                  : 'm3-tonal-container'
              }`}
            >
              {voter.serialNo || '#'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3
                  className={`text-base sm:text-lg font-black leading-snug truncate ${
                    isMig ? 'line-through text-[var(--md-error)]' : ''
                  }`}
                >
                  {voter.name || 'নাম নেই'}
                </h3>
                {annotation?.voted && (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    ভোট সম্পন্ন
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--md-on-surface-variant)] flex items-center gap-2 flex-wrap mt-0.5">
                <span>{voter.gender || '-'}</span>
                <span>•</span>
                <span>ক্রমিক: {voter.serialNo || '-'}</span>
                {voter.villageName && (
                  <>
                    <span>•</span>
                    <span className="font-semibold text-[var(--md-primary)]">
                      {voter.villageName}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                const res = toggleVoterStarred(voter);
                onAnnotationsChanged();
                showToast(
                  res.starred ? 'বুকমার্ক তালিকায় যুক্ত হয়েছে' : 'বুকমার্ক সরানো হয়েছে'
                );
              }}
              className={`m3-icon-btn ${
                annotation?.starred ? 'text-amber-500 bg-amber-500/10' : ''
              }`}
              title="বুকমার্ক"
            >
              <Bookmark
                className={`w-5 h-5 ${annotation?.starred ? 'fill-current' : ''}`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="m3-icon-btn"
              aria-label="বন্ধ করুন"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 3 Clean M3 Tabs (Family tab removed) */}
        <div className="grid grid-cols-3 border-b border-[var(--md-outline-variant)]/50 bg-[var(--md-surface-container-low)] px-2 shrink-0">
          {[
            { id: 'info' as VoterDetailTab, label: 'তথ্য ও শেয়ার', icon: FileText },
            { id: 'campaign' as VoterDetailTab, label: 'নোট ও ট্র্যাকার', icon: UserCheck },
            { id: 'qr' as VoterDetailTab, label: 'QR কোড', icon: QrCode },
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`py-2.5 px-1 flex flex-col items-center justify-center gap-1 text-[11px] font-bold relative transition cursor-pointer ${
                  active
                    ? 'text-[var(--md-primary)]'
                    : 'text-[var(--md-on-surface-variant)] hover:text-[var(--md-on-surface)]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="truncate max-w-full">{t.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-4 right-4 h-[3px] rounded-t-full bg-[var(--md-primary)]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Scrollable Sheet Body with overscroll-contain */}
        <div className="p-5 overflow-y-auto overscroll-contain space-y-4 flex-1">
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div className="m3-card-filled p-3.5 flex items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-semibold text-[var(--md-on-surface-variant)] block">
                    জাতীয় পরিচয়পত্র / ভোটার নম্বর
                  </span>
                  <span className="text-base sm:text-lg font-black tracking-wider text-[var(--md-primary)]">
                    {voter.voterId || '-'}
                  </span>
                </div>
                {voter.voterId && (
                  <button
                    type="button"
                    onClick={() => copyText(voter.voterId || '', 'ভোটার নম্বর')}
                    className="m3-btn-primary-tonal px-3.5 py-2 text-xs flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>কপি</span>
                  </button>
                )}
              </div>

              <div className="m3-card-outlined divide-y divide-[var(--md-outline-variant)]/50 text-xs sm:text-sm overflow-hidden">
                {[
                  { label: 'পিতার নাম', value: voter.fatherName || '-' },
                  { label: 'মাতার নাম', value: voter.motherName || '-' },
                  {
                    label: 'জন্ম তারিখ ও বয়স',
                    value: `${voter.dob || '-'} ${ageText || ''}`.trim(),
                  },
                  { label: 'পেশা', value: voter.profession || '-' },
                  { label: 'গ্রাম / এলাকা', value: voter.villageName || '-' },
                  { label: 'ঠিকানা', value: voter.address || '-' },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-start justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="text-[var(--md-on-surface-variant)] font-semibold shrink-0 w-[36%]">
                      {row.label}
                    </span>
                    <span className="font-bold text-right flex-1">{row.value}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-[var(--md-outline-variant)] bg-[var(--md-surface-container-low)]">
                <div>
                  <span className="text-xs font-extrabold block">পোলিং ডে ভোট স্ট্যাটাস</span>
                  <span className="text-[11px] text-[var(--md-on-surface-variant)]">
                    {annotation?.voted
                      ? 'এই ভোটার ইতিমধ্যে ভোট প্রদান করেছেন'
                      : 'ভোট প্রদান সম্পন্ন হলে মার্ক করে রাখুন'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const res = toggleVoterVoted(voter);
                    onAnnotationsChanged();
                    showToast(
                      res.voted
                        ? 'ভোট প্রদান সম্পন্ন হিসেবে চিহ্নিত!'
                        : 'ভোট স্ট্যাটাস মুছে ফেলা হয়েছে'
                    );
                  }}
                  className={`px-3.5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition active:scale-95 ${
                    annotation?.voted
                      ? 'bg-emerald-600 text-white'
                      : 'm3-btn-outlined'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{annotation?.voted ? 'ভোট দিয়েছেন' : 'ভোট মার্ক করুন'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={handleWhatsAppShare}
                  className="py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handleSmsShare}
                  className="m3-btn-tonal py-2.5 px-3 rounded-2xl text-xs flex items-center justify-center gap-1.5"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>SMS পাঠান</span>
                </button>

                <button
                  type="button"
                  onClick={handleSystemShare}
                  className="m3-btn-outlined py-2.5 px-3 rounded-2xl text-xs flex items-center justify-center gap-1.5"
                >
                  <Share2 className="w-4 h-4" />
                  <span>শেয়ার</span>
                </button>

                <button
                  type="button"
                  onClick={() => copyText(shareText, 'সম্পূর্ণ তথ্য')}
                  className="m3-btn-outlined py-2.5 px-3 rounded-2xl text-xs flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-4 h-4" />
                  <span>তথ্য কপি</span>
                </button>
              </div>

              {allowSlipPrint && onOpenSlipModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSlipModal(voter);
                  }}
                  className="w-full m3-btn-filled py-3 px-4 text-sm flex items-center justify-center gap-2 shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  <span>নির্বাচনী ভোটার স্লিপ ও থার্মাল প্রিন্ট করুন</span>
                </button>
              )}
            </div>
          )}

          {activeTab === 'campaign' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--md-on-surface-variant)] block">
                  ক্যাম্পেইন ক্যাটাগরি / ট্যাগ নির্বাচন করুন
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTagInput('')}
                    className={`m3-chip ${tagInput === '' ? 'm3-chip-selected' : ''}`}
                  >
                    ট্যাগ নেই
                  </button>
                  {SUPPORT_TAGS_META.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTagInput(t.id)}
                      className={`m3-chip ${
                        tagInput === t.id ? 'm3-chip-selected ring-1 ring-[var(--md-primary)]' : ''
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--md-on-surface-variant)] block">
                  মোবাইল নম্বর (কল বা হোয়াটসঅ্যাপের জন্য)
                </label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="যেমন: 017XXXXXXXX"
                    className="m3-input flex-1"
                  />
                  {phoneInput.trim() && (
                    <a
                      href={`tel:${convertToEnglishNumbers(phoneInput.trim())}`}
                      className="m3-btn-primary-tonal px-4 flex items-center gap-1.5 text-xs"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>কল</span>
                    </a>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--md-on-surface-variant)] block">
                  ব্যক্তিগত নোট / বাড়ির পরিচিতি
                </label>
                <textarea
                  rows={3}
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="যেমন: মসজিদ বাড়ির উত্তর পাশে, সকালে কেন্দ্রে আসবেন..."
                  className="m3-input w-full resize-none"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveCampaignDetails}
                className="w-full m3-btn-filled py-3 px-4 text-xs sm:text-sm flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>ক্যাম্পেইন নোট ও নম্বর সংরক্ষণ করুন</span>
              </button>
            </div>
          )}

          {activeTab === 'qr' && (
            <div className="flex flex-col items-center text-center space-y-4 py-2">
              <div className="bg-white p-4 rounded-3xl border border-[var(--md-outline-variant)] shadow-sm">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Voter QR Code"
                    className="w-52 h-52 object-contain"
                  />
                ) : (
                  <div className="w-52 h-52 flex items-center justify-center text-xs text-slate-400">
                    QR তৈরি হচ্ছে...
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-extrabold">{voter.name}</h4>
                <p className="text-xs text-[var(--md-on-surface-variant)]">
                  অন্য মোবাইলের ক্যামেরা বা স্ক্যানার দিয়ে স্ক্যান করলে সম্পূর্ণ ভোটার তথ্য দেখা যাবে
                </p>
              </div>
              {qrDataUrl && (
                <button
                  type="button"
                  onClick={() => {
                    const fileName = `voter_qr_${voter.serialNo || 'card'}.png`;
                    import('../lib/nativeBridge').then(({ saveDataUrlFileCrossPlatform }) => {
                      saveDataUrlFileCrossPlatform(qrDataUrl, fileName, 'image/png');
                      showToast('QR কোড ইমেজ ডাউনলোড হয়েছে!');
                    });
                  }}
                  className="m3-btn-primary-tonal px-5 py-2.5 text-xs flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>QR ইমেজ ডাউনলোড করুন</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
