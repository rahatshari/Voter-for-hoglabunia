import React, { useEffect, useState } from 'react';

interface AnotherDeviceModalProps {
  isOpen: boolean;
  onRedirect: () => void;
}

export const AnotherDeviceModal: React.FC<AnotherDeviceModalProps> = ({
  isOpen,
  onRedirect,
}) => {
  const [countdown, setCountdown] = useState(4);

  useEffect(() => {
    if (!isOpen) return;

    setCountdown(4);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onRedirect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, onRedirect]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl border border-slate-200 animate-slide-down">
        <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
          ⚠️
        </div>
        <h3 className="text-lg font-bold text-red-800 mb-2.5">
          অন্য ডিভাইসে লগইন হয়েছে!
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed mb-4">
          আপনার এই জিমেইল অ্যাকাউন্টটি এইমাত্র অন্য একটি মোবাইলে লগইন করা হয়েছে।
          <br /><br />
          নিরাপত্তার কারণে <b className="text-slate-800">একটি জিমেইল দিয়ে একই সাথে একটিমাত্র মোবাইলেই</b> ব্যবহার করা যাবে।
        </p>
        <div className="text-xs font-semibold text-slate-500 mb-3.5">
          {countdown} সেকেন্ডের মধ্যে লগইন পেজে নেওয়া হবে...
        </div>
        <button
          type="button"
          onClick={onRedirect}
          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold cursor-pointer transition shadow-md hover:shadow-lg shadow-red-500/25"
        >
          লগইন পেজে যান
        </button>
      </div>
    </div>
  );
};
