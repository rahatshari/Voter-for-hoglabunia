import React, { useState, useMemo } from 'react';
import { Voter } from '../types';
import {
  convertToBengaliNumbers,
  convertToEnglishNumbers,
  isMigrated,
} from '../lib/bengaliUtils';

interface AnalyticsScreenProps {
  villagesData: Record<string, Voter[]>;
  initialVillage?: string;
  onNavigateSearch: (village?: string) => void;
  onNavigateHome: () => void;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({
  villagesData,
  initialVillage = 'all',
  onNavigateSearch,
  onNavigateHome,
}) => {
  const [selectedVillage, setSelectedVillage] = useState<string>(initialVillage || 'all');
  const [gaugeMetric, setGaugeMetric] = useState<'female' | 'male' | 'active'>('female');
  const [maxAgeFilter, setMaxAgeFilter] = useState<number>(100);
  const [minAgeFilter, setMinAgeFilter] = useState<number>(18);

  const villageNames = useMemo(() => Object.keys(villagesData), [villagesData]);

  // Aggregate voters based on selected village
  const activeVotersPool = useMemo(() => {
    let pool: Voter[] = [];
    if (selectedVillage === 'all') {
      pool = Object.values(villagesData).flat();
    } else {
      pool = villagesData[selectedVillage] || [];
    }
    return pool;
  }, [villagesData, selectedVillage]);

  // Filtered by age slider
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

  // High-level Metrics
  const stats = useMemo(() => {
    const total = filteredVoters.length;
    if (total === 0) {
      return {
        total: 0,
        active: 0,
        migrated: 0,
        males: 0,
        females: 0,
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
    let totalAgeYears = 0;
    let ageKnownCount = 0;

    const ageGroups = {
      youth: 0, // 18-25
      working: 0, // 26-40
      middle: 0, // 41-60
      senior: 0, // 60+
    };

    const profMap: Record<string, number> = {};

    filteredVoters.forEach((v) => {
      const isMig = v._isMigrated !== undefined ? v._isMigrated : isMigrated(v);
      if (isMig) {
        migratedCount++;
      } else {
        activeCount++;
      }

      const gender = (v._gender || v.gender || 'পুরুষ').trim();
      if (gender === 'মহিলা') {
        females++;
      } else {
        males++;
      }

      // Age grouping
      if (v.dob && v.dob !== '-') {
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

      // Professions
      let prof = (v._profession || v.profession || '').trim();
      if (!prof || prof === 'nan') prof = 'পেশা দেওয়া নেই';
      profMap[prof] = (profMap[prof] || 0) + 1;
    });

    const topProfessions = Object.entries(profMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({
        name,
        count,
        percent: Math.round((count / total) * 100),
      }));

    const malePercent = Math.round((males / total) * 100);
    const femalePercent = Math.round((females / total) * 100);
    const migratedPercent = Math.round((migratedCount / total) * 100);
    const activePercent = Math.round((activeCount / total) * 100);
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
      malePercent,
      femalePercent,
      migratedPercent,
      activePercent,
      avgAge,
      ageGroups,
      agePercentages,
      topProfessions,
    };
  }, [filteredVoters]);

  // Selected Gauge Value based on state
  const gaugePercent = useMemo(() => {
    if (gaugeMetric === 'female') return stats.femalePercent;
    if (gaugeMetric === 'male') return stats.malePercent;
    return stats.activePercent;
  }, [gaugeMetric, stats]);

  const gaugeLabel = useMemo(() => {
    if (gaugeMetric === 'female') return 'নারী ভোটার';
    if (gaugeMetric === 'male') return 'পুরুষ ভোটার';
    return 'সক্রিয় ভোটার';
  }, [gaugeMetric]);

  // Circumference for 220-degree circular dial gauge
  const radius = 64;
  const stroke = 12;
  const normalizedRadius = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalizedRadius;
  const strokeDashoffset = circumference - (gaugePercent / 100) * circumference * 0.75;

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-slide-down pb-12">
      {/* Top Header & Village Switcher Bar */}
      <div className="soft-card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNavigateHome}
            className="soft-btn w-10 h-10 flex items-center justify-center text-slate-600 hover:text-indigo-600 text-lg cursor-pointer"
            title="হোমে ফিরুন"
          >
            🏠
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              <h1 className="text-lg sm:text-xl font-bold text-slate-800">
                ইউনিয়ন ভোটার ডাটা অ্যানালাইসিস
              </h1>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              রিয়েলটাইম ডেমোগ্রাফিক অ্যানালিটিক্স ও ইন্টারেক্টিভ মেট্রিক্স ড্যাশবোর্ড
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Village Filter Select */}
          <div className="soft-card-inset px-3 py-1.5 flex items-center gap-2">
            <span className="text-xs text-slate-500 font-bold">📍 গ্রাম:</span>
            <select
              value={selectedVillage}
              onChange={(e) => setSelectedVillage(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="all">🌐 সকল গ্রাম (ইউনিয়ন ওভারভিউ)</option>
              {villageNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => onNavigateSearch(selectedVillage === 'all' ? '' : selectedVillage)}
            className="soft-btn px-3 py-2 text-xs font-bold text-indigo-600 flex items-center gap-1.5 cursor-pointer"
          >
            <span>🔍</span> তালিকায় দেখুন
          </button>

          <button
            type="button"
            onClick={handlePrintReport}
            className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md hover:shadow-lg shadow-pink-500/25 cursor-pointer transition flex items-center gap-1.5"
          >
            <span>🖨️</span> প্রিন্ট রিপোর্ট
          </button>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Circular Dial Gauge Widget (Matches 65% Expenses widget from image) */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          <div className="soft-card p-6 flex flex-col items-center justify-between relative overflow-hidden">
            {/* Top Indicator Pills */}
            <div className="w-full flex justify-between items-center mb-4">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                  অনুপাত ডায়াল
                </span>
                <span className="text-sm font-bold text-slate-700">{gaugeLabel}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
                <span>{convertToBengaliNumbers(stats.total)}</span> মোট
              </div>
            </div>

            {/* Circular Gauge Display */}
            <div className="relative w-44 h-44 flex items-center justify-center my-2">
              <svg className="w-full h-full -rotate-135" viewBox="0 0 128 128">
                {/* Background Track */}
                <circle
                  cx="64"
                  cy="64"
                  r={normalizedRadius}
                  fill="transparent"
                  stroke="#E2E8F0"
                  strokeWidth={stroke}
                  strokeDasharray={`${circumference * 0.75} ${circumference}`}
                  strokeLinecap="round"
                />
                {/* Active Colored Arc */}
                <circle
                  cx="64"
                  cy="64"
                  r={normalizedRadius}
                  fill="transparent"
                  stroke={
                    gaugeMetric === 'female'
                      ? '#EC4899'
                      : gaugeMetric === 'male'
                      ? '#6366F1'
                      : '#10B981'
                  }
                  strokeWidth={stroke}
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              </svg>

              {/* Inner Center Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-extrabold text-slate-800 tracking-tight">
                  {convertToBengaliNumbers(gaugePercent)}%
                </span>
                <span className="text-[11px] font-bold text-slate-400 mt-0.5">
                  {gaugeMetric === 'female'
                    ? `${convertToBengaliNumbers(stats.females)} জন`
                    : gaugeMetric === 'male'
                    ? `${convertToBengaliNumbers(stats.males)} জন`
                    : `${convertToBengaliNumbers(stats.active)} জন`}
                </span>
              </div>
            </div>

            {/* Toggle Metric Pills (Like Expenses / Income toggle in user image) */}
            <div className="w-full grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setGaugeMetric('female')}
                className={`py-2 px-2 text-xs font-bold rounded-xl cursor-pointer transition ${
                  gaugeMetric === 'female'
                    ? 'bg-pink-500 text-white shadow-md shadow-pink-500/25'
                    : 'soft-btn text-slate-600 hover:text-pink-600'
                }`}
              >
                👩 নারী
              </button>
              <button
                type="button"
                onClick={() => setGaugeMetric('male')}
                className={`py-2 px-2 text-xs font-bold rounded-xl cursor-pointer transition ${
                  gaugeMetric === 'male'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                    : 'soft-btn text-slate-600 hover:text-indigo-600'
                }`}
              >
                👨 পুরুষ
              </button>
              <button
                type="button"
                onClick={() => setGaugeMetric('active')}
                className={`py-2 px-2 text-xs font-bold rounded-xl cursor-pointer transition ${
                  gaugeMetric === 'active'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                    : 'soft-btn text-slate-600 hover:text-emerald-600'
                }`}
              >
                ⚡ সক্রিয়
              </button>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div className="soft-card p-5 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              সাধারণ তথ্য ও পরিসংখ্যান
            </h3>
            <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> মোট ভোটার
              </span>
              <span className="font-bold text-slate-800 text-sm">
                {convertToBengaliNumbers(stats.total)} জন
              </span>
            </div>
            <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> সক্রিয় ভোটার
              </span>
              <span className="font-bold text-emerald-600">
                {convertToBengaliNumbers(stats.active)} জন ({convertToBengaliNumbers(stats.activePercent)}%)
              </span>
            </div>
            <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> কর্তিত/স্থানান্তরিত
              </span>
              <span className="font-bold text-rose-600">
                {convertToBengaliNumbers(stats.migrated)} জন ({convertToBengaliNumbers(stats.migratedPercent)}%)
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> ভোটারদের গড় বয়স
              </span>
              <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                ~ {convertToBengaliNumbers(stats.avgAge)} বছর
              </span>
            </div>
          </div>
        </div>

        {/* Center & Right Columns: Demographic Bar Chart, Smart Card & Sliders */}
        <div className="lg:col-span-8 space-y-5">
          {/* Top Row: Demographic Sliders & Digital Smart ID Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 4 Interactive Progress Sliders (Matches user image's 4 limit sliders) */}
            <div className="soft-card p-5 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  ডেমোগ্রাফিক সূচক মিটার
                </span>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                  অনুপাত
                </span>
              </div>

              <div className="space-y-4">
                {/* 1. Male limit */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-slate-600">পুরুষ ভোটার হার</span>
                    <span className="text-indigo-600">{convertToBengaliNumbers(stats.malePercent)}%</span>
                  </div>
                  <div className="h-2.5 w-full soft-card-inset relative overflow-hidden rounded-full">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                      style={{ width: `${stats.malePercent}%` }}
                    />
                  </div>
                </div>

                {/* 2. Female limit */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-slate-600">নারী ভোটার হার</span>
                    <span className="text-pink-600">{convertToBengaliNumbers(stats.femalePercent)}%</span>
                  </div>
                  <div className="h-2.5 w-full soft-card-inset relative overflow-hidden rounded-full">
                    <div
                      className="h-full bg-gradient-to-r from-pink-500 to-rose-400 rounded-full transition-all duration-500"
                      style={{ width: `${stats.femalePercent}%` }}
                    />
                  </div>
                </div>

                {/* 3. Youth limit */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-slate-600">নতুন/তরুণ ভোটার (১৮-২৫)</span>
                    <span className="text-emerald-600">
                      {convertToBengaliNumbers(stats.agePercentages.youth)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full soft-card-inset relative overflow-hidden rounded-full">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-500"
                      style={{ width: `${stats.agePercentages.youth}%` }}
                    />
                  </div>
                </div>

                {/* 4. Migrated limit */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-slate-600">স্থানান্তরিত/কর্তিত হার</span>
                    <span className="text-rose-600">{convertToBengaliNumbers(stats.migratedPercent)}%</span>
                  </div>
                  <div className="h-2.5 w-full soft-card-inset relative overflow-hidden rounded-full">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-rose-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(stats.migratedPercent, 2)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Digital Union Voter Smart Card Mockup (Matches credit card in top right of user image) */}
            <div className="rounded-2xl p-6 text-white bg-gradient-to-tr from-sky-500 via-indigo-600 to-pink-500 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[220px]">
              {/* Background holographic rings */}
              <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full border-4 border-white/20 pointer-events-none" />
              <div className="absolute right-6 -bottom-10 w-44 h-44 rounded-full border-4 border-white/15 pointer-events-none" />

              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <span className="text-[10px] tracking-widest uppercase opacity-80 block">
                    গণপ্রজাতন্ত্রী বাংলাদেশ
                  </span>
                  <h4 className="text-sm font-bold tracking-wide">ডিজিটাল ভোটার স্মার্ট কার্ড</h4>
                </div>
                <div className="w-8 h-6 bg-amber-300/80 rounded-md border border-amber-100/40 shadow-inner flex items-center justify-center text-[10px] text-amber-900 font-mono font-bold">
                  SIM
                </div>
              </div>

              {/* Masked Card Number */}
              <div className="relative z-10 my-3">
                <span className="text-[10px] opacity-75 block mb-1">ভোটার / স্মার্ট এনআইডি নং</span>
                <span className="font-mono text-lg font-bold tracking-widest drop-shadow-sm">
                  ০১০৯ •••• •••• ৬৩৪৬
                </span>
              </div>

              {/* Card Footer Info */}
              <div className="relative z-10 flex justify-between items-end text-xs">
                <div>
                  <span className="text-[10px] opacity-75 block">ইউনিয়ন পরিষদ</span>
                  <span className="font-bold">
                    {selectedVillage === 'all' ? 'ইউনিয়ন ভোটার তালিকা' : selectedVillage}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] opacity-75 block">মেয়াদ</span>
                  <span className="font-mono font-bold">০৫ / ৩৪</span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Row: Vertical Bar Chart (Income / Month chart in user image) */}
          <div className="soft-card p-6">
            <div className="flex flex-wrap justify-between items-center mb-6">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  বয়স স্তরবিন্যাস চার্ট
                </span>
                <h3 className="text-sm sm:text-base font-bold text-slate-800">
                  বয়সভিত্তিক ভোটারদের আনুপাতিক চিত্র
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                <span>🗓️ বছর ২০২৪-২৬</span>
              </div>
            </div>

            {/* Vertical Bar Chart Graphic */}
            <div className="grid grid-cols-4 gap-3 sm:gap-6 items-end h-52 pt-4 px-2 sm:px-6">
              {/* Group 1: 18-25 */}
              <div className="flex flex-col items-center h-full justify-end group">
                <span className="text-xs font-bold text-pink-600 mb-2 transition group-hover:scale-110">
                  {convertToBengaliNumbers(stats.ageGroups.youth)} জন
                </span>
                <div className="w-full max-w-[50px] bg-slate-100 rounded-2xl h-36 flex items-end p-1">
                  <div
                    className="w-full bg-gradient-to-t from-pink-500 to-rose-400 rounded-xl transition-all duration-700 shadow-sm"
                    style={{ height: `${Math.max(stats.agePercentages.youth, 8)}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-700 mt-2 text-center">১৮-২৫ বছর</span>
                <span className="text-[10px] text-slate-400">নতুন ভোটার</span>
              </div>

              {/* Group 2: 26-40 */}
              <div className="flex flex-col items-center h-full justify-end group">
                <span className="text-xs font-bold text-amber-600 mb-2 transition group-hover:scale-110">
                  {convertToBengaliNumbers(stats.ageGroups.working)} জন
                </span>
                <div className="w-full max-w-[50px] bg-slate-100 rounded-2xl h-36 flex items-end p-1">
                  <div
                    className="w-full bg-gradient-to-t from-amber-400 to-amber-500 rounded-xl transition-all duration-700 shadow-sm"
                    style={{ height: `${Math.max(stats.agePercentages.working, 8)}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-700 mt-2 text-center">২৬-৪০ বছর</span>
                <span className="text-[10px] text-slate-400">যুবক/কর্মক্ষম</span>
              </div>

              {/* Group 3: 41-60 */}
              <div className="flex flex-col items-center h-full justify-end group">
                <span className="text-xs font-bold text-emerald-600 mb-2 transition group-hover:scale-110">
                  {convertToBengaliNumbers(stats.ageGroups.middle)} জন
                </span>
                <div className="w-full max-w-[50px] bg-slate-100 rounded-2xl h-36 flex items-end p-1">
                  <div
                    className="w-full bg-gradient-to-t from-emerald-400 to-teal-500 rounded-xl transition-all duration-700 shadow-sm"
                    style={{ height: `${Math.max(stats.agePercentages.middle, 8)}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-700 mt-2 text-center">৪১-৬০ বছর</span>
                <span className="text-[10px] text-slate-400">মধ্যবয়সী</span>
              </div>

              {/* Group 4: 60+ */}
              <div className="flex flex-col items-center h-full justify-end group">
                <span className="text-xs font-bold text-purple-600 mb-2 transition group-hover:scale-110">
                  {convertToBengaliNumbers(stats.ageGroups.senior)} জন
                </span>
                <div className="w-full max-w-[50px] bg-slate-100 rounded-2xl h-36 flex items-end p-1">
                  <div
                    className="w-full bg-gradient-to-t from-purple-500 to-indigo-500 rounded-xl transition-all duration-700 shadow-sm"
                    style={{ height: `${Math.max(stats.agePercentages.senior, 8)}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-700 mt-2 text-center">৬০+ বছর</span>
                <span className="text-[10px] text-slate-400">প্রবীণ নাগরিক</span>
              </div>
            </div>
          </div>

          {/* Bottom Row: Arc Gauges (Bottom left of user image) & Top Professions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Concentric Arc Gauges (Matches 12% & 15% pink concentric arcs in user image) */}
            <div className="soft-card p-5 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  আর্ক মিটার ও ব্যালেন্স
                </span>
                <span className="text-[11px] font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full">
                  রেসিও
                </span>
              </div>

              <div className="flex items-center justify-around py-3">
                {/* Arc 1: Senior Citizens */}
                <div className="flex flex-col items-center text-center">
                  <div className="relative w-24 h-16 flex items-end justify-center overflow-hidden">
                    <svg className="w-24 h-24" viewBox="0 0 100 100">
                      <path
                        d="M 15 65 A 35 35 0 0 1 85 65"
                        fill="none"
                        stroke="#FEE2E2"
                        strokeWidth="8"
                        strokeLinecap="round"
                      />
                      <path
                        d="M 15 65 A 35 35 0 0 1 85 65"
                        fill="none"
                        stroke="#F43F5E"
                        strokeWidth="8"
                        strokeDasharray="110"
                        strokeDashoffset={110 - (stats.agePercentages.senior / 100) * 110}
                        strokeLinecap="round"
                        className="transition-all duration-700"
                      />
                    </svg>
                  </div>
                  <span className="text-base font-extrabold text-slate-800 mt-1">
                    {convertToBengaliNumbers(stats.agePercentages.senior)}%
                  </span>
                  <span className="text-[11px] text-slate-500 font-semibold">প্রবীণ অনুপাত</span>
                </div>

                {/* Arc 2: Gender Parity / Parity balance */}
                <div className="flex flex-col items-center text-center">
                  <div className="relative w-24 h-16 flex items-end justify-center overflow-hidden">
                    <svg className="w-24 h-24" viewBox="0 0 100 100">
                      <path
                        d="M 15 65 A 35 35 0 0 1 85 65"
                        fill="none"
                        stroke="#E0E7FF"
                        strokeWidth="8"
                        strokeLinecap="round"
                      />
                      <path
                        d="M 15 65 A 35 35 0 0 1 85 65"
                        fill="none"
                        stroke="#6366F1"
                        strokeWidth="8"
                        strokeDasharray="110"
                        strokeDashoffset={110 - (stats.femalePercent / 100) * 110}
                        strokeLinecap="round"
                        className="transition-all duration-700"
                      />
                    </svg>
                  </div>
                  <span className="text-base font-extrabold text-slate-800 mt-1">
                    {convertToBengaliNumbers(stats.femalePercent)}%
                  </span>
                  <span className="text-[11px] text-slate-500 font-semibold">নারী অংশগ্রহণ</span>
                </div>
              </div>

              {/* Interactive Age Range Filter Slider (Matches the sliders in user image) */}
              <div className="mt-2 pt-3 border-t border-slate-100">
                <div className="flex justify-between items-center text-xs font-bold mb-2">
                  <span className="text-slate-600">বয়সের ফিল্টার পরিসর:</span>
                  <span className="text-indigo-600 font-mono">
                    {convertToBengaliNumbers(minAgeFilter)} - {convertToBengaliNumbers(maxAgeFilter)} বছর
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-400 font-bold">১৮</span>
                  <input
                    type="range"
                    min="18"
                    max="90"
                    value={maxAgeFilter}
                    onChange={(e) => setMaxAgeFilter(parseInt(e.target.value, 10))}
                    className="w-full accent-pink-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 font-bold">৯০+</span>
                </div>
              </div>
            </div>

            {/* Top Professions Breakdown List */}
            <div className="soft-card p-5 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    শীর্ষ পেশাসমূহ
                  </span>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    পেশা অ্যানালাইসিস
                  </span>
                </div>

                <div className="space-y-2.5">
                  {stats.topProfessions.map((prof, idx) => (
                    <div key={prof.name} className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                          {prof.name}
                        </span>
                        <span className="text-slate-500 font-mono">
                          {convertToBengaliNumbers(prof.count)} জন ({convertToBengaliNumbers(prof.percent)}%)
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            idx === 0
                              ? 'bg-pink-500'
                              : idx === 1
                              ? 'bg-indigo-500'
                              : idx === 2
                              ? 'bg-emerald-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.max(prof.percent, 3)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {stats.topProfessions.length === 0 && (
                    <div className="text-center text-xs text-slate-400 py-6">
                      কোনো পেশার তথ্য পাওয়া যায়নি
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => onNavigateSearch(selectedVillage === 'all' ? '' : selectedVillage)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer transition"
                >
                  বিস্তারিত ভোটার তালিকায় যান ➔
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
