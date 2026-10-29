import React, { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPwaBanner: React.FC = () => {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if dismissed in this session
    if (sessionStorage.getItem('pwa_install_dismissed')) {
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Also check if already installed in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsVisible(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsVisible(false);
      }
    } catch (e) {
      console.warn('Install error:', e);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    sessionStorage.setItem('pwa_install_dismissed', '1');
  };

  if (!isVisible || isDismissed) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-lg animate-slide-down">
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-600 text-white p-3.5 sm:p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-3 border border-indigo-400/40">
        <div className="flex items-center gap-3">
          <img
            src="./icon-192.png"
            alt="App Icon"
            className="w-11 h-11 rounded-xl shadow-md border-2 border-white/80 object-cover shrink-0"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div>
            <h4 className="text-xs sm:text-sm font-bold leading-tight">
              ইউনিয়ন ভোটার তালিকা অ্যাপ
            </h4>
            <p className="text-[11px] text-indigo-100 mt-0.5 leading-snug">
              মোবাইল বা পিসিতে ইনস্টল করে সরাসরি অ্যাপ হিসেবে ব্যবহার করুন
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleInstallClick}
            className="bg-white text-indigo-700 hover:bg-indigo-50 font-bold px-3.5 py-1.5 rounded-xl text-xs shadow-md transition cursor-pointer"
          >
            📲 ইনস্টল
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-indigo-200 hover:text-white p-1 text-base leading-none cursor-pointer"
            title="বন্ধ করুন"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};
