import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Voter, CandidateProfile } from '../types';
import {
  getActiveCandidate,
  saveCandidateProfile,
  printVoterSlips,
} from '../lib/voterSlipUtils';
import {
  isBluetoothSupported,
  getConnectedPrinter,
  connectBluetoothPrinter,
  disconnectBluetoothPrinter,
  canvasToEscPosBytes,
  sendEscPosToPrinter,
  BluetoothPrinterDevice,
} from '../lib/bluetoothPrinter';

interface VoterSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  voter?: Voter | null;
  allVillages?: Record<string, Voter[]>;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Draw crisp 384px wide ESC/POS monochrome thermal receipt
async function drawThermalSlipToCanvas(
  canvas: HTMLCanvasElement,
  voter: Voter,
  candidate: CandidateProfile
): Promise<void> {
  const width = 384;
  const height = 470;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Pure white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';

  // 1. Religious Header
  ctx.font = 'bold 13px "Noto Sans Bengali", sans-serif';
  ctx.fillText(candidate.religiousHeader || 'বিসমিল্লাহির রাহমানির রাহিম', width / 2, 22);

  // 2. Election title & subtitle
  ctx.font = 'bold 14px "Noto Sans Bengali", sans-serif';
  ctx.fillText(candidate.electionTitle || 'আসন্ন ইউনিয়ন পরিষদ নির্বাচনে', width / 2, 42);

  ctx.font = '11px "Noto Sans Bengali", sans-serif';
  ctx.fillText(candidate.electionSubtitle || 'সততা ও নিষ্ঠার সাথে গণমানুষের প্রিয় মেম্বার প্রার্থী', width / 2, 58);

  // 3. Dashed line
  ctx.font = '10px monospace';
  ctx.fillText('----------------------------------------------------', width / 2, 72);

  // Load photos in parallel
  const [candImg, symbolImg] = await Promise.all([
    loadImage(candidate.candidatePhotoUrl || './candidate-default.jpg'),
    loadImage(candidate.symbolPhotoUrl || './symbol-default.png'),
  ]);

  // 4. CANDIDATE & SYMBOL HEADER
  // Left: Symbol
  if (symbolImg) {
    ctx.drawImage(symbolImg, 14, 80, 66, 60);
  }
  ctx.textAlign = 'center';
  ctx.font = 'bold 11px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`মার্কা: ${candidate.symbolName || 'তালা'}`, 47, 154);
  ctx.font = 'bold 9px "Noto Sans Bengali", sans-serif';
  ctx.strokeRect(16, 160, 62, 16);
  ctx.fillText(candidate.symbolCallout || 'তালা মার্কায় ভোট দিন', 47, 172);

  // Right: Candidate Photo
  ctx.strokeRect(300, 78, 70, 84);
  if (candImg) {
    ctx.drawImage(candImg, 302, 80, 66, 80);
  }
  ctx.font = 'bold 10px "Noto Sans Bengali", sans-serif';
  ctx.fillText('প্রার্থী', 335, 176);

  // Center: Candidate Details
  ctx.font = 'bold 10px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`[ ${candidate.candidateBadge || 'মেম্বার প্রার্থী'} ]`, 190, 96);

  ctx.font = '900 17px "Noto Sans Bengali", sans-serif';
  ctx.fillText(candidate.candidateName + '-কে', 190, 124);

  ctx.font = 'bold 12px "Noto Sans Bengali", sans-serif';
  ctx.fillText(candidate.postTitle || 'মেম্বার পদপ্রার্থী', 190, 146);

  // Separator
  ctx.font = '10px monospace';
  ctx.fillText('====================================================', width / 2, 192);

  // 5. Polling Center & Ward
  ctx.textAlign = 'left';
  ctx.font = 'bold 12.5px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`ভোট কেন্দ্র: ${candidate.pollingCenter || 'দারুল কোরআন সিনিয়র মাদ্রাসা'}`, 16, 214);
  ctx.fillText(
    `এলাকা: ${voter.villageName || candidate.voterArea || 'পাঠামারা'}  |  ওয়ার্ড নং: ${candidate.wardNo || '০৭'}`,
    16,
    234
  );

  ctx.textAlign = 'center';
  ctx.font = '10px monospace';
  ctx.fillText('----------------------------------------------------', width / 2, 250);

  // 6. Voter Information
  ctx.textAlign = 'left';
  ctx.font = '900 16px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`${voter.serialNo || '-'}. ${voter.name || '-'}`, 16, 274);

  ctx.font = 'bold 13px monospace, "Noto Sans Bengali", sans-serif';
  ctx.fillText(`ভোটার আইডি: ${voter.voterId || '-'}`, 16, 298);

  ctx.font = '12px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`পিতা: ${voter.fatherName || '-'}`, 16, 318);
  ctx.fillText(`মাতা: ${voter.motherName || '-'}`, 16, 338);

  const extraLine = [
    voter.dob ? `জন্ম: ${voter.dob}` : '',
    voter.gender ? `লিঙ্গ: ${voter.gender}` : '',
  ]
    .filter(Boolean)
    .join('  |  ');
  if (extraLine) {
    ctx.fillText(extraLine, 16, 358);
  }

  // 7. QR Code (Right side)
  try {
    const qrData = `VOTER:${voter.serialNo || ''}|ID:${voter.voterId || ''}|NAME:${voter.name || ''}|AREA:${voter.villageName || candidate.voterArea}|CENTER:${candidate.pollingCenter}`;
    const qrDataUrl = await QRCode.toDataURL(qrData, {
      width: 90,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    const qrImg = await loadImage(qrDataUrl);
    if (qrImg) {
      ctx.drawImage(qrImg, width - 105, 270, 90, 90);
    }
  } catch (e) {
    console.warn('QR draw error:', e);
  }

  // Footer
  ctx.textAlign = 'center';
  ctx.font = '10px monospace';
  ctx.fillText('----------------------------------------------------', width / 2, 385);
  ctx.font = 'bold 12px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`আপনার মূল্যবান ভোট দিয়ে জয়যুক্ত করুন`, width / 2, 405);
  ctx.font = '10px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`মুদ্রণ সময়: ${new Date().toLocaleTimeString('bn-BD')}`, width / 2, 425);
  ctx.fillText('====================================================', width / 2, 442);
}

export const VoterSlipModal: React.FC<VoterSlipModalProps> = ({
  isOpen,
  onClose,
  voter,
  allVillages = {},
}) => {
  // Candidate Profile (Maulana Md. Ismail as default)
  const [candidate, setCandidate] = useState<CandidateProfile>(getActiveCandidate());
  const [isEditingCandidate, setIsEditingCandidate] = useState(false);

  // Active Voter Data (defaults to selected voter or first village voter)
  const [voterData, setVoterData] = useState<Voter>(() => {
    if (voter) return voter;
    const firstVillage = Object.keys(allVillages)[0];
    if (firstVillage && allVillages[firstVillage]?.[0]) {
      return allVillages[firstVillage][0];
    }
    return {
      serialNo: '১',
      name: 'মোঃ আব্দুল করিম',
      voterId: '১৯৭৫২৬৯২০৩০০০০০০১',
      fatherName: 'মরহুম মোঃ রমজান আলী',
      motherName: 'মোছাঃ ফাতেমা খাতুন',
      dob: '০১/০১/১৯৭৫',
      gender: 'পুরুষ',
      villageName: 'পাঠামারা',
      profession: 'কৃষি',
    };
  });

  // Selected Village for Quick Voter Switching
  const villageList = Object.keys(allVillages);
  const [selectedVillage, setSelectedVillage] = useState<string>(
    voter?.villageName || (villageList.includes('পাঠামারা') ? 'পাঠামারা' : villageList[0] || '')
  );

  // Bluetooth State
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothPrinterDevice | null>(getConnectedPrinter());
  const [isConnectingBt, setIsConnectingBt] = useState(false);
  const [isPrintingBt, setIsPrintingBt] = useState(false);
  const [btProgress, setBtProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync voter when prop changes
  useEffect(() => {
    if (voter) {
      setVoterData(voter);
      if (voter.villageName) setSelectedVillage(voter.villageName);
    }
  }, [voter]);

  // Generate QR Code data URL
  useEffect(() => {
    const qrData = `VOTER:${voterData.serialNo || ''}|ID:${voterData.voterId || ''}|NAME:${voterData.name || ''}|AREA:${voterData.villageName || candidate.voterArea}|CENTER:${candidate.pollingCenter}`;
    QRCode.toDataURL(qrData, { width: 100, margin: 1 })
      .then(setQrCodeDataUrl)
      .catch(() => {});
  }, [voterData, candidate]);

  // Notice notification
  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  // Switch to next/previous voter in village list
  const handleVoterNavigate = (direction: 'prev' | 'next') => {
    const list = allVillages[selectedVillage] || [];
    if (list.length === 0) return;
    const currentIndex = list.findIndex(
      (v) => String(v.serialNo) === String(voterData.serialNo) || v.voterId === voterData.voterId
    );
    let nextIndex = 0;
    if (currentIndex !== -1) {
      nextIndex = direction === 'next' ? (currentIndex + 1) % list.length : (currentIndex - 1 + list.length) % list.length;
    }
    setVoterData(list[nextIndex]);
  };

  // Candidate photo upload
  const handleCandidatePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const updated = { ...candidate, candidatePhotoUrl: event.target!.result as string };
          setCandidate(updated);
          saveCandidateProfile(updated);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Symbol photo upload
  const handleSymbolPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const updated = { ...candidate, symbolPhotoUrl: event.target!.result as string };
          setCandidate(updated);
          saveCandidateProfile(updated);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Connect to Bluetooth POS Printer
  const handleConnectBluetooth = async () => {
    setIsConnectingBt(true);
    try {
      const dev = await connectBluetoothPrinter();
      setBluetoothDevice(dev);
      showNotice(`✅ "${dev.name}" এর সাথে সফলভাবে কানেক্ট হয়েছে!`);
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        showNotice(`⚠️ কানেক্ট ব্যর্থ: ${err.message || 'প্রিন্টারের ব্লুটুথ অন রাখুন'}`);
      }
    } finally {
      setIsConnectingBt(false);
    }
  };

  // Disconnect Bluetooth
  const handleDisconnectBluetooth = async () => {
    await disconnectBluetoothPrinter();
    setBluetoothDevice(null);
    showNotice('ব্লুটুথ প্রিন্টার ডিসকানেক্ট করা হয়েছে।');
  };

  // Direct Bluetooth ESC/POS Print
  const handlePrintBluetooth = async () => {
    setIsPrintingBt(true);
    setBtProgress(0);
    try {
      let printer = bluetoothDevice || getConnectedPrinter();
      if (!printer) {
        showNotice('ডিভাইস খুঁজছি... আপনার ব্লুটুথ প্রিন্টারটি সিলেক্ট করুন');
        printer = await connectBluetoothPrinter();
        setBluetoothDevice(printer);
      }

      const canvas = canvasRef.current || document.createElement('canvas');
      await drawThermalSlipToCanvas(canvas, voterData, candidate);
      const escPosBytes = canvasToEscPosBytes(canvas);

      showNotice(`"${printer.name}"-এ পাঠানো হচ্ছে...`);
      await sendEscPosToPrinter(printer.characteristic, escPosBytes, (percent) => {
        setBtProgress(percent);
      });

      showNotice('🎉 থার্মাল প্রিন্টারে ভোটার স্লিপ সফলভাবে প্রিন্ট হয়েছে!');
    } catch (err: any) {
      console.warn('Bluetooth print error:', err);
      if (err.name !== 'NotFoundError') {
        showNotice(`⚠️ প্রিন্ট ত্রুটি: ${err.message || 'প্রিন্টারটি রিস্টার্ট দিয়ে আবার চেষ্টা করুন'}`);
      }
    } finally {
      setIsPrintingBt(false);
    }
  };

  // Standard Web/System Print
  const handleStandardPrint = () => {
    printVoterSlips([voterData], candidate, 'thermal58', 'bw');
  };

  // Download Slip PNG Image
  const handleDownloadImage = async () => {
    const canvas = canvasRef.current || document.createElement('canvas');
    await drawThermalSlipToCanvas(canvas, voterData, candidate);
    const link = document.createElement('a');
    link.download = `voter_slip_${voterData.serialNo || 'pos'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showNotice('✅ স্লিপ ইমেজ ডাউনলোড হয়েছে!');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Hidden canvas used for high precision ESC/POS raster generation */}
      <canvas ref={canvasRef} className="hidden" />

      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] animate-slide-down">
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-4 py-3 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🗳️</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base leading-tight">
                  নির্বাচনী ভোটার স্লিপ ও ব্লুটুথ প্রিন্টার
                </h3>
                <span className="text-[11px] bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full font-bold">
                  {candidate.name} ({candidate.symbolName || 'তালা'})
                </span>
                {bluetoothDevice ? (
                  <span className="text-[11px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    BT: {bluetoothDevice.name}
                  </span>
                ) : (
                  <span className="text-[11px] bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded-full">
                    ব্লুটুথ সংযোগ নেই
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300">
                এক ক্লিকেই মোবাইল থেকে সরাসরি ব্লুটুথ থার্মাল প্রিন্টারে (৫৮মিমি) ভোটার স্লিপ প্রিন্ট করুন
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm cursor-pointer transition"
            title="বন্ধ করুন"
          >
            ✕
          </button>
        </div>

        {/* Notice Banner */}
        {notice && (
          <div className="bg-indigo-600 text-white text-xs font-bold py-2 px-4 text-center animate-slide-down shadow-inner">
            {notice}
          </div>
        )}

        {/* Unified 2-Column Main Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 bg-slate-50">
          {/* Left Column: Candidate Profile & Voter Navigator (7 Cols) */}
          <div className="md:col-span-7 space-y-4">
            {/* Candidate Card */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 relative overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <img
                      src={candidate.candidatePhotoUrl || './candidate-default.jpg'}
                      alt={candidate.name}
                      className="w-16 h-20 object-cover rounded-xl border-2 border-indigo-500 shadow-md bg-slate-100"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = './candidate-default.jpg';
                      }}
                    />
                    <span className="absolute -bottom-1.5 -right-1.5 bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-xs">
                      প্রার্থী
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md inline-block">
                      {candidate.candidateBadge || 'মেম্বার প্রার্থী'}
                    </span>
                    <h4 className="text-base font-extrabold text-slate-900 mt-0.5 leading-snug">
                      {candidate.name}
                    </h4>
                    <p className="text-xs font-bold text-emerald-700 mt-0.5">
                      মার্কা: {candidate.symbolName || 'তালা'} ({candidate.symbolCallout || 'তালা মার্কায় ভোট দিন'})
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      কেন্দ্র: {candidate.pollingCenter} | ওয়ার্ড: {candidate.wardNo}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsEditingCandidate(!isEditingCandidate)}
                  className="soft-btn px-2.5 py-1.5 text-xs text-indigo-700 font-bold flex items-center gap-1 cursor-pointer shrink-0"
                  title="প্রার্থীর তথ্য পরিবর্তন করুন"
                >
                  <span>✏️</span> {isEditingCandidate ? 'সংক্ষেপ' : 'এডিট'}
                </button>
              </div>

              {/* Expandable Candidate Editor */}
              {isEditingCandidate && (
                <div className="mt-4 pt-3 border-t border-slate-200 space-y-2.5 text-xs animate-slide-down">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-600 font-semibold mb-0.5">প্রার্থীর নাম</label>
                      <input
                        type="text"
                        value={candidate.name}
                        onChange={(e) => {
                          const updated = { ...candidate, name: e.target.value, candidateName: e.target.value };
                          setCandidate(updated);
                          saveCandidateProfile(updated);
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-semibold mb-0.5">পদবী</label>
                      <input
                        type="text"
                        value={candidate.postTitle}
                        onChange={(e) => {
                          const updated = { ...candidate, postTitle: e.target.value };
                          setCandidate(updated);
                          saveCandidateProfile(updated);
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-600 font-semibold mb-0.5">ভোট কেন্দ্র</label>
                      <input
                        type="text"
                        value={candidate.pollingCenter}
                        onChange={(e) => {
                          const updated = { ...candidate, pollingCenter: e.target.value };
                          setCandidate(updated);
                          saveCandidateProfile(updated);
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-semibold mb-0.5">ওয়ার্ড নং</label>
                      <input
                        type="text"
                        value={candidate.wardNo}
                        onChange={(e) => {
                          const updated = { ...candidate, wardNo: e.target.value };
                          setCandidate(updated);
                          saveCandidateProfile(updated);
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-600 font-semibold mb-0.5">মার্কার নাম</label>
                      <input
                        type="text"
                        value={candidate.symbolName}
                        onChange={(e) => {
                          const updated = { ...candidate, symbolName: e.target.value };
                          setCandidate(updated);
                          saveCandidateProfile(updated);
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-semibold mb-0.5">ছবি পরিবর্তন</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleCandidatePhotoUpload}
                        className="w-full text-[11px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[11px] file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Voter Data Card & Fast Selector */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <span>👤</span> ভোটারের তথ্য ও দ্রুত অনুসন্ধান
                </h4>

                {/* Village Picker */}
                {villageList.length > 0 && (
                  <select
                    value={selectedVillage}
                    onChange={(e) => {
                      const vName = e.target.value;
                      setSelectedVillage(vName);
                      if (allVillages[vName]?.[0]) {
                        setVoterData(allVillages[vName][0]);
                      }
                    }}
                    className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg outline-none cursor-pointer"
                  >
                    {villageList.map((v) => (
                      <option key={v} value={v}>
                        গ্রাম: {v}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Prev / Next Quick Navigators */}
              <div className="flex items-center justify-between gap-2 mb-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => handleVoterNavigate('prev')}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 shadow-2xs transition cursor-pointer flex items-center gap-1"
                >
                  <span>◀</span> আগের ভোটার
                </button>

                <span className="text-xs font-extrabold text-slate-800">
                  ক্রমিক: <span className="text-indigo-600 text-sm">{voterData.serialNo || '-'}</span>
                </span>

                <button
                  type="button"
                  onClick={() => handleVoterNavigate('next')}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 shadow-2xs transition cursor-pointer flex items-center gap-1"
                >
                  পরের ভোটার <span>▶</span>
                </button>
              </div>

              {/* Editable Voter Fields */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="block text-slate-600 font-semibold mb-0.5">ভোটারের নাম</label>
                  <input
                    type="text"
                    value={voterData.name}
                    onChange={(e) => setVoterData({ ...voterData, name: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-800 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-0.5">ভোটার আইডি / নম্বর</label>
                  <input
                    type="text"
                    value={voterData.voterId}
                    onChange={(e) => setVoterData({ ...voterData, voterId: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-0.5">পিতার নাম</label>
                  <input
                    type="text"
                    value={voterData.fatherName || ''}
                    onChange={(e) => setVoterData({ ...voterData, fatherName: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-700 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-0.5">মাতার নাম</label>
                  <input
                    type="text"
                    value={voterData.motherName || ''}
                    onChange={(e) => setVoterData({ ...voterData, motherName: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-700 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-0.5">ভোটার এলাকা / গ্রাম</label>
                  <input
                    type="text"
                    value={voterData.villageName || ''}
                    onChange={(e) => setVoterData({ ...voterData, villageName: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-700 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-0.5">ক্রমিক নং</label>
                  <input
                    type="text"
                    value={voterData.serialNo || ''}
                    onChange={(e) => setVoterData({ ...voterData, serialNo: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold text-indigo-700 focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Thermal Slip Preview & Action Controls (5 Cols) */}
          <div className="md:col-span-5 flex flex-col items-center">
            {/* Thermal Receipt Paper Card */}
            <div className="w-full max-w-[320px] bg-white rounded-xl shadow-xl border-2 border-slate-300 p-4 text-slate-900 font-sans select-none relative mb-4">
              {/* Top Receipt Jagged Notch styling */}
              <div className="text-center pb-2 border-b border-dashed border-slate-400 mb-2.5">
                <h5 className="font-bold text-xs text-slate-800 leading-tight">
                  {candidate.religiousHeader || 'বিসমিল্লাহির রাহমানির রাহিম'}
                </h5>
                <h4 className="font-extrabold text-sm text-indigo-950 mt-0.5">
                  {candidate.electionTitle || 'আসন্ন ইউনিয়ন পরিষদ নির্বাচনে'}
                </h4>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {candidate.electionSubtitle || 'সততা ও নিষ্ঠার সাথে গণমানুষের প্রিয় মেম্বার প্রার্থী'}
                </p>
              </div>

              {/* Candidate & Symbol 3-Column Header */}
              <div className="flex items-center justify-between gap-1.5 pb-2.5 border-b-2 border-slate-800 mb-2.5">
                {/* Symbol Box */}
                <div className="text-center w-16 shrink-0">
                  <img
                    src={candidate.symbolPhotoUrl || './symbol-default.png'}
                    alt="মার্কা"
                    className="w-12 h-12 object-contain mx-auto"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = './symbol-default.png';
                    }}
                  />
                  <span className="text-[10px] font-bold block text-slate-800 mt-0.5">
                    মার্কা: {candidate.symbolName || 'তালা'}
                  </span>
                  <span className="text-[8px] font-bold border border-slate-800 px-1 py-0.2 rounded-xs block mt-0.5">
                    {candidate.symbolCallout || 'ভোট দিন'}
                  </span>
                </div>

                {/* Candidate Name Center */}
                <div className="text-center flex-1">
                  <span className="text-[9px] font-extrabold text-slate-700 block">
                    [ {candidate.candidateBadge || 'মেম্বার প্রার্থী'} ]
                  </span>
                  <h4 className="text-sm font-black text-slate-950 mt-0.5 leading-tight">
                    {candidate.name}-কে
                  </h4>
                  <span className="text-[10px] font-bold text-indigo-900 block mt-0.5">
                    {candidate.postTitle || 'মেম্বার পদপ্রার্থী'}
                  </span>
                </div>

                {/* Candidate Photo Box */}
                <div className="text-center w-16 shrink-0">
                  <img
                    src={candidate.candidatePhotoUrl || './candidate-default.jpg'}
                    alt="প্রার্থী"
                    className="w-13 h-16 object-cover mx-auto rounded border border-slate-800 shadow-2xs bg-slate-100"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = './candidate-default.jpg';
                    }}
                  />
                  <span className="text-[9px] font-bold block text-slate-800 mt-0.5">প্রার্থী</span>
                </div>
              </div>

              {/* Polling Center & Ward */}
              <div className="text-[11px] font-bold pb-2 border-b border-dashed border-slate-400 space-y-0.5">
                <div>
                  কেন্দ্র: <span className="text-slate-950">{candidate.pollingCenter}</span>
                </div>
                <div className="flex justify-between">
                  <span>এলাকা: {voterData.villageName || candidate.voterArea}</span>
                  <span>ওয়ার্ড: {candidate.wardNo}</span>
                </div>
              </div>

              {/* Voter Info Box */}
              <div className="pt-2.5 pb-2 text-left relative min-h-[105px]">
                <div className="pr-20">
                  <div className="text-sm font-black text-slate-950 leading-tight">
                    {voterData.serialNo || '-'}. {voterData.name}
                  </div>
                  <div className="text-[11px] font-mono font-bold text-slate-800 mt-1">
                    ভোটার আইডি: {voterData.voterId || '-'}
                  </div>
                  <div className="text-[10px] text-slate-700 mt-1">পিতা: {voterData.fatherName || '-'}</div>
                  <div className="text-[10px] text-slate-700">মাতা: {voterData.motherName || '-'}</div>
                  {voterData.dob && (
                    <div className="text-[10px] text-slate-600">জন্ম তারিখ: {voterData.dob}</div>
                  )}
                </div>

                {/* QR Code */}
                {qrCodeDataUrl && (
                  <div className="absolute right-0 top-2.5 text-center">
                    <img src={qrCodeDataUrl} alt="QR" className="w-18 h-18 border border-slate-300 p-0.5 rounded" />
                    <span className="text-[8px] text-slate-500 font-mono block">QR SLIP</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="text-center pt-2 border-t border-dashed border-slate-400">
                <span className="text-[11px] font-bold text-slate-900 block">
                  আপনার মূল্যবান ভোট দিয়ে জয়যুক্ত করুন
                </span>
                <span className="text-[9px] text-slate-500 font-mono mt-0.5 block">
                  POS 58mm Thermal Print
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Unified Bottom Action Bar (One place to do everything!) */}
        <div className="bg-white border-t border-slate-200 px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 shadow-lg">
          {/* Bluetooth Connection Controls */}
          <div className="flex items-center gap-2">
            {bluetoothDevice ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {bluetoothDevice.name}
                </span>
                <button
                  type="button"
                  onClick={handleDisconnectBluetooth}
                  className="text-xs text-red-600 hover:text-red-700 hover:underline font-bold cursor-pointer"
                >
                  ডিসকানেক্ট
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectBluetooth}
                disabled={isConnectingBt}
                className="soft-btn px-3 py-2 text-indigo-700 hover:bg-indigo-50 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <span>📶</span> {isConnectingBt ? 'খুঁজছি...' : 'ব্লুটুথ কানেক্ট করুন'}
              </button>
            )}
          </div>

          {/* Primary Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 1. Direct ESC/POS Bluetooth Thermal Print (The ultimate star feature) */}
            <button
              type="button"
              onClick={handlePrintBluetooth}
              disabled={isPrintingBt}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs sm:text-sm shadow-md hover:shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer transition active:scale-98"
            >
              <span>⚡</span>
              <span>{isPrintingBt ? `প্রিন্ট হচ্ছে ${btProgress}%...` : 'ব্লুটুথ থার্মাল প্রিন্ট'}</span>
            </button>

            {/* 2. Standard Print / PDF */}
            <button
              type="button"
              onClick={handleStandardPrint}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm shadow-md hover:shadow-lg shadow-indigo-600/25 flex items-center gap-1.5 cursor-pointer transition"
            >
              <span>🖨️</span> সাধারণ প্রিন্ট / PDF
            </button>

            {/* 3. Download Slip Image */}
            <button
              type="button"
              onClick={handleDownloadImage}
              className="soft-btn text-slate-700 hover:text-slate-900 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
              title="গ্যালারিতে ইমেজ হিসেবে সেভ করুন"
            >
              <span>💾</span> ছবি ডাউনলোড
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
