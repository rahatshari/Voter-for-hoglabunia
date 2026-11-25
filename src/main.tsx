import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// Register Service Worker ONLY on Web/PWA (never on Android APK WebViewAssetLoader where assets are already local)
if ('serviceWorker' in navigator) {
  const isAndroidAssetLoader = window.location.hostname === 'appassets.androidplatform.net';
  if (isAndroidAssetLoader) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
  } else if (window.location.protocol === 'https:' || window.location.hostname === 'localhost') {
    window.addEventListener('load', () => {
      const swUrl = new URL('sw.js', window.location.href).href;
      navigator.serviceWorker.register(swUrl).catch((err) => {
        console.warn('Service Worker registration skipped:', err);
      });
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
