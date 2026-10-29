import React from 'react';

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white px-5 py-3 rounded-full text-sm font-semibold shadow-xl border border-slate-700 animate-bounce transition-all duration-300">
      {message}
    </div>
  );
};
