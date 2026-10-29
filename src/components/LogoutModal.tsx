import React from 'react';

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white w-full max-w-xs rounded-2xl p-6 text-center shadow-2xl border border-slate-100 animate-slide-down">
        <div className="text-4xl mb-2">🚪</div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">লগআউট নিশ্চিতকরণ</h3>
        <p className="text-xs text-slate-500 mb-5 leading-relaxed">
          আপনি কি নিশ্চিতভাবে ভোটার অ্যাপ থেকে লগআউট করতে চান?
        </p>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2.5 px-3 border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          >
            না, বাতিল
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-2.5 px-3 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
          >
            {isLoading ? 'লগআউট হচ্ছে...' : 'হ্যাঁ, লগআউট'}
          </button>
        </div>
      </div>
    </div>
  );
};
