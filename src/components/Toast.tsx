import React from 'react';

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-22 sm:bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] sm:max-w-md px-5 py-3 rounded-2xl bg-[var(--md-inverse-surface)] text-[var(--md-inverse-on-surface)] text-xs sm:text-sm font-bold shadow-xl animate-m3-scale"
    >
      {message}
    </div>
  );
};
