import React, { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { recordSuccessfulLoginTimestamp } from '../lib/sessionExpiryUtils';

interface LoginScreenProps {
  onLoginSuccess: (email: string) => void;
  initialMessage?: { text: string; isError: boolean } | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  initialMessage,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(
    initialMessage || null
  );

  useEffect(() => {
    if (initialMessage) {
      setStatusMessage(initialMessage);
    }
  }, [initialMessage]);

  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setStatusMessage({ text: 'দয়া করে ইমেইল এবং পাসওয়ার্ড দিন!', isError: true });
      return;
    }

    setLoading(true);
    setStatusMessage({ text: 'লগইন করা হচ্ছে...', isError: false });
    setUnauthorizedDomain(null);

    try {
      try {
        const checkRes = await fetch(`/api/auth/check-status?email=${encodeURIComponent(cleanEmail)}`);
        const ct = checkRes.headers.get('content-type') || '';
        if (checkRes.ok && ct.includes('application/json')) {
          const checkJson = await checkRes.json();
          if (checkJson.isBlocked) {
            setLoading(false);
            setStatusMessage({
              text: 'আপনার অ্যাকাউন্টটি অ্যাডমিন কর্তৃক সাময়িকভাবে ব্লক করা হয়েছে। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।',
              isError: true,
            });
            return;
          }
        } else {
          const { loadStoredUsers } = await import('../lib/clientAdminStore');
          const clientUsers = loadStoredUsers();
          if (clientUsers[cleanEmail]?.status === 'blocked') {
            setLoading(false);
            setStatusMessage({
              text: 'আপনার অ্যাকাউন্টটি অ্যাডমিন কর্তৃক সাময়িকভাবে ব্লক করা হয়েছে। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।',
              isError: true,
            });
            return;
          }
        }
      } catch (checkErr) {
        console.warn('Block check bypassed due to network:', checkErr);
      }

      // Prepare session ID BEFORE signInWithEmailAndPassword so App.tsx onAuthStateChanged registers the exact same sessionId
      const preSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('voter_device_session_id', preSessionId);

      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
      const loggedEmail = userCredential.user.email || cleanEmail;

      try {
        const { checkCloudAccessForUser } = await import('../lib/cloudStore');
        const cloudCheck = await checkCloudAccessForUser(loggedEmail);
        if (cloudCheck.isBlocked) {
          localStorage.removeItem('voter_device_session_id');
          await signOut(auth);
          setLoading(false);
          setStatusMessage({
            text: 'আপনার অ্যাকাউন্টটি অ্যাডমিন কর্তৃক সাময়িকভাবে ব্লক করা হয়েছে। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।',
            isError: true,
          });
          return;
        }
        if (cloudCheck.maintenanceBlocked) {
          localStorage.removeItem('voter_device_session_id');
          await signOut(auth);
          setLoading(false);
          setStatusMessage({
            text: `${cloudCheck.maintenanceMessage || 'সিস্টেম রক্ষণাবেক্ষণের কাজ চলছে। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন।'}`,
            isError: true,
          });
          return;
        }
      } catch (cloudCheckErr) {
        console.warn('Cloud access check notice:', cloudCheckErr);
      }

      const activeSessionId = localStorage.getItem('voter_device_session_id') || preSessionId;

      const ua = navigator.userAgent;
      let detectedDevice = 'Mobile Web';
      if (/Android/i.test(ua)) detectedDevice = 'Android Mobile';
      else if (/iPhone|iPad|iPod/i.test(ua)) detectedDevice = 'iOS Device';
      else if (/Windows/i.test(ua)) detectedDevice = 'Windows PC';
      else if (/Macintosh/i.test(ua)) detectedDevice = 'Mac Computer';

      try {
        const regRes = await fetch('/api/session/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: loggedEmail,
            sessionId: activeSessionId,
            deviceName: detectedDevice,
          }),
        });

        if (regRes.status === 403) {
          localStorage.removeItem('voter_device_session_id');
          await signOut(auth);
          setLoading(false);
          setStatusMessage({
            text: 'আপনার অ্যাকাউন্টটি অ্যাডমিন কর্তৃক সাময়িকভাবে ব্লক করা হয়েছে। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।',
            isError: true,
          });
          return;
        }
      } catch (err) {
        console.warn('Session registration sync:', err);
      }

      recordSuccessfulLoginTimestamp(loggedEmail);
      onLoginSuccess(loggedEmail);
    } catch (error: any) {
      console.warn('Login error code:', error?.code);
      setLoading(false);

      let errMsg = 'লগইন ব্যর্থ হয়েছে। ইমেইল বা পাসওয়ার্ড সঠিক নয়।';
      const code = error?.code || '';

      if (code === 'auth/unauthorized-domain') {
        setUnauthorizedDomain(window.location.hostname);
        errMsg = `ফায়ারবেসে এই ডোমেনটি (${window.location.hostname}) অনুমোদন করা নেই। নিচের নির্দেশিকা অনুযায়ী ডোমেনটি যুক্ত করুন।`;
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password'
      ) {
        errMsg =
          'ইমেইল বা পাসওয়ার্ড সঠিক নয়। অনুগ্রহ করে পুনরায় সতর্কতার সাথে টাইপ করুন।';
      } else if (code === 'auth/invalid-email') {
        errMsg = 'ইমেইলের ফরম্যাট সঠিক নয়। যেমন: user@gmail.com';
      } else if (code === 'auth/too-many-requests') {
        errMsg =
          'বারবার ভুল পাসওয়ার্ড দেওয়ার কারণে অ্যাকাউন্টটি সাময়িকভাবে বন্ধ আছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
      } else if (code === 'auth/network-request-failed') {
        errMsg = 'ইন্টারনেট সংযোগে সমস্যা দেখা দিয়েছে। ইন্টারনেট চেক করে আবার চেষ্টা করুন।';
      } else if (error?.message) {
        errMsg = `ত্রুটি: ${error.message}`;
      }

      setStatusMessage({ text: errMsg, isError: true });
    }
  };

  const handleResetPassword = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setStatusMessage({ text: 'দয়া করে আপনার ইমেইলটি বক্সে লিখুন!', isError: true });
      return;
    }

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setStatusMessage({
        text: 'পাসওয়ার্ড রিসেট লিঙ্ক আপনার ইমেইলে পাঠানো হয়েছে! স্প্যাম ফোল্ডারও চেক করুন।',
        isError: false,
      });
    } catch (error: any) {
      let errMsg = 'পাসওয়ার্ড রিসেট লিঙ্ক পাঠানো ব্যর্থ হয়েছে।';
      if (error?.code === 'auth/user-not-found') {
        errMsg = 'এই ইমেইল দিয়ে কোনো অ্যাকাউন্ট পাওয়া যায়নি!';
      } else if (error?.code === 'auth/invalid-email') {
        errMsg = 'ইমেইলটি সঠিক নয়।';
      }
      setStatusMessage({ text: errMsg, isError: true });
    }
  };

  return (
    <div className="min-h-screen m3-surface flex items-center justify-center p-4">
      <div className="m3-card-elevated w-full max-w-sm p-7 sm:p-8 rounded-[28px] animate-m3-scale">
        <div className="text-center mb-6">
          <img
            src="./logo.png"
            alt="ইউনিয়ন ভোটার তালিকা লোগো"
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl mx-auto mb-4 object-contain shadow-md border-2 border-[var(--md-primary-container)] p-2 bg-white transition-transform duration-200 hover:scale-105"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <h1 className="text-2xl font-black tracking-tight">স্বাগতম</h1>
          <p className="text-[var(--md-on-surface-variant)] text-xs sm:text-sm mt-1">
            হোগলাবুনিয়া ভোটার তালিকায় নিরাপদে লগইন করুন
          </p>
        </div>

        {statusMessage && (
          <div
            className={`p-3.5 rounded-2xl text-xs mb-4 text-center leading-relaxed font-semibold ${
              statusMessage.isError
                ? 'bg-[var(--md-error-container)] text-[var(--md-on-error-container)]'
                : 'm3-tonal-container'
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {unauthorizedDomain && (
          <div className="mb-5 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-left text-xs text-amber-950 space-y-2.5">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>ফায়ারবেস অনুমোদিত ডোমেন পারমিশন দিন</span>
            </div>
            <div className="flex items-center justify-between bg-white border border-amber-300 rounded-xl p-2 font-mono text-[11px]">
              <span className="truncate select-all font-semibold text-slate-800">
                {unauthorizedDomain}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(unauthorizedDomain);
                  setCopiedDomain(true);
                  setTimeout(() => setCopiedDomain(false), 2500);
                }}
                className="ml-2 px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg font-sans text-[11px] font-bold cursor-pointer transition shrink-0"
              >
                {copiedDomain ? 'কপি হয়েছে' : 'কপি করুন'}
              </button>
            </div>
            <div className="pt-1 text-center">
              <a
                href="https://console.firebase.google.com/project/voter-ba30b/authentication/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-full font-bold text-xs transition"
              >
                <span>ফায়ারবেস কনসোলে যান ↗</span>
              </a>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-3.5">
          <div className="relative">
            <Mail className="w-4 h-4 text-[var(--md-on-surface-variant)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="আপনার ইমেইল অ্যাড্রেস"
              required
              autoComplete="email"
              autoCapitalize="none"
              spellCheck="false"
              className="m3-input w-full !pl-10 !py-3 !rounded-2xl !text-sm"
            />
          </div>

          <div className="relative">
            <Lock className="w-4 h-4 text-[var(--md-on-surface-variant)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="আপনার পাসওয়ার্ড"
              required
              autoComplete="current-password"
              autoCapitalize="none"
              className="m3-input w-full !pl-10 !pr-11 !py-3 !rounded-2xl !text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 m3-icon-btn !w-8 !h-8"
              title="পাসওয়ার্ড দেখুন/লুকান"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="text-right">
            <button
              type="button"
              onClick={handleResetPassword}
              className="text-xs text-[var(--md-primary)] hover:underline font-bold cursor-pointer"
            >
              পাসওয়ার্ড ভুলে গেছেন?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full m3-btn-filled py-3.5 text-sm inline-flex items-center justify-center gap-2 shadow-sm"
          >
            <LogIn className="w-4 h-4" />
            <span>{loading ? 'লগইন করা হচ্ছে...' : 'লগইন করুন'}</span>
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-[var(--md-outline-variant)]/50 flex items-center justify-center">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('voter_open_update_modal'))}
            className="text-xs text-[var(--md-on-surface-variant)] hover:text-[var(--md-primary)] font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>অ্যাপ আপডেট ও সেটিংস</span>
          </button>
        </div>
      </div>
    </div>
  );
};
