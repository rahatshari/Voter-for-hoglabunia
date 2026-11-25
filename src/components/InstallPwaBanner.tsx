import React, { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPwaBanner: React.FC = () => {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showManualGuide, setShowManualGuide] = useState(false);

  useEffect(() => {
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsVisible(false);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      if (!sessionStorage.getItem('pwa_install_dismissed')) {
        setIsVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsVisible(false);
        }
      } catch {
        setShowManualGuide(true);
      }
    } else {
      setShowManualGuide(true);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    sessionStorage.setItem('pwa_install_dismissed', '1');
  };

  if (!isVisible || isDismissed) return null;

  return (
    <>
      <div className="fixed bottom-22 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 z-40 w-[94%] sm:w-auto sm:max-w-md animate-slide-down">
        <div className="m3-card-elevated p-3.5 rounded-3xl shadow-2xl flex items-center justify-between gap-3 border border-[var(--md-primary)]/30">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="./icon-192.png"
              alt="App Icon"
              className="w-10 h-10 rounded-2xl border border-[var(--md-outline-variant)] object-cover shrink-0 bg-white"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-extrabold leading-tight truncate">
                ইউনিয়ন ভোটার অ্যাপ ইনস্টল করুন
              </h4>
              <p className="text-[11px] text-[var(--md-on-surface-variant)] mt-0.5 truncate">
                অফলাইনে দ্রুত ব্যবহারের জন্য হোমস্ক্রিনে রাখুন
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="m3-btn-filled h-8 px-3.5 text-xs inline-flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ইনস্টল</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="m3-icon-btn !w-8 !h-8"
              title="বন্ধ করুন"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {showManualGuide && (
        <div
          className="fixed inset-0 z-50 m3-sheet-backdrop flex items-center justify-center p-4"
          onClick={() => setShowManualGuide(false)}
        >
          <div
            className="m3-card-elevated w-full max-w-sm rounded-[28px] p-6 shadow-2xl text-center animate-m3-scale"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 m3-tonal-container rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Smartphone className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-base mb-2">
              গুগল ক্রোমে ইনস্টল করার নিয়ম
            </h3>
            <div className="text-left m3-card-filled p-3.5 rounded-2xl text-xs space-y-2 mb-4 leading-relaxed">
              <p>১. ব্রাউজারের উপরে ডানদিকের <b>তিনটি ডট (⋮)</b> মেনুতে ট্যাপ করুন।</p>
              <p>২. <b>"Install app"</b> অথবা <b>"Add to Home screen"</b> অপশনে চাপুন।</p>
              <p>৩. <b>"Install"</b> কনফার্ম করলেই হোমস্ক্রিনে অ্যাপ তৈরি হয়ে যাবে!</p>
            </div>
            <button
              type="button"
              onClick={() => setShowManualGuide(false)}
              className="w-full m3-btn-filled py-2.5 text-xs"
            >
              বুঝেছি, বন্ধ করুন
            </button>
          </div>
        </div>
      )}
    </>
  );
};
