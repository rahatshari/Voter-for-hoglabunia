import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AdminPanelData,
  AppUserRecord,
  SessionHistoryItem,
} from '../types';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';
import {
  formatDurationBengali,
  formatBengaliDateTime,
  formatTimeAgo,
  getDeviceDetails,
} from '../lib/sessionUtils';
import {
  formatCumulativeMinutesBengali,
  filterAppUsers,
  validateNewUserForm,
} from '../lib/adminUtils';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail: string;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  currentUserEmail,
}) => {
  const [data, setData] = useState<AdminPanelData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'add_user' | 'admins' | 'history'>('users');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'active' | 'blocked'>('all');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Add User Form State
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [addUserError, setAddUserError] = useState<string | null>(null);

  // Admin Emails Management State
  const [adminEmailsList, setAdminEmailsList] = useState<string[]>([]);
  const [newAdminInput, setNewAdminInput] = useState('');
  const [isSavingAdmins, setIsSavingAdmins] = useState(false);

  // Inline confirmations
  const [confirmBlockEmail, setConfirmBlockEmail] = useState<string | null>(null);
  const [confirmKickEmail, setConfirmKickEmail] = useState<string | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState<boolean>(false);
  const [actionLoadingEmail, setActionLoadingEmail] = useState<string | null>(null);

  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showNotification = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const fetchAdminData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await fetch(`/api/admin/data?adminEmail=${encodeURIComponent(currentUserEmail)}`, {
        headers: {
          'x-admin-email': currentUserEmail,
        },
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const json: AdminPanelData = await res.json();
        setData(json);
        setAdminEmailsList(json.adminEmails || []);
        setError(null);
      } else if (res.status === 403) {
        setError('অননুমোদিত অ্যাক্সেস: আপনার এই অ্যাডমিন প্যানেলে প্রবেশের অনুমতি নেই।');
      } else {
        setError('সার্ভার থেকে অ্যাডমিন ডাটা লোড করা যায়নি।');
      }
    } catch (err: any) {
      console.warn('Admin panel fetch error:', err);
      setError('সার্ভারের সাথে সংযোগ স্থাপন করা সম্ভব হয়নি।');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [currentUserEmail]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    if (!isOpen) return;
    fetchAdminData(false);

    if (autoRefresh) {
      refreshTimerRef.current = setInterval(() => {
        fetchAdminData(true);
      }, 5000);
    }

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [isOpen, autoRefresh, fetchAdminData]);

  // Add User Handler
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserError(null);
    const validation = validateNewUserForm(newEmail, newPassword);
    if (!validation.isValid) {
      setAddUserError(validation.error || 'ভুল তথ্য দেওয়া হয়েছে');
      return;
    }

    setIsSubmittingUser(true);
    try {
      const res = await fetch('/api/admin/users/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUserEmail,
        },
        body: JSON.stringify({
          adminEmail: currentUserEmail,
          email: newEmail.trim().toLowerCase(),
          password: newPassword.trim(),
          name: newName.trim(),
          role: newRole,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showNotification(`✅ "${newEmail}" সফলভাবে যুক্ত করা হয়েছে!`);
        setNewEmail('');
        setNewPassword('');
        setNewName('');
        setNewRole('user');
        setActiveTab('users');
        await fetchAdminData(true);
      } else {
        setAddUserError(json.error || 'ব্যবহারকারী যোগ করা সম্ভব হয়নি।');
      }
    } catch {
      setAddUserError('নেটওয়ার্ক সমস্যার কারণে ব্যবহারকারী তৈরি করা যায়নি।');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  // Toggle Block / Unblock
  const handleToggleBlock = async (email: string, currentStatus: 'active' | 'blocked') => {
    setActionLoadingEmail(email);
    const newStatus = currentStatus === 'active' ? 'blocked' : 'active';
    try {
      const res = await fetch('/api/admin/users/toggle-block', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUserEmail,
        },
        body: JSON.stringify({
          adminEmail: currentUserEmail,
          email,
          status: newStatus,
        }),
      });
      if (res.ok) {
        showNotification(
          newStatus === 'blocked'
            ? `🚫 "${email}" অ্যাকাউন্টটি ব্লক করা হয়েছে এবং সেশন বন্ধ করা হয়েছে।`
            : `✅ "${email}" অ্যাকাউন্টটি পুনরায় সক্রিয় (আনব্লক) করা হয়েছে।`
        );
        await fetchAdminData(true);
      } else {
        const json = await res.json();
        showNotification(`⚠️ ত্রুটি: ${json.error || 'স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে'}`);
      }
    } catch {
      showNotification('⚠️ নেটওয়ার্ক ত্রুটি');
    } finally {
      setActionLoadingEmail(null);
      setConfirmBlockEmail(null);
    }
  };

  // Send Password Reset
  const handleSendPasswordReset = async (email: string) => {
    setActionLoadingEmail(email);
    try {
      const res = await fetch('/api/admin/users/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUserEmail,
        },
        body: JSON.stringify({
          adminEmail: currentUserEmail,
          email,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        showNotification(
          json.message || `🔑 "${email}" জিমেইলে পাসওয়ার্ড রিসেট লিংক পাঠানো হয়েছে!`
        );
        await fetchAdminData(true);
      } else {
        showNotification(`⚠️ ত্রুটি: ${json.error || 'পাসওয়ার্ড লিংক পাঠানো যায়নি'}`);
      }
    } catch {
      showNotification('⚠️ নেটওয়ার্ক সমস্যার কারণে অনুরোধ পাঠানো যায়নি');
    } finally {
      setActionLoadingEmail(null);
    }
  };

  // Kick Session
  const handleKickSession = async (email: string) => {
    setActionLoadingEmail(email);
    try {
      const res = await fetch('/api/admin/kick', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUserEmail,
        },
        body: JSON.stringify({
          adminEmail: currentUserEmail,
          email,
        }),
      });
      if (res.ok) {
        showNotification(`🚪 "${email}" অ্যাকাউন্টটি সফলভাবে লগআউট করানো হয়েছে।`);
        await fetchAdminData(true);
      } else {
        showNotification('⚠️ লগআউট কমান্ড ব্যর্থ হয়েছে।');
      }
    } catch {
      showNotification('⚠️ নেটওয়ার্ক ত্রুটি');
    } finally {
      setActionLoadingEmail(null);
      setConfirmKickEmail(null);
    }
  };

  // Save Admin Emails
  const handleSaveAdmins = async () => {
    if (adminEmailsList.length === 0) {
      showNotification('⚠️ কমপক্ষে ১টি অ্যাডমিন ইমেইল থাকতে হবে।');
      return;
    }
    setIsSavingAdmins(true);
    try {
      const res = await fetch('/api/admin/config/admins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUserEmail,
        },
        body: JSON.stringify({
          adminEmail: currentUserEmail,
          newAdminEmails: adminEmailsList,
        }),
      });
      if (res.ok) {
        showNotification('✅ অ্যাডমিন পারমিশন তালিকা সফলভাবে হালনাগাদ করা হয়েছে!');
        await fetchAdminData(true);
      } else {
        const json = await res.json();
        showNotification(`⚠️ ${json.error || 'সংরক্ষণ ব্যর্থ হয়েছে'}`);
      }
    } catch {
      showNotification('⚠️ নেটওয়ার্ক ত্রুটি');
    } finally {
      setIsSavingAdmins(false);
    }
  };

  // Clear Session History
  const handleClearHistory = async () => {
    try {
      const res = await fetch('/api/admin/clear-history', {
        method: 'POST',
        headers: {
          'x-admin-email': currentUserEmail,
        },
        body: JSON.stringify({ adminEmail: currentUserEmail }),
      });
      if (res.ok) {
        showNotification('✅ পূর্বের সব সেশন হিস্ট্রি মুছে ফেলা হয়েছে।');
        await fetchAdminData(true);
      }
    } catch {
      showNotification('⚠️ হিস্ট্রি মোছা সম্ভব হয়নি');
    } finally {
      setConfirmClearHistory(false);
    }
  };

  if (!isOpen) return null;

  const users = data?.users || [];
  const history = data?.history || [];
  const summary = data?.summary || {
    totalRegisteredUsers: 0,
    onlineCount: 0,
    blockedCount: 0,
    totalCumulativeMinutes: 0,
    avgMinutesPerUser: 0,
  };

  const filteredUsers = filterAppUsers(users, searchQuery, statusFilter);
  const activeCount = users.filter((u) => u.status === 'active').length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-panel-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-slate-50 w-full max-w-4xl max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden text-slate-800 animate-in slide-in-from-bottom duration-200">
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto my-2 sm:hidden shrink-0" />

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/60 border border-indigo-400/40 flex items-center justify-center text-xl shadow-inner">
              ⚙️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="admin-panel-title" className="text-base sm:text-lg font-black tracking-tight">
                  সুপার অ্যাডমিন ড্যাশবোর্ড
                </h3>
                <span className="bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  সীমাবদ্ধ অ্যাক্সেস
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-medium">
                অ্যাডমিন: <span className="font-semibold text-white">{currentUserEmail}</span> • এক নজরে সব ব্যবহারকারীর সময় ও নিয়ন্ত্রণ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchAdminData(false)}
              disabled={loading}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1"
              title="নতুন করে ডাটা রিফ্রেশ করুন"
            >
              <span className={loading ? 'animate-spin' : ''}>🔄</span>
              <span className="hidden sm:inline">রিফ্রেশ</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition cursor-pointer text-lg font-bold"
              title="বন্ধ করুন"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Action Notification Toast */}
        {actionNotice && (
          <div className="bg-indigo-600 text-white px-4 py-2 text-xs font-semibold text-center shadow-md animate-in fade-in duration-150 shrink-0">
            {actionNotice}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="bg-white border-b border-slate-200 px-4 pt-2 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'users'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>👥</span>
            <span>ব্যবহারকারী ও সময় ট্র্যাকিং</span>
            <span className="ml-1 bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {convertToBengaliNumbers(users.length)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('add_user')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'add_user'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>➕</span>
            <span>নতুন জিমেইল যুক্ত করুন</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('admins')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'admins'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🛡️</span>
            <span>অ্যাডমিন পারমিশন ({convertToBengaliNumbers(adminEmailsList.length)})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📜</span>
            <span>লগইন হিস্ট্রি</span>
            <span className="ml-1 bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {convertToBengaliNumbers(history.length)}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {error ? (
            <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center space-y-2">
              <span className="text-3xl">🚫</span>
              <h4 className="font-bold text-red-900 text-sm">{error}</h4>
              <p className="text-xs text-red-700 leading-relaxed">
                এই ড্যাশবোর্ডটি দেখার জন্য আপনার ইমেইলটি অ্যাডমিন তালিকায় যুক্ত থাকতে হবে।
              </p>
            </div>
          ) : null}

          {/* TAB 1: USERS & TIME TRACKING */}
          {activeTab === 'users' && !error && (
            <div className="space-y-4">
              {/* 4 KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Online */}
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                    <span>বর্তমানে অনলাইন</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-emerald-600">
                    {convertToBengaliNumbers(summary.onlineCount)} জন
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">লাইভ একটিভ সেশন</span>
                </div>

                {/* 2. Total Users */}
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                    <span>মোট জিমেইল</span>
                    <span className="text-blue-500">👥</span>
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-indigo-900">
                    {convertToBengaliNumbers(summary.totalRegisteredUsers)} টি
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">নিবন্ধিত অ্যাকাউন্ট</span>
                </div>

                {/* 3. Total Cumulative Minutes */}
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                    <span>সর্বমোট ব্যবহৃত সময়</span>
                    <span className="text-amber-500">⏳</span>
                  </div>
                  <div className="text-sm sm:text-base font-black text-amber-700 truncate" title={formatCumulativeMinutesBengali(summary.totalCumulativeMinutes)}>
                    {formatCumulativeMinutesBengali(summary.totalCumulativeMinutes)}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">সব সেশন মিলিয়ে মোট</span>
                </div>

                {/* 4. Blocked Accounts */}
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                    <span>ব্লকড অ্যাকাউন্ট</span>
                    <span className="text-red-500">🚫</span>
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-red-600">
                    {convertToBengaliNumbers(summary.blockedCount)} টি
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">লগইন বন্ধ রাখা হয়েছে</span>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="relative flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="জিমেইল, নাম বা ডিভাইস খুঁজুন..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      statusFilter === 'all'
                        ? 'bg-slate-800 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    সব ({convertToBengaliNumbers(users.length)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('online')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      statusFilter === 'online'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    অনলাইন ({convertToBengaliNumbers(summary.onlineCount)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('blocked')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      statusFilter === 'blocked'
                        ? 'bg-red-600 text-white'
                        : 'bg-red-50 text-red-700 hover:bg-red-100'
                    }`}
                  >
                    ব্লকড ({convertToBengaliNumbers(summary.blockedCount)})
                  </button>
                </div>

                {/* Auto Refresh toggle */}
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span>অটো-রিফ্রেশ (৫ সেঃ)</span>
                </label>
              </div>

              {/* Users Cards / List */}
              {loading && users.length === 0 ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin text-2xl mb-2">🔄</div>
                  <p className="text-xs text-slate-500 font-medium">অ্যাডমিন ডাটা লোড হচ্ছে...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 p-6">
                  <div className="text-3xl mb-2">🔍</div>
                  <h4 className="font-bold text-slate-700 text-sm">কোনো ব্যবহারকারী পাওয়া যায়নি</h4>
                  <p className="text-xs text-slate-500 mt-1">অনুসন্ধান ফিল্টার পরিবর্তন করুন অথবা নতুন জিমেইল যুক্ত করুন</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredUsers.map((user) => {
                    const dev = getDeviceDetails(user.deviceName);
                    const isCurrentUser = user.email.toLowerCase() === currentUserEmail.toLowerCase();
                    const isActionLoading = actionLoadingEmail === user.email;

                    return (
                      <div
                        key={user.email}
                        className={`bg-white rounded-2xl border transition shadow-xs p-4 ${
                          user.status === 'blocked'
                            ? 'border-red-200 bg-red-50/20'
                            : user.isOnline
                            ? 'border-emerald-200 bg-emerald-50/15'
                            : 'border-slate-200'
                        }`}
                      >
                        {/* Top Row: User Email, Role, Status, and Action Buttons */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${
                                user.status === 'blocked'
                                  ? 'bg-red-100 text-red-700'
                                  : user.isOnline
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {user.email.charAt(0).toUpperCase()}
                            </div>

                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-black text-slate-900 text-sm sm:text-base">
                                  {user.email}
                                </span>

                                {user.role === 'admin' && (
                                  <span className="bg-indigo-100 text-indigo-800 border border-indigo-200 text-[10px] px-2 py-0.5 rounded-md font-bold">
                                    🛡️ অ্যাডমিন
                                  </span>
                                )}

                                {isCurrentUser && (
                                  <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px] px-2 py-0.5 rounded-md font-bold">
                                    আপনার অ্যাকাউন্ট
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-slate-600">
                                {user.name && user.name !== user.email.split('@')[0] && (
                                  <span className="font-semibold text-slate-700 text-xs">
                                    {user.name} •
                                  </span>
                                )}

                                {/* Device badge */}
                                {user.deviceName && (
                                  <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md text-[11px] font-semibold text-slate-700">
                                    <span>{dev.icon}</span>
                                    <span>{dev.label}</span>
                                  </span>
                                )}

                                {/* Online/Offline/Blocked Badge */}
                                {user.status === 'blocked' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
                                    🚫 অ্যাকাউন্ট ব্লক করা
                                  </span>
                                ) : user.isOnline ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    অনলাইন (এখন সক্রিয়)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                                    ⚪ অফলাইন
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Toolbar */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Password Reset Button */}
                            <button
                              type="button"
                              onClick={() => handleSendPasswordReset(user.email)}
                              disabled={isActionLoading}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
                              title="পাসওয়ার্ড পরিবর্তনের লিংক পাঠান"
                            >
                              <span>🔑</span>
                              <span>পাসওয়ার্ড লিংক</span>
                            </button>

                            {/* Remote Kick / Logout Button (if active) */}
                            {user.isOnline && (
                              confirmKickEmail === user.email ? (
                                <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 p-1 rounded-xl">
                                  <span className="text-[11px] font-bold text-amber-900">লগআউট?</span>
                                  <button
                                    type="button"
                                    onClick={() => handleKickSession(user.email)}
                                    disabled={isActionLoading}
                                    className="bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded text-[11px] font-bold"
                                  >
                                    হ্যাঁ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmKickEmail(null)}
                                    className="bg-white text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-bold"
                                  >
                                    না
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmKickEmail(user.email)}
                                  disabled={isActionLoading}
                                  className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
                                  title="এই সেশনটি বন্ধ করুন"
                                >
                                  <span>🚪</span>
                                  <span>লগআউট</span>
                                </button>
                              )
                            )}

                            {/* Block / Unblock Button */}
                            {!isCurrentUser && (
                              confirmBlockEmail === user.email ? (
                                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 p-1.5 rounded-xl">
                                  <span className="text-[11px] font-bold text-red-700">
                                    {user.status === 'blocked' ? 'আনব্লক করবেন?' : 'ব্লক নিশ্চিত?'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleBlock(user.email, user.status)}
                                    disabled={isActionLoading}
                                    className="bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded text-[11px] font-bold"
                                  >
                                    হ্যাঁ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmBlockEmail(null)}
                                    className="bg-white border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-bold"
                                  >
                                    না
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmBlockEmail(user.email)}
                                  disabled={isActionLoading}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                                    user.status === 'blocked'
                                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                                      : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                                  }`}
                                >
                                  <span>{user.status === 'blocked' ? '✅' : '🚫'}</span>
                                  <span>{user.status === 'blocked' ? 'আনব্লক করুন' : 'ব্লক করুন'}</span>
                                </button>
                              )
                            )}
                          </div>
                        </div>

                        {/* Timing and Duration Breakdown Strip */}
                        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                          {/* 1. Current Session Time */}
                          <div className="bg-indigo-50/70 p-2.5 rounded-xl flex items-center gap-2">
                            <span className="text-lg">⏱️</span>
                            <div>
                              <span className="text-[10px] text-slate-500 font-bold block">
                                {user.isOnline ? 'বর্তমানে অ্যাক্টিভ আছে' : 'সর্বশেষ সেশনে ছিল'}
                              </span>
                              <span className="font-extrabold text-indigo-900 text-xs sm:text-sm">
                                {formatDurationBengali(user.currentSessionDuration || 0)}
                              </span>
                            </div>
                          </div>

                          {/* 2. Cumulative Lifetime Minutes (Crucial User Requirement) */}
                          <div className="bg-amber-50/80 p-2.5 rounded-xl flex items-center gap-2 border border-amber-200/60">
                            <span className="text-lg">⌛</span>
                            <div>
                              <span className="text-[10px] text-amber-800 font-extrabold block">
                                অ্যাপে সর্বমোট সময় কাটিয়েছে
                              </span>
                              <span className="font-black text-amber-950 text-xs sm:text-sm">
                                {formatCumulativeMinutesBengali(user.totalMinutesSpent || 0)}
                              </span>
                            </div>
                          </div>

                          {/* 3. Last Active / Registration */}
                          <div className="bg-slate-50 p-2.5 rounded-xl flex items-center gap-2">
                            <span className="text-lg">🕒</span>
                            <div>
                              <span className="text-[10px] text-slate-500 font-bold block">
                                {user.isOnline ? 'শেষ সক্রিয় রেসপন্স' : 'সর্বশেষ লগইন ছিল'}
                              </span>
                              <span className="font-bold text-slate-700 text-xs">
                                {user.lastActive ? formatTimeAgo(user.lastActive) : user.lastLoginAt ? formatBengaliDateTime(user.lastLoginAt) : 'নতুন অ্যাকাউন্ট'}
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

          {/* TAB 2: ADD NEW USER */}
          {activeTab === 'add_user' && !error && (
            <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <span>➕</span> নতুন জিমেইল অ্যাকাউন্ট তৈরি করুন
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  এখানে জিমেইল এবং পাসওয়ার্ড দিয়ে যুক্ত করলে তিনি সরাসরি অ্যাপে লগইন করতে পারবেন।
                </p>
              </div>

              {addUserError && (
                <div className="p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-semibold">
                  ⚠️ {addUserError}
                </div>
              )}

              <form onSubmit={handleAddUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ব্যবহারকারীর জিমেইল (Gmail / Email) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="যেমন: voter1@gmail.com"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    প্রাথমিক পাসওয়ার্ড <span className="text-red-500">* (কমপক্ষে ৬ অক্ষর)</span>
                  </label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="পাসওয়ার্ড লিখুন (যেমন: 123456)"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ব্যবহারকারীর নাম বা পদবী (ঐচ্ছিক)
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="যেমন: ওয়ার্ড কর্মী ১"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    অ্যাকাউন্ট রোল / অনুমতি
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition ${newRole === 'user' ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 font-bold' : 'border-slate-200 text-slate-600'}`}>
                      <input
                        type="radio"
                        name="role"
                        value="user"
                        checked={newRole === 'user'}
                        onChange={() => setNewRole('user')}
                      />
                      <span className="text-xs">সাধারণ ব্যবহারকারী (শুধু ভোটার স্লিপ ও সার্চ)</span>
                    </label>

                    <label className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition ${newRole === 'admin' ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 font-bold' : 'border-slate-200 text-slate-600'}`}>
                      <input
                        type="radio"
                        name="role"
                        value="admin"
                        checked={newRole === 'admin'}
                        onChange={() => setNewRole('admin')}
                      />
                      <span className="text-xs">অ্যাডমিন (এই ড্যাশবোর্ড ব্যবহারের অনুমতি পাবে)</span>
                    </label>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmittingUser}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-bold cursor-pointer transition shadow-md shadow-indigo-500/20"
                  >
                    {isSubmittingUser ? 'যুক্ত করা হচ্ছে...' : 'যুক্ত করুন ও সক্রিয় করুন'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: ADMIN PERMISSION SETTINGS */}
          {activeTab === 'admins' && !error && (
            <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <span>🛡️</span> অ্যাডমিন পারমিশন ব্যবস্থাপনা (১ বা ২টি ইমেইল)
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  এখানে সংরক্ষিত ইমেইলগুলো ছাড়া অন্য কোনো ব্যবহারকারী এই অ্যাডমিন প্যানেল বা ইউজার তথ্য দেখতে পারবে না।
                </p>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-700">
                  বর্তমান অনুমোদিত অ্যাডমিন তালিকা:
                </label>

                {adminEmailsList.map((email, idx) => (
                  <div
                    key={email}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold flex items-center justify-center">
                        {convertToBengaliNumbers(idx + 1)}
                      </span>
                      <span className="font-bold text-xs text-slate-800">{email}</span>
                      {idx === 0 && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
                          মূল সুপার অ্যাডমিন
                        </span>
                      )}
                    </div>

                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAdminEmailsList(adminEmailsList.filter((_, i) => i !== idx));
                        }}
                        className="text-xs text-red-600 hover:text-red-700 font-bold cursor-pointer"
                      >
                        বাদ দিন
                      </button>
                    )}
                  </div>
                ))}

                {adminEmailsList.length < 3 && (
                  <div className="flex gap-2 pt-2">
                    <input
                      type="email"
                      value={newAdminInput}
                      onChange={(e) => setNewAdminInput(e.target.value)}
                      placeholder="নতুন অ্যাডমিন জিমেইল লিখুন..."
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-indigo-600"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const clean = newAdminInput.trim().toLowerCase();
                        if (clean && !adminEmailsList.includes(clean)) {
                          setAdminEmailsList([...adminEmailsList, clean]);
                          setNewAdminInput('');
                        }
                      }}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      যোগ করুন
                    </button>
                  </div>
                )}

                <div className="pt-3">
                  <button
                    type="button"
                    onClick={handleSaveAdmins}
                    disabled={isSavingAdmins}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-bold cursor-pointer transition shadow-md shadow-indigo-500/20"
                  >
                    {isSavingAdmins ? 'সংরক্ষণ হচ্ছে...' : 'অ্যাডমিন তালিকা সংরক্ষণ করুন'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LOGIN HISTORY */}
          {activeTab === 'history' && !error && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">
                  সর্বশেষ সেশন রেকর্ড ({convertToBengaliNumbers(history.length)} টি)
                </span>
                {history.length > 0 && (
                  confirmClearHistory ? (
                    <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1 rounded-xl">
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
                        className="bg-white border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-bold cursor-pointer"
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

              {history.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 p-6">
                  <div className="text-3xl mb-2">📜</div>
                  <h4 className="font-bold text-slate-700 text-sm">কোনো পূর্বের লগইন হিস্ট্রি নেই</h4>
                  <p className="text-xs text-slate-500 mt-1">ব্যবহারকারীরা লগআউট বা বন্ধ করলে রেকর্ড এখানে সংরক্ষিত হবে</p>
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
                          <th className="py-2.5 px-3">সেশনে ছিল</th>
                          <th className="py-2.5 px-3">সমাপ্তির কারণ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {history.map((item) => {
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
                                {item.logoutAt ? formatBengaliDateTime(item.logoutAt) : 'চলমান'}
                              </td>
                              <td className="py-2.5 px-3 font-extrabold text-indigo-900">
                                {formatDurationBengali(item.durationMinutes)}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${endColor}`}>
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
        <div className="bg-white border-t border-slate-200 px-5 py-3 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>সিস্টেম লাইভ সিঙ্ক সক্রিয়</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            বন্ধ করুন
          </button>
        </div>
      </div>
    </div>
  );
};
