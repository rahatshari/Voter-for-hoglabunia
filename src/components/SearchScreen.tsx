import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Voter, AppSearchFilters, AppSettings } from '../types';
import {
  normalizeBengaliText,
  convertToEnglishNumbers,
  convertToBengaliNumbers,
  formatDobInput,
  calculateAge,
  isMigrated,
} from '../lib/bengaliUtils';
import { VoterCard } from './VoterCard';

interface SearchScreenProps {
  villageTitle: string;
  villageKey: string;
  voters: Voter[];
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

export const SearchScreen: React.FC<SearchScreenProps> = ({
  villageTitle,
  villageKey,
  voters,
  initialSearch,
  initialSettings,
  onBack,
  onOpenAnalytics,
  onOpenSlipModal,
  onLogoutClick,
  showToast,
  onStateChange,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(
    initialSettings || { fullList: false, stats: false, migrated: false }
  );

  const [search, setSearch] = useState<AppSearchFilters>(
    initialSearch || {
      serial: '',
      name: '',
      father: '',
      mother: '',
      dob: '',
      profession: '',
      gender: '',
    }
  );

  const [renderedCount, setRenderedCount] = useState(RENDER_BATCH_SIZE);
  const observerRef = useRef<HTMLDivElement | null>(null);

  // Sync state changes with parent / localStorage
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

  // Unique professions for this village/set of voters
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
      .sort();
  }, [professionStats]);

  // Filtered voters calculation
  const filteredVoters = useMemo(() => {
    const qSerial = convertToEnglishNumbers(search.serial.trim());
    const qName = normalizeBengaliText(search.name.trim().toLowerCase());
    const qFather = normalizeBengaliText(search.father.trim().toLowerCase());
    const qMother = normalizeBengaliText(search.mother.trim().toLowerCase());
    const qDob = convertToEnglishNumbers(search.dob.trim());
    const qProf = search.profession.trim();
    const qGender = search.gender.trim();

    const isSearchEmpty = !qSerial && !qName && !qFather && !qMother && !qDob && !qProf && !qGender;

    if (isSearchEmpty) {
      if (settings.migrated) {
        return voters.filter((v) =>
          v._isMigrated !== undefined ? v._isMigrated : isMigrated(v)
        );
      }
      if (settings.fullList) {
        return voters.filter((v) =>
          v._isMigrated !== undefined ? !v._isMigrated : !isMigrated(v)
        );
      }
      return [];
    }

    return voters.filter((voter) => {
      const vMig = voter._isMigrated !== undefined ? voter._isMigrated : isMigrated(voter);

      if (settings.migrated && !vMig) return false;
      if (!settings.migrated && vMig) return false;

      if (qSerial) {
        const vSerial = voter._normSerial ?? convertToEnglishNumbers(voter.serialNo || '');
        if (!vSerial.includes(qSerial)) return false;
      }
      if (qName) {
        const rawSearchText = (voter.name || '').toLowerCase();
        const vName = voter._normName ?? normalizeBengaliText(rawSearchText);
        if (!vName.includes(qName)) return false;
      }
      if (qFather) {
        const vFather =
          voter._normFather ?? normalizeBengaliText((voter.fatherName || '').toLowerCase());
        if (!vFather.includes(qFather)) return false;
      }
      if (qMother) {
        const vMother =
          voter._normMother ?? normalizeBengaliText((voter.motherName || '').toLowerCase());
        if (!vMother.includes(qMother)) return false;
      }
      if (qDob) {
        const vDob = voter._normDob ?? convertToEnglishNumbers(voter.dob || '');
        if (!vDob.includes(qDob)) return false;
      }
      if (qProf) {
        const vProf = (voter._profession || voter.profession || '').trim();
        if (vProf !== qProf) return false;
      }
      if (qGender) {
        const vGender = (voter._gender || voter.gender || '').trim();
        if (vGender !== qGender) return false;
      }

      return true;
    });
  }, [voters, search, settings]);

  // Reset rendered count when filtered list changes
  useEffect(() => {
    setRenderedCount(RENDER_BATCH_SIZE);
  }, [filteredVoters]);

  // Infinite scroll observer for load more
  useEffect(() => {
    if (!observerRef.current || renderedCount >= filteredVoters.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setRenderedCount((prev) => Math.min(prev + RENDER_BATCH_SIZE, filteredVoters.length));
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [renderedCount, filteredVoters.length]);

  const displayedVoters = useMemo(() => {
    return filteredVoters.slice(0, renderedCount);
  }, [filteredVoters, renderedCount]);

  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDobInput(e.target.value);
    setSearch((prev) => ({ ...prev, dob: formatted }));
  };

  const handleClear = () => {
    setSearch({
      serial: '',
      name: '',
      father: '',
      mother: '',
      dob: '',
      profession: '',
      gender: '',
    });
  };

  const handleCopy = (voter: Voter) => {
    const ageText = calculateAge(voter.dob) ? ` ${calculateAge(voter.dob)}` : '';
    const villageText = voter.villageName ? `\nগ্রাম: ${voter.villageName}` : '';
    const statusText = isMigrated(voter) ? `\nস্ট্যাটাস: স্থানান্তরিত/কর্তিত` : '';
    const textToCopy = `ক্রমিক নং: ${voter.serialNo || '-'}\nনাম: ${voter.name || '-'} (${
      voter.gender || '-'
    })\nজন্ম তারিখ: ${voter.dob || '-'}${ageText}\nপিতার নাম: ${voter.fatherName || '-'}\nমাতার নাম: ${
      voter.motherName || '-'
    }\nপেশা: ${voter.profession || '-'}\nভোটার নং: ${
      voter.voterId || '-'
    }${villageText}${statusText}\nঠিকানা: ${voter.address || '-'}`;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(textToCopy)
        .then(() => showToast('✅ তথ্য কপি হয়েছে!'))
        .catch(() => fallbackCopy(textToCopy));
    } else {
      fallbackCopy(textToCopy);
    }
  };

  const fallbackCopy = (text: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy')
        ? showToast('✅ তথ্য কপি হয়েছে!')
        : showToast('কপি করা সম্ভব হয়নি!');
    } catch (err) {
      showToast('কপি সাপোর্ট করছে না!');
    }
    document.body.removeChild(textArea);
  };

  const handlePrint = (voter: Voter) => {
    if (onOpenSlipModal) {
      onOpenSlipModal(voter);
      return;
    }

    const ageText = calculateAge(voter.dob) ? ` <b>${calculateAge(voter.dob)}</b>` : '';
    const villageRow = voter.villageName
      ? `<tr><td class="label">গ্রাম:</td><td><b>${voter.villageName}</b></td></tr>`
      : '';
    const statusRow = isMigrated(voter)
      ? `<tr><td class="label">স্ট্যাটাস:</td><td style="color:red;"><b>স্থানান্তরিত/কর্তিত</b></td></tr>`
      : '';

    const printHTML = `
      <!DOCTYPE html>
      <html lang="bn">
      <head>
          <meta charset="UTF-8">
          <title>প্রিন্ট - ${voter.name || 'Voter'}</title>
          <style>
              body { font-family: 'Noto Sans Bengali', system-ui, sans-serif; padding: 20px; color: #000; background: #fff; }
              .print-card { border: 2px solid #1e293b; border-radius: 12px; padding: 20px; max-width: 400px; margin: auto; }
              h3 { text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-top: 0; }
              table { width: 100%; border-collapse: collapse; font-size: 15px; margin-top: 15px; }
              td { padding: 8px 0; border-bottom: 1px dashed #cbd5e1; }
              tr:last-child td { border-bottom: none; }
              .label { font-weight: bold; width: 120px; color: #475569; }
          </style>
      </head>
      <body>
          <div class="print-card">
              <h3>ভোটার তথ্য</h3>
              <table>
                  ${villageRow}
                  ${statusRow}
                  <tr><td class="label">ক্রমিক নং:</td><td><b>${voter.serialNo || '-'}</b></td></tr>
                  <tr><td class="label">নাম:</td><td><b>${voter.name || '-'}</b> (${voter.gender || '-'})</td></tr>
                  <tr><td class="label">জন্ম তারিখ:</td><td>${voter.dob || '-'}${ageText}</td></tr>
                  <tr><td class="label">পিতার নাম:</td><td>${voter.fatherName || '-'}</td></tr>
                  <tr><td class="label">মাতার নাম:</td><td>${voter.motherName || '-'}</td></tr>
                  <tr><td class="label">পেশা:</td><td>${voter.profession || '-'}</td></tr>
                  <tr><td class="label">ভোটার নং:</td><td><b>${voter.voterId || '-'}</b></td></tr>
                  <tr><td class="label">ঠিকানা:</td><td>${voter.address || '-'}</td></tr>
              </table>
          </div>
          <script>
              window.onload = function() { window.print(); }
          <\/script>
      </body>
      </html>
    `;

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
      showToast('🖨️ প্রিন্ট পেজ লোড হচ্ছে...');
    }
  };

  const isSearchEmpty =
    !search.name &&
    !search.father &&
    !search.mother &&
    !search.dob &&
    !search.profession &&
    !search.gender;

  return (
    <div className="max-w-5xl mx-auto soft-card p-4 sm:p-6 pb-20 relative">
      {/* Search Header Row */}
      <div className="flex flex-wrap justify-between items-center pb-3 mb-3 border-b border-slate-200/80 gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full soft-btn text-slate-700 flex items-center justify-center text-base cursor-pointer"
            title="পেছনে যান"
          >
            ⬅️
          </button>
          <img
            src="/logo.png"
            alt="Logo"
            className="w-8 h-8 rounded-full object-cover border border-slate-200"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-slate-800">
                {villageTitle} - তালিকা
              </h2>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                অরিজিনাল: {convertToBengaliNumbers(totalActive)} জন
              </span>
              {totalMigrated > 0 ? (
                <span className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
                  কর্তিত: {convertToBengaliNumbers(totalMigrated)} জন
                </span>
              ) : (
                <span className="text-[11px] font-medium text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                  কর্তিত: ০ জন
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAnalytics && (
            <button
              type="button"
              onClick={() => onOpenAnalytics(villageKey)}
              className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-md shadow-pink-500/20 cursor-pointer transition flex items-center gap-1"
              title="গ্রামের ডাটা অ্যানালাইসিস"
            >
              <span>📊</span> অ্যানালাইসিস
            </button>
          )}

          {onOpenSlipModal && (
            <button
              type="button"
              onClick={() => onOpenSlipModal()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 cursor-pointer transition flex items-center gap-1"
              title="নির্বাচনী ভোটার স্লিপ প্রস্তুতকারক"
            >
              <span>🗳️</span> স্লিপ মেকার
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="text-slate-500 hover:text-indigo-600 text-2xl font-bold px-2 py-0.5 rounded cursor-pointer leading-none transition"
              title="সেটিংস"
            >
              ⋮
            </button>

          {/* Settings Popup */}
          {showSettings && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/20"
                onClick={() => setShowSettings(false)}
              />
              <div className="absolute right-0 top-9 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-50 flex flex-col gap-2 animate-slide-down">
                <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-indigo-50 text-xs font-semibold text-slate-800 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={settings.fullList}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, fullList: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                  />
                  <span>📋 সম্পূর্ণ ভোটার তালিকা দেখান</span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-indigo-50 text-xs font-semibold text-slate-800 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={settings.stats}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, stats: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                  />
                  <span>📊 পেশা ভিত্তিক পরিসংখ্যান দেখান</span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-red-50 text-xs font-semibold text-red-700 bg-red-50/50 border border-red-100 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={settings.migrated}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, migrated: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-red-600 focus:ring-red-500 accent-red-600"
                  />
                  <span>🚫 কর্তিত/মাইগ্রেটেড ভোটার দেখুন</span>
                </label>

                <hr className="border-t border-slate-100 my-1" />

                <button
                  type="button"
                  onClick={() => {
                    setShowSettings(false);
                    onLogoutClick();
                  }}
                  className="w-full py-2 px-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  🚪 লগআউট করুন
                </button>
              </div>
            </>
          )}
          </div>
        </div>
      </div>

      {/* Profession Statistics Badges */}
      {settings.stats && (
        <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-3.5 mb-3 text-center">
          <h3 className="text-xs font-bold text-sky-700 uppercase tracking-wide mb-2">
            📊 পেশা ভিত্তিক পরিসংখ্যান
          </h3>
          <div className="flex flex-wrap justify-center gap-1.5">
            {Object.entries(professionStats).map(([prof, count]) => (
              <span
                key={prof}
                className="bg-indigo-600 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-xs"
              >
                {prof}: {convertToBengaliNumbers(count)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search Input Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 bg-slate-50 border border-slate-200 p-3 rounded-xl mb-3">
        <input
          type="text"
          value={search.serial}
          onChange={(e) => setSearch({ ...search, serial: e.target.value })}
          placeholder="🔢 ক্রমিক নং (যেমন: ১৩৬)..."
          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100"
        />
        <input
          type="text"
          value={search.name}
          onChange={(e) => setSearch({ ...search, name: e.target.value })}
          placeholder="🔍 নাম..."
          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100"
        />
        <input
          type="text"
          value={search.father}
          onChange={(e) => setSearch({ ...search, father: e.target.value })}
          placeholder="👤 পিতার নাম..."
          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100"
        />
        <input
          type="text"
          value={search.mother}
          onChange={(e) => setSearch({ ...search, mother: e.target.value })}
          placeholder="👩 মাতার নাম..."
          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100"
        />
        <input
          type="text"
          value={search.dob}
          onChange={handleDobChange}
          placeholder="📅 জন্ম তারিখ (যেমন: ২৩/০২/২০০১)"
          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100"
        />

        {/* Profession dropdown: visible when stats enabled */}
        {settings.stats && (
          <select
            value={search.profession}
            onChange={(e) => setSearch({ ...search, profession: e.target.value })}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:border-indigo-600 cursor-pointer"
          >
            <option value="">💼 সকল পেশা</option>
            {uniqueProfessions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}

        {/* Gender dropdown: visible when full list is active */}
        {settings.fullList && (
          <select
            value={search.gender}
            onChange={(e) => setSearch({ ...search, gender: e.target.value })}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:border-indigo-600 cursor-pointer"
          >
            <option value="">👫 সকল ভোটার</option>
            <option value="পুরুষ">👨 পুরুষ</option>
            <option value="মহিলা">👩 মহিলা</option>
          </select>
        )}
      </div>

      {/* Action Row: Count and Clear Button */}
      <div className="flex justify-between items-center mb-3 gap-2 flex-wrap">
        <div
          className={`text-xs font-bold px-3 py-2 rounded-lg flex-1 border ${
            isSearchEmpty && !settings.fullList && !settings.migrated
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : filteredVoters.length > 0
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-600 border-red-200'
          }`}
        >
          {isSearchEmpty && !settings.fullList && !settings.migrated
            ? '✨ অনুসন্ধান করতে ওপরের বক্সে তথ্য দিন অথবা অপশন বাছাই করুন'
            : filteredVoters.length > 0
            ? `✅ পাওয়া গেছে: ${convertToBengaliNumbers(filteredVoters.length)} জন`
            : 'কোনো ভোটার পাওয়া যায়নি ❌'}
        </div>

        <button
          type="button"
          onClick={handleClear}
          className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-bold cursor-pointer transition"
        >
          মুছে ফেলুন
        </button>
      </div>

      {/* Voter Cards List */}
      <div className="flex flex-col gap-3">
        {displayedVoters.map((voter, index) => (
          <VoterCard
            key={`${voter.villageName || villageKey}_${voter.serialNo || index}_${voter.voterId || index}`}
            voter={voter}
            onCopy={handleCopy}
            onPrint={handlePrint}
          />
        ))}

        {/* No Data Display */}
        {displayedVoters.length === 0 && !isSearchEmpty && (
          <div className="text-center text-red-600 font-semibold p-8 text-sm border border-dashed border-red-300 rounded-xl bg-red-50/30">
            কোনো তথ্য পাওয়া যায়নি ❌
          </div>
        )}

        {/* Load More Button & Intersection Sentinel */}
        {renderedCount < filteredVoters.length && (
          <div ref={observerRef} className="text-center my-4">
            <button
              type="button"
              onClick={() =>
                setRenderedCount((prev) => Math.min(prev + RENDER_BATCH_SIZE, filteredVoters.length))
              }
              className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold py-2.5 px-6 rounded-xl text-xs cursor-pointer shadow-md hover:shadow-lg transition"
            >
              আরও দেখুন (বাকি{' '}
              {convertToBengaliNumbers(filteredVoters.length - renderedCount)} জন) ⬇️
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
