import React from 'react';
import { LogOut } from 'lucide-react';
import { useLockBodyScroll } from '../lib/useLockBodyScroll';

interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export const LogoutModal: React.FC<LogoutModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}) => {
  useLockBodyScroll(isOpen);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 m3-sheet-backdrop z-50 flex items-center justify-center p-4 overscroll-contain"
      onClick={onClose}
    >
      <div
        className="m3-card-elevated w-full max-w-xs rounded-[28px] p-6 text-center shadow-2xl animate-m3-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-2xl bg-[var(--md-error-container)] text-[var(--md-on-error-container)] flex items-center justify-center mx-auto mb-3.5">
          <LogOut className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-extrabold mb-2">লগআউট নিশ্চিতকরণ</h3>
        <p className="text-xs text-[var(--md-on-surface-variant)] mb-6 leading-relaxed">
          আপনি কি নিশ্চিতভাবে ইউনিয়ন ভোটার অ্যাপ থেকে লগআউট করতে চান?
        </p>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 m3-btn-outlined py-2.5 px-3 text-xs font-bold"
          >
            বাতিল
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-2.5 px-3 rounded-full bg-[var(--md-error)] text-[var(--md-on-error)] disabled:opacity-50 text-xs font-bold cursor-pointer transition active:scale-95"
          >
            {isLoading ? 'লগআউট হচ্ছে...' : 'লগআউট করুন'}
          </button>
        </div>
      </div>
    </div>
  );
};
