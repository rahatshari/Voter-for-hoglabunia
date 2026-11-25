import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';
import { useLockBodyScroll } from '../lib/useLockBodyScroll';

interface AnotherDeviceModalProps {
  isOpen: boolean;
  onRedirect: () => void;
}

export const AnotherDeviceModal: React.FC<AnotherDeviceModalProps> = ({
  isOpen,
  onRedirect,
}) => {
  const [countdown, setCountdown] = useState(4);
  useLockBodyScroll(isOpen);

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
    <div className="fixed inset-0 m3-sheet-backdrop z-50 flex items-center justify-center p-4 overscroll-contain">
      <div className="m3-card-elevated w-full max-w-sm rounded-[28px] p-6 text-center shadow-2xl animate-m3-scale">
        <div className="w-14 h-14 bg-[var(--md-error-container)] text-[var(--md-on-error-container)] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-extrabold text-[var(--md-error)] mb-2.5">
          অন্য ডিভাইসে লগইন হয়েছে!
        </h3>
        <p className="text-xs text-[var(--md-on-surface-variant)] leading-relaxed mb-4">
          আপনার এই অ্যাকাউন্টটি এইমাত্র অন্য একটি মোবাইলে লগইন করা হয়েছে।
          <br />
          <br />
          নিরাপত্তার কারণে <b>একটি অ্যাকাউন্ট দিয়ে একই সাথে একটিমাত্র ডিভাইসেই</b> ব্যবহার করা যাবে।
        </p>
        <div className="text-xs font-bold text-[var(--md-on-surface-variant)] mb-4">
          {convertToBengaliNumbers(countdown)} সেকেন্ডের মধ্যে লগইন পেজে নেওয়া হবে...
        </div>
        <button
          type="button"
          onClick={onRedirect}
          className="w-full py-3 rounded-full bg-[var(--md-error)] text-[var(--md-on-error)] text-sm font-bold cursor-pointer transition active:scale-95"
        >
          লগইন পেজে যান
        </button>
      </div>
    </div>
  );
};
