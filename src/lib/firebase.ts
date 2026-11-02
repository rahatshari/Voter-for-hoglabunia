import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env as any)
    : typeof process !== 'undefined'
    ? (process.env as any)
    : {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyDSE5kxWXULnlTB2sOY7AE6MLFLmHuguWg",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "voter-apps-14962.firebaseapp.com",
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || "https://voter-apps-14962-default-rtdb.firebaseio.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "voter-apps-14962",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "voter-apps-14962.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "957567395353",
  appId: env.VITE_FIREBASE_APP_ID || "1:957567395353:android:84aad0acdb14a8a343ec88"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const database = getDatabase(app);
export default app;
