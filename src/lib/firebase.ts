import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env as any)
    : typeof process !== 'undefined'
    ? (process.env as any)
    : {};

export const FIREBASE_PROJECT_ID = env.VITE_FIREBASE_PROJECT_ID || 'voter-ba30b';

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyAbOIhoArZU275DtYKxo11UyizhGR1GP8A',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'voter-ba30b.firebaseapp.com',
  databaseURL:
    env.VITE_FIREBASE_DATABASE_URL || 'https://voter-ba30b-default-rtdb.firebaseio.com',
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'voter-ba30b.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '886401397261',
  appId: env.VITE_FIREBASE_APP_ID || '1:886401397261:web:12f87c8a5cae31ac005b44',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const database = getDatabase(app);
export default app;
