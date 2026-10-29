import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';

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

    try {
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
      const newSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('voter_device_session_id', newSessionId);

      try {
        await fetch('/api/session/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userCredential.user.email,
            sessionId: newSessionId,
            deviceName: 'Mobile Web',
          }),
        });
      } catch (err) {
        console.warn('Session registration sync:', err);
      }

      onLoginSuccess(userCredential.user.email || cleanEmail);
    } catch (error: any) {
      console.warn('Login error code:', error?.code);
      setLoading(false);

      let errMsg = 'লগইন ব্যর্থ হয়েছে। ইমেইল বা পাসওয়ার্ড সঠিক নয়।';
      const code = error?.code || '';

      if (code === 'auth/unauthorized-domain') {
        errMsg = `ফায়ারবেসে এই ডোমেনটি অনুমোদন দেওয়া নেই (${window.location.hostname})। ফায়ারবেস কনসোলে ডোমেন যুক্ত করুন।`;
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password'
      ) {
        errMsg =
          'ইমেইল বা পাসওয়ার্ড সঠিক নয়। অনুগ্রহ করে পুনরায় সতর্কতার সাথে টাইপ করুন (বড়/ছোট হাতের অক্ষর ও বাড়তি স্পেস খেয়াল করুন)।';
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
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm p-8 rounded-2xl shadow-xl border border-slate-100">
        <div className="text-center mb-6">
          <img
            src="./logo.png"
            alt="Logo"
            className="w-16 h-16 rounded-full mx-auto mb-3 object-cover shadow-sm border border-slate-200"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <h2 className="text-2xl font-bold text-slate-800">স্বাগতম</h2>
          <p className="text-slate-500 text-sm mt-1">ইউনিয়ন ভোটার তালিকায় প্রবেশ করুন</p>
        </div>

        {statusMessage && (
          <div
            className={`p-3 rounded-xl text-xs mb-5 text-center leading-relaxed font-medium ${
              statusMessage.isError
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="আপনার ইমেইল"
              required
              autoComplete="email"
              autoCapitalize="none"
              spellCheck="false"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition"
            />
          </div>

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="আপনার পাসওয়ার্ড"
              required
              autoComplete="current-password"
              autoCapitalize="none"
              className="w-full px-4 py-3 pr-12 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 text-base cursor-pointer"
              title="পাসওয়ার্ড দেখুন/লুকান"
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>

          <div className="text-right">
            <button
              type="button"
              onClick={handleResetPassword}
              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-medium cursor-pointer"
            >
              পাসওয়ার্ড ভুলে গেছেন?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl text-sm font-bold cursor-pointer transition shadow-md hover:shadow-lg shadow-indigo-500/20"
          >
            {loading ? 'লগইন করা হচ্ছে...' : 'লগইন করুন'}
          </button>
        </form>
      </div>
    </div>
  );
};
