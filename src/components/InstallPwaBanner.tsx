import React, { useState, useEffect } from 'react';

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
    // If running in standalone mode (already installed), hide completely
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
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Show banner after 2 seconds if not installed
    const timer = setTimeout(() => {
      if (!sessionStorage.getItem('pwa_install_dismissed')) {
        setIsVisible(true);
      }
    }, 2000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(timer);
    };
  }, []);

  const handleInstallClick = async () => {
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsVisible(false);
        }
      } catch (e) {
        console.warn('Install prompt error:', e);
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
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-lg animate-slide-down">
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-600 text-white p-3 sm:p-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 border border-indigo-400/40">
          <div className="flex items-center gap-2.5">
            <img
              src="./icon-192.png"
              alt="App Icon"
              className="w-10 h-10 rounded-xl shadow-md border-2 border-white/80 object-cover shrink-0 bg-white"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div>
              <h4 className="text-xs sm:text-sm font-bold leading-tight">
                ইউনিয়ন ভোটার তালিকা অ্যাপ
              </h4>
              <p className="text-[11px] text-indigo-100 mt-0.5 leading-snug">
                হোমস্ক্রিনে ইনস্টল করে সরাসরি অ্যাপ হিসেবে ব্যবহার করুন
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="bg-white text-indigo-700 hover:bg-indigo-50 font-bold px-3 py-1.5 rounded-xl text-xs shadow-md transition cursor-pointer flex items-center gap-1"
            >
              <span>📲</span> ইনস্টল
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

      {/* Manual Install Instruction Modal for Chrome */}
      {showManualGuide && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl border border-slate-200 text-center animate-slide-down">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
              📲
            </div>
            <h3 className="font-extrabold text-base text-slate-800 mb-2">
              গুগল ক্রোমে ইনস্টল করার নিয়ম
            </h3>
            <div className="text-left bg-slate-50 p-3.5 rounded-xl text-xs text-slate-700 space-y-2 border border-slate-200 mb-4 leading-relaxed">
              <p className="flex items-start gap-2">
                <span className="font-bold text-indigo-600 shrink-0">১.</span>
                <span>ক্রোম ব্রাউজারের উপরে ডানদিকের <b>তিনটি ডট (⋮)</b> মেনুতে ট্যাপ করুন।</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="font-bold text-indigo-600 shrink-0">২.</span>
                <span>তালিকায় <b>"Install app"</b> (অ্যাপ ইনস্টল করুন) অথবা <b>"Add to Home screen"</b> (হোম স্ক্রিনে যোগ করুন) অপশনে চাপুন।</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="font-bold text-indigo-600 shrink-0">৩.</span>
                <span>এরপর <b>"Install"</b> বাটন কনফার্ম করলেই আপনার মোবাইলের হোম স্ক্রিনে অ্যাপ আইকন তৈরি হয়ে যাবে!</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowManualGuide(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs cursor-pointer transition"
            >
              বুঝেছি, বন্ধ করুন
            </button>
          </div>
        </div>
      )}
    </>
  );
};
