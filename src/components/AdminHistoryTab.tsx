import React, { useState, useMemo } from 'react';
import { SessionHistoryItem } from '../types';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';
import {
  formatDurationBengali,
  formatBengaliDateTime,
  getDeviceDetails,
} from '../lib/sessionUtils';
import {
  computeHistoryStats,
  exportHistoryToCsv,
  filterHistoryRecords,
  formatCumulativeMinutesBengali,
  HistoryDatePreset,
  HistoryReasonFilter,
} from '../lib/adminUtils';

interface AdminHistoryTabProps {
  history: SessionHistoryItem[];
  registeredEmails: string[];
  dataSource: 'firebase' | 'server' | 'local';
  cloudConnected: boolean;
  initialEmailFilter?: string;
  onDeleteItems: (ids: string[]) => Promise<void>;
  onClearAll: () => Promise<void>;
}

export const AdminHistoryTab: React.FC<AdminHistoryTabProps> = ({
  history,
  registeredEmails,
  dataSource,
  cloudConnected,
  initialEmailFilter = 'all',
  onDeleteItems,
  onClearAll,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [emailFilter, setEmailFilter] = useState(initialEmailFilter);
  const [reasonFilter, setReasonFilter] = useState<HistoryReasonFilter>('all');
  const [datePreset, setDatePreset] = useState<HistoryDatePreset>('all');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');
  const [confirmClearMode, setConfirmClearMode] = useState<'none' | 'filtered' | 'all'>('none');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isBulkWorking, setIsBulkWorking] = useState(false);

  // Keep emailFilter synced if parent jumps here from a user card
  React.useEffect(() => {
    setEmailFilter(initialEmailFilter || 'all');
  }, [initialEmailFilter]);

  const distinctEmails = useMemo(() => {
    const set = new Set<string>();
    registeredEmails.forEach((e) => e && set.add(e.toLowerCase()));
    history.forEach((h) => h.email && set.add(h.email.toLowerCase()));
    return Array.from(set).sort();
  }, [registeredEmails, history]);

  const filteredHistory = useMemo(
    () =>
      filterHistoryRecords(history, {
        query: searchQuery,
        emailFilter,
        reasonFilter,
        datePreset,
        customFromDate,
        customToDate,
      }),
    [history, searchQuery, emailFilter, reasonFilter, datePreset, customFromDate, customToDate]
  );

  const stats = useMemo(() => computeHistoryStats(filteredHistory), [filteredHistory]);

  const handleDownloadCsv = () => {
    if (filteredHistory.length === 0) return;
    const csv = exportHistoryToCsv(filteredHistory);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voter-login-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDeleteSingle = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteItems([id]);
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkConfirm = async () => {
    setIsBulkWorking(true);
    try {
      if (confirmClearMode === 'all') {
        await onClearAll();
      } else if (confirmClearMode === 'filtered') {
        await onDeleteItems(filteredHistory.map((h) => h.id));
      }
      setConfirmClearMode('none');
    } finally {
      setIsBulkWorking(false);
    }
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    emailFilter !== 'all' ||
    reasonFilter !== 'all' ||
    datePreset !== 'all';

  return (
    <div className="space-y-4">
      {/* Live Cloud Audit Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-extrabold text-slate-700">
            মোট প্রদর্শিত হিস্ট্রি: {convertToBengaliNumbers(filteredHistory.length)} /{' '}
            {convertToBengaliNumbers(history.length)} টি
          </span>
          {stats.oldestLoginAt && (
            <span className="text-[11px] text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-lg font-medium">
              শুরু: {formatBengaliDateTime(stats.oldestLoginAt)}
            </span>
          )}
        </div>

        <div
          className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-xl font-bold border ${
            cloudConnected && dataSource === 'firebase'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              cloudConnected && dataSource === 'firebase'
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-amber-500'
            }`}
          />
          <span>
            {cloudConnected && dataSource === 'firebase'
              ? 'ফায়ারবেস রিয়েল-টাইম ক্লাউড হিস্ট্রি সক্রিয়'
              : dataSource === 'server'
              ? 'সার্ভার হিস্ট্রি মোড (ফায়ারবেস অফলাইন/অননুমোদিত)'
              : 'লোকাল ক্যাশ হিস্ট্রি (ফায়ারবেস সংযুক্ত নয়)'}
          </span>
        </div>
      </div>

      {/* 4 History KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 block">ফিল্টার্ড রেকর্ড</span>
          <span className="text-lg sm:text-xl font-black text-indigo-900">
            {convertToBengaliNumbers(stats.totalCount)} টি
          </span>
        </div>
        <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 block">আজকের লগইন</span>
          <span className="text-lg sm:text-xl font-black text-blue-700">
            {convertToBengaliNumbers(stats.todayCount)} বার
          </span>
        </div>
        <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 block">চলমান সেশন</span>
          <span className="text-lg sm:text-xl font-black text-emerald-600">
            {convertToBengaliNumbers(stats.activeCount)} টি
          </span>
        </div>
        <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 block">মোট সেশন সময়</span>
          <span className="text-xs sm:text-sm font-black text-amber-700 block mt-1 truncate">
            {formatCumulativeMinutesBengali(stats.totalDurationMinutes)}
          </span>
        </div>
      </div>

      {/* Filters & Export Toolbar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-3 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <label htmlFor="history-search" className="sr-only">
              হিস্ট্রি খুঁজুন
            </label>
            <input
              id="history-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="জিমেইল, ডিভাইস বা সেশন আইডি..."
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-600 focus:bg-white transition"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
          </div>

          {/* Email Dropdown */}
          <div>
            <label htmlFor="history-email-filter" className="sr-only">
              ব্যবহারকারী ফিল্টার
            </label>
            <select
              id="history-email-filter"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-600 focus:bg-white"
            >
              <option value="all">সকল ব্যবহারকারী ({convertToBengaliNumbers(distinctEmails.length)})</option>
              {distinctEmails.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>
          </div>

          {/* Reason Dropdown */}
          <div>
            <label htmlFor="history-reason-filter" className="sr-only">
              অবস্থা ফিল্টার
            </label>
            <select
              id="history-reason-filter"
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value as HistoryReasonFilter)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-600 focus:bg-white"
            >
              <option value="all">সব সেশন অবস্থা</option>
              <option value="active">🟢 বর্তমানে চলমান</option>
              <option value="logout">স্বাভাবিক লগআউট</option>
              <option value="another_device">অন্য মোবাইলে লগইন</option>
              <option value="kicked">অ্যাডমিন কর্তৃক বন্ধ</option>
            </select>
          </div>
        </div>

        {/* Date Presets + Custom Dates + Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                ['all', 'সব দিন'],
                ['today', 'আজ'],
                ['7days', 'গত ৭ দিন'],
                ['30days', 'গত ৩০ দিন'],
                ['custom', 'কাস্টম তারিখ'],
              ] as [HistoryDatePreset, string][]
            ).map(([presetKey, label]) => (
              <button
                key={presetKey}
                type="button"
                onClick={() => setDatePreset(presetKey)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  datePreset === presetKey
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setEmailFilter('all');
                  setReasonFilter('all');
                  setDatePreset('all');
                  setCustomFromDate('');
                  setCustomToDate('');
                }}
                className="px-2 py-1 rounded-lg text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 cursor-pointer"
              >
                রিসেট ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={filteredHistory.length === 0}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 text-emerald-800 border border-emerald-200 rounded-xl text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
            >
              <span>📥</span>
              <span>CSV এক্সপোর্ট</span>
            </button>

            {history.length > 0 && confirmClearMode === 'none' && (
              <>
                {hasActiveFilters && filteredHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmClearMode('filtered')}
                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-[11px] font-bold transition cursor-pointer"
                  >
                    🗑️ ফিল্টার্ড মুছুন
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmClearMode('all')}
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-[11px] font-bold transition cursor-pointer"
                >
                  🗑️ সব হিস্ট্রি মুছুন
                </button>
              </>
            )}
          </div>
        </div>

        {/* Custom Date Range Pickers */}
        {datePreset === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
            <div>
              <label htmlFor="hist-from-date" className="block text-[11px] font-bold text-slate-600 mb-1">
                শুরুর তারিখ থেকে:
              </label>
              <input
                id="hist-from-date"
                type="date"
                value={customFromDate}
                onChange={(e) => setCustomFromDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div>
              <label htmlFor="hist-to-date" className="block text-[11px] font-bold text-slate-600 mb-1">
                শেষ তারিখ পর্যন্ত:
              </label>
              <input
                id="hist-to-date"
                type="date"
                value={customToDate}
                onChange={(e) => setCustomToDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
          </div>
        )}

        {/* Inline Bulk Delete Confirmation */}
        {confirmClearMode !== 'none' && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-red-900">
              {confirmClearMode === 'all'
                ? `⚠️ ফায়ারবেস থেকে সর্বমোট ${convertToBengaliNumbers(history.length)} টি লগইন হিস্ট্রি স্থায়ীভাবে মুছে ফেলবেন?`
                : `⚠️ ফিল্টার করা ${convertToBengaliNumbers(filteredHistory.length)} টি হিস্ট্রি ফায়ারবেস থেকে স্থায়ীভাবে মুছে ফেলবেন?`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBulkConfirm}
                disabled={isBulkWorking}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                {isBulkWorking ? 'মুছছে...' : 'হ্যাঁ, স্থায়ীভাবে মুছুন'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearMode('none')}
                disabled={isBulkWorking}
                className="px-3 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
              >
                বাতিল
              </button>
            </div>
          </div>
        )}
      </div>

      {/* History Records Table */}
      {filteredHistory.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 p-6">
          <div className="text-3xl mb-2">📜</div>
          <h4 className="font-bold text-slate-700 text-sm">
            {history.length === 0
              ? 'কোনো লগইন হিস্ট্রি এখনো পাওয়া যায়নি'
              : 'নির্বাচিত ফিল্টারে কোনো হিস্ট্রি পাওয়া যায়নি'}
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            ব্যবহারকারীরা লগইন করলে বা সেশন শেষ করলে ফায়ারবেস ক্লাউডে স্বয়ংক্রিয়ভাবে রেকর্ড জমা হবে
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto max-h-[460px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3">ব্যবহারকারী (জিমেইল)</th>
                  <th className="py-2.5 px-3">ডিভাইস</th>
                  <th className="py-2.5 px-3">লগইন সময়</th>
                  <th className="py-2.5 px-3">লগআউট সময়</th>
                  <th className="py-2.5 px-3">সেশনে ছিল</th>
                  <th className="py-2.5 px-3">অবস্থা / কারণ</th>
                  <th className="py-2.5 px-3 text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.map((item) => {
                  const dev = getDeviceDetails(item.deviceName);
                  const reason = item.endReason || (item.logoutAt ? 'logout' : 'active');
                  let endLabel = 'স্বাভাবিক লগআউট';
                  let endColor = 'bg-slate-100 text-slate-700';

                  if (reason === 'active') {
                    endLabel = '🟢 বর্তমানে চলমান';
                    endColor = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
                  } else if (reason === 'another_device') {
                    endLabel = 'অন্য মোবাইলে লগইন';
                    endColor = 'bg-amber-100 text-amber-800';
                  } else if (reason === 'kicked') {
                    endLabel = 'অ্যাডমিন কর্তৃক বন্ধ';
                    endColor = 'bg-red-100 text-red-800';
                  }

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 font-bold text-slate-800 whitespace-nowrap">
                        {item.email}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <span>{dev.icon}</span>
                          <span>{dev.label}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium whitespace-nowrap">
                        {formatBengaliDateTime(item.loginAt)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium whitespace-nowrap">
                        {item.logoutAt ? formatBengaliDateTime(item.logoutAt) : (
                          <span className="text-emerald-700 font-bold">চলমান</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-extrabold text-indigo-900 whitespace-nowrap">
                        {formatDurationBengali(item.durationMinutes)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${endColor}`}>
                          {endLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleDeleteSingle(item.id)}
                          disabled={deletingId === item.id}
                          aria-label={`${item.email} এর হিস্ট্রি মুছুন`}
                          title="এই রেকর্ডটি মুছুন"
                          className="px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer disabled:opacity-40"
                        >
                          {deletingId === item.id ? '...' : '🗑️'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
