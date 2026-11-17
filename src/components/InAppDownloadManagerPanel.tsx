import React from 'react';
import { ApkDownloadState } from '../types';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';
import { formatBytesBengali } from '../lib/appUpdateUtils';

interface InAppDownloadManagerPanelProps {
  downloadState: ApkDownloadState;
  versionName: string;
  isAndroidNative: boolean;
  canInstallPkgs: boolean;
  compact?: boolean;
  onStartDownload: () => void;
  onCancelDownload: () => void;
  onInstallDownloaded: () => void;
  onOpenInstallPermission: () => void;
}

export const InAppDownloadManagerPanel: React.FC<InAppDownloadManagerPanelProps> = ({
  downloadState,
  versionName,
  isAndroidNative,
  canInstallPkgs,
  compact = false,
  onStartDownload,
  onCancelDownload,
  onInstallDownloaded,
  onOpenInstallPermission,
}) => {
  const { status, downloadedBytes, totalBytes, percent, speedBps, errorMessage, fileName } =
    downloadState;

  const isDownloading = status === 'downloading';
  const isCompleted = status === 'completed';
  const isError = status === 'error';
  const isCancelled = status === 'cancelled';

  const displayPercent = isCompleted ? 100 : Math.max(0, Math.min(100, percent || 0));
  const displayFileName = fileName || `Union-Voter-App-v${versionName}.apk`;

  return (
    <div
      data-testid="inapp-download-manager"
      className={`rounded-2xl border ${
        compact
          ? 'bg-white/10 border-white/20 p-3 text-white'
          : 'bg-white border-slate-200 p-3.5 text-slate-800 shadow-xs'
      } space-y-2.5`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 ${
              isCompleted
                ? 'bg-emerald-500/20 text-emerald-500'
                : isError
                ? 'bg-red-500/20 text-red-500'
                : 'bg-indigo-500/15 text-indigo-500'
            }`}
          >
            {isDownloading ? '⬇️' : isCompleted ? '✅' : isError ? '⚠️' : '📦'}
          </span>
          <div className="min-w-0">
            <div
              className={`text-xs font-black truncate ${
                compact ? 'text-white' : 'text-slate-900'
              }`}
            >
              ইনবিল্ট ডাউনলোড ম্যানেজার
            </div>
            <div
              className={`text-[10px] font-medium truncate ${
                compact ? 'text-indigo-200' : 'text-slate-500'
              }`}
            >
              {displayFileName}
            </div>
          </div>
        </div>

        <span
          className={`text-[10px] font-black px-2 py-0.5 rounded-md shrink-0 ${
            isCompleted
              ? 'bg-emerald-500 text-white'
              : isDownloading
              ? 'bg-indigo-600 text-white'
              : isError
              ? 'bg-red-500 text-white'
              : compact
              ? 'bg-white/15 text-white'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          {isDownloading
            ? totalBytes > 0
              ? `${convertToBengaliNumbers(displayPercent)}%`
              : 'ডাউনলোড হচ্ছে'
            : isCompleted
            ? 'ডাউনলোড সম্পন্ন'
            : isError
            ? 'ব্যর্থ হয়েছে'
            : isCancelled
            ? 'বাতিল হয়েছে'
            : `v${convertToBengaliNumbers(versionName)}`}
        </span>
      </div>

      {/* Live Progress Bar & Stats when Downloading or Completed */}
      {(isDownloading || isCompleted) && (
        <div className="space-y-1.5">
          <div
            className={`w-full h-2.5 rounded-full overflow-hidden ${
              compact ? 'bg-white/15' : 'bg-slate-100'
            }`}
          >
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                isCompleted
                  ? 'bg-emerald-500'
                  : totalBytes > 0
                  ? 'bg-gradient-to-r from-indigo-500 to-emerald-400'
                  : 'bg-indigo-500 animate-pulse'
              }`}
              style={{ width: `${isDownloading && totalBytes <= 0 ? 60 : displayPercent}%` }}
            />
          </div>

          <div
            className={`flex items-center justify-between text-[11px] font-bold ${
              compact ? 'text-indigo-100' : 'text-slate-600'
            }`}
          >
            <span>
              {formatBytesBengali(downloadedBytes)}
              {totalBytes > 0 ? ` / ${formatBytesBengali(totalBytes)}` : ''}
            </span>
            <span>
              {isDownloading && speedBps > 0
                ? `${formatBytesBengali(speedBps)}/সেকেন্ড`
                : isCompleted
                ? 'ফোনে সংরক্ষিত ✓'
                : 'সংযোগ স্থাপন হচ্ছে...'}
            </span>
          </div>
        </div>
      )}

      {/* Error Box */}
      {isError && errorMessage && (
        <div
          className={`text-[11px] font-bold rounded-xl px-2.5 py-2 ${
            compact
              ? 'bg-red-500/20 border border-red-400/40 text-red-100'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {errorMessage}
        </div>
      )}

      {/* Unknown App Sources Warning if Android needs permission */}
      {isAndroidNative && !canInstallPkgs && isCompleted && (
        <div
          className={`text-[11px] font-bold rounded-xl px-2.5 py-2 flex items-center justify-between gap-2 ${
            compact
              ? 'bg-amber-500/20 border border-amber-400/40 text-amber-100'
              : 'bg-amber-50 border border-amber-200 text-amber-900'
          }`}
        >
          <span>ইন্সটল করতে &quot;Allow from this source&quot; চালু করুন।</span>
          <button
            type="button"
            onClick={onOpenInstallPermission}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-black shrink-0 cursor-pointer"
          >
            অনুমতি দিন
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {isDownloading ? (
          <button
            type="button"
            onClick={onCancelDownload}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-black cursor-pointer transition flex items-center justify-center gap-1.5 ${
              compact
                ? 'bg-red-500/25 hover:bg-red-500/40 text-white border border-red-400/40'
                : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
            }`}
          >
            <span>✕</span> ডাউনলোড বাতিল করুন
          </button>
        ) : isCompleted ? (
          <>
            <button
              type="button"
              onClick={onInstallDownloaded}
              className="flex-1 min-w-[170px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs sm:text-sm font-black shadow-lg shadow-emerald-500/25 cursor-pointer transition flex items-center justify-center gap-1.5"
            >
              <span>📲</span>
              <span>এখনই ইন্সটল করুন (Install)</span>
            </button>
            <button
              type="button"
              onClick={onStartDownload}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold cursor-pointer transition ${
                compact
                  ? 'bg-white/15 hover:bg-white/25 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
              title="পুনরায় ডাউনলোড করুন"
            >
              🔄 পুনরায়
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onStartDownload}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs sm:text-sm font-black shadow-lg shadow-emerald-500/25 cursor-pointer transition flex items-center justify-center gap-1.5"
          >
            <span>⬇️</span>
            <span>
              {isError
                ? 'আবার ডাউনলোড চেষ্টা করুন'
                : isCancelled
                ? 'পুনরায় ডাউনলোড শুরু করুন'
                : isAndroidNative
                ? 'অ্যাপের ভেতরেই ডাউনলোড ও ইন্সটল করুন'
                : 'ফোনে APK ডাউনলোড করুন'}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
