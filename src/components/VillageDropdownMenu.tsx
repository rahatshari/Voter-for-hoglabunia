import React, { useState } from 'react';
import { Check, ChevronDown, Globe, MapPin } from 'lucide-react';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';
import { useLockBodyScroll } from '../lib/useLockBodyScroll';

export interface VillageMenuOption {
  key: string;
  label: string;
  count?: number;
}

interface VillageDropdownMenuProps {
  selectedKey: string;
  options: VillageMenuOption[];
  onSelect: (key: string) => void;
  compact?: boolean;
}

export const VillageDropdownMenu: React.FC<VillageDropdownMenuProps> = ({
  selectedKey,
  options,
  onSelect,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  useLockBodyScroll(open);

  const activeOpt =
    options.find((o) => o.key === selectedKey) ||
    options[0] || { key: 'all', label: 'সকল গ্রাম' };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full transition cursor-pointer active:scale-95 ${
          compact
            ? 'h-8.5 px-3 text-xs font-bold bg-[var(--md-surface-container-high)] border border-[var(--md-outline-variant)]/70 text-[var(--md-on-surface)]'
            : 'h-9 px-3.5 text-sm sm:text-base font-black m3-secondary-container shadow-2xs'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {activeOpt.key === 'all' ? (
          <Globe className="w-3.5 h-3.5 text-[var(--md-primary)] shrink-0" />
        ) : (
          <MapPin className="w-3.5 h-3.5 text-[var(--md-primary)] shrink-0" />
        )}
        <span className="truncate max-w-[155px] sm:max-w-[210px]">{activeOpt.label}</span>
        <ChevronDown
          className={`w-4 h-4 opacity-75 shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            className="absolute left-0 top-11 z-50 w-60 max-h-72 overflow-y-auto overscroll-contain m3-card-elevated rounded-2xl p-1.5 shadow-2xl border border-[var(--md-outline-variant)] animate-m3-scale"
          >
            <div className="px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[var(--md-on-surface-variant)] border-b border-[var(--md-outline-variant)]/40 mb-1">
              গ্রাম নির্বাচন করুন
            </div>
            <div className="space-y-0.5">
              {options.map((opt) => {
                const isSelected = opt.key === selectedKey;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelect(opt.key);
                      setOpen(false);
                    }}
                    className={`w-full px-2.5 py-2 rounded-xl text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                      isSelected
                        ? 'm3-tonal-container font-extrabold'
                        : 'hover:bg-[var(--md-surface-container-high)] font-semibold text-[var(--md-on-surface)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {opt.key === 'all' ? (
                        <Globe className="w-3.5 h-3.5 shrink-0 opacity-80" />
                      ) : (
                        <MapPin className="w-3.5 h-3.5 shrink-0 opacity-80" />
                      )}
                      <span className="truncate">{opt.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.count !== undefined && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                            isSelected
                              ? 'bg-black/10'
                              : 'bg-[var(--md-surface-container-high)] text-[var(--md-on-surface-variant)]'
                          }`}
                        >
                          {convertToBengaliNumbers(opt.count)}
                        </span>
                      )}
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
