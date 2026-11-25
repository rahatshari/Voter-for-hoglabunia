import React from 'react';
import {
  BarChart3,
  Bookmark,
  Home,
  Printer,
  Search,
  Shield,
} from 'lucide-react';
import { AppScreenType } from '../types';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';

interface NavigationDockProps {
  activeScreen: AppScreenType;
  onNavigate: (screen: AppScreenType) => void;
  onLogoutClick: () => void;
  onOpenSlipModal?: () => void;
  allowSlipPrint?: boolean;
  onOpenUserMonitoring?: () => void;
  isAdmin?: boolean;
  onOpenAdminPanel?: () => void;
  savedCount?: number;
  slipQueueCount?: number;
}

export const NavigationDock: React.FC<NavigationDockProps> = ({
  activeScreen,
  onNavigate,
  onOpenSlipModal,
  allowSlipPrint = true,
  isAdmin,
  onOpenAdminPanel,
  savedCount = 0,
  slipQueueCount = 0,
}) => {
  const navItems: {
    id: string;
    label: string;
    icon: React.FC<{ className?: string }>;
    isActive: boolean;
    badge?: number;
    onClick: () => void;
  }[] = [
    {
      id: 'home',
      label: 'হোম',
      icon: Home,
      isActive: activeScreen === 'home',
      onClick: () => onNavigate('home'),
    },
    {
      id: 'search',
      label: 'অনুসন্ধান',
      icon: Search,
      isActive: activeScreen === 'search',
      onClick: () => onNavigate('search'),
    },
    ...(allowSlipPrint && onOpenSlipModal
      ? [
          {
            id: 'slip',
            label: 'ভোটার স্লিপ',
            icon: Printer,
            isActive: false,
            badge: slipQueueCount > 0 ? slipQueueCount : undefined,
            onClick: onOpenSlipModal,
          },
        ]
      : []),
    {
      id: 'saved',
      label: 'সংরক্ষিত',
      icon: Bookmark,
      isActive: activeScreen === 'saved',
      badge: savedCount > 0 ? savedCount : undefined,
      onClick: () => onNavigate('saved'),
    },
    {
      id: 'analytics',
      label: 'অ্যানালাইসিস',
      icon: BarChart3,
      isActive: activeScreen === 'analytics',
      onClick: () => onNavigate('analytics'),
    },
    ...(isAdmin && onOpenAdminPanel
      ? [
          {
            id: 'admin',
            label: 'অ্যাডমিন',
            icon: Shield,
            isActive: false,
            onClick: onOpenAdminPanel,
          },
        ]
      : []),
  ];

  return (
    <nav
      role="navigation"
      aria-label="প্রধান নেভিগেশন"
      className="fixed bottom-0 left-0 right-0 w-full sm:bottom-3.5 sm:max-w-2xl mx-auto z-40 bg-[var(--md-surface-container)]/95 backdrop-blur-md border-t sm:border border-[var(--md-outline-variant)]/70 sm:rounded-full shadow-[0_-2px_12px_rgba(0,0,0,0.06)] sm:shadow-xl bottom-safe select-none transition-all"
    >
      <div className="h-[68px] sm:h-16 flex items-center justify-around px-1.5 sm:px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-1.5 cursor-pointer group active:scale-95 transition-transform"
              title={item.label}
            >
              {/* M3 64x32px Active Indicator Pill */}
              <div
                className={`relative w-14 sm:w-16 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
                  item.isActive
                    ? 'bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]'
                    : item.id === 'slip'
                    ? 'bg-[var(--md-primary-container)]/60 text-[var(--md-on-primary-container)] group-hover:bg-[var(--md-primary-container)]'
                    : 'text-[var(--md-on-surface-variant)] group-hover:bg-[var(--md-surface-container-highest)]/70'
                }`}
              >
                <Icon
                  className={`w-[19px] h-[19px] transition-transform ${
                    item.isActive ? 'stroke-[2.5]' : 'stroke-[2]'
                  }`}
                />

                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--md-error)] text-[var(--md-on-error)] text-[10px] font-black flex items-center justify-center leading-none shadow-2xs">
                    {convertToBengaliNumbers(item.badge > 99 ? 99 : item.badge)}
                  </span>
                )}

                {item.id === 'admin' && (
                  <span className="absolute top-1 right-3 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </div>

              <span
                className={`text-[11px] leading-none truncate max-w-full px-0.5 transition-colors ${
                  item.isActive
                    ? 'font-extrabold text-[var(--md-on-surface)]'
                    : 'font-semibold text-[var(--md-on-surface-variant)]'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
