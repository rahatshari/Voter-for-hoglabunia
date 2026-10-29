import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDSE5kxWXULnlTB2sOY7AE6MLFLmHuguWg",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "voter-apps-14962.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "voter-apps-14962",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "voter-apps-14962.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "957567395353",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:957567395353:android:84aad0acdb14a8a343ec88"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export default app;
