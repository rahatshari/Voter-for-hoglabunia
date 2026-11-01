import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserSessionData, SessionHistoryItem, AdminSessionsResponse } from '../types';
import {
  formatDurationBengali,
  formatBengaliDateTime,
  formatTimeAgo,
  getDeviceDetails,
} from '../lib/sessionUtils';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';

interface UserMonitoringModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string | null;
}

export const UserMonitoringModal: React.FC<UserMonitoringModalProps> = ({
  isOpen,
  onClose,
  currentUserEmail,
}) => {
  const [data, setData] = useState<AdminSessionsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionLoadingEmail, setActionLoadingEmail] = useState<string | null>(null);

  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSessionData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await fetch('/api/admin/sessions');
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const json: AdminSessionsResponse = await res.json();
        setData(json);
        setError(null);
      } else {
        // Fallback for static hosting (GitHub Pages)
        const mySessionId = localStorage.getItem('voter_device_session_id') || 'sess_local';
        const fallbackSession: UserSessionData = {
          sessionId: mySessionId,
          email: currentUserEmail || 'current_user@gmail.com',
          deviceName: navigator.userAgent.includes('Mobile') ? 'Mobile Web' : 'Desktop Browser',
          registeredAt: Date.now() - 1000 * 60 * 18, // 18 minutes ago
          lastActive: Date.now(),
          isOnline: true,
          durationMinutes: 18,
          lastSeenSecondsAgo: 2,
        };
        setData({
          success: true,
          activeUsers: [fallbackSession],
          history: [],
          summary: {
            totalDistinctEmails: 1,
            onlineCount: 1,
            totalRegisteredSessions: 1,
            totalHistoryCount: 0,
            avgDurationMinutes: 18,
          },
        });
      }
    } catch (err: any) {
      console.warn('Session monitor fetch warning:', err);
      setError('সার্ভার থেকে সেশন ডাটা লোড করা যায়নি');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [currentUserEmail]);

  // Initial fetch and auto-refresh interval (every 5 seconds)
  useEffect(() => {
    if (!isOpen) return;
    fetchSessionData(false);

    if (autoRefresh) {
      refreshTimerRef.current = setInterval(() => {
        fetchSessionData(true);
      }, 5000);
    }

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [isOpen, autoRefresh, fetchSessionData]);

  const showNotification = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const [confirmKickEmail, setConfirmKickEmail] = useState<string | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState<boolean>(false);

  // Kick / Terminate a session
  const handleKickSession = async (email: string) => {
    setActionLoadingEmail(email);
    try {
      const res = await fetch('/api/admin/kick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        showNotification(`✅ "${email}" অ্যাকাউন্টটি সফলভাবে লগআউট করানো হয়েছে`);
        await fetchSessionData(true);
      } else {
        showNotification('⚠️ লগআউট কমান্ড ব্যর্থ হয়েছে');
      }
    } catch {
      showNotification('⚠️ নেটওয়ার্ক ত্রুটি');
    } finally {
      setActionLoadingEmail(null);
      setConfirmKickEmail(null);
    }
  };

  // Clear Session History
  const handleClearHistory = async () => {
    try {
      const res = await fetch('/api/admin/clear-history', { method: 'POST' });
      if (res.ok) {
        showNotification('✅ লগইন হিস্ট্রি সফলভাবে মুছে ফেলা হয়েছে');
        await fetchSessionData(true);
      }
    } catch {
      showNotification('⚠️ হিস্ট্রি মোছা সম্ভব হয়নি');
    } finally {
      setConfirmClearHistory(false);
    }
  };

  if (!isOpen) return null;

  const activeUsers = data?.activeUsers || [];
  const history = data?.history || [];
  const summary = data?.summary || {
    totalDistinctEmails: 0,
    onlineCount: 0,
    totalRegisteredSessions: 0,
    totalHistoryCount: 0,
    avgDurationMinutes: 0,
  };

  // Filtered lists based on search
  const filteredActive = activeUsers.filter((u) =>
    u.email.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );
  const filteredHistory = history.filter((h) =>
    h.email.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] animate-slide-down">
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-4 py-3.5 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-xl shrink-0">
              👥
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-sm sm:text-base leading-tight">
                  ইউজার অ্যাক্টিভিটি ও লাইভ সেশন মনিটর
                </h3>
                <span className="text-[11px] bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  লাইভ ট্র্যাকিং
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                কে কোন জিমেইল দিয়ে লগইন করেছেন, বর্তমানে অনলাইন আছেন কিনা এবং কত মিনিট ধরে আছেন তা সরাসরি দেখুন
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm cursor-pointer transition"
            title="বন্ধ করুন"
          >
            ✕
          </button>
        </div>

        {/* Action Notice Bar */}
        {actionNotice && (
          <div className="bg-indigo-600 text-white text-xs font-bold py-2 px-4 text-center animate-slide-down shadow-inner">
            {actionNotice}
          </div>
        )}

        {/* Modal Main Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#F8FAFC] space-y-4 sm:space-y-5">
          {/* 4 Summary Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Card 1: Currently Online */}
            <div className="bg-white p-3.5 rounded-2xl border border-emerald-100 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">বর্তমানে অনলাইন</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-600 mt-1 flex items-baseline gap-1">
                {convertToBengaliNumbers(summary.onlineCount)}
                <span className="text-xs font-bold text-slate-500">জন</span>
              </div>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold mt-1 inline-block">
                🟢 সরাসরি অ্যাপে সক্রিয়
              </span>
            </div>

            {/* Card 2: Total Distinct Gmail Users */}
            <div className="bg-white p-3.5 rounded-2xl border border-blue-100 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500">মোট ব্যবহৃত জিমেইল</span>
              <div className="text-xl sm:text-2xl font-black text-blue-600 mt-1 flex items-baseline gap-1">
                {convertToBengaliNumbers(summary.totalDistinctEmails)}
                <span className="text-xs font-bold text-slate-500">টি</span>
              </div>
              <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-semibold mt-1 inline-block">
                📧 অ্যাকাউন্ট সংখ্যা
              </span>
            </div>

            {/* Card 3: Average Logged In Duration */}
            <div className="bg-white p-3.5 rounded-2xl border border-indigo-100 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500">গড় সেশন সময়কাল</span>
              <div className="text-lg sm:text-xl font-black text-indigo-600 mt-1">
                {formatDurationBengali(summary.avgDurationMinutes)}
              </div>
              <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-semibold mt-1 inline-block">
                ⏱️ ব্যবহারের গড় মিনিট
              </span>
            </div>

            {/* Card 4: Total Sessions */}
            <div className="bg-white p-3.5 rounded-2xl border border-purple-100 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500">মোট লগইন সেশন</span>
              <div className="text-xl sm:text-2xl font-black text-purple-600 mt-1 flex items-baseline gap-1">
                {convertToBengaliNumbers(summary.totalRegisteredSessions + summary.totalHistoryCount)}
                <span className="text-xs font-bold text-slate-500">বার</span>
              </div>
              <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded font-semibold mt-1 inline-block">
                📊 সর্বমোট রেকর্ড
              </span>
            </div>
          </div>

          {/* Controls Bar: Search, Tabs, Auto-Refresh */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Tab Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('active')}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'active'
                    ? 'bg-white text-indigo-900 shadow-xs'
                    : 'text-slate-600 hover:text-indigo-700'
                }`}
              >
                <span>🟢</span>
                <span>সক্রিয় সেশনসমূহ ({convertToBengaliNumbers(activeUsers.length)})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'history'
                    ? 'bg-white text-indigo-900 shadow-xs'
                    : 'text-slate-600 hover:text-indigo-700'
                }`}
              >
                <span>📜</span>
                <span>লগইন হিস্ট্রি ({convertToBengaliNumbers(history.length)})</span>
              </button>
            </div>

            {/* Search Input & Refresh Controls */}
            <div className="flex items-center gap-2 flex-1 justify-end min-w-[260px]">
              <div className="relative flex-1 max-w-xs">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="জিমেইল দিয়ে খুঁজুন..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-500 outline-none transition"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              </div>

              {/* Auto Refresh Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 hover:text-slate-900 select-none font-medium">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                />
                <span className="hidden sm:inline">অটো-রিফ্রেশ</span>
              </label>

              {/* Manual Refresh Button */}
              <button
                type="button"
                onClick={() => fetchSessionData(false)}
                disabled={loading}
                className="soft-btn px-2.5 py-1.5 text-indigo-700 font-bold flex items-center gap-1 cursor-pointer"
                title="তথ্য রিফ্রেশ করুন"
              >
                <span className={loading ? 'animate-spin' : ''}>🔄</span>
                <span className="hidden sm:inline">রিফ্রেশ</span>
              </button>
            </div>
          </div>

          {/* TAB 1: Active Users List */}
          {activeTab === 'active' && (
            <div className="space-y-3">
              {filteredActive.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 p-6">
                  <div className="text-3xl mb-2">👤</div>
                  <h4 className="font-bold text-slate-700 text-sm">কোনো সক্রিয় ব্যবহারকারী পাওয়া যায়নি</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {searchQuery ? 'আপনার সার্চের সাথে কোনো জিমেইল মিলছে না' : 'বর্তমানে কেউ লগইন অবস্থায় নেই'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredActive.map((user) => {
                    const dev = getDeviceDetails(user.deviceName);
                    const isCurrentAppUser = currentUserEmail && user.email.toLowerCase() === currentUserEmail.toLowerCase();
                    const isTerminating = actionLoadingEmail === user.email;

                    return (
                      <div
                        key={user.sessionId}
                        className={`bg-white rounded-2xl p-4 border transition shadow-xs hover:shadow-md ${
                          user.isOnline ? 'border-emerald-200 bg-gradient-to-r from-emerald-50/20 to-white' : 'border-slate-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          {/* User Details */}
                          <div className="flex items-start gap-3">
                            {/* Avatar Circle */}
                            <div
                              className={`w-11 h-11 rounded-2xl flex items-center justify-center text-base font-extrabold text-white shrink-0 shadow-xs ${
                                user.isOnline
                                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                                  : 'bg-gradient-to-br from-slate-400 to-slate-600'
                              }`}
                            >
                              {user.email.charAt(0).toUpperCase()}
                            </div>

                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug">
                                  {user.email}
                                </h4>
                                {isCurrentAppUser && (
                                  <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                    আপনার ডিভাইস
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-slate-600">
                                {/* Device info */}
                                <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md text-[11px] font-semibold text-slate-700">
                                  <span>{dev.icon}</span>
                                  <span>{dev.label}</span>
                                </span>

                                {/* Online status badge */}
                                {user.isOnline ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    অনলাইন (এখন সক্রিয়)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                                    ⚪ অফলাইন (নিষ্ক্রিয়)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Button: Remote Kick */}
                          {confirmKickEmail === user.email ? (
                            <div className="flex items-center gap-1.5 shrink-0 bg-red-50 border border-red-200 p-1.5 rounded-xl">
                              <span className="text-[11px] font-bold text-red-700">নিশ্চিত?</span>
                              <button
                                type="button"
                                onClick={() => handleKickSession(user.email)}
                                disabled={isTerminating}
                                className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer"
                              >
                                {isTerminating ? 'হচ্ছে...' : 'হ্যাঁ'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmKickEmail(null)}
                                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer"
                              >
                                না
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmKickEmail(user.email)}
                              disabled={isTerminating}
                              className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 shrink-0"
                              title="এই ডিভাইসটি লগআউট করিয়ে দিন"
                            >
                              <span>🚫</span>
                              <span>{isTerminating ? 'লগআউট হচ্ছে...' : 'লগআউট করান'}</span>
                            </button>
                          )}
                        </div>

                        {/* Timing and Duration Strip */}
                        <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          {/* Duration */}
                          <div className="bg-indigo-50/60 p-2 rounded-xl flex items-center gap-2">
                            <span className="text-base">⏱️</span>
                            <div>
                              <span className="text-[10px] text-slate-500 font-bold block">
                                {user.isOnline ? 'বর্তমানে লগইন আছে' : 'লগইন ছিল'}
                              </span>
                              <span className="font-extrabold text-indigo-900 text-xs sm:text-sm">
                                {formatDurationBengali(user.durationMinutes)}
                              </span>
                            </div>
                          </div>

                          {/* Login Time */}
                          <div className="bg-slate-50 p-2 rounded-xl flex items-center gap-2">
                            <span className="text-base">🕒</span>
                            <div>
                              <span className="text-[10px] text-slate-500 font-bold block">লগইন করার সময়</span>
                              <span className="font-bold text-slate-700 text-xs">
                                {formatBengaliDateTime(user.registeredAt)}
                              </span>
                            </div>
                          </div>

                          {/* Last Active Ping */}
                          <div className="bg-slate-50 p-2 rounded-xl flex items-center gap-2">
                            <span className="text-base">📡</span>
                            <div>
                              <span className="text-[10px] text-slate-500 font-bold block">শেষ সক্রিয় রেসপন্স</span>
                              <span className="font-bold text-slate-700 text-xs">
                                {formatTimeAgo(user.lastActive)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Login History */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">
                  সর্বশেষ লগইন ও ব্যবহার রেকর্ড ({convertToBengaliNumbers(filteredHistory.length)} টি)
                </span>
                {history.length > 0 && (
                  confirmClearHistory ? (
                    <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 px-2 py-1 rounded-lg">
                      <span className="text-[11px] font-bold text-red-700">সব রেকর্ড মুছবেন?</span>
                      <button
                        type="button"
                        onClick={handleClearHistory}
                        className="bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer"
                      >
                        হ্যাঁ
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearHistory(false)}
                        className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded text-[11px] font-bold cursor-pointer"
                      >
                        না
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClearHistory(true)}
                      className="text-xs text-red-600 hover:text-red-700 font-bold hover:underline cursor-pointer"
                    >
                      হিস্ট্রি মুছুন
                    </button>
                  )
                )}
              </div>

              {filteredHistory.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 p-6">
                  <div className="text-3xl mb-2">📜</div>
                  <h4 className="font-bold text-slate-700 text-sm">কোনো পূর্বের লগইন হিস্ট্রি নেই</h4>
                  <p className="text-xs text-slate-500 mt-1">ব্যবহারকারীরা লগআউট করলে তাদের রেকর্ড এখানে সংরক্ষিত হবে</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">ব্যবহারকারী (জিমেইল)</th>
                          <th className="py-2.5 px-3">ডিভাইস</th>
                          <th className="py-2.5 px-3">লগইন সময়</th>
                          <th className="py-2.5 px-3">লগআউট সময়</th>
                          <th className="py-2.5 px-3">কয় মিনিট ছিল</th>
                          <th className="py-2.5 px-3">অবস্থা</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredHistory.map((item) => {
                          const dev = getDeviceDetails(item.deviceName);
                          let endLabel = 'স্বাভাবিক লগআউট';
                          let endColor = 'bg-slate-100 text-slate-700';
                          if (item.endReason === 'another_device') {
                            endLabel = 'অন্য মোবাইলে লগইন';
                            endColor = 'bg-amber-100 text-amber-800';
                          } else if (item.endReason === 'kicked') {
                            endLabel = 'অ্যাডমিন কর্তৃক বন্ধ';
                            endColor = 'bg-red-100 text-red-800';
                          }

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/80 transition">
                              <td className="py-2.5 px-3 font-bold text-slate-800">
                                {item.email}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">
                                <span className="flex items-center gap-1">
                                  <span>{dev.icon}</span>
                                  <span>{dev.label}</span>
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 font-medium">
                                {formatBengaliDateTime(item.loginAt)}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 font-medium">
                                {item.logoutAt ? formatBengaliDateTime(item.logoutAt) : '-'}
                              </td>
                              <td className="py-2.5 px-3 font-extrabold text-indigo-700">
                                {formatDurationBengali(item.durationMinutes)}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${endColor}`}>
                                  {endLabel}
                                </span>
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
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 sm:px-6 flex items-center justify-between text-xs text-slate-500">
          <span>* ব্যবহারকারীর ব্রাউজার থেকে প্রতি ৫ সেকেন্ডে লাইভ সক্রিয়তা যাচাই করা হয়</span>
          <button
            type="button"
            onClick={onClose}
            className="soft-btn px-4 py-1.5 font-bold text-slate-700 hover:text-slate-900 cursor-pointer"
          >
            বন্ধ করুন
          </button>
        </div>
      </div>
    </div>
  );
};
