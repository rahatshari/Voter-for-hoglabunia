import React from 'react';
import { Voter } from '../types';
import { calculateAge, isMigrated } from '../lib/bengaliUtils';

interface VoterCardProps {
  voter: Voter;
  onCopy: (voter: Voter) => void;
  onPrint: (voter: Voter) => void;
}

export const VoterCard: React.FC<VoterCardProps> = ({ voter, onCopy, onPrint }) => {
  const isMig = isMigrated(voter);
  const calculatedAge = voter._age || calculateAge(voter.dob);
  const displayName = voter.name || (isMig ? 'মাইগ্রেট হয়েছে' : '-');

  return (
    <div
      className={`border rounded-xl p-4 shadow-xs transition hover:shadow-md relative overflow-hidden ${
        isMig ? 'border-red-300 bg-red-50/60' : 'border-slate-200 bg-white'
      }`}
    >
      {/* Header */}
      <div className="flex justify-between items-start border-b border-dashed border-slate-200 pb-2.5 mb-2.5 flex-wrap gap-2">
        <div className="flex flex-col gap-1">
          <span
            className={`font-bold text-base ${
              isMig ? 'text-red-600 line-through' : 'text-indigo-600'
            }`}
          >
            {displayName}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
              {voter.gender || '-'}
            </span>
            {isMig && (
              <span className="text-[11px] bg-red-100 text-red-700 border border-red-200 px-2.5 py-0.5 rounded-full font-bold">
                🚫 {voter.name || 'স্থানান্তরিত/কর্তিত'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {voter.villageName && (
            <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded-md font-bold">
              📍 {voter.villageName}
            </span>
          )}
          <span className="text-xs bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-md font-bold">
            ক্রমিক: {voter.serialNo || '-'}
          </span>
        </div>
      </div>

      {/* Details Rows */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500 font-semibold w-[35%]">পিতার নাম:</span>
          <span className="text-slate-800 font-medium w-[65%]">{voter.fatherName || '-'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 font-semibold w-[35%]">মাতার নাম:</span>
          <span className="text-slate-800 font-medium w-[65%]">{voter.motherName || '-'}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500 font-semibold w-[35%]">জন্ম তারিখ:</span>
          <span className="text-slate-800 font-medium w-[65%] flex items-center gap-1.5 flex-wrap">
            <span>{voter.dob || '-'}</span>
            {calculatedAge && (
              <span className="text-indigo-700 font-bold bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded text-xs">
                {calculatedAge}
              </span>
            )}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 font-semibold w-[35%]">পেশা:</span>
          <span className="text-slate-800 font-medium w-[65%]">{voter.profession || '-'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 font-semibold w-[35%]">ভোটার নং:</span>
          <span className="text-red-600 font-bold tracking-wider w-[65%]">
            {voter.voterId || '-'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 font-semibold w-[35%]">ঠিকানা:</span>
          <span className="text-slate-800 font-medium w-[65%]">{voter.address || '-'}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 mt-3 pt-2.5 border-t border-slate-100">
        <button
          type="button"
          onClick={() => onCopy(voter)}
          className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-1 shadow-xs"
        >
          📋 কপি
        </button>
        <button
          type="button"
          onClick={() => onPrint(voter)}
          className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-1 shadow-xs"
          title="নির্বাচনী ভোটার স্লিপ প্রস্তুত ও প্রিন্ট"
        >
          🗳️ ভোটার স্লিপ
        </button>
      </div>
    </div>
  );
};
