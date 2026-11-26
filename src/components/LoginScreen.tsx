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
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { FIREBASE_WEB_API_KEY, auth } from '../lib/firebase';
import { safeLocalRemove, safeLocalSet } from '../lib/safeStorage';

interface LoginScreenProps {
  onLoginSuccess: (email: string) => void;
  initialMessage?: { text: string; isError: boolean } | null;
}

function isCredentialFailureCode(code: string): boolean {
  const c = code.toLowerCase();
  return (
    c.includes('invalid-credential') ||
    c.includes('invalid-login-credentials') ||
    c.includes('invalid_login_credentials') ||
    c.includes('user-not-found') ||
    c.includes('email_not_found') ||
    c.includes('wrong-password') ||
    c.includes('invalid_password') ||
    c.includes('invalid-email') ||
    c.includes('invalid_email') ||
    c.includes('too-many-requests') ||
    c.includes('too_many_attempts') ||
    c.includes('user-disabled') ||
    c.includes('user_disabled')
  );
}

function mapFirebaseErrorMessage(codeOrMsg: string): string {
  const c = codeOrMsg.toLowerCase();
  if (
    c.includes('invalid-credential') ||
    c.includes('invalid-login-credentials') ||
    c.includes('invalid_login_credentials') ||
    c.includes('user-not-found') ||
    c.includes('email_not_found') ||
    c.includes('wrong-password') ||
    c.includes('invalid_password')
  ) {
    return 'ইমেইল বা পাসওয়ার্ড সঠিক নয়। পাসওয়ার্ড মনে না থাকলে নিচে "পাসওয়ার্ড ভুলে গেছেন?" বাটনে চাপুন।';
  }
  if (c.includes('invalid-email') || c.includes('invalid_email')) {
    return 'ইমেইলের ফরম্যাট সঠিক নয়। যেমন: user@gmail.com';
  }
  if (c.includes('too-many-requests') || c.includes('too_many_attempts')) {
    return 'বারবার ভুল পাসওয়ার্ড দেওয়ার কারণে সাময়িকভাবে বন্ধ আছে। কিছুক্ষণ পর আবার চেষ্টা করুন অথবা পাসওয়ার্ড রিসেট করুন।';
  }
  if (c.includes('user-disabled') || c.includes('user_disabled')) {
    return 'এই অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।';
  }
  if (c.includes('network')) {
    return 'ইন্টারনেট সংযোগে সমস্যা দেখা দিয়েছে। সংযোগ চেক করে আবার চেষ্টা করুন।';
  }
  return `লগইন ব্যর্থ হয়েছে (${codeOrMsg})। অনুগ্রহ করে পুনরায় চেষ্টা করুন।`;
}

async function verifyPasswordViaFirebaseRest(
  email: string,
  password: string
): Promise<{ email: string }> {
  // 1. Try local/backend proxy first (works even if browser iframe blocks cross-origin googleapis)
  try {
    const srvRes = await fetch('/api/auth/firebase-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const ct = srvRes.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const srvJson = await srvRes.json();
      if (srvRes.ok && srvJson.success) {
        return { email: srvJson.email || email };
      }
      if (srvJson?.errorCode && srvJson.errorCode !== 'NETWORK_ERROR') {
        const err: any = new Error(srvJson.errorCode);
        err.code = srvJson.errorCode;
        throw err;
      }
    }
  } catch (e: any) {
    if (e?.code && isCredentialFailureCode(e.code)) {
      throw e;
    }
  }

  // 2. Direct Google Identity Toolkit REST call (works in Android APK & static hosting)
  const directRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const directJson = await directRes.json();
  if (!directRes.ok || directJson?.error) {
    const code = directJson?.error?.message || 'INVALID_LOGIN_CREDENTIALS';
    const err: any = new Error(code);
    err.code = code;
    throw err;
  }
  return { email: directJson.email || email };
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
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatusMessage({
        text: 'লগইন করার জন্য সক্রিয় ইন্টারনেট সংযোগ প্রয়োজন। অনুগ্রহ করে মোবাইল ডাটা বা ওয়াইফাই চালু করুন।',
        isError: true,
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setStatusMessage({ text: 'দয়া করে ইমেইল এবং পাসওয়ার্ড দিন!', isError: true });
      return;
    }

    setLoading(true);
    setStatusMessage({ text: 'ইন্টারনেট ও অ্যাকাউন্ট যাচাই করা হচ্ছে...', isError: false });
    setUnauthorizedDomain(null);

    try {
      // Pre-check server/local block status if reachable
      try {
        const checkRes = await fetch(
          `/api/auth/check-status?email=${encodeURIComponent(cleanEmail)}`
        );
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
      } catch {
        // Network pre-check optional
      }

      // Prepare single session ID safely BEFORE sign-in
      const preSessionId =
        'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
      safeLocalSet('voter_device_session_id', preSessionId);

      let sdkSucceeded = false;
      let loggedEmail = cleanEmail;

      try {
        const SDK_TIMEOUT = Symbol('sdk_timeout');
        const sdkResult = await Promise.race([
          signInWithEmailAndPassword(auth, cleanEmail, cleanPassword),
          new Promise<typeof SDK_TIMEOUT>((resolve) =>
            setTimeout(() => resolve(SDK_TIMEOUT), 7000)
          ),
        ]);

        if (sdkResult !== SDK_TIMEOUT) {
          sdkSucceeded = true;
          loggedEmail = sdkResult.user.email || cleanEmail;
        }
      } catch (sdkErr: any) {
        const sdkCode = String(sdkErr?.code || sdkErr?.message || '');
        // If password/email is genuinely wrong, fail immediately with clear Bangla message
        if (isCredentialFailureCode(sdkCode)) {
          safeLocalRemove('voter_device_session_id');
          setLoading(false);
          setStatusMessage({ text: mapFirebaseErrorMessage(sdkCode), isError: true });
          return;
        }
        // Otherwise (e.g. preview iframe storage/CORS/unauthorized-domain), fall through to official Firebase REST verification!
        console.warn('Firebase SDK signIn fallback to REST:', sdkCode);
      }

      if (!sdkSucceeded) {
        const restVerified = await verifyPasswordViaFirebaseRest(cleanEmail, cleanPassword);
        loggedEmail = restVerified.email;

        // Check cloud/server block status and register session when using REST fallback
        try {
          const { checkCloudAccessForUser } = await import('../lib/cloudStore');
          const cloudCheck = await checkCloudAccessForUser(loggedEmail);
          if (cloudCheck.isBlocked) {
            safeLocalRemove('voter_device_session_id');
            setLoading(false);
            setStatusMessage({
              text: 'আপনার অ্যাকাউন্টটি অ্যাডমিন কর্তৃক সাময়িকভাবে ব্লক করা হয়েছে।',
              isError: true,
            });
            return;
          }
          if (cloudCheck.maintenanceBlocked) {
            safeLocalRemove('voter_device_session_id');
            setLoading(false);
            setStatusMessage({
              text:
                cloudCheck.maintenanceMessage ||
                'সিস্টেম রক্ষণাবেক্ষণের কাজ চলছে। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন।',
              isError: true,
            });
            return;
          }
        } catch {}

        safeLocalSet('voter_verified_auth_email', loggedEmail);
        onLoginSuccess(loggedEmail);
        return;
      }

      // SDK succeeded! Verify cloud access (App.tsx onAuthStateChanged will handle full session registration)
      try {
        const { checkCloudAccessForUser } = await import('../lib/cloudStore');
        const cloudCheck = await checkCloudAccessForUser(loggedEmail);
        if (cloudCheck.isBlocked) {
          safeLocalRemove('voter_device_session_id');
          safeLocalRemove('voter_verified_auth_email');
          await signOut(auth).catch(() => {});
          setLoading(false);
          setStatusMessage({
            text: 'আপনার অ্যাকাউন্টটি অ্যাডমিন কর্তৃক সাময়িকভাবে ব্লক করা হয়েছে।',
            isError: true,
          });
          return;
        }
        if (cloudCheck.maintenanceBlocked) {
          safeLocalRemove('voter_device_session_id');
          safeLocalRemove('voter_verified_auth_email');
          await signOut(auth).catch(() => {});
          setLoading(false);
          setStatusMessage({
            text:
              cloudCheck.maintenanceMessage ||
              'সিস্টেম রক্ষণাবেক্ষণের কাজ চলছে। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন।',
            isError: true,
          });
          return;
        }
      } catch {}

      safeLocalSet('voter_verified_auth_email', loggedEmail);
      onLoginSuccess(loggedEmail);
    } catch (error: any) {
      safeLocalRemove('voter_device_session_id');
      setLoading(false);
      const code = String(error?.code || error?.message || '');
      if (code === 'auth/unauthorized-domain') {
        setUnauthorizedDomain(window.location.hostname);
        setStatusMessage({
          text: `ফায়ারবেসে এই ডোমেনটি (${window.location.hostname}) অনুমোদন করা নেই।`,
          isError: true,
        });
        return;
      }
      setStatusMessage({ text: mapFirebaseErrorMessage(code), isError: true });
    }
  };

  const handleResetPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setStatusMessage({ text: 'দয়া করে আপনার ইমেইলটি আগে বক্সে লিখুন!', isError: true });
      return;
    }

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setStatusMessage({
        text: 'পাসওয়ার্ড রিসেট লিঙ্ক আপনার ইমেইলে পাঠানো হয়েছে! ইনবক্স ও স্প্যাম ফোল্ডার চেক করুন।',
        isError: false,
      });
    } catch {
      try {
        const res = await fetch('/api/auth/firebase-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail }),
        });
        if (res.ok) {
          setStatusMessage({
            text: 'পাসওয়ার্ড রিসেট লিঙ্ক আপনার ইমেইলে পাঠানো হয়েছে! ইনবক্স ও স্প্যাম ফোল্ডার চেক করুন।',
            isError: false,
          });
          return;
        }
      } catch {}
      setStatusMessage({
        text: 'পাসওয়ার্ড রিসেট লিঙ্ক পাঠানো ব্যর্থ হয়েছে। সঠিক ইমেইল দিয়ে আবার চেষ্টা করুন।',
        isError: true,
      });
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
