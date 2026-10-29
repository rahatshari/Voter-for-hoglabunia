import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Voter, CandidateProfile } from '../types';
import {
  getAllCandidates,
  getActiveCandidate,
  setActiveCandidateId,
  saveCandidateProfile,
  deleteCandidateProfile,
  generateVoterQrCode,
  printVoterSlips,
  PrintLayoutMode,
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

async function drawThermalSlipToCanvas(
  canvas: HTMLCanvasElement,
  voter: Voter,
  candidate: CandidateProfile
): Promise<void> {
  const width = 384;
  const height = 455;
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
  ctx.fillText(candidate.religiousHeader || 'আল্লাহ সর্বশক্তিমান', width / 2, 22);

  // 2. Election title & subtitle
  ctx.font = 'bold 14px "Noto Sans Bengali", sans-serif';
  ctx.fillText(candidate.electionTitle, width / 2, 42);

  ctx.font = '11px "Noto Sans Bengali", sans-serif';
  ctx.fillText(candidate.electionSubtitle, width / 2, 58);

  // 3. Dashed line
  ctx.font = '10px monospace';
  ctx.fillText('----------------------------------------------------', width / 2, 72);

  // Load photos in parallel
  const [candImg, symbolImg] = await Promise.all([
    loadImage(candidate.candidatePhotoUrl || '/candidate-default.jpg'),
    loadImage(candidate.symbolPhotoUrl || '/symbol-default.png'),
  ]);

  // 4. CANDIDATE & SYMBOL 3-COLUMN HEADER
  // Left: Symbol
  if (symbolImg) {
    ctx.drawImage(symbolImg, 14, 80, 66, 60);
  }
  ctx.textAlign = 'center';
  ctx.font = 'bold 11px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`মার্কা: ${candidate.symbolName}`, 47, 154);
  ctx.font = 'bold 9px "Noto Sans Bengali", sans-serif';
  ctx.strokeRect(16, 160, 62, 16);
  ctx.fillText(candidate.symbolCallout || 'ভোট দিন', 47, 172);

  // Right: Candidate Photo
  ctx.strokeRect(300, 78, 70, 84);
  if (candImg) {
    ctx.drawImage(candImg, 302, 80, 66, 80);
  }
  ctx.font = 'bold 10px "Noto Sans Bengali", sans-serif';
  ctx.fillText('প্রার্থী', 335, 176);

  // Center: Candidate Details
  ctx.font = 'bold 10px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`[ ${candidate.candidateBadge || 'স্বতন্ত্র প্রার্থী'} ]`, 190, 96);

  ctx.font = '900 17px "Noto Sans Bengali", sans-serif';
  ctx.fillText(candidate.candidateName + '-কে', 190, 124);

  ctx.font = 'bold 12px "Noto Sans Bengali", sans-serif';
  ctx.fillText(candidate.postTitle || 'চেয়ারম্যান পদপ্রার্থী', 190, 146);

  // Separator
  ctx.font = '10px monospace';
  ctx.fillText('====================================================', width / 2, 192);

  // 5. Polling Center & Ward
  ctx.textAlign = 'left';
  ctx.font = 'bold 12.5px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`ভোট কেন্দ্র: ${candidate.pollingCenter}`, 16, 214);
  ctx.fillText(
    `এলাকা: ${voter.villageName || candidate.voterArea}  |  ওয়ার্ড নং: ${candidate.wardNo}`,
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

  ctx.font = '12.5px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`পিতা: ${voter.fatherName || '-'}`, 16, 320);
  ctx.fillText(`মাতা: ${voter.motherName || '-'}`, 16, 342);
  ctx.fillText(`পেশা: ${voter.profession || '-'}  |  জন্ম: ${voter.dob || '-'}`, 16, 364);
  ctx.fillText(`ঠিকানা: ${voter.address || voter.villageName || '-'}`, 16, 386);

  ctx.textAlign = 'center';
  ctx.font = '10px monospace';
  ctx.fillText('====================================================', width / 2, 404);

  ctx.font = 'bold 11.5px "Noto Sans Bengali", sans-serif';
  ctx.fillText('ভোট আপনার নাগরিক অধিকার ও পবিত্র আমানত', width / 2, 423);

  ctx.font = '10px monospace';
  ctx.fillText('- - - - - - - - - - [ টিয়ার কাট ] - - - - - - - - - -', width / 2, 442);
}

export const VoterSlipModal: React.FC<VoterSlipModalProps> = ({
  isOpen,
  onClose,
  voter: initialVoter,
}) => {
  // Candidate profiles list & active candidate
  const [candidates, setCandidates] = useState<CandidateProfile[]>(getAllCandidates());
  const [activeCandidate, setActiveCandidate] = useState<CandidateProfile>(getActiveCandidate());
  const [editingCandidate, setEditingCandidate] = useState<CandidateProfile>(getActiveCandidate());
  const [isAddingNewCandidate, setIsAddingNewCandidate] = useState(false);

  // Bluetooth Printer states
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothPrinterDevice | null>(getConnectedPrinter());
  const [isConnectingBt, setIsConnectingBt] = useState(false);
  const [isPrintingBt, setIsPrintingBt] = useState(false);
  const [btProgress, setBtProgress] = useState(0);
  const [btError, setBtError] = useState<string | null>(null);

  // Modal navigation & display
  const [activeTab, setActiveTab] = useState<'preview' | 'thermal' | 'candidates' | 'voter'>('thermal');
  const [printMode, setPrintMode] = useState<PrintLayoutMode>('thermal58');
  const [colorMode, setColorMode] = useState<'color' | 'bw'>('bw');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);


  // Editable voter data
  const [voterData, setVoterData] = useState<Voter>({
    serialNo: '০০১',
    name: 'মোঃ আফছার উদ্দিন খান',
    voterId: '৫৬১২৭৮০১৯৪৩৩',
    fatherName: 'কামাল খান',
    motherName: 'আমেনা বেগম',
    profession: 'কৃষক',
    dob: '১৯/০৮/১৯৪৮',
    address: 'ছোট ধুতুরা বাড়ী, শিবালয়, মানিকগঞ্জ',
    villageName: 'পূর্ব কালিঞ্জুরী',
  });

  const candidateFileInputRef = useRef<HTMLInputElement | null>(null);
  const symbolFileInputRef = useRef<HTMLInputElement | null>(null);

  // Update initial voter
  useEffect(() => {
    if (initialVoter) {
      setVoterData({
        serialNo: initialVoter.serialNo || '০০১',
        name: initialVoter.name || '',
        voterId: initialVoter.voterId || '',
        fatherName: initialVoter.fatherName || '',
        motherName: initialVoter.motherName || '',
        profession: initialVoter.profession || '',
        dob: initialVoter.dob || '',
        address: initialVoter.address || initialVoter.villageName || '',
        villageName: initialVoter.villageName || activeCandidate.voterArea || '',
      });
    }
  }, [initialVoter, activeCandidate.voterArea]);


  if (!isOpen) return null;

  const showNotice = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(null), 3500);
  };

  // Switch active candidate
  const handleSelectCandidate = (cand: CandidateProfile) => {
    setActiveCandidate(cand);
    setEditingCandidate(cand);
    setActiveCandidateId(cand.id);
    setIsAddingNewCandidate(false);
    showNotice(`সক্রিয় প্রার্থী হিসেবে "${cand.name}" নির্বাচিত হয়েছে!`);
  };

  // Start adding new candidate
  const handleStartAddNewCandidate = () => {
    const newCand: CandidateProfile = {
      id: 'cand_' + Date.now(),
      name: '',
      postTitle: 'চেয়ারম্যান পদপ্রার্থী',
      religiousHeader: 'আল্লাহ সর্বশক্তিমান',
      electionTitle: 'আসন্ন ইউনিয়ন পরিষদ নির্বাচনে',
      electionSubtitle: 'শান্তির পক্ষে-উন্নয়নের লক্ষ্যে চেয়ারম্যান পদে মনোনীত',
      candidateBadge: 'স্বতন্ত্র প্রার্থী',
      candidateName: '',
      candidatePhotoUrl: '/candidate-default.jpg',
      symbolName: '',
      symbolPhotoUrl: '/symbol-default.png',
      symbolCallout: 'মার্কায় ভোট দিন',
      pollingCenter: 'স্থানীয় ভোট কেন্দ্র',
      voterArea: 'ছোট বাদুরা',
      wardNo: '০১',
      isCustom: true,
    };
    setEditingCandidate(newCand);
    setIsAddingNewCandidate(true);
    setActiveTab('candidates');
  };

  // Save candidate profile permanently
  const handleSaveCandidate = () => {
    if (!editingCandidate.name.trim()) {
      alert('অনুগ্রহ করে প্রার্থীর নাম লিখুন!');
      return;
    }
    const finalCand: CandidateProfile = {
      ...editingCandidate,
      candidateName: editingCandidate.candidateName || editingCandidate.name,
      isCustom: true,
    };
    const updated = saveCandidateProfile(finalCand);
    setCandidates(updated);
    setActiveCandidate(finalCand);
    setIsAddingNewCandidate(false);
    showNotice(`✅ প্রার্থীর তথ্য স্থায়ীভাবে সেভ হয়েছে!`);
  };

  // Delete candidate profile
  const handleDeleteCandidate = (id: string, name: string) => {
    if (window.confirm(`আপনি কি "${name}" প্রার্থীর প্রোফাইল মুছে ফেলতে চান?`)) {
      const updated = deleteCandidateProfile(id);
      setCandidates(updated);
      const nextActive = updated[0];
      setActiveCandidate(nextActive);
      setEditingCandidate(nextActive);
      showNotice(`প্রার্থী প্রোফাইল মুছে ফেলা হয়েছে।`);
    }
  };

  // Upload photo handler
  const handleCandidatePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setEditingCandidate((prev) => ({
            ...prev,
            candidatePhotoUrl: event.target!.result as string,
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Upload symbol handler
  const handleSymbolPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setEditingCandidate((prev) => ({
            ...prev,
            symbolPhotoUrl: event.target!.result as string,
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Connect to Bluetooth POS Printer
  const handleConnectBluetooth = async () => {
    setIsConnectingBt(true);
    setBtError(null);
    try {
      const dev = await connectBluetoothPrinter();
      setBluetoothDevice(dev);
      showNotice(`✅ প্রিন্টার "${dev.name}" এর সাথে সফলভাবে কানেক্ট হয়েছে!`);
    } catch (err: any) {
      console.warn('Bluetooth connection error:', err);
      if (err.name !== 'NotFoundError') {
        setBtError(err.message || 'ব্লুটুথ কানেক্ট করা যায়নি। প্রিন্টারের পাওয়ার ও ব্লুটুথ অন রাখুন।');
      }
    } finally {
      setIsConnectingBt(false);
    }
  };

  // Disconnect from Bluetooth Printer
  const handleDisconnectBluetooth = async () => {
    await disconnectBluetoothPrinter();
    setBluetoothDevice(null);
    showNotice('ব্লুটুথ প্রিন্টার ডিসকানেক্ট করা হয়েছে।');
  };

  // Direct Bluetooth Print via ESC/POS
  const handlePrintDirectBluetooth = async () => {
    setIsPrintingBt(true);
    setBtError(null);
    setBtProgress(0);

    try {
      let printer = bluetoothDevice || getConnectedPrinter();
      if (!printer) {
        showNotice('ব্লুটুথ ডিভাইস খুঁজছি... তালিকায় আপনার প্রিন্টারটি সিলেক্ট করুন');
        printer = await connectBluetoothPrinter();
        setBluetoothDevice(printer);
      }

      const canvas = document.createElement('canvas');
      await drawThermalSlipToCanvas(canvas, voterData, activeCandidate);

      const escPosBytes = canvasToEscPosBytes(canvas);

      showNotice(`"${printer.name}" প্রিন্টারে পাঠানো হচ্ছে...`);
      await sendEscPosToPrinter(printer.characteristic, escPosBytes, (percent) => {
        setBtProgress(percent);
      });

      showNotice('🎉 ব্লুটুথ প্রিন্টারে স্লিপ সফলভাবে প্রিন্ট হয়েছে!');
    } catch (err: any) {
      console.error('Bluetooth print error:', err);
      if (err.name !== 'NotFoundError') {
        setBtError(err.message || 'প্রিন্টারে ডাটা পাঠাতে ব্যর্থ হয়েছে। প্রিন্টারটি রিস্টার্ট দিয়ে আবার চেষ্টা করুন।');
      }
    } finally {
      setIsPrintingBt(false);
    }
  };

  // Standard web print
  const handleTriggerPrint = (mode: PrintLayoutMode = printMode) => {
    printVoterSlips([voterData], activeCandidate, mode, colorMode);
  };

  // Download thermal slip as image
  const handleDownloadThermalImage = async () => {
    const canvas = document.createElement('canvas');
    await drawThermalSlipToCanvas(canvas, voterData, activeCandidate);

    const a = document.createElement('a');
    a.download = `voter_slip_${voterData.serialNo || 'pos'}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    showNotice('✅ থার্মাল স্লিপ ইমেজ ডাউনলোড হয়েছে! Bluetooth Print অ্যাপ দিয়েও প্রিন্ট করতে পারেন।');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[96vh] animate-slide-down">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-950 text-white px-4 py-3 sm:px-6 sm:py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🗳️</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base leading-tight">
                  নির্বাচনী ভোটার স্লিপ ও ব্লুটুথ প্রিন্টার
                </h3>
                <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold">
                  সক্রিয়: {activeCandidate.name} ({activeCandidate.symbolName})
                </span>
                {bluetoothDevice && (
                  <span className="text-[11px] bg-blue-500/30 text-blue-200 border border-blue-400/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    BT: {bluetoothDevice.name}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300">
                একাধিক প্রার্থী ম্যানেজ করুন এবং সরাসরি ব্লুটুথ থার্মাল প্রিন্টারে ২-৩ সেকেন্ডে প্রিন্ট করুন
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

        {/* Top Active Candidate Selector Strip */}
        <div className="bg-indigo-900/90 text-white px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto text-xs">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-indigo-200">👤 প্রার্থী নির্বাচন:</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {candidates.map((cand) => {
              const isActive = cand.id === activeCandidate.id;
              return (
                <button
                  key={cand.id}
                  type="button"
                  onClick={() => handleSelectCandidate(cand)}
                  className={`px-3 py-1 rounded-lg font-bold text-xs whitespace-nowrap transition cursor-pointer flex items-center gap-1 border ${
                    isActive
                      ? 'bg-white text-indigo-900 border-white shadow-md'
                      : 'bg-indigo-950/60 text-indigo-100 hover:bg-indigo-800 border-indigo-700/50'
                  }`}
                >
                  <span>{cand.symbolName ? '🗳️' : '👤'}</span>
                  <span>{cand.name}</span>
                  <span className="text-[10px] opacity-80">({cand.symbolName})</span>
                  {isActive && <span className="text-emerald-600 font-black">✓</span>}
                </button>
              );
            })}

            <button
              type="button"
              onClick={handleStartAddNewCandidate}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1 rounded-lg text-xs whitespace-nowrap transition cursor-pointer flex items-center gap-1 border border-emerald-400/50 shadow-xs"
              title="নতুন প্রার্থী যোগ করুন"
            >
              <span>➕</span> নতুন প্রার্থী যোগ
            </button>
          </div>
        </div>

        {/* Navigation Tabs Toolbar */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Main Tabs */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
            {/* Special Feature for Thermal Bluetooth POS Printer */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('thermal');
                setPrintMode('thermal58');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 ${
                activeTab === 'thermal'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <span>📶</span> ব্লুটুথ থার্মাল প্রিন্টার (৫৮মিমি)
              <span className="bg-amber-400 text-amber-950 text-[9px] font-black px-1.5 py-0.2 rounded-full ml-1">
                ছবিতে দেওয়া
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('preview');
                setPrintMode('single');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 ${
                activeTab === 'preview'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-indigo-600'
              }`}
            >
              <span>📑</span> A4 / সাধারণ প্রিভিউ
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('candidates');
                setEditingCandidate(activeCandidate);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 ${
                activeTab === 'candidates'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-indigo-600'
              }`}
            >
              <span>⚙️</span> প্রার্থীর তথ্য ও মার্কা
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('voter')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 ${
                activeTab === 'voter'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-indigo-600'
              }`}
            >
              <span>📝</span> ভোটারের তথ্য এডিট
            </button>
          </div>

          {/* Quick Print Trigger Buttons */}
          <div className="flex items-center gap-2">
            {activeTab === 'thermal' && (
              <>
                <button
                  type="button"
                  onClick={handlePrintDirectBluetooth}
                  disabled={isPrintingBt || isConnectingBt}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white px-4 py-1.5 rounded-lg font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>⚡</span>
                  {isPrintingBt ? `প্রিন্ট হচ্ছে ${btProgress}%...` : 'সরাসরি ব্লুটুথ প্রিন্ট'}
                </button>
              </>
            )}

            {activeTab === 'preview' && (
              <>
                {/* Single vs 6-in-1 layout toggle */}
                <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setPrintMode('single')}
                    className={`px-2 py-1 rounded transition cursor-pointer ${
                      printMode === 'single' ? 'bg-indigo-600 text-white' : 'text-slate-600'
                    }`}
                  >
                    ১টি স্লিপ
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintMode('sheet6')}
                    className={`px-2 py-1 rounded transition cursor-pointer ${
                      printMode === 'sheet6' ? 'bg-indigo-600 text-white' : 'text-slate-600'
                    }`}
                  >
                    ৬টি (A4 পেজ)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleTriggerPrint(printMode)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg font-bold shadow-md shadow-indigo-600/20 transition cursor-pointer flex items-center gap-1"
                >
                  <span>🖨️</span> সাধারণ প্রিন্ট
                </button>
              </>
            )}
          </div>
        </div>

        {/* Modal Main Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50">
          {saveSuccessMsg && (
            <div className="mb-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold text-center animate-slide-down">
              {saveSuccessMsg}
            </div>
          )}

          {btError && (
            <div className="mb-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold text-center animate-slide-down flex items-center justify-between gap-2">
              <span>⚠️ {btError}</span>
              <button
                type="button"
                onClick={() => setBtError(null)}
                className="text-red-500 hover:text-red-800 text-sm font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* TAB 1: SPECIAL THERMAL BLUETOOTH PRINTER MODE (58mm POS Receipt) */}
          {activeTab === 'thermal' && (
            <div className="flex flex-col items-center">
              {/* Bluetooth Connection & Control Card */}
              <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 mb-4 shadow-sm">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📶</span>
                    <div>
                      <h4 className="font-bold text-xs sm:text-sm text-slate-800">
                        ব্লুটুথ প্রিন্টার কানেকশন স্ট্যাটাস
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {bluetoothDevice
                          ? `সংযুক্ত: ${bluetoothDevice.name}`
                          : 'কোনো ব্লুটুথ প্রিন্টার কানেক্ট নেই'}
                      </p>
                    </div>
                  </div>

                  {bluetoothDevice ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        সংযুক্ত
                      </span>
                      <button
                        type="button"
                        onClick={handleDisconnectBluetooth}
                        className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition cursor-pointer font-semibold"
                      >
                        বিচ্ছিন্ন করুন
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConnectBluetooth}
                      disabled={isConnectingBt}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition cursor-pointer shadow-xs flex items-center gap-1"
                    >
                      <span>🔗</span>
                      {isConnectingBt ? 'খুঁজছি...' : 'প্রিন্টার কানেক্ট করুন'}
                    </button>
                  )}
                </div>

                {/* Direct Action Bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handlePrintDirectBluetooth}
                    disabled={isPrintingBt}
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-400 disabled:to-slate-500 text-white font-black py-2.5 px-4 rounded-xl shadow-md text-xs sm:text-sm transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>⚡</span>
                    {isPrintingBt ? `প্রিন্ট হচ্ছে ${btProgress}%...` : 'সরাসরি ব্লুটুথ প্রিন্ট (২-৩ সেকেন্ড)'}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadThermalImage}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 px-3 rounded-xl text-xs transition cursor-pointer flex items-center gap-1"
                    title="ছবি ডাউনলোড করুন"
                  >
                    <span>📱</span> ইমেজ ডাউনলোড
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTriggerPrint('thermal58')}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-3 rounded-xl text-xs transition cursor-pointer"
                    title="ব্রাউজার প্রিন্ট ডায়ালগ"
                  >
                    🖨️ ডায়ালগ
                  </button>
                </div>

                {isPrintingBt && (
                  <div className="mt-2.5">
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-150"
                        style={{ width: `${btProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* THERMAL RECEIPT SLIP PREVIEW (58mm Roll format) */}
              <div
                className="w-full max-w-[320px] bg-white border border-slate-300 rounded shadow-xl p-4 text-black text-center text-xs"
                style={{
                  fontFamily: "'Noto Sans Bengali', monospace, sans-serif",
                  boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                }}
              >
                {/* Roll cut header */}
                <div className="text-[10px] font-bold text-slate-800 pb-1 border-b border-dashed border-slate-400">
                  {activeCandidate.religiousHeader || 'আল্লাহ সর্বশক্তিমান'}
                </div>

                <div className="font-black text-sm text-slate-900 mt-2 leading-tight">
                  {activeCandidate.electionTitle}
                </div>
                <div className="text-[10px] font-bold text-slate-700 mt-0.5 leading-snug">
                  {activeCandidate.electionSubtitle}
                </div>

                <div className="font-mono text-slate-400 text-[10px] my-1">
                  ----------------------------------------
                </div>

                {/* Candidate banner with Symbol on Left, Info in Center, Candidate Photo on Right */}
                <div className="bg-slate-50 p-2 rounded border border-slate-300 my-1">
                  <div className="flex items-center justify-between gap-1.5">
                    {/* Left: Symbol */}
                    <div className="w-14 flex flex-col items-center text-center shrink-0">
                      <img
                        src={activeCandidate.symbolPhotoUrl || '/symbol-default.png'}
                        alt="মার্কা"
                        className="w-12 h-12 object-contain grayscale contrast-125"
                      />
                      <div className="font-black text-[10px] leading-tight mt-0.5">
                        {activeCandidate.symbolName}
                      </div>
                      <div className="border border-black text-[8px] font-bold px-1 rounded-xs mt-0.5">
                        {activeCandidate.symbolCallout || 'ভোট দিন'}
                      </div>
                    </div>

                    {/* Center: Candidate Info */}
                    <div className="flex-1 text-center px-1">
                      <span className="inline-block bg-black text-white text-[9px] font-bold px-2 py-0.2 rounded-full mb-0.5">
                        {activeCandidate.candidateBadge || 'স্বতন্ত্র প্রার্থী'}
                      </span>
                      <div className="font-black text-sm text-black tracking-tight leading-tight">
                        {activeCandidate.candidateName}-কে
                      </div>
                      <div className="text-[10.5px] font-bold text-slate-800 leading-tight mt-0.5">
                        {activeCandidate.postTitle || 'চেয়ারম্যান পদপ্রার্থী'}
                      </div>
                    </div>

                    {/* Right: Candidate Photo */}
                    <div className="w-14 flex flex-col items-center text-center shrink-0">
                      <div className="border border-black p-0.5 rounded-xs bg-white">
                        <img
                          src={activeCandidate.candidatePhotoUrl || '/candidate-default.jpg'}
                          alt="প্রার্থী"
                          className="w-12 h-14 object-cover grayscale contrast-125"
                        />
                      </div>
                      <span className="text-[9px] font-black mt-0.5">প্রার্থী</span>
                    </div>
                  </div>
                </div>

                <div className="font-mono text-slate-400 text-[10px] my-1">
                  ========================================
                </div>

                {/* Polling Center */}
                <div className="text-left text-[11px] leading-tight space-y-0.5">
                  <div>
                    <b>কেন্দ্র:</b> {activeCandidate.pollingCenter}
                  </div>
                  <div className="flex justify-between">
                    <div>
                      <b>এলাকা:</b> {voterData.villageName || activeCandidate.voterArea}
                    </div>
                    <div>
                      <b>ওয়ার্ড:</b> {activeCandidate.wardNo}
                    </div>
                  </div>
                </div>

                <div className="font-mono text-slate-400 text-[10px] my-1">
                  ----------------------------------------
                </div>

                {/* Voter Details */}
                <div className="text-left text-[11.5px] leading-tight space-y-1">
                  <div className="font-black text-sm text-black">
                    {voterData.serialNo || '-'}. {voterData.name || '-'}
                  </div>
                  <div className="font-mono font-bold text-xs">
                    <b>ভোটার নং:</b> {voterData.voterId || '-'}
                  </div>
                  <div>
                    <b>পিতা:</b> {voterData.fatherName || '-'}
                  </div>
                  <div>
                    <b>মাতা:</b> {voterData.motherName || '-'}
                  </div>
                  <div className="text-[10.5px]">
                    <b>পেশা:</b> {voterData.profession || '-'} | <b>জন্ম:</b> {voterData.dob || '-'}
                  </div>
                  <div className="text-[10px] text-slate-800">
                    <b>ঠিকানা:</b> {voterData.address || voterData.villageName || '-'}
                  </div>
                </div>


                <div className="font-mono text-slate-400 text-[10px] my-1">
                  ========================================
                </div>
                <div className="text-[10px] font-bold text-slate-700">
                  ভোট আপনার নাগরিক অধিকার ও আমানত
                </div>
                <div className="text-slate-300 font-mono text-[9px] mt-1">
                  - - - - - - - - - - [ টিয়ার কাট ] - - - - - - - - - -
                </div>
              </div>

              {/* Instructions Guide */}
              <div className="mt-4 p-3 bg-white border border-slate-200 rounded-xl text-[11px] text-slate-600 max-w-md">
                <div className="font-bold text-slate-800 mb-1 flex items-center gap-1">
                  <span>💡</span> ব্লুটুথ প্রিন্টারে সংযোগ দেওয়ার সহজ নিয়ম:
                </div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>প্রিন্টারের পাওয়ার বাটন চেপে অন করুন (সবুজ বা নীল লাইট জ্বলবে)।</li>
                  <li>আপনার মোবাইল বা কম্পিউটারের ব্লুটুথ চালু রাখুন।</li>
                  <li>
                    উপরে <b>"প্রিন্টার কানেক্ট করুন"</b> বাটনে চাপ দিলে আপনার ডিভাইসে প্রিন্টারের নাম
                    (যেমন: MPT-II, RPP02N, POS-58) আসবে, সিলেক্ট করে পেয়ার করুন।
                  </li>
                  <li>
                    এরপর <b>"সরাসরি ব্লুটুথ প্রিন্ট"</b> বাটনে চাপলেই মাত্র ২-৩ সেকেন্ডে প্রিন্ট বের হয়ে আসবে!
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* TAB 2: STANDARD A4 SLIP PREVIEW */}
          {activeTab === 'preview' && (
            <div className="flex flex-col items-center">
              <div className="text-center mb-3">
                <span className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold px-3 py-1 rounded-full">
                  {printMode === 'single'
                    ? 'একক স্লিপ প্রিভিউ'
                    : 'A4 শিট প্রিভিউ (এক পাতায় ৬টি স্লিপ)'}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">
                  বর্তমান প্রার্থী: <b className="text-indigo-700">{activeCandidate.name}</b> | মার্কা:{' '}
                  <b className="text-indigo-700">{activeCandidate.symbolName}</b>
                </p>
              </div>

              {/* SLIP PREVIEW CONTAINER */}
              <div
                className={`w-full max-w-xl bg-white border-2 border-slate-900 rounded-sm p-3.5 sm:p-4 shadow-xl relative ${
                  colorMode === 'bw' ? 'grayscale contrast-125' : ''
                }`}
                style={{ fontFamily: "'Noto Sans Bengali', sans-serif" }}
              >
                {/* Top Religious Line */}
                <div className="text-center font-bold text-[11px] border-b border-dashed border-slate-400 pb-1 mb-1 tracking-wider text-slate-800">
                  {activeCandidate.religiousHeader}
                </div>

                {/* Subheader: Election title & Candidate Badge */}
                <div className="flex justify-between items-center gap-2 mb-1">
                  <div>
                    <div className="text-xs font-black text-slate-900 leading-tight">
                      {activeCandidate.electionTitle}
                    </div>
                    <div className="text-[10px] font-semibold text-slate-700 leading-tight">
                      {activeCandidate.electionSubtitle}
                    </div>
                  </div>
                  {activeCandidate.candidateBadge && (
                    <span className="bg-slate-900 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full whitespace-nowrap">
                      {activeCandidate.candidateBadge}
                    </span>
                  )}
                </div>

                {/* Big Candidate Name Heading */}
                <div className="text-base sm:text-lg font-black text-slate-900 border-b-2 border-slate-900 pb-1 mb-2 leading-none">
                  {activeCandidate.candidateName}-কে
                </div>

                {/* Main Body */}
                <div className="flex items-stretch gap-2.5 sm:gap-3 text-xs">
                  {/* Left Column: Symbol */}
                  <div className="w-20 shrink-0 flex flex-col items-center justify-between text-center">
                    <div className="w-18 h-18 flex items-center justify-center p-1 bg-white">
                      <img
                        src={activeCandidate.symbolPhotoUrl}
                        alt="প্রতীক"
                        className="max-w-full max-h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/symbol-default.png';
                        }}
                      />
                    </div>
                    <div className="font-black text-xs text-slate-900 mt-0.5 leading-tight">
                      {activeCandidate.symbolName}
                    </div>
                    <div className="w-full border-1.5 border-slate-900 text-[10px] font-black py-0.5 mt-1 bg-white text-slate-900 leading-none">
                      {activeCandidate.symbolCallout}
                    </div>
                  </div>

                  {/* Center Column: Center info & Voter Data */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    {/* Top Polling Info Box */}
                    <div className="border border-slate-900 rounded p-1.5 mb-1.5 bg-slate-50 text-[10px] leading-tight font-medium">
                      <div className="truncate">
                        <span className="font-bold text-slate-800">ভোট কেন্দ্র:</span>{' '}
                        <span className="font-bold text-slate-900">{activeCandidate.pollingCenter}</span>
                      </div>
                      <div className="flex justify-between gap-1 mt-0.5">
                        <div className="truncate">
                          <span className="font-bold text-slate-800">ভোটার এলাকা:</span>{' '}
                          <span className="font-semibold text-slate-900">
                            {voterData.villageName || activeCandidate.voterArea}
                          </span>
                        </div>
                        <div className="shrink-0">
                          <span className="font-bold text-slate-800">ওয়ার্ড:</span>{' '}
                          <span className="font-bold text-slate-900">{activeCandidate.wardNo}</span>
                        </div>
                      </div>
                    </div>

                    {/* Voter Info Rows */}
                    <div className="space-y-0.5 text-[11px] leading-tight">
                      <div className="flex items-baseline gap-1">
                        <span className="font-black text-xs text-slate-900">
                          {voterData.serialNo || '-'}.
                        </span>
                        <span className="font-bold text-slate-800">নাম:</span>
                        <span className="font-bold text-slate-900 text-xs">
                          {voterData.name || '-'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-bold text-slate-700">ভোটার নং:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {voterData.voterId || '-'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-semibold text-slate-700">পিতা:</span>
                        <span className="font-medium text-slate-900">
                          {voterData.fatherName || '-'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-semibold text-slate-700">মাতা:</span>
                        <span className="font-medium text-slate-900">
                          {voterData.motherName || '-'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-semibold text-slate-700">পেশা:</span>
                        <span className="font-medium text-slate-900">
                          {voterData.profession || '-'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-semibold text-slate-700">জন্ম তারিখ:</span>
                        <span className="font-medium text-slate-900">
                          {voterData.dob || '-'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1 text-[10px]">
                        <span className="font-semibold text-slate-700 shrink-0">ঠিকানা:</span>
                        <span className="font-medium text-slate-900 truncate">
                          {voterData.address || voterData.villageName || '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Candidate Photo */}
                  <div className="w-22 shrink-0 border border-slate-900 rounded overflow-hidden flex items-center justify-center bg-slate-100">
                    <img
                      src={activeCandidate.candidatePhotoUrl}
                      alt="প্রার্থী"
                      className="w-full h-full object-cover max-h-36 block"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/candidate-default.jpg';
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-4 flex items-center gap-3 flex-wrap justify-center">
                <button
                  type="button"
                  onClick={() => handleTriggerPrint(printMode)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition"
                >
                  <span>🖨️</span> সাধারণ প্রিন্টারে প্রিন্ট করুন
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('thermal');
                    setPrintMode('thermal58');
                  }}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-700/30 text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition"
                >
                  <span>📶</span> ব্লুটুথ থার্মাল প্রিন্টারে যান
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: CANDIDATE PROFILES & SETTINGS */}
          {activeTab === 'candidates' && (
            <div className="space-y-4">
              {/* Candidates list selector */}
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                    <span>👥</span> সংরক্ষিত প্রার্থী তালিকা ({candidates.length} জন)
                  </h4>
                  <button
                    type="button"
                    onClick={handleStartAddNewCandidate}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1"
                  >
                    <span>➕</span> নতুন প্রার্থী যোগ করুন
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {candidates.map((cand) => {
                    const isActive = cand.id === activeCandidate.id;
                    const isBeingEdited = cand.id === editingCandidate.id && !isAddingNewCandidate;
                    return (
                      <div
                        key={cand.id}
                        className={`p-3 rounded-xl border transition flex flex-col justify-between gap-2 ${
                          isActive
                            ? 'bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-200'
                            : isBeingEdited
                            ? 'bg-slate-50 border-indigo-300'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <img
                            src={cand.candidatePhotoUrl}
                            alt={cand.name}
                            className="w-11 h-13 object-cover rounded border border-slate-300 bg-white shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/candidate-default.jpg';
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-xs text-slate-900 truncate">
                              {cand.name}
                            </div>
                            <div className="text-[11px] text-indigo-700 font-semibold truncate">
                              মার্কা: {cand.symbolName}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {cand.postTitle || cand.candidateBadge}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-1 pt-2 border-t border-slate-100">
                          {isActive ? (
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                              ✓ বর্তমান সক্রিয়
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSelectCandidate(cand)}
                              className="text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-0.5 rounded transition cursor-pointer"
                            >
                              সক্রিয় করুন
                            </button>
                          )}

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCandidate(cand);
                                setIsAddingNewCandidate(false);
                              }}
                              className="text-[11px] font-semibold text-slate-600 hover:text-indigo-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition cursor-pointer"
                              title="এডিট করুন"
                            >
                              ✏️ এডিট
                            </button>
                            {cand.isCustom && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCandidate(cand.id, cand.name)}
                                className="text-[11px] font-semibold text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50 transition cursor-pointer"
                                title="মুছে ফেলুন"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Candidate Edit / Add Form */}
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                    <span>✏️</span>{' '}
                    {isAddingNewCandidate
                      ? 'নতুন প্রার্থীর তথ্য যুক্ত করুন'
                      : `"${editingCandidate.name || 'প্রার্থী'}"-এর তথ্য পরিবর্তন করুন`}
                  </h4>
                  {isAddingNewCandidate && (
                    <span className="text-xs bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded">
                      নতুন প্রোফাইল মোড
                    </span>
                  )}
                </div>

                {/* Photo Uploaders */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {/* Candidate Photo */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
                    <img
                      src={editingCandidate.candidatePhotoUrl}
                      alt="Candidate"
                      className="w-16 h-20 object-cover rounded-lg border border-slate-300 shrink-0 bg-white"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/candidate-default.jpg';
                      }}
                    />
                    <div className="flex-1">
                      <div className="font-bold text-xs text-slate-800 mb-1">
                        প্রার্থীর ছবি (Candidate Photo)
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        ref={candidateFileInputRef}
                        onChange={handleCandidatePhotoUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => candidateFileInputRef.current?.click()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                      >
                        📁 যেকোনো ছবি আপলোড করুন
                      </button>
                    </div>
                  </div>

                  {/* Symbol Photo */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
                    <img
                      src={editingCandidate.symbolPhotoUrl}
                      alt="Symbol"
                      className="w-16 h-16 object-contain rounded-lg border border-slate-300 shrink-0 bg-white p-1"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/symbol-default.png';
                      }}
                    />
                    <div className="flex-1">
                      <div className="font-bold text-xs text-slate-800 mb-1">
                        মার্কার ছবি / প্রতীক (Symbol)
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        ref={symbolFileInputRef}
                        onChange={handleSymbolPhotoUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => symbolFileInputRef.current?.click()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                      >
                        📁 মার্কার ছবি আপলোড করুন
                      </button>
                    </div>
                  </div>
                </div>

                {/* Form fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      প্রার্থীর নাম: *
                    </label>
                    <input
                      type="text"
                      value={editingCandidate.name}
                      onChange={(e) =>
                        setEditingCandidate({
                          ...editingCandidate,
                          name: e.target.value,
                          candidateName: e.target.value,
                        })
                      }
                      placeholder="যেমন: অ্যাড. মোঃ সোহরাব উদ্দিন"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      মার্কার নাম: *
                    </label>
                    <input
                      type="text"
                      value={editingCandidate.symbolName}
                      onChange={(e) =>
                        setEditingCandidate({
                          ...editingCandidate,
                          symbolName: e.target.value,
                        })
                      }
                      placeholder="যেমন: ঈগল পাখি, আনারস, নৌকা, ফুটবল"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      নির্বাচনী টাইটেল (লাইন ১):
                    </label>
                    <input
                      type="text"
                      value={editingCandidate.electionTitle}
                      onChange={(e) =>
                        setEditingCandidate({
                          ...editingCandidate,
                          electionTitle: e.target.value,
                        })
                      }
                      placeholder="যেমন: আসন্ন ইউনিয়ন পরিষদ নির্বাচনে"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      নির্বাচনী স্লোগান / পদবি (লাইন ২):
                    </label>
                    <input
                      type="text"
                      value={editingCandidate.electionSubtitle}
                      onChange={(e) =>
                        setEditingCandidate({
                          ...editingCandidate,
                          electionSubtitle: e.target.value,
                        })
                      }
                      placeholder="যেমন: শান্তির পক্ষে-উন্নয়নের লক্ষ্যে চেয়ারম্যান পদে মনোনীত"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      প্রার্থীর ব্যাজ / সিল:
                    </label>
                    <input
                      type="text"
                      value={editingCandidate.candidateBadge}
                      onChange={(e) =>
                        setEditingCandidate({
                          ...editingCandidate,
                          candidateBadge: e.target.value,
                        })
                      }
                      placeholder="যেমন: স্বতন্ত্র প্রার্থী, সততার প্রতীক"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      শীর্ষ বাণী (Religious Header):
                    </label>
                    <input
                      type="text"
                      value={editingCandidate.religiousHeader}
                      onChange={(e) =>
                        setEditingCandidate({
                          ...editingCandidate,
                          religiousHeader: e.target.value,
                        })
                      }
                      placeholder="যেমন: আল্লাহ সর্বশক্তিমান / বিসমিল্লাহির রাহমানির রাহিম"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      ভোট কেন্দ্র (Polling Center):
                    </label>
                    <input
                      type="text"
                      value={editingCandidate.pollingCenter}
                      onChange={(e) =>
                        setEditingCandidate({
                          ...editingCandidate,
                          pollingCenter: e.target.value,
                        })
                      }
                      placeholder="যেমন: কালকা নগর সরকারি প্রাথমিক বিদ্যালয়"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        ভোটার এলাকা:
                      </label>
                      <input
                        type="text"
                        value={editingCandidate.voterArea}
                        onChange={(e) =>
                          setEditingCandidate({
                            ...editingCandidate,
                            voterArea: e.target.value,
                          })
                        }
                        placeholder="যেমন: ছোট বাদুরা"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        ওয়ার্ড নং:
                      </label>
                      <input
                        type="text"
                        value={editingCandidate.wardNo}
                        onChange={(e) =>
                          setEditingCandidate({
                            ...editingCandidate,
                            wardNo: e.target.value,
                          })
                        }
                        placeholder="যেমন: ০১"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleSaveCandidate}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2 rounded-xl transition cursor-pointer shadow-md"
                  >
                    💾 প্রার্থীর তথ্য স্থায়ীভাবে সেভ করুন
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('thermal')}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2 rounded-xl transition cursor-pointer shadow-md"
                  >
                    ⚡ থার্মাল স্লিপে যান
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: EDIT VOTER INFORMATION */}
          {activeTab === 'voter' && (
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                  <span>👤</span> যেকোনো ব্যক্তির তথ্য দিয়ে স্লিপ তৈরি করুন
                </h4>
                <span className="text-[11px] text-slate-400">
                  নিচের তথ্য পরিবর্তন করলে স্লিপে সাথে সাথে আপডেট হবে
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ভোটারের নাম:
                  </label>
                  <input
                    type="text"
                    value={voterData.name || ''}
                    onChange={(e) =>
                      setVoterData({ ...voterData, name: e.target.value })
                    }
                    placeholder="নাম লিখুন..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ক্রমিক নং:
                  </label>
                  <input
                    type="text"
                    value={voterData.serialNo || ''}
                    onChange={(e) =>
                      setVoterData({ ...voterData, serialNo: e.target.value })
                    }
                    placeholder="যেমন: ০০১"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ভোটার আইডি নং:
                  </label>
                  <input
                    type="text"
                    value={voterData.voterId || ''}
                    onChange={(e) =>
                      setVoterData({ ...voterData, voterId: e.target.value })
                    }
                    placeholder="যেমন: ৫৬১২৭৮০১৯৪৩৩"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    পিতার নাম:
                  </label>
                  <input
                    type="text"
                    value={voterData.fatherName || ''}
                    onChange={(e) =>
                      setVoterData({ ...voterData, fatherName: e.target.value })
                    }
                    placeholder="পিতার নাম..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    মাতার নাম:
                  </label>
                  <input
                    type="text"
                    value={voterData.motherName || ''}
                    onChange={(e) =>
                      setVoterData({ ...voterData, motherName: e.target.value })
                    }
                    placeholder="মাতার নাম..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    জন্ম তারিখ:
                  </label>
                  <input
                    type="text"
                    value={voterData.dob || ''}
                    onChange={(e) =>
                      setVoterData({ ...voterData, dob: e.target.value })
                    }
                    placeholder="যেমন: ১৯/০৮/১৯৪৮"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    পেশা:
                  </label>
                  <input
                    type="text"
                    value={voterData.profession || ''}
                    onChange={(e) =>
                      setVoterData({ ...voterData, profession: e.target.value })
                    }
                    placeholder="যেমন: কৃষক, ব্যবসা, চাকুরী"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    গ্রাম / এলাকা:
                  </label>
                  <input
                    type="text"
                    value={voterData.villageName || ''}
                    onChange={(e) =>
                      setVoterData({ ...voterData, villageName: e.target.value })
                    }
                    placeholder="যেমন: পূর্ব কালিঞ্জুরী"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    পূর্ণ ঠিকানা:
                  </label>
                  <input
                    type="text"
                    value={voterData.address || ''}
                    onChange={(e) =>
                      setVoterData({ ...voterData, address: e.target.value })
                    }
                    placeholder="ঠিকানা..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('thermal');
                    setPrintMode('thermal58');
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2 rounded-xl transition cursor-pointer shadow-xs flex items-center gap-1"
                >
                  <span>⚡</span> থার্মাল স্লিপ প্রিন্ট করুন
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
