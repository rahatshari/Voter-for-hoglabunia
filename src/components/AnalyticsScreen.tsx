import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Printer,
  Search,
  Sliders,
  Users,
} from 'lucide-react';
import { AgeGroupFilter, Voter, VoterAnnotation } from '../types';
import {
  convertToBengaliNumbers,
  convertToEnglishNumbers,
  isMigrated,
} from '../lib/bengaliUtils';
import { getVoterUniqueKey } from '../lib/voterSlipUtils';
import { VillageDropdownMenu, VillageMenuOption } from './VillageDropdownMenu';

interface AnalyticsScreenProps {
  villagesData: Record<string, Voter[]>;
  annotationsMap?: Record<string, VoterAnnotation>;
  initialVillage?: string;
  onNavigateSearch: (
    village?: string,
    preset?: { ageGroup?: AgeGroupFilter; profession?: string }
  ) => void;
  onNavigateHome: () => void;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({
  villagesData,
  annotationsMap = {},
  initialVillage = 'all',
  onNavigateSearch,
  onNavigateHome,
}) => {
  const [selectedVillage, setSelectedVillage] = useState<string>(initialVillage || 'all');
  const [gaugeMetric, setGaugeMetric] = useState<'female' | 'male' | 'active'>('female');
  const [maxAgeFilter, setMaxAgeFilter] = useState<number>(100);
  const [minAgeFilter] = useState<number>(18);

  const villageNames = useMemo(() => Object.keys(villagesData), [villagesData]);

  const villageMenuOptions: VillageMenuOption[] = useMemo(() => {
    let totalActive = 0;
    const perVillage = villageNames.map((vn) => {
      const active = (villagesData[vn] || []).filter((v) =>
        v._isMigrated !== undefined ? !v._isMigrated : !isMigrated(v)
      ).length;
      totalActive += active;
      return { key: vn, label: vn, count: active };
    });
    return [{ key: 'all', label: 'সকল গ্রাম (ইউনিয়ন)', count: totalActive }, ...perVillage];
  }, [villageNames, villagesData]);

  const activeVotersPool = useMemo(() => {
    if (selectedVillage === 'all') {
      return Object.values(villagesData).flat();
    }
    return villagesData[selectedVillage] || [];
  }, [villagesData, selectedVillage]);

  const filteredVoters = useMemo(() => {
    return activeVotersPool.filter((voter) => {
      if (!voter.dob || voter.dob === '-') return true;
      const engDob = convertToEnglishNumbers(voter.dob);
      const parts = engDob.split('/');
      if (parts.length === 3) {
        const year = parseInt(parts[2], 10);
        if (!isNaN(year)) {
          const age = new Date().getFullYear() - year;
          if (age < minAgeFilter || age > maxAgeFilter) return false;
        }
      }
      return true;
    });
  }, [activeVotersPool, minAgeFilter, maxAgeFilter]);

  const stats = useMemo(() => {
    const total = filteredVoters.length;
    if (total === 0) {
      return {
        total: 0,
        active: 0,
        migrated: 0,
        males: 0,
        females: 0,
        votedCount: 0,
        starredCount: 0,
        turnoutPercent: 0,
        malePercent: 0,
        femalePercent: 0,
        migratedPercent: 0,
        activePercent: 0,
        avgAge: 0,
        ageGroups: { youth: 0, working: 0, middle: 0, senior: 0 },
        agePercentages: { youth: 0, working: 0, middle: 0, senior: 0 },
        topProfessions: [] as { name: string; count: number; percent: number }[],
      };
    }

    let activeCount = 0;
    let migratedCount = 0;
    let males = 0;
    let females = 0;
    let votedCount = 0;
    let starredCount = 0;
    let totalAgeYears = 0;
    let ageKnownCount = 0;

    const ageGroups = {
      youth: 0,
      working: 0,
      middle: 0,
      senior: 0,
    };

    const profMap: Record<string, number> = {};

    filteredVoters.forEach((v) => {
      const isMig = v._isMigrated !== undefined ? v._isMigrated : isMigrated(v);
      const ann = annotationsMap[getVoterUniqueKey(v)];
      if (ann?.starred) starredCount++;

      if (isMig) {
        migratedCount++;
      } else {
        activeCount++;
        if (ann?.voted) votedCount++;
      }

      const gender = (v._gender || v.gender || 'পুরুষ').trim();
      if (gender === 'মহিলা') females++;
      else males++;

      if (!isMig && v.dob && v.dob !== '-') {
        const engDob = convertToEnglishNumbers(v.dob);
        const parts = engDob.split('/');
        if (parts.length === 3) {
          const year = parseInt(parts[2], 10);
          if (!isNaN(year)) {
            const age = new Date().getFullYear() - year;
            if (age >= 0 && age <= 120) {
              totalAgeYears += age;
              ageKnownCount++;
              if (age <= 25) ageGroups.youth++;
              else if (age <= 40) ageGroups.working++;
              else if (age <= 60) ageGroups.middle++;
              else ageGroups.senior++;
            }
          }
        }
      }

      if (!isMig) {
        let prof = (v._profession || v.profession || '').trim();
        if (!prof || prof === 'nan') prof = 'পেশা দেওয়া নেই';
        profMap[prof] = (profMap[prof] || 0) + 1;
      }
    });

    const denomActive = activeCount || 1;
    const topProfessions = Object.entries(profMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({
        name,
        count,
        percent: Math.round((count / denomActive) * 100),
      }));

    const malePercent = Math.round((males / total) * 100);
    const femalePercent = Math.round((females / total) * 100);
    const migratedPercent = Math.round((migratedCount / total) * 100);
    const activePercent = Math.round((activeCount / total) * 100);
    const turnoutPercent = activeCount > 0 ? Math.round((votedCount / activeCount) * 1000) / 10 : 0;
    const avgAge = ageKnownCount > 0 ? Math.round(totalAgeYears / ageKnownCount) : 0;

    const ageSum = ageGroups.youth + ageGroups.working + ageGroups.middle + ageGroups.senior || 1;
    const agePercentages = {
      youth: Math.round((ageGroups.youth / ageSum) * 100),
      working: Math.round((ageGroups.working / ageSum) * 100),
      middle: Math.round((ageGroups.middle / ageSum) * 100),
      senior: Math.round((ageGroups.senior / ageSum) * 100),
    };

    return {
      total,
      active: activeCount,
      migrated: migratedCount,
      males,
      females,
      votedCount,
      starredCount,
      turnoutPercent,
      malePercent,
      femalePercent,
      migratedPercent,
      activePercent,
      avgAge,
      ageGroups,
      agePercentages,
      topProfessions,
    };
  }, [filteredVoters, annotationsMap]);

  // Village-by-Village Comparison Matrix
  const villageComparison = useMemo(() => {
    return villageNames
      .map((vName) => {
        const list = villagesData[vName] || [];
        let active = 0;
        let males = 0;
        let females = 0;
        let youth = 0;
        let migrated = 0;
        let voted = 0;

        for (const v of list) {
          const isMig = v._isMigrated !== undefined ? v._isMigrated : isMigrated(v);
          if (isMig) {
            migrated++;
            continue;
          }
          active++;
          const g = (v._gender || v.gender || '').trim();
          if (g === 'মহিলা') females++;
          else males++;

          if (annotationsMap[getVoterUniqueKey(v)]?.voted) voted++;

          if (v.dob && v.dob !== '-') {
            const parts = convertToEnglishNumbers(v.dob).split('/');
            if (parts.length === 3) {
              const yr = parseInt(parts[2], 10);
              const age = new Date().getFullYear() - yr;
              if (!isNaN(age) && age >= 18 && age <= 25) youth++;
            }
          }
        }

        const malePct = active > 0 ? Math.round((males / active) * 100) : 0;
        const turnoutPct = active > 0 ? Math.round((voted / active) * 100) : 0;
        return {
          name: vName,
          active,
          males,
          females,
          malePct,
          youth,
          migrated,
          voted,
          turnoutPct,
        };
      })
      .sort((a, b) => b.active - a.active);
  }, [villageNames, villagesData, annotationsMap]);

  const gaugePercent = useMemo(() => {
    if (gaugeMetric === 'female') return stats.femalePercent;
    if (gaugeMetric === 'male') return stats.malePercent;
    return stats.activePercent;
  }, [gaugeMetric, stats]);

  const gaugeLabel = useMemo(() => {
    if (gaugeMetric === 'female') return 'নারী ভোটার অনুপাত';
    if (gaugeMetric === 'male') return 'পুরুষ ভোটার অনুপাত';
    return 'সক্রিয় ভোটার অনুপাত';
  }, [gaugeMetric]);

  const radius = 62;
  const stroke = 12;
  const normalizedRadius = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalizedRadius;
  const strokeDashoffset = circumference - (gaugePercent / 100) * circumference * 0.75;

  return (
    <div className="space-y-4 sm:space-y-5 animate-slide-down pb-12">
      {/* 1. Material Design 3 Top Bar */}
      <header className="m3-card-elevated p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNavigateHome}
            className="m3-icon-btn-tonal"
            title="হোমে ফিরুন"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[var(--md-primary)]" />
              <h1 className="text-base sm:text-lg font-black tracking-tight">
                ভোটার ডাটা অ্যানালাইসিস
              </h1>
            </div>
            <p className="text-xs text-[var(--md-on-surface-variant)]">
              ডেমোগ্রাফিক চার্ট, গ্রামভিত্তিক তুলনা ও ক্যাম্পেইন ইনসাইটস
            </p>
          </div>
        </div>

        {/* Village Selector & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <VillageDropdownMenu
            selectedKey={selectedVillage}
            options={villageMenuOptions}
            onSelect={(vk) => setSelectedVillage(vk)}
            compact
          />

          <button
            type="button"
            onClick={() => onNavigateSearch(selectedVillage === 'all' ? '' : selectedVillage)}
            className="m3-btn-tonal h-9 px-3.5 text-xs inline-flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            <span>তালিকায় দেখুন</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="m3-btn-filled h-9 px-3.5 text-xs inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">প্রিন্ট রিপোর্ট</span>
          </button>
        </div>
      </header>

      {/* 2. Top 4 M3 KPI Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div className="m3-tonal-container rounded-3xl p-4">
          <span className="text-xs font-bold opacity-80 block">সক্রিয় ভোটার</span>
          <span className="text-2xl sm:text-3xl font-black block mt-1">
            {convertToBengaliNumbers(stats.active)}
          </span>
          <span className="text-[11px] font-semibold opacity-80 block mt-1">
            গড় বয়স ~ {convertToBengaliNumbers(stats.avgAge)} বছর
          </span>
        </div>

        <div className="m3-card-elevated rounded-3xl p-4">
          <span className="text-xs font-bold text-[var(--md-on-surface-variant)] block">
            লিঙ্গ অনুপাত
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl sm:text-2xl font-black text-sky-700">
              {convertToBengaliNumbers(stats.malePercent)}%
            </span>
            <span className="text-xs text-[var(--md-outline)]">/</span>
            <span className="text-xl sm:text-2xl font-black text-rose-600">
              {convertToBengaliNumbers(stats.femalePercent)}%
            </span>
          </div>
          <span className="text-[11px] text-[var(--md-on-surface-variant)] block mt-1">
            পুরুষ {convertToBengaliNumbers(stats.males)} • নারী{' '}
            {convertToBengaliNumbers(stats.females)}
          </span>
        </div>

        <div
          onClick={() =>
            onNavigateSearch(selectedVillage === 'all' ? '' : selectedVillage, {
              ageGroup: 'youth',
            })
          }
          className="m3-card-elevated rounded-3xl p-4 cursor-pointer hover:border-[var(--md-primary)] transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--md-on-surface-variant)]">
              তরুণ ভোটার (১৮-২৫)
            </span>
            <ChevronRight className="w-4 h-4 text-[var(--md-outline)]" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-emerald-600 block mt-1">
            {convertToBengaliNumbers(stats.ageGroups.youth)}
          </span>
          <span className="text-[11px] text-[var(--md-primary)] font-bold block mt-1">
            মোটের {convertToBengaliNumbers(stats.agePercentages.youth)}% (দেখতে ট্যাপ করুন)
          </span>
        </div>

        <div className="m3-card-elevated rounded-3xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--md-on-surface-variant)]">
              ভোট প্রদান ট্র্যাকার
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-[var(--md-primary)] block mt-1">
            {convertToBengaliNumbers(stats.turnoutPercent)}%
          </span>
          <span className="text-[11px] text-[var(--md-on-surface-variant)] block mt-1">
            সম্পন্ন: {convertToBengaliNumbers(stats.votedCount)} জন • বুকমার্ক:{' '}
            {convertToBengaliNumbers(stats.starredCount)}
          </span>
        </div>
      </section>

      {/* 3. Main Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: M3 Circular Dial + Age Range Slider */}
        <div className="lg:col-span-4 space-y-4">
          <div className="m3-card-elevated p-5 flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-2">
              <div>
                <span className="text-[11px] font-bold text-[var(--md-on-surface-variant)] block">
                  ইন্টারেক্টিভ ডায়াল
                </span>
                <span className="text-sm font-extrabold">{gaugeLabel}</span>
              </div>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full m3-secondary-container">
                মোট {convertToBengaliNumbers(stats.total)}
              </span>
            </div>

            <div className="relative w-44 h-44 flex items-center justify-center my-2">
              <svg className="w-full h-full -rotate-135" viewBox="0 0 128 128">
                <circle
                  cx="64"
                  cy="64"
                  r={normalizedRadius}
                  fill="transparent"
                  stroke="var(--md-surface-container-highest)"
                  strokeWidth={stroke}
                  strokeDasharray={`${circumference * 0.75} ${circumference}`}
                  strokeLinecap="round"
                />
                <circle
                  cx="64"
                  cy="64"
                  r={normalizedRadius}
                  fill="transparent"
                  stroke={
                    gaugeMetric === 'female'
                      ? '#e11d48'
                      : gaugeMetric === 'male'
                      ? '#0284c7'
                      : 'var(--md-primary)'
                  }
                  strokeWidth={stroke}
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-black tracking-tight">
                  {convertToBengaliNumbers(gaugePercent)}%
                </span>
                <span className="text-xs font-semibold text-[var(--md-on-surface-variant)] mt-0.5">
                  {gaugeMetric === 'female'
                    ? `${convertToBengaliNumbers(stats.females)} জন`
                    : gaugeMetric === 'male'
                    ? `${convertToBengaliNumbers(stats.males)} জন`
                    : `${convertToBengaliNumbers(stats.active)} জন`}
                </span>
              </div>
            </div>

            {/* M3 Segmented Toggle */}
            <div className="w-full grid grid-cols-3 rounded-full border border-[var(--md-outline-variant)] p-1 bg-[var(--md-surface-container-low)] mt-2">
              {[
                { id: 'female' as const, label: 'নারী' },
                { id: 'male' as const, label: 'পুরুষ' },
                { id: 'active' as const, label: 'সক্রিয়' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setGaugeMetric(m.id)}
                  className={`py-1.5 text-xs font-bold rounded-full transition cursor-pointer ${
                    gaugeMetric === m.id
                      ? 'm3-secondary-container shadow-2xs'
                      : 'text-[var(--md-on-surface-variant)]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Age Filter Slider */}
            <div className="w-full mt-4 pt-3.5 border-t border-[var(--md-outline-variant)]/50">
              <div className="flex items-center justify-between text-xs font-bold mb-2">
                <span className="inline-flex items-center gap-1 text-[var(--md-on-surface-variant)]">
                  <Sliders className="w-3.5 h-3.5" />
                  বয়স সীমা ফিল্টার:
                </span>
                <span className="text-[var(--md-primary)]">
                  ১৮ – {convertToBengaliNumbers(maxAgeFilter)} বছর
                </span>
              </div>
              <input
                type="range"
                min="25"
                max="100"
                value={maxAgeFilter}
                onChange={(e) => setMaxAgeFilter(parseInt(e.target.value, 10))}
                className="w-full accent-[var(--md-primary)] cursor-pointer"
              />
            </div>
          </div>

          {/* Demographic Ratios Card */}
          <div className="m3-card-elevated p-5 space-y-3.5">
            <h3 className="text-xs font-extrabold text-[var(--md-on-surface-variant)] uppercase tracking-wider">
              ডেমোগ্রাফিক সূচক মিটার
            </h3>

            {[
              {
                label: 'পুরুষ ভোটার হার',
                pct: stats.malePercent,
                barClass: 'bg-sky-600',
              },
              {
                label: 'নারী ভোটার হার',
                pct: stats.femalePercent,
                barClass: 'bg-rose-500',
              },
              {
                label: 'তরুণ ভোটার (১৮-২৫)',
                pct: stats.agePercentages.youth,
                barClass: 'bg-emerald-600',
              },
              {
                label: 'কর্তিত / স্থানান্তরিত হার',
                pct: stats.migratedPercent,
                barClass: 'bg-amber-500',
              },
            ].map((row) => (
              <div key={row.label} className="space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span>{row.label}</span>
                  <span>{convertToBengaliNumbers(row.pct)}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-[var(--md-surface-container-highest)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${row.barClass}`}
                    style={{ width: `${Math.max(row.pct, row.pct > 0 ? 3 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Interactive Age Bars & Top Professions */}
        <div className="lg:col-span-8 space-y-4">
          {/* Interactive Age Group Bar Chart */}
          <div className="m3-card-elevated p-5">
            <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold">
                  বয়সভিত্তিক ভোটার স্তরবিন্যাস
                </h3>
                <p className="text-xs text-[var(--md-on-surface-variant)]">
                  যেকোনো বয়স স্তরে ট্যাপ করলে সরাসরি সেই বয়সের ভোটার তালিকা খুলবে
                </p>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full m3-tonal-container">
                ট্যাপ করে ফিল্টার করুন
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2.5 sm:gap-5 items-end h-52 pt-4 px-1 sm:px-4">
              {[
                {
                  id: 'youth' as AgeGroupFilter,
                  title: '১৮-২৫ বছর',
                  sub: 'নতুন ভোটার',
                  count: stats.ageGroups.youth,
                  pct: stats.agePercentages.youth,
                  color: 'bg-emerald-500',
                },
                {
                  id: 'working' as AgeGroupFilter,
                  title: '২৬-৪০ বছর',
                  sub: 'কর্মক্ষম যুবক',
                  count: stats.ageGroups.working,
                  pct: stats.agePercentages.working,
                  color: 'bg-sky-600',
                },
                {
                  id: 'middle' as AgeGroupFilter,
                  title: '৪১-৬০ বছর',
                  sub: 'মধ্যবয়সী',
                  count: stats.ageGroups.middle,
                  pct: stats.agePercentages.middle,
                  color: 'bg-amber-500',
                },
                {
                  id: 'senior' as AgeGroupFilter,
                  title: '৬০+ বছর',
                  sub: 'প্রবীণ নাগরিক',
                  count: stats.ageGroups.senior,
                  pct: stats.agePercentages.senior,
                  color: 'bg-rose-500',
                },
              ].map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() =>
                    onNavigateSearch(selectedVillage === 'all' ? '' : selectedVillage, {
                      ageGroup: col.id,
                    })
                  }
                  className="flex flex-col items-center h-full justify-end group cursor-pointer"
                >
                  <span className="text-xs font-extrabold mb-1.5 group-hover:text-[var(--md-primary)] transition">
                    {convertToBengaliNumbers(col.count)}
                  </span>
                  <div className="w-full max-w-[54px] bg-[var(--md-surface-container-high)] rounded-2xl h-34 flex items-end p-1 group-hover:ring-2 group-hover:ring-[var(--md-primary)] transition">
                    <div
                      className={`w-full ${col.color} rounded-xl transition-all duration-700`}
                      style={{ height: `${Math.max(col.pct, 10)}%` }}
                    />
                  </div>
                  <span className="text-xs font-extrabold mt-2 text-center leading-tight">
                    {col.title}
                  </span>
                  <span className="text-[10px] text-[var(--md-on-surface-variant)]">
                    {convertToBengaliNumbers(col.pct)}% • {col.sub}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Top Professions Card */}
          <div className="m3-card-elevated p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-[var(--md-primary)]" />
                <h3 className="text-sm sm:text-base font-extrabold">শীর্ষ পেশাসমূহ</h3>
              </div>
              <span className="text-xs text-[var(--md-on-surface-variant)] font-semibold">
                ট্যাপ করে পেশাভিত্তিক ভোটার দেখুন
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {stats.topProfessions.map((prof) => {
                const clickable = prof.name !== 'পেশা দেওয়া নেই';
                return (
                  <button
                    key={prof.name}
                    type="button"
                    disabled={!clickable}
                    onClick={() =>
                      clickable &&
                      onNavigateSearch(selectedVillage === 'all' ? '' : selectedVillage, {
                        profession: prof.name,
                      })
                    }
                    className={`m3-card-filled p-3 text-left space-y-1.5 ${
                      clickable
                        ? 'cursor-pointer hover:ring-1 hover:ring-[var(--md-primary)]'
                        : 'opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="truncate">{prof.name}</span>
                      <span className="text-[var(--md-primary)] shrink-0 ml-2">
                        {convertToBengaliNumbers(prof.count)} জন (
                        {convertToBengaliNumbers(prof.percent)}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[var(--md-surface-container-highest)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--md-primary)] transition-all duration-500"
                        style={{ width: `${Math.max(prof.percent, 4)}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 4. NEW: Village-by-Village Comparison Matrix */}
      {villageComparison.length > 0 && (
        <section className="m3-card-elevated p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--md-primary)]" />
              <h3 className="text-sm sm:text-base font-extrabold">
                সকল গ্রামের তুলনামূলক পরিসংখ্যান ({convertToBengaliNumbers(villageComparison.length)} টি গ্রাম)
              </h3>
            </div>
            <span className="text-xs text-[var(--md-on-surface-variant)]">
              গ্রামে ট্যাপ করে সরাসরি তালিকা খুলুন
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse min-w-[540px]">
              <thead>
                <tr className="border-b border-[var(--md-outline-variant)] text-[var(--md-on-surface-variant)]">
                  <th className="py-2.5 px-2 font-bold">গ্রাম / এলাকা</th>
                  <th className="py-2.5 px-2 font-bold text-right">সক্রিয় ভোটার</th>
                  <th className="py-2.5 px-2 font-bold text-right">পুরুষ</th>
                  <th className="py-2.5 px-2 font-bold text-right">মহিলা</th>
                  <th className="py-2.5 px-2 font-bold text-right">তরুণ (১৮-২৫)</th>
                  <th className="py-2.5 px-2 font-bold text-right">ভোট সম্পন্ন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--md-outline-variant)]/40">
                {villageComparison.map((v, i) => (
                  <tr
                    key={v.name}
                    onClick={() => onNavigateSearch(v.name)}
                    className="hover:bg-[var(--md-surface-container-low)] cursor-pointer transition"
                  >
                    <td className="py-2.5 px-2 font-extrabold flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full m3-secondary-container text-[10px] inline-flex items-center justify-center">
                        {convertToBengaliNumbers(i + 1)}
                      </span>
                      <span>{v.name}</span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-black text-[var(--md-primary)]">
                      {convertToBengaliNumbers(v.active)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-semibold text-sky-700">
                      {convertToBengaliNumbers(v.males)} ({convertToBengaliNumbers(v.malePct)}%)
                    </td>
                    <td className="py-2.5 px-2 text-right font-semibold text-rose-600">
                      {convertToBengaliNumbers(v.females)} ({convertToBengaliNumbers(100 - v.malePct)}%)
                    </td>
                    <td className="py-2.5 px-2 text-right font-semibold text-emerald-700">
                      {convertToBengaliNumbers(v.youth)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold">
                      {v.voted > 0 ? (
                        <span className="text-emerald-600">
                          {convertToBengaliNumbers(v.voted)} ({convertToBengaliNumbers(v.turnoutPct)}%)
                        </span>
                      ) : (
                        <span className="text-[var(--md-outline)]">০</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
