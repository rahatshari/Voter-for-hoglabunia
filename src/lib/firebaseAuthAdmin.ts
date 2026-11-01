/**
 * Direct Client-Side & Server-Compatible Firebase Auth User Creation
 * Uses Google Identity Toolkit REST API with the project Web API Key.
 *
 * This works seamlessly on:
 * 1. GitHub Pages (Static hosting without backend)
 * 2. Node.js backend / Express server
 * 3. Localhost & AI Studio environment
 *
 * It does NOT log out the currently logged-in Admin session!
 */

import { auth } from './firebase';
import { sendPasswordResetEmail } from 'firebase/auth';

const FIREBASE_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_API_KEY) ||
  'AIzaSyDSE5kxWXULnlTB2sOY7AE6MLFLmHuguWg';

export interface CreateUserResult {
  success: boolean;
  message: string;
  uid?: string;
  alreadyExists?: boolean;
}

export async function createFirebaseUserDirect(
  email: string,
  password: string,
  displayName?: string
): Promise<CreateUserResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();

  if (!cleanEmail) {
    return { success: false, message: 'দয়া করে জিমেইল আইডি লিখুন।' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return {
      success: false,
      message: 'সঠিক ইমেইল ফরম্যাট দিন (যেমন: voter1@gmail.com)।',
    };
  }

  if (cleanPassword.length < 6) {
    return {
      success: false,
      message: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।',
    };
  }

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPassword,
          returnSecureToken: true,
        }),
      }
    );

    const data = await res.json();

    if (data.error) {
      const errMsg = data.error.message || '';

      if (errMsg.includes('EMAIL_EXISTS')) {
        return {
          success: true,
          alreadyExists: true,
          message: `"${cleanEmail}" জিমেইলটি ফায়ারবেসে আগে থেকেই বিদ্যমান। এটি ব্যবহারকারী তালিকায় হালনাগাদ করা হয়েছে।`,
        };
      }

      if (errMsg.includes('WEAK_PASSWORD')) {
        return {
          success: false,
          message: 'পাসওয়ার্ডটি দুর্বল। কমপক্ষে ৬ বা তার বেশি অক্ষরের পাসওয়ার্ড দিন।',
        };
      }

      if (errMsg.includes('INVALID_EMAIL')) {
        return {
          success: false,
          message: 'জিমেইল আইডিটি সঠিক নয়। অনুগ্রহ করে সঠিক বানান যাচাই করুন।',
        };
      }

      if (errMsg.includes('OPERATION_NOT_ALLOWED')) {
        return {
          success: false,
          message: 'ফায়ারবেস কনসোলে Email/Password সাইন-ইন সক্রিয় করা নেই।',
        };
      }

      return {
        success: false,
        message: `ফায়ারবেস ত্রুটি: ${errMsg}`,
      };
    }

    // Optionally set display name if returned token is present
    if (data.idToken && displayName?.trim()) {
      try {
        await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken: data.idToken,
              displayName: displayName.trim(),
              returnSecureToken: false,
            }),
          }
        );
      } catch (upErr) {
        console.warn('Update user display name notice:', upErr);
      }
    }

    return {
      success: true,
      uid: data.localId,
      message: `✅ "${cleanEmail}" অ্যাকাউন্টটি সফলভাবে ফায়ারবেসে তৈরি ও সক্রিয় করা হয়েছে!`,
    };
  } catch (netErr: any) {
    return {
      success: false,
      message: `ইন্টারনেট সংযোগ সমস্যা: ${netErr?.message || 'পুনরায় চেষ্টা করুন'}`,
    };
  }
}

export async function sendPasswordResetSafe(email: string): Promise<{ success: boolean; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    await sendPasswordResetEmail(auth, cleanEmail);
    return {
      success: true,
      message: `🔑 "${cleanEmail}" ঠিকানায় পাসওয়ার্ড রিসেট লিংক সফলভাবে পাঠানো হয়েছে!`,
    };
  } catch (err: any) {
    let msg = 'পাসওয়ার্ড রিসেট লিংক পাঠানো যায়নি।';
    if (err?.code === 'auth/user-not-found') {
      msg = 'এই জিমেইলে কোনো ফায়ারবেস অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।';
    } else if (err?.code === 'auth/invalid-email') {
      msg = 'ইমেইল ফরম্যাট সঠিক নয়।';
    } else if (err?.message) {
      msg = `ত্রুটি: ${err.message}`;
    }
    return { success: false, message: msg };
  }
}
