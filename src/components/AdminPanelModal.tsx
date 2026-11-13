import React, { useState, useEffect, useCallback } from 'react';
import {
  createFirebaseUserDirect,
  sendPasswordResetSafe,
} from '../lib/firebaseAuthAdmin';
import {
  AdminPanelData,
  AppGlobalConfig,
  AppUserRecord,
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
  isEmailAdmin,
} from '../lib/adminUtils';
import {
  DEFAULT_APP_CONFIG,
  buildClientAdminData,
  clientAddUser,
  clientUpdateUser,
  clientDeleteUser,
  clientDeleteHistoryItems,
  clientToggleBlock,
  clientKickSession,
  clientKickAllSessions,
  saveStoredAdminEmails,
  saveStoredAppConfig,
  replaceStoredHistoryExact,
  loadStoredAdminEmails,
} from '../lib/clientAdminStore';
import {
  fetchCloudAdminData,
  subscribeCloudAdminData,
  cloudAddUser,
  cloudUpdateUser,
  cloudDeleteUser,
  cloudDeleteHistoryItems,
  cloudClearAllHistory,
  cloudToggleBlock,
  cloudKickSession,
  cloudKickAllSessions,
  saveCloudAdminEmails,
  saveCloudAppConfig,
} from '../lib/cloudStore';
import { AdminHistoryTab } from './AdminHistoryTab';
import { AdminControlsTab } from './AdminControlsTab';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail: string;
}

type AdminTabId = 'users' | 'history' | 'add_user' | 'admins' | 'controls';

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  currentUserEmail,
}) => {
  const [data, setData] = useState<AdminPanelData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTabId>('users');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'active' | 'blocked' | 'admin'>('all');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [historyInitialEmail, setHistoryInitialEmail] = useState<string>('all');

  // Add User Form State
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [sendActivationEmail, setSendActivationEmail] = useState<boolean>(false);
  const [showAddUserPassword, setShowAddUserPassword] = useState<boolean>(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [addUserError, setAddUserError] = useState<string | null>(null);

  // Admin Emails Management State
  const [adminEmailsList, setAdminEmailsList] = useState<string[]>([]);
  const [newAdminInput, setNewAdminInput] = useState('');
  const [newAdminError, setNewAdminError] = useState<string | null>(null);
  const [isSavingAdmins, setIsSavingAdmins] = useState(false);

  // Inline Edit User State
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editRole, setEditRole] = useState<'user' | 'admin'>('user');
  const [editMinutes, setEditMinutes] = useState<string>('0');

  // Inline confirmations
  const [confirmBlockEmail, setConfirmBlockEmail] = useState<string | null>(null);
  const [confirmKickEmail, setConfirmKickEmail] = useState<string | null>(null);
  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState<string | null>(null);
  const [actionLoadingEmail, setActionLoadingEmail] = useState<string | null>(null);

  const showNotification = useCallback((msg: string) => {
    setActionNotice(msg);
    setTimeout(() => {
      setActionNotice((prev) => (prev === msg ? null : prev));
    }, 4500);
  }, []);

  const loadFallbackData = useCallback(
    async (cloudErrReason?: string | null) => {
      // Try Express Server first, then Client Local Store
      try {
        const res = await fetch(`/api/admin/data?adminEmail=${encodeURIComponent(currentUserEmail)}`, {
          headers: { 'x-admin-email': currentUserEmail },
        });
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          const json: AdminPanelData = await res.json();
          setData({
            ...json,
            dataSource: 'server',
            cloudConnected: false,
            cloudError: cloudErrReason || json.cloudError || null,
          });
          setAdminEmailsList(json.adminEmails || []);
          setError(null);
          setLoading(false);
          return;
        }
        if (res.status === 403) {
          setError('অননুমোদিত অ্যাক্সেস: আপনার এই অ্যাডমিন প্যানেলে প্রবেশের অনুমতি নেই।');
          setLoading(false);
          return;
        }
      } catch {
        // Static/APK host (no Express server)
      }

      try {
        const clientData = buildClientAdminData(currentUserEmail);
        const storedAdmins = loadStoredAdminEmails();
        if (isEmailAdmin(currentUserEmail, storedAdmins)) {
          setData({
            ...clientData,
            dataSource: 'local',
            cloudConnected: false,
            cloudError: cloudErrReason || null,
          });
          setAdminEmailsList(clientData.adminEmails || storedAdmins);
          setError(null);
        } else {
          setError('অননুমোদিত অ্যাক্সেস: আপনার এই অ্যাডমিন প্যানেলে প্রবেশের অনুমতি নেই।');
        }
      } catch {
        setError('অ্যাডমিন ডাটা লোড করা সম্ভব হয়নি।');
      } finally {
        setLoading(false);
      }
    },
    [currentUserEmail]
  );

  const fetchAdminData = useCallback(
    async (isSilent = false) => {
      if (!isSilent) setLoading(true);
      try {
        const cloudData = await fetchCloudAdminData(currentUserEmail);
        if (!cloudData.isAdmin) {
          setError('অননুমোদিত অ্যাক্সেস: আপনার এই অ্যাডমিন প্যানেলে প্রবেশের অনুমতি নেই।');
          setLoading(false);
          return;
        }
        setData(cloudData);
        setAdminEmailsList(cloudData.adminEmails || []);
        setError(null);
        setLoading(false);
      } catch (err: any) {
        await loadFallbackData(err?.message || 'ফায়ারবেস ক্লাউড সংযোগ বিচ্ছিন্ন');
      }
    },
    [currentUserEmail, loadFallbackData]
  );

  // Real-time Firebase RTDB Subscription while modal is open!
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);

    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let isUsingCloudStream = true;

    const unsubCloud = subscribeCloudAdminData(
      currentUserEmail,
      (cloudData) => {
        if (!cloudData.isAdmin) {
          setError('অননুমোদিত অ্যাক্সেস: আপনার এই অ্যাডমিন প্যানেলে প্রবেশের অনুমতি নেই।');
          setLoading(false);
          return;
        }
        setData(cloudData);
        setAdminEmailsList(cloudData.adminEmails || []);
        setError(null);
        setLoading(false);
      },
      (fatalCloudErr) => {
        // Cloud permission denied or unreachable -> use server/local fallback + surface exact Cloud reason
        if (isUsingCloudStream) {
          isUsingCloudStream = false;
          loadFallbackData(fatalCloudErr);
          if (!fallbackTimer) {
            fallbackTimer = setInterval(() => {
              loadFallbackData(fatalCloudErr);
            }, 6000);
          }
        }
      }
    );

    return () => {
      try {
        unsubCloud();
      } catch {}
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, [isOpen, currentUserEmail, loadFallbackData]);

  const syncRefreshIfOffline = async () => {
    if (!data?.cloudConnected) {
      await loadFallbackData(data?.cloudError);
    }
  };

  const runCloudMutation = async (fn: () => Promise<unknown>) => {
    if (data?.cloudConnected) {
      await fn().catch((err) => console.warn('Cloud mutation notice:', err));
    } else {
      void fn().catch(() => null);
    }
  };

  // Start editing a user
  const startEditUser = (u: AppUserRecord) => {
    setEditingEmail(u.email);
    setEditName(u.name || '');
    setEditPhone(u.phone || '');
    setEditNotes(u.notes || '');
    setEditRole(u.role);
    setEditMinutes(String(Math.round(u.totalMinutesSpent || 0)));
  };

  const handleSaveUserEdit = async (email: string) => {
    setActionLoadingEmail(email);
    const cleanEmail = email.trim().toLowerCase();
    const isSuperPrimary = cleanEmail === 'rahatsharif10448@gmail.com';
    const nextRole: 'admin' | 'user' = isSuperPrimary ? 'admin' : editRole;
    const parsedMinutes = Math.max(0, Number(editMinutes) || 0);

    const updates = {
      name: editName.trim() || cleanEmail.split('@')[0],
      phone: editPhone.trim(),
      notes: editNotes.trim(),
      role: nextRole,
      totalMinutesSpent: parsedMinutes,
    };

    clientUpdateUser(cleanEmail, updates);

    await Promise.allSettled([
      runCloudMutation(() => cloudUpdateUser(cleanEmail, updates)),
      fetch('/api/admin/users/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUserEmail,
        },
        body: JSON.stringify({
          adminEmail: currentUserEmail,
          email: cleanEmail,
          updates,
        }),
      }),
    ]);

    setEditingEmail(null);
    setActionLoadingEmail(null);
    showNotification(`✅ "${cleanEmail}" ব্যবহারকারীর তথ্য সফলভাবে হালনাগাদ হয়েছে।`);
    await syncRefreshIfOffline();
  };

  // Delete User permanently from Cloud + Server + Local
  const handleDeleteUser = async (email: string) => {
    setActionLoadingEmail(email);
    const cleanEmail = email.trim().toLowerCase();

    clientDeleteUser(cleanEmail);

    await Promise.allSettled([
      runCloudMutation(() => cloudDeleteUser(cleanEmail)),
      fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUserEmail,
        },
        body: JSON.stringify({ adminEmail: currentUserEmail, email: cleanEmail }),
      }),
    ]);

    setConfirmDeleteEmail(null);
    setActionLoadingEmail(null);
    showNotification(`🗑️ "${cleanEmail}" অ্যাকাউন্টটি তালিকা থেকে মুছে ফেলা হয়েছে।`);
    await syncRefreshIfOffline();
  };

  // Add User Handler (Direct Firebase Auth + Hybrid Sync)
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserError(null);
    const cleanMail = newEmail.trim().toLowerCase();
    const cleanPass = newPassword.trim();
    const cleanUserName = newName.trim();
    const cleanPhone = newPhone.trim();

    const validation = validateNewUserForm(cleanMail, cleanPass);
    if (!validation.isValid) {
      setAddUserError(validation.error || 'ভুল তথ্য দেওয়া হয়েছে');
      return;
    }

    setIsSubmittingUser(true);

    try {
      const fbResult = await createFirebaseUserDirect(cleanMail, cleanPass, cleanUserName);
      if (!fbResult.success) {
        setAddUserError(fbResult.message);
        setIsSubmittingUser(false);
        return;
      }

      try {
        await cloudAddUser({
          email: cleanMail,
          name: cleanUserName,
          phone: cleanPhone,
          role: newRole,
        });
      } catch (cloudErr) {
        console.warn('Notice: cloudAddUser error:', cloudErr);
      }

      try {
        await fetch('/api/admin/users/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-email': currentUserEmail,
          },
          body: JSON.stringify({
            adminEmail: currentUserEmail,
            email: cleanMail,
            password: cleanPass,
            name: cleanUserName,
            role: newRole,
          }),
        });
      } catch {}

      clientAddUser({
        email: cleanMail,
        name: cleanUserName,
        phone: cleanPhone,
        role: newRole,
      });

      if (newRole === 'admin') {
        const storedAdmins = loadStoredAdminEmails();
        if (!storedAdmins.includes(cleanMail)) {
          const updated = [...storedAdmins, cleanMail];
          await saveCloudAdminEmails(updated).catch(() => null);
          saveStoredAdminEmails(updated);
          setAdminEmailsList(updated);
        }
      }

      if (sendActivationEmail) {
        try {
          await sendPasswordResetSafe(cleanMail);
        } catch {}
      }

      showNotification(
        fbResult.alreadyExists
          ? `✅ "${cleanMail}" ব্যবহারকারী তালিকায় সফলভাবে যুক্ত ও সক্রিয় করা হয়েছে!`
          : `✅ "${cleanMail}" অ্যাকাউন্টটি সফলভাবে ফায়ারবেসে তৈরি ও সক্রিয় করা হয়েছে!`
      );

      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setNewPhone('');
      setNewRole('user');
      setActiveTab('users');
      await syncRefreshIfOffline();
    } catch (err: any) {
      setAddUserError(`ত্রুটি: ${err?.message || 'অ্যাকাউন্ট তৈরি করা সম্ভব হয়নি'}`);
    } finally {
      setIsSubmittingUser(false);
    }
  };

  // Toggle Block / Unblock
  const handleToggleBlock = async (email: string, currentStatus: 'active' | 'blocked') => {
    setActionLoadingEmail(email);
    const newStatus = currentStatus === 'active' ? 'blocked' : 'active';

    clientToggleBlock(email, newStatus);

    await Promise.allSettled([
      runCloudMutation(() => cloudToggleBlock(email, newStatus)),
      fetch('/api/admin/users/toggle-block', {
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
      }),
    ]);

    showNotification(
      newStatus === 'blocked'
        ? `🚫 "${email}" অ্যাকাউন্টটি ব্লক করা হয়েছে এবং সেশন বন্ধ করা হয়েছে।`
        : `✅ "${email}" অ্যাকাউন্টটি পুনরায় সক্রিয় (আনব্লক) করা হয়েছে।`
    );
    await syncRefreshIfOffline();
    setActionLoadingEmail(null);
    setConfirmBlockEmail(null);
  };

  // Send Password Reset
  const handleSendPasswordReset = async (email: string) => {
    setActionLoadingEmail(email);
    try {
      const res = await sendPasswordResetSafe(email);
      showNotification(res.message);
    } finally {
      setActionLoadingEmail(null);
    }
  };

  // Kick single user's active session
  const handleKickSession = async (email: string) => {
    setActionLoadingEmail(email);

    clientKickSession(email);

    await Promise.allSettled([
      runCloudMutation(() => cloudKickSession(email)),
      fetch('/api/admin/kick', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUserEmail,
        },
        body: JSON.stringify({
          adminEmail: currentUserEmail,
          email,
        }),
      }),
    ]);

    showNotification(`🚪 "${email}" অ্যাকাউন্টটি সফলভাবে লগআউট করানো হয়েছে।`);
    await syncRefreshIfOffline();
    setActionLoadingEmail(null);
    setConfirmKickEmail(null);
  };

  // Kick ALL active sessions except current admin
  const handleKickAllSessions = async () => {
    let kickedCount = clientKickAllSessions(currentUserEmail);

    const [cloudRes, serverRes] = await Promise.allSettled([
      data?.cloudConnected ? cloudKickAllSessions(currentUserEmail) : Promise.resolve(0),
      fetch('/api/admin/kick-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUserEmail,
        },
        body: JSON.stringify({
          adminEmail: currentUserEmail,
          excludeEmail: currentUserEmail,
        }),
      }).then((r) => (r.ok ? r.json() : null)),
    ]);

    if (cloudRes.status === 'fulfilled') {
      kickedCount = Math.max(kickedCount, Number(cloudRes.value || 0));
    } else {
      void cloudKickAllSessions(currentUserEmail).catch(() => null);
    }
    if (serverRes.status === 'fulfilled' && serverRes.value) {
      kickedCount = Math.max(kickedCount, Number(serverRes.value.kickedCount || 0));
    }

    showNotification(
      kickedCount > 0
        ? `🚪 ${convertToBengaliNumbers(kickedCount)} টি সক্রিয় সেশন সফলভাবে লগআউট করানো হয়েছে।`
        : 'ℹ️ বর্তমানে অন্য কোনো সক্রিয় সেশন চালু নেই।'
    );
    await syncRefreshIfOffline();
  };

  // Save Admin Emails
  const handleSaveAdmins = async (customList?: string[]) => {
    const listToSave = customList || adminEmailsList;
    if (listToSave.length === 0) {
      showNotification('⚠️ কমপক্ষে ১টি অ্যাডমিন ইমেইল থাকতে হবে।');
      return;
    }
    setIsSavingAdmins(true);

    saveStoredAdminEmails(listToSave);
    setAdminEmailsList(listToSave);

    await Promise.allSettled([
      runCloudMutation(() => saveCloudAdminEmails(listToSave)),
      fetch('/api/admin/config/admins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUserEmail,
        },
        body: JSON.stringify({
          adminEmail: currentUserEmail,
          newAdminEmails: listToSave,
        }),
      }),
    ]);

    showNotification('✅ অ্যাডমিন পারমিশন তালিকা সফলভাবে সংরক্ষিত হয়েছে!');
    await syncRefreshIfOffline();
    setIsSavingAdmins(false);
  };

  const handleAddAdminEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setNewAdminError(null);
    const clean = newAdminInput.trim().toLowerCase();
    if (!clean) {
      setNewAdminError('দয়া করে জিমেইল আইডি লিখুন।');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clean)) {
      setNewAdminError('সঠিক জিমেইল ফরম্যাট দিন (যেমন: admin@gmail.com)।');
      return;
    }
    if (adminEmailsList.includes(clean)) {
      setNewAdminError('এই জিমেইলটি ইতিমধ্যে অ্যাডমিন তালিকায় বিদ্যমান রয়েছে।');
      return;
    }

    const updated = [...adminEmailsList, clean];
    setNewAdminInput('');
    await handleSaveAdmins(updated);
  };

  // Delete specific history items across Cloud + Server + Local
  const handleDeleteHistoryItems = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;

    clientDeleteHistoryItems(ids);

    await Promise.allSettled([
      runCloudMutation(() => cloudDeleteHistoryItems(ids)),
      fetch('/api/admin/delete-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUserEmail,
        },
        body: JSON.stringify({ adminEmail: currentUserEmail, ids }),
      }),
    ]);

    showNotification(`🗑️ ${convertToBengaliNumbers(ids.length)} টি লগইন হিস্ট্রি মুছে ফেলা হয়েছে।`);
    await syncRefreshIfOffline();
  };

  // Clear ALL history across Cloud + Server + Local
  const handleClearAllHistory = async () => {
    replaceStoredHistoryExact([]);

    await Promise.allSettled([
      runCloudMutation(() => cloudClearAllHistory()),
      fetch('/api/admin/clear-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUserEmail,
        },
        body: JSON.stringify({ adminEmail: currentUserEmail }),
      }),
    ]);

    showNotification('✅ সব লগইন হিস্ট্রি স্থায়ীভাবে মুছে ফেলা হয়েছে।');
    await syncRefreshIfOffline();
  };

  // Save Global App Config across Cloud + Server + Local
  const handleSaveAppConfig = async (cfg: AppGlobalConfig) => {
    saveStoredAppConfig(cfg);
    window.dispatchEvent(new Event('voter_app_config_changed'));

    await Promise.allSettled([
      runCloudMutation(() => saveCloudAppConfig(cfg, currentUserEmail)),
      fetch('/api/admin/config/app', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUserEmail,
        },
        body: JSON.stringify({ adminEmail: currentUserEmail, appConfig: cfg }),
      }),
    ]);

    showNotification('✅ গ্লোবাল অ্যাপ কন্ট্রোল সেটিংস সফলভাবে কার্যকর করা হয়েছে!');
    await syncRefreshIfOffline();
  };

  if (!isOpen) return null;

  const users = data?.users || [];
  const history = data?.history || [];
  const appConfig = data?.appConfig || DEFAULT_APP_CONFIG;
  const dataSource = data?.dataSource || 'local';
  const cloudConnected = Boolean(data?.cloudConnected);
  const cloudError = data?.cloudError || null;
  const summary = data?.summary || {
    totalRegisteredUsers: 0,
    onlineCount: 0,
    blockedCount: 0,
    adminCount: 0,
    totalCumulativeMinutes: 0,
    avgMinutesPerUser: 0,
  };

  const filteredUsers = filterAppUsers(users, searchQuery, statusFilter);
  const activeCount = users.filter((u) => u.status === 'active').length;
  const adminRoleCount = users.filter((u) => u.role === 'admin').length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-panel-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5 bg-slate-900/75"
    >
      <div className="bg-slate-50 w-full max-w-5xl max-h-[94vh] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden text-slate-800 animate-in slide-in-from-bottom duration-200">
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto my-2 sm:hidden shrink-0" />

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between gap-2 shadow-md shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/60 border border-indigo-400/40 flex items-center justify-center text-xl shadow-inner shrink-0">
              ⚙️
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="admin-panel-title" className="text-base sm:text-lg font-black tracking-tight">
                  সুপার অ্যাডমিন কন্ট্রোল সেন্টার
                </h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                    cloudConnected
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-400/30'
                  }`}
                >
                  {cloudConnected ? '🟢 Firebase Live' : '⚠️ ব্যাকআপ মোড'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-medium truncate">
                অ্যাডমিন: <span className="font-semibold text-white">{currentUserEmail}</span> • রিয়েল-টাইম নিয়ন্ত্রণ ও সম্পূর্ণ হিস্ট্রি
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
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
              aria-label="অ্যাডমিন প্যানেল বন্ধ করুন"
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
        <div
          role="tablist"
          aria-label="অ্যাডমিন সেকশন"
          className="bg-white border-b border-slate-200 px-3 sm:px-4 pt-2 flex items-center gap-1.5 overflow-x-auto shrink-0 scrollbar-none"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'users'}
            onClick={() => setActiveTab('users')}
            className={`px-3 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'users'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>👥</span>
            <span>ব্যবহারকারী</span>
            <span className="ml-0.5 bg-slate-100 text-slate-700 text-[10px] px-1.5 rounded-full font-bold">
              {convertToBengaliNumbers(users.length)}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            className={`px-3 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📜</span>
            <span>লগইন হিস্ট্রি</span>
            <span className="ml-0.5 bg-slate-100 text-slate-700 text-[10px] px-1.5 rounded-full font-bold">
              {convertToBengaliNumbers(history.length)}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'add_user'}
            onClick={() => setActiveTab('add_user')}
            className={`px-3 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'add_user'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>➕</span>
            <span>নতুন জিমেইল</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'admins'}
            onClick={() => setActiveTab('admins')}
            className={`px-3 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'admins'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🛡️</span>
            <span>অ্যাডমিন ({convertToBengaliNumbers(adminEmailsList.length)})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'controls'}
            onClick={() => setActiveTab('controls')}
            className={`px-3 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'controls'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-xl'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🎛️</span>
            <span>অ্যাপ কন্ট্রোল ও সিঙ্ক</span>
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

          {/* Cloud Warning Strip (shown cleanly on non-controls tabs if Firebase RTDB isn't synced) */}
          {!error && !loading && cloudError && activeTab !== 'controls' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-amber-900 font-semibold">
                <span>⚠️</span>
                <span>
                  ফায়ারবেস ক্লাউড সিঙ্ক বিচ্ছিন্ন ({cloudError})। তাই পূর্বের ক্লাউড হিস্ট্রি দেখা না গেলে{' '}
                  <strong>অ্যাপ কন্ট্রোল ও সিঙ্ক</strong> ট্যাব দেখুন।
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('controls')}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold cursor-pointer"
              >
                সমাধান দেখুন →
              </button>
            </div>
          )}

          {/* TAB 1: USERS & FULL CONTROL */}
          {activeTab === 'users' && !error && (
            <div className="space-y-4">
              {/* 4 KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                    <span>বর্তমানে অনলাইন</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-emerald-600">
                    {convertToBengaliNumbers(summary.onlineCount)} জন
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">লাইভ সক্রিয় সেশন</span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                    <span>মোট ব্যবহারকারী</span>
                    <span className="text-blue-500">👥</span>
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-indigo-900">
                    {convertToBengaliNumbers(summary.totalRegisteredUsers)} টি
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">
                    সক্রিয় {convertToBengaliNumbers(activeCount)} • অ্যাডমিন {convertToBengaliNumbers(adminRoleCount)}
                  </span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                    <span>সর্বমোট ব্যবহৃত সময়</span>
                    <span className="text-amber-500">⏳</span>
                  </div>
                  <div
                    className="text-sm sm:text-base font-black text-amber-700 truncate"
                    title={formatCumulativeMinutesBengali(summary.totalCumulativeMinutes)}
                  >
                    {formatCumulativeMinutesBengali(summary.totalCumulativeMinutes)}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">সব সেশন মিলিয়ে মোট</span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                    <span>ব্লকড অ্যাকাউন্ট</span>
                    <span className="text-red-500">🚫</span>
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-red-600">
                    {convertToBengaliNumbers(summary.blockedCount)} টি
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">প্রবেশ বন্ধ রাখা হয়েছে</span>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shadow-xs">
                <div className="relative flex-1 min-w-[200px]">
                  <label htmlFor="admin-user-search" className="sr-only">
                    ব্যবহারকারী খুঁজুন
                  </label>
                  <input
                    id="admin-user-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="জিমেইল, নাম, ফোন বা ডিভাইস খুঁজুন..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      ['all', `সব (${convertToBengaliNumbers(users.length)})`],
                      ['online', `অনলাইন (${convertToBengaliNumbers(summary.onlineCount)})`],
                      ['active', `সক্রিয় (${convertToBengaliNumbers(activeCount)})`],
                      ['blocked', `ব্লকড (${convertToBengaliNumbers(summary.blockedCount)})`],
                      ['admin', `অ্যাডমিন (${convertToBengaliNumbers(adminRoleCount)})`],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStatusFilter(key)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        statusFilter === key
                          ? key === 'blocked'
                            ? 'bg-red-600 text-white'
                            : key === 'online'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-800 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Users List */}
              {loading && users.length === 0 ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin text-2xl mb-2">🔄</div>
                  <p className="text-xs text-slate-500 font-medium">রিয়েল-টাইম ডাটা লোড হচ্ছে...</p>
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
                    const isPrimarySuperAdmin = user.email.toLowerCase() === 'rahatsharif10448@gmail.com';
                    const isActionLoading = actionLoadingEmail === user.email;
                    const isEditing = editingEmail === user.email;

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
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
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

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-black text-slate-900 text-sm sm:text-base break-all">
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
                                {user.name && (
                                  <span className="font-semibold text-slate-700 text-xs">
                                    👤 {user.name}
                                  </span>
                                )}
                                {user.phone && (
                                  <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md font-semibold">
                                    📞 {user.phone}
                                  </span>
                                )}
                                {user.deviceName && (
                                  <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md text-[11px] font-semibold text-slate-700">
                                    <span>{dev.icon}</span>
                                    <span>{dev.label}</span>
                                  </span>
                                )}
                                {user.status === 'blocked' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
                                    🚫 ব্লক করা
                                  </span>
                                ) : user.isOnline ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    অনলাইন
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                                    ⚪ অফলাইন
                                  </span>
                                )}
                              </div>

                              {user.notes && (
                                <p className="text-[11px] text-slate-500 mt-1 italic">
                                  📝 {user.notes}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Full Action Toolbar */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Jump to this user's Login History */}
                            <button
                              type="button"
                              onClick={() => {
                                setHistoryInitialEmail(user.email.toLowerCase());
                                setActiveTab('history');
                              }}
                              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
                              title="এই ব্যবহারকারীর সম্পূর্ণ লগইন হিস্ট্রি দেখুন"
                            >
                              <span>📜</span>
                              <span>হিস্ট্রি</span>
                            </button>

                            {/* Edit Profile / Role / Minutes */}
                            <button
                              type="button"
                              onClick={() => (isEditing ? setEditingEmail(null) : startEditUser(user))}
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 border ${
                                isEditing
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                              }`}
                              title="ব্যবহারকারীর তথ্য এডিট করুন"
                            >
                              <span>✏️</span>
                              <span>{isEditing ? 'এডিট বন্ধ' : 'এডিট'}</span>
                            </button>

                            {/* Password Reset */}
                            <button
                              type="button"
                              onClick={() => handleSendPasswordReset(user.email)}
                              disabled={isActionLoading}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
                              title="পাসওয়ার্ড পরিবর্তনের লিংক পাঠান"
                            >
                              <span>🔑</span>
                              <span>পাসওয়ার্ড</span>
                            </button>

                            {/* Remote Kick / Force Logout (if online) */}
                            {user.isOnline &&
                              (confirmKickEmail === user.email ? (
                                <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 p-1 rounded-xl">
                                  <span className="text-[11px] font-bold text-amber-900">লগআউট?</span>
                                  <button
                                    type="button"
                                    onClick={() => handleKickSession(user.email)}
                                    disabled={isActionLoading}
                                    className="bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer"
                                  >
                                    হ্যাঁ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmKickEmail(null)}
                                    className="bg-white text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-bold cursor-pointer"
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
                              ))}

                            {/* Block / Unblock */}
                            {!isCurrentUser &&
                              !isPrimarySuperAdmin &&
                              (confirmBlockEmail === user.email ? (
                                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 p-1.5 rounded-xl">
                                  <span className="text-[11px] font-bold text-red-700">
                                    {user.status === 'blocked' ? 'আনব্লক?' : 'ব্লক?'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleBlock(user.email, user.status)}
                                    disabled={isActionLoading}
                                    className="bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer"
                                  >
                                    হ্যাঁ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmBlockEmail(null)}
                                    className="bg-white border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-bold cursor-pointer"
                                  >
                                    না
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmBlockEmail(user.email)}
                                  disabled={isActionLoading}
                                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 border ${
                                    user.status === 'blocked'
                                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                      : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'
                                  }`}
                                >
                                  <span>{user.status === 'blocked' ? '✅' : '🚫'}</span>
                                  <span>{user.status === 'blocked' ? 'আনব্লক' : 'ব্লক'}</span>
                                </button>
                              ))}

                            {/* Delete User */}
                            {!isCurrentUser &&
                              !isPrimarySuperAdmin &&
                              (confirmDeleteEmail === user.email ? (
                                <div className="flex items-center gap-1 bg-red-100 border border-red-300 p-1 rounded-xl">
                                  <span className="text-[11px] font-bold text-red-900">মুছবেন?</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(user.email)}
                                    disabled={isActionLoading}
                                    className="bg-red-700 text-white px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer"
                                  >
                                    হ্যাঁ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteEmail(null)}
                                    className="bg-white text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-bold cursor-pointer"
                                  >
                                    না
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteEmail(user.email)}
                                  disabled={isActionLoading}
                                  aria-label={`${user.email} ব্যবহারকারী ডিলিট করুন`}
                                  title="তালিকা থেকে ব্যবহারকারী ডিলিট করুন"
                                  className="px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition cursor-pointer"
                                >
                                  🗑️
                                </button>
                              ))}
                          </div>
                        </div>

                        {/* Inline Edit User Drawer */}
                        {isEditing && (
                          <div className="mt-3 p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-2xl space-y-3">
                            <div className="text-xs font-black text-indigo-950 flex items-center justify-between">
                              <span>✏️ ব্যবহারকারীর তথ্য ও অনুমতি এডিট করুন ({user.email})</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                  নাম / পদবী
                                </label>
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  placeholder="নাম লিখুন"
                                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                  মোবাইল নম্বর
                                </label>
                                <input
                                  type="text"
                                  value={editPhone}
                                  onChange={(e) => setEditPhone(e.target.value)}
                                  placeholder="01XXXXXXXXX"
                                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                  ব্যবহারের ভূমিকা (Role)
                                </label>
                                <select
                                  value={editRole}
                                  disabled={isPrimarySuperAdmin}
                                  onChange={(e) => setEditRole(e.target.value as 'user' | 'admin')}
                                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                                >
                                  <option value="user">সাধারণ ব্যবহারকারী</option>
                                  <option value="admin">🛡️ অ্যাডমিন</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                  সর্বমোট ব্যবহৃত মিনিট (রিসেট/এডিট)
                                </label>
                                <div className="flex gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    value={editMinutes}
                                    onChange={(e) => setEditMinutes(e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setEditMinutes('0')}
                                    className="px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded-lg text-[10px] font-bold cursor-pointer shrink-0"
                                  >
                                    ০ করুন
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                অ্যাডমিন নোট (ওয়ার্ড / এলাকা / মন্তব্য)
                              </label>
                              <input
                                type="text"
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                placeholder="যেমন: ৩ নং ওয়ার্ড প্রতিনিধি..."
                                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs"
                              />
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingEmail(null)}
                                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                              >
                                বাতিল
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveUserEdit(user.email)}
                                disabled={isActionLoading}
                                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                              >
                                {isActionLoading ? 'সংরক্ষণ হচ্ছে...' : '💾 পরিবর্তন সংরক্ষণ করুন'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Timing Breakdown Strip */}
                        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
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

                          <div className="bg-slate-50 p-2.5 rounded-xl flex items-center gap-2">
                            <span className="text-lg">🕒</span>
                            <div>
                              <span className="text-[10px] text-slate-500 font-bold block">
                                {user.isOnline ? 'শেষ সক্রিয় রেসপন্স' : 'সর্বশেষ লগইন ছিল'}
                              </span>
                              <span className="font-bold text-slate-700 text-xs">
                                {user.lastActive
                                  ? formatTimeAgo(user.lastActive)
                                  : user.lastLoginAt
                                  ? formatBengaliDateTime(user.lastLoginAt)
                                  : 'নতুন অ্যাকাউন্ট'}
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

          {/* TAB 2: REAL-TIME LOGIN HISTORY */}
          {activeTab === 'history' && !error && (
            <AdminHistoryTab
              history={history}
              registeredEmails={users.map((u) => u.email)}
              dataSource={dataSource}
              cloudConnected={cloudConnected}
              initialEmailFilter={historyInitialEmail}
              onDeleteItems={handleDeleteHistoryItems}
              onClearAll={handleClearAllHistory}
            />
          )}

          {/* TAB 3: ADD NEW USER */}
          {activeTab === 'add_user' && !error && (
            <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <span>➕</span> নতুন জিমেইল অ্যাকাউন্ট তৈরি করুন
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  এখানে জিমেইল এবং পাসওয়ার্ড দিয়ে যুক্ত করলে অ্যাকাউন্টটি তাৎক্ষণিকভাবে ফায়ারবেসে তৈরি হবে এবং ব্যবহারকারী সরাসরি অ্যাপে লগইন করতে পারবেন।
                </p>
              </div>

              {addUserError && (
                <div className="p-3.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-semibold flex items-start gap-2">
                  <span className="text-base">⚠️</span>
                  <div className="flex-1">{addUserError}</div>
                </div>
              )}

              <form onSubmit={handleAddUser} className="space-y-4">
                <div>
                  <label htmlFor="add-user-email" className="block text-xs font-bold text-slate-700 mb-1">
                    ব্যবহারকারীর জিমেইল (Gmail / Email) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="add-user-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="যেমন: voter1@gmail.com"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="add-user-pass" className="text-xs font-bold text-slate-700">
                      লগইন পাসওয়ার্ড <span className="text-red-500">* (কমপক্ষে ৬ অক্ষর)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setNewPassword('123456')}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-lg cursor-pointer"
                    >
                      💡 ডিফল্ট পাসওয়ার্ড (123456) দিন
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="add-user-pass"
                      type={showAddUserPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="পাসওয়ার্ড লিখুন (যেমন: 123456)"
                      required
                      minLength={6}
                      className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                    />
                    <button
                      type="button"
                      aria-label="পাসওয়ার্ড দেখুন বা লুকান"
                      onClick={() => setShowAddUserPassword(!showAddUserPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
                    >
                      {showAddUserPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="add-user-name" className="block text-xs font-bold text-slate-700 mb-1">
                      নাম বা পদবী (ঐচ্ছিক)
                    </label>
                    <input
                      id="add-user-name"
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="যেমন: ওয়ার্ড কর্মী ১"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                    />
                  </div>
                  <div>
                    <label htmlFor="add-user-phone" className="block text-xs font-bold text-slate-700 mb-1">
                      মোবাইল নম্বর (ঐচ্ছিক)
                    </label>
                    <input
                      id="add-user-phone"
                      type="text"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-bold text-slate-700 mb-1">
                    অ্যাকাউন্ট রোল / অনুমতি
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                        newRole === 'user'
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 font-bold'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value="user"
                        checked={newRole === 'user'}
                        onChange={() => setNewRole('user')}
                      />
                      <span className="text-xs">সাধারণ ব্যবহারকারী</span>
                    </label>

                    <label
                      className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                        newRole === 'admin'
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 font-bold'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value="admin"
                        checked={newRole === 'admin'}
                        onChange={() => setNewRole('admin')}
                      />
                      <span className="text-xs">অ্যাডমিন (পূর্ণ কন্ট্রোল)</span>
                    </label>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 select-none">
                  <input
                    type="checkbox"
                    checked={sendActivationEmail}
                    onChange={(e) => setSendActivationEmail(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span>জিমেইলে পাসওয়ার্ড রিসেট বা অ্যাক্টিভেশন ইমেইল লিংকও পাঠান</span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmittingUser}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-bold cursor-pointer transition shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2"
                >
                  {isSubmittingUser ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>অ্যাকাউন্ট তৈরি হচ্ছে...</span>
                    </>
                  ) : (
                    <>
                      <span>➕</span>
                      <span>যুক্ত করুন ও তাৎক্ষণিক সক্রিয় করুন</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: ADMIN PERMISSION SETTINGS */}
          {activeTab === 'admins' && !error && (
            <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <span>🛡️</span> অ্যাডমিন পারমিশন ব্যবস্থাপনা
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  এখানে অনুমোদিত যেকোনো জিমেইল দিয়ে লগইন করলে এই অ্যাডমিন ড্যাশবোর্ড দেখা ও পরিচালনা করা যাবে।
                </p>
              </div>

              {newAdminError && (
                <div className="p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-semibold flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{newAdminError}</span>
                </div>
              )}

              <form onSubmit={handleAddAdminEmail} className="space-y-2">
                <label htmlFor="add-admin-email" className="block text-xs font-bold text-slate-700">
                  নতুন অ্যাডমিন জিমেইল যুক্ত করুন:
                </label>
                <div className="flex gap-2">
                  <input
                    id="add-admin-email"
                    type="email"
                    value={newAdminInput}
                    onChange={(e) => {
                      setNewAdminInput(e.target.value);
                      if (newAdminError) setNewAdminError(null);
                    }}
                    placeholder="যেমন: newadmin@gmail.com"
                    required
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                  />
                  <button
                    type="submit"
                    disabled={isSavingAdmins}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-bold cursor-pointer transition shadow-xs flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <span>🛡️</span>
                    <span>অ্যাডমিন যোগ করুন</span>
                  </button>
                </div>
              </form>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">বর্তমান অনুমোদিত অ্যাডমিন তালিকা:</span>
                  <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                    মোট: {convertToBengaliNumbers(adminEmailsList.length)} জন
                  </span>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {adminEmailsList.map((email, idx) => {
                    const isPrimary = email.toLowerCase() === 'rahatsharif10448@gmail.com' || idx === 0;
                    return (
                      <div
                        key={email}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 shrink-0 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold flex items-center justify-center">
                            {convertToBengaliNumbers(idx + 1)}
                          </span>
                          <span className="font-bold text-xs text-slate-800 truncate">{email}</span>
                          {isPrimary && (
                            <span className="shrink-0 text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
                              সুপার অ্যাডমিন
                            </span>
                          )}
                        </div>

                        {!isPrimary && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = adminEmailsList.filter((_, i) => i !== idx);
                              handleSaveAdmins(updated);
                            }}
                            disabled={isSavingAdmins}
                            className="text-xs text-red-600 hover:text-red-700 font-bold cursor-pointer px-2 py-1 rounded hover:bg-red-50"
                          >
                            বাদ দিন
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: GLOBAL APP CONTROLS & FIREBASE SYNC */}
          {activeTab === 'controls' && !error && (
            <AdminControlsTab
              appConfig={appConfig}
              onlineCount={summary.onlineCount}
              historyCount={history.length}
              dataSource={dataSource}
              cloudConnected={cloudConnected}
              cloudError={cloudError}
              onSaveConfig={handleSaveAppConfig}
              onKickAllSessions={handleKickAllSessions}
              onForceRefresh={() => fetchAdminData(false)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-slate-200 px-5 py-3 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                cloudConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span>
              {cloudConnected
                ? 'ফায়ারবেস ক্লাউড রিয়েল-টাইম লাইভ'
                : dataSource === 'server'
                ? 'সার্ভার মোড চালু'
                : 'লোকাল ক্যাশ মোড'}
            </span>
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
