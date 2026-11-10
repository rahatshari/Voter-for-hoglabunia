import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Voter, CandidateProfile, SlipDesignStyle, VoterInfoFillMode } from '../types';
import {
  getAllCandidates,
  getActiveCandidate,
  setActiveCandidateId,
  saveCandidateProfile,
  createNewCandidateTemplate,
  deleteCandidateProfile,
  resetDefaultCandidates,
  printVoterSlips,
  PrintLayoutMode,
  getSlipQueue,
  addToSlipQueue,
  removeFromSlipQueue,
  clearSlipQueue,
  isVoterInSlipQueue,
  findFamilyMembers,
  searchVotersForSlipQueue,
  getVoterUniqueKey,
  ELECTION_SYMBOLS_GALLERY,
  SLIP_DESIGN_STYLES,
} from '../lib/voterSlipUtils';
import {
  connectBluetoothPrinter,
  disconnectBluetoothPrinter,
  getConnectedPrinter,
  autoConnectBluetoothPrinter,
  canvasToEscPosBytes,
  sendEscPosToPrinter,
  BluetoothPrinterDevice,
} from '../lib/bluetoothPrinter';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';

interface VoterSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  voter?: Voter | null;
  allVillages?: Record<string, Voter[]>;
}

/**
 * Helper to load an image for Canvas drawing
 */
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

/**
 * Draw Voter Slip onto a 384px wide canvas (Standard 58mm POS thermal printer width)
 * NO QR CODE — clean, high-contrast thermal layout
 */
async function drawThermalSlipToCanvas(
  canvas: HTMLCanvasElement,
  voter: Voter,
  config: CandidateProfile
): Promise<void> {
  const width = 384;
  const height = 470;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const [candImg, symImg] = await Promise.all([
    loadImage(config.candidatePhotoUrl || './candidate-ataur.jpg'),
    loadImage(config.symbolPhotoUrl || './symbol-horse.png'),
  ]);

  ctx.textAlign = 'center';
  ctx.font = 'bold 13px "Noto Sans Bengali", sans-serif';
  ctx.fillText(config.religiousHeader || 'বিসমিল্লাহির রাহমানির রাহিম', width / 2, 8);

  ctx.font = '900 15px "Noto Sans Bengali", sans-serif';
  ctx.fillText((config.electionTitle || 'নির্বাচনী ভোটার কার্ড').slice(0, 34), width / 2, 28);

  ctx.font = 'bold 11px "Noto Sans Bengali", sans-serif';
  ctx.fillText(
    (config.constituencyText || config.electionSubtitle || '').slice(0, 42),
    width / 2,
    49
  );

  ctx.font = 'bold 12px monospace';
  ctx.fillText('------------------------------------------------', width / 2, 66);

  if (symImg) {
    ctx.drawImage(symImg, 12, 82, 72, 68);
  }
  ctx.font = 'bold 12px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`মার্কা: ${config.symbolName || 'ঘোড়া'}`, 48, 153);
  ctx.strokeRect(8, 170, 82, 18);
  ctx.font = 'bold 10px "Noto Sans Bengali", sans-serif';
  ctx.fillText((config.symbolCallout || 'ভোট দিন').slice(0, 16), 49, 173);

  if (candImg) {
    ctx.drawImage(candImg, width - 84, 82, 70, 84);
    ctx.strokeRect(width - 84, 82, 70, 84);
  }
  ctx.font = 'bold 10px "Noto Sans Bengali", sans-serif';
  ctx.fillText('প্রার্থী', width - 49, 170);

  ctx.fillStyle = '#000000';
  ctx.fillRect(102, 84, 180, 20);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 12px "Noto Sans Bengali", sans-serif';
  ctx.fillText(config.candidateBadge || config.postTitle || 'পদপ্রার্থী', width / 2, 87);

  ctx.fillStyle = '#000000';
  ctx.font = '900 17px "Noto Sans Bengali", sans-serif';
  ctx.fillText(
    `${config.candidateName || config.name} ${config.candidateSuffix || 'কে'}`.slice(0, 22),
    width / 2,
    114
  );

  ctx.font = 'bold 11px "Noto Sans Bengali", sans-serif';
  ctx.fillText((config.electionSubtitle || '').slice(0, 28), width / 2, 140);

  ctx.font = 'bold 12px monospace';
  ctx.fillText('================================================', width / 2, 194);

  ctx.textAlign = 'left';
  ctx.font = 'bold 13px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`ভোট কেন্দ্র: ${config.pollingCenter || '-'}`, 12, 212);
  ctx.fillText(`এলাকা: ${voter.villageName || config.voterArea || '-'}`, 12, 232);
  ctx.textAlign = 'right';
  ctx.fillText(`ওয়ার্ড নং: ${config.wardNo || '-'}`, width - 12, 232);

  ctx.textAlign = 'center';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('------------------------------------------------', width / 2, 250);

  ctx.textAlign = 'left';
  ctx.font = '900 16px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`ক্রমিক: ${voter.serialNo || '-'} | ${voter.name || '-'}`, 14, 270);

  ctx.font = 'bold 14px monospace';
  ctx.fillText(`ভোটার আইডি: ${voter.voterId || '-'}`, 14, 296);

  ctx.font = 'bold 13px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`পিতা/স্বামী: ${voter.fatherName || '-'}`, 14, 319);
  ctx.fillText(`মাতা: ${voter.motherName || '-'}`, 14, 342);

  const extraLine = [
    voter.dob ? `জন্ম: ${voter.dob}` : '',
    voter.profession ? `পেশা: ${voter.profession}` : '',
  ]
    .filter(Boolean)
    .join('  |  ');
  if (extraLine) {
    ctx.font = 'bold 12px "Noto Sans Bengali", sans-serif';
    ctx.fillText(extraLine, 14, 365);
  }

  ctx.font = 'bold 12px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`ঠিকানা: ${voter.address || voter.villageName || '-'}`, 14, 386);

  ctx.textAlign = 'center';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('------------------------------------------------', width / 2, 406);
  ctx.font = 'bold 12px "Noto Sans Bengali", sans-serif';
  ctx.fillText(
    (config.footerCenterText || 'ভোট কেন্দ্রে আসার সময় কার্ডটি সঙ্গে আনবেন').slice(0, 42),
    width / 2,
    424
  );
  ctx.font = 'bold 11px monospace';
  ctx.fillText('================================================', width / 2, 444);
}

export const VoterSlipModal: React.FC<VoterSlipModalProps> = ({
  isOpen,
  onClose,
  voter,
  allVillages = {},
}) => {
  const [candidatesList, setCandidatesList] = useState<CandidateProfile[]>(() =>
    getAllCandidates()
  );
  const [candidate, setCandidate] = useState<CandidateProfile>(() => getActiveCandidate());
  const [isEditingCandidate, setIsEditingCandidate] = useState(false);

  // Two distinct print mode tabs: 'normal' vs 'bluetooth'
  const [activePrintOption, setActivePrintOption] = useState<'bluetooth' | 'normal'>('normal');
  const [pageLayoutMode, setPageLayoutMode] = useState<PrintLayoutMode>('sheet4');
  const [colorMode, setColorMode] = useState<'bw' | 'color'>('bw');

  // Active Single Voter Data
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

  // Multi-Voter / Family Slip Queue
  const [slipQueue, setSlipQueue] = useState<Voter[]>(() => getSlipQueue());
  const [familySearchQuery, setFamilySearchQuery] = useState('');
  const [showFamilyFinder, setShowFamilyFinder] = useState(false);

  // Village selector
  const villageList = Object.keys(allVillages);
  const [selectedVillage, setSelectedVillage] = useState<string>(
    voter?.villageName || (villageList.includes('পাঠামারা') ? 'পাঠামারা' : villageList[0] || '')
  );

  // Bluetooth State
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothPrinterDevice | null>(
    getConnectedPrinter()
  );
  const [isConnectingBt, setIsConnectingBt] = useState(false);
  const [isPrintingBt, setIsPrintingBt] = useState(false);
  const [btProgress, setBtProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const allVotersFlat = useMemo(() => Object.values(allVillages).flat(), [allVillages]);

  const suggestedFamilyMembers = useMemo(() => {
    const pool = allVillages[selectedVillage] || allVotersFlat;
    return findFamilyMembers(voterData, pool).slice(0, 15);
  }, [voterData, selectedVillage, allVillages, allVotersFlat]);

  const quickSearchResults = useMemo(() => {
    if (!familySearchQuery.trim()) return [];
    const pool = allVotersFlat.length > 0 ? allVotersFlat : allVillages[selectedVillage] || [];
    return searchVotersForSlipQueue(familySearchQuery, pool, 25);
  }, [familySearchQuery, allVotersFlat, allVillages, selectedVillage]);

  useEffect(() => {
    if (voter) {
      setVoterData(voter);
      if (voter.villageName) setSelectedVillage(voter.villageName);
    }
    setSlipQueue(getSlipQueue());
    setCandidatesList(getAllCandidates());
    setCandidate(getActiveCandidate());
  }, [voter, isOpen]);

  useEffect(() => {
    const onQueueUpdate = () => setSlipQueue(getSlipQueue());
    window.addEventListener('slip-queue-updated', onQueueUpdate);
    return () => window.removeEventListener('slip-queue-updated', onQueueUpdate);
  }, []);

  // Automatic Bluetooth Printer Detection & Connection
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const checkAutoConnect = async () => {
      const current = getConnectedPrinter();
      if (current) {
        if (mounted) setBluetoothDevice(current);
        return;
      }
      const autoDev = await autoConnectBluetoothPrinter();
      if (mounted && autoDev) {
        setBluetoothDevice(autoDev);
      }
    };

    checkAutoConnect();
    const interval = setInterval(checkAutoConnect, 4000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkAutoConnect();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', checkAutoConnect);

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', checkAutoConnect);
    };
  }, [isOpen]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  // Update active candidate field & persist immediately
  const updateCandidateField = (patch: Partial<CandidateProfile>) => {
    const updated: CandidateProfile = {
      ...candidate,
      ...patch,
    };
    if (patch.name !== undefined && patch.candidateName === undefined) {
      updated.candidateName = patch.name;
    }
    if (patch.candidateName !== undefined && patch.name === undefined) {
      updated.name = patch.candidateName;
    }
    setCandidate(updated);
    const list = saveCandidateProfile(updated);
    setCandidatesList(list);
  };

  const handleSelectCandidateTemplate = (selected: CandidateProfile) => {
    setCandidate(selected);
    setActiveCandidateId(selected.id);
    showNotice(`✅ "${selected.templateTitle || selected.name}" স্লিপ ডিজাইনটি সিলেক্ট করা হয়েছে!`);
  };

  const handleCreateCustomTemplate = () => {
    const created = createNewCandidateTemplate(candidate);
    setCandidatesList(getAllCandidates());
    setCandidate(created);
    setIsEditingCandidate(true);
    showNotice('✨ নতুন কাস্টম ভোটার স্লিপ তৈরি হয়েছে! নিচে নিজের মতো এডিট করুন।');
  };

  const handleDeleteTemplate = (id: string) => {
    const updated = deleteCandidateProfile(id);
    setCandidatesList(updated);
    setCandidate(updated[0]);
    showNotice('🗑️ স্লিপ টেমপ্লেট মুছে ফেলা হয়েছে।');
  };

  const handleResetTemplates = () => {
    const reset = resetDefaultCandidates();
    setCandidatesList(reset);
    setCandidate(reset[0]);
    showNotice('🔄 সকল ডিফল্ট ভোটার স্লিপ টেমপ্লেট রিসেট করা হয়েছে।');
  };

  // Candidate photo upload
  const handleCandidatePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          updateCandidateField({ candidatePhotoUrl: event.target.result as string });
          showNotice('✅ প্রার্থীর ছবি আপডেট হয়েছে!');
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
          updateCandidateField({ symbolPhotoUrl: event.target.result as string });
          showNotice('✅ মার্কার ছবি আপডেট হয়েছে!');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVoterNavigate = (direction: 'prev' | 'next') => {
    const list = allVillages[selectedVillage] || [];
    if (list.length === 0) return;
    const currentIndex = list.findIndex(
      (v) => String(v.serialNo) === String(voterData.serialNo) || v.voterId === voterData.voterId
    );
    let nextIndex = 0;
    if (currentIndex !== -1) {
      nextIndex =
        direction === 'next'
          ? (currentIndex + 1) % list.length
          : (currentIndex - 1 + list.length) % list.length;
    }
    setVoterData(list[nextIndex]);
  };

  const handleAddEntireFamilyToQueue = () => {
    addToSlipQueue([voterData, ...suggestedFamilyMembers]);
    const updated = getSlipQueue();
    setSlipQueue(updated);
    showNotice(
      `✅ পরিবারের ${convertToBengaliNumbers(suggestedFamilyMembers.length + 1)} জন ভোটার একসাথে প্রিন্ট লিস্টে যুক্ত হয়েছে!`
    );
  };

  const handleAddSingleToQueue = (v: Voter) => {
    const updated = addToSlipQueue(v);
    setSlipQueue(updated);
    showNotice(`✅ "${v.name}" একসাথে প্রিন্ট লিস্টে যুক্ত হয়েছে!`);
  };

  const handleRemoveFromQueue = (v: Voter) => {
    const updated = removeFromSlipQueue(v);
    setSlipQueue(updated);
  };

  const handleClearQueue = () => {
    const updated = clearSlipQueue();
    setSlipQueue(updated);
    showNotice('একসাথে প্রিন্ট লিস্ট খালি করা হয়েছে।');
  };

  const handleConnectBluetooth = async () => {
    setIsConnectingBt(true);
    try {
      const dev = await connectBluetoothPrinter();
      setBluetoothDevice(dev);
      showNotice(`✅ "${dev.name}" প্রিন্টারের সাথে সফলভাবে কানেক্ট হয়েছে!`);
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        showNotice(`⚠️ কানেক্ট ব্যর্থ: ${err.message || 'প্রিন্টারের ব্লুটুথ অন রাখুন'}`);
      }
    } finally {
      setIsConnectingBt(false);
    }
  };

  const handleDisconnectBluetooth = async () => {
    await disconnectBluetoothPrinter();
    setBluetoothDevice(null);
    showNotice('ব্লুটুথ প্রিন্টার ডিসকানেক্ট করা হয়েছে।');
  };

  const handlePrintBluetooth = async (votersToPrint: Voter[]) => {
    if (votersToPrint.length === 0) return;
    setIsPrintingBt(true);
    setBtProgress(0);
    try {
      let printer = bluetoothDevice || getConnectedPrinter();
      if (!printer) {
        printer = await autoConnectBluetoothPrinter();
      }
      if (!printer) {
        showNotice('ডিভাইস খুঁজছি... আপনার ব্লুটুথ প্রিন্টারটি সিলেক্ট করুন');
        printer = await connectBluetoothPrinter();
      }
      setBluetoothDevice(printer);

      const canvas = canvasRef.current || document.createElement('canvas');

      for (let i = 0; i < votersToPrint.length; i++) {
        const v = votersToPrint[i];
        showNotice(
          votersToPrint.length > 1
            ? `"${printer.name}"-এ প্রিন্ট হচ্ছে (${convertToBengaliNumbers(i + 1)}/${convertToBengaliNumbers(votersToPrint.length)}): ${v.name}`
            : `"${printer.name}"-এ পাঠানো হচ্ছে...`
        );
        await drawThermalSlipToCanvas(canvas, v, candidate);
        const escPosBytes = canvasToEscPosBytes(canvas);

        await sendEscPosToPrinter(printer, escPosBytes, (percent) => {
          const overall = Math.round(((i + percent / 100) / votersToPrint.length) * 100);
          setBtProgress(overall);
        });

        if (i < votersToPrint.length - 1) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      showNotice(
        `🎉 থার্মাল প্রিন্টারে ${convertToBengaliNumbers(votersToPrint.length)}টি ভোটার স্লিপ সফলভাবে প্রিন্ট হয়েছে!`
      );
    } catch (err: any) {
      console.warn('Bluetooth print error:', err);
      if (err.name !== 'NotFoundError') {
        showNotice(`⚠️ প্রিন্ট ত্রুটি: ${err.message || 'প্রিন্টারটি অন করে আবার চেষ্টা করুন'}`);
      }
    } finally {
      setIsPrintingBt(false);
    }
  };

  const handleNormalPrint = (votersToPrint: Voter[], mode: PrintLayoutMode = pageLayoutMode) => {
    if (votersToPrint.length === 0) return;
    showNotice(
      `🖨️ ${convertToBengaliNumbers(votersToPrint.length)} জন ভোটারের কার্ড প্রিন্ট পেজ তৈরি হচ্ছে...`
    );
    printVoterSlips(votersToPrint, candidate, mode, colorMode);
  };

  const handleDownloadImage = async () => {
    const canvas = canvasRef.current || document.createElement('canvas');
    await drawThermalSlipToCanvas(canvas, voterData, candidate);
    const link = document.createElement('a');
    link.download = `voter_slip_${voterData.serialNo || 'card'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showNotice('✅ স্লিপ ইমেজ ডাউনলোড হয়েছে!');
  };

  if (!isOpen) return null;

  const isCurrentInQueue = isVoterInSlipQueue(voterData, slipQueue);
  const effectiveBatchVoters = slipQueue.length > 0 ? slipQueue : [voterData];
  const currentStyle: SlipDesignStyle = candidate.designStyle || 'classic_voter_card';
  const fillMode: VoterInfoFillMode = candidate.voterInfoMode || 'auto';

  // Helper to render voter info inside live preview
  const renderLiveVoterBlock = () => {
    if (fillMode === 'blank') {
      return (
        <div className="space-y-1.5 py-1 text-[11px] font-bold text-slate-900">
          <div className="flex items-baseline gap-1">
            <span>ভোটারের নাম :</span>
            <span className="flex-1 border-b border-dotted border-slate-900 h-3.5" />
            <span>ক্রমিক :</span>
            <span className="w-12 border-b border-dotted border-slate-900 h-3.5" />
          </div>
          <div className="flex items-baseline gap-1">
            <span>পিতা / স্বামীর নাম :</span>
            <span className="flex-1 border-b border-dotted border-slate-900 h-3.5" />
          </div>
          <div className="flex items-baseline gap-1">
            <span>মাতার নাম :</span>
            <span className="flex-1 border-b border-dotted border-slate-900 h-3.5" />
            <span>জন্ম :</span>
            <span className="w-16 border-b border-dotted border-slate-900 h-3.5" />
          </div>
          <div className="flex items-baseline gap-1">
            <span>ভোটার আইডি নং :</span>
            <span className="flex-1 border-b border-dotted border-slate-900 h-3.5" />
          </div>
          <div className="flex items-baseline gap-1">
            <span>ভোট কেন্দ্র :</span>
            <span className="flex-1 border-b border-dotted border-slate-900 px-1 font-extrabold">
              {candidate.pollingCenter}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span>গ্রাম / ঠিকানা :</span>
            <span className="flex-1 border-b border-dotted border-slate-900 px-1">
              {voterData.villageName || candidate.voterArea} (ওয়ার্ড: {candidate.wardNo})
            </span>
          </div>
        </div>
      );
    }

    const rowBorder = fillMode === 'lined' ? 'border-b border-dotted border-slate-400 pb-0.5' : '';

    return (
      <div className="space-y-1 text-[11px] text-slate-950">
        <div className="flex items-center justify-between bg-slate-100 border border-slate-800 px-2 py-0.5 text-[10px] font-extrabold">
          <span>ক্রমিক নং: {voterData.serialNo || '-'}</span>
          <span>ওয়ার্ড নং: {candidate.wardNo || '-'}</span>
          <span>এলাকা: {voterData.villageName || candidate.voterArea || '-'}</span>
        </div>
        <div className={`text-xs font-black text-slate-950 ${rowBorder}`}>
          ভোটারের নাম: <span className="text-[13px]">{voterData.name || '-'}</span>
        </div>
        <div className={`font-bold ${rowBorder}`}>
          পিতা/স্বামীর নাম: <span className="font-semibold">{voterData.fatherName || '-'}</span>
        </div>
        <div className={`font-bold ${rowBorder}`}>
          মাতার নাম: <span className="font-semibold">{voterData.motherName || '-'}</span>
        </div>
        <div className={`flex justify-between gap-2 font-bold ${rowBorder}`}>
          <span>
            ভোটার আইডি: <span className="font-mono font-extrabold">{voterData.voterId || '-'}</span>
          </span>
          <span>জন্ম: {voterData.dob || '-'}</span>
        </div>
        <div className={`font-bold ${rowBorder}`}>
          ভোট কেন্দ্র: <span className="font-extrabold">{candidate.pollingCenter || '-'}</span>
        </div>
        <div className={`font-bold ${rowBorder}`}>
          ঠিকানা: <span className="font-semibold">{voterData.address || voterData.villageName || '-'}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-3 overflow-y-auto">
      <canvas ref={canvasRef} className="hidden" />

      <div className="bg-white w-full max-w-6xl rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header Bar */}
        <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🗳️</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base leading-tight">
                  ভোটার কার্ড ও স্লিপ ডিজাইন স্টুডিও
                </h3>
                <span className="text-xs text-emerald-300 font-semibold">
                  · {candidate.templateTitle || `${candidate.name} (${candidate.symbolName})`}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                যেকোনো ভোটার স্লিপ সিলেক্ট করুন, নিজের মতো নাম-ছবি-মার্কা-স্লোগান এডিট করুন এবং প্রিন্ট করুন
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm cursor-pointer transition shrink-0"
            title="বন্ধ করুন"
          >
            ✕
          </button>
        </div>

        {/* Print Mode & Family Queue Bar */}
        <div className="bg-slate-100 px-3 sm:px-6 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActivePrintOption('normal')}
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                activePrintOption === 'normal'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <span>🖨️</span>
              <span>স্বাভাবিক প্রিন্ট (এক পেজে অনেক স্লিপ)</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePrintOption('bluetooth')}
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                activePrintOption === 'bluetooth'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <span>📶</span>
              <span>ব্লুটুথ থার্মাল প্রিন্ট</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setIsEditingCandidate(!isEditingCandidate)}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition border whitespace-nowrap ${
                isEditingCandidate
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-amber-400 hover:bg-amber-500 text-slate-950 border-amber-500'
              }`}
            >
              <span>✏️</span>
              <span>{isEditingCandidate ? 'এডিটর বন্ধ করুন' : 'স্লিপ নিজের মতো এডিট করুন'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFamilyFinder(!showFamilyFinder)}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition border whitespace-nowrap ${
                showFamilyFinder || slipQueue.length > 0
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
              }`}
            >
              <span>👨‍👩‍👧‍👦</span>
              <span>একসাথে স্লিপ ({convertToBengaliNumbers(slipQueue.length)} জন)</span>
            </button>
          </div>
        </div>

        {/* Notice Banner */}
        {notice && (
          <div className="bg-indigo-600 text-white text-xs font-bold py-2 px-4 text-center shrink-0">
            {notice}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 bg-slate-50">
          {/* 1. SAVED VOTER SLIP TEMPLATES SELECTOR BAR */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm">
                  🎨 রেডিমেড ভোটার কার্ড ও স্লিপ টেমপ্লেটসমূহ ({convertToBengaliNumbers(candidatesList.length)}টি)
                </h4>
                <p className="text-[11px] text-slate-500">
                  আপনার যে ভোটার কার্ডটি প্রয়োজন সেটিতে ক্লিক করুন এবং &ldquo;স্লিপ নিজের মতো এডিট করুন&rdquo; বাটনে চাপ দিয়ে যেকোনো নাম, ছবি, মার্কা বা লেখা পরিবর্তন করুন
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreateCustomTemplate}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold cursor-pointer transition whitespace-nowrap"
                >
                  ➕ নতুন কাস্টম স্লিপ যোগ করুন
                </button>
                <button
                  type="button"
                  onClick={handleResetTemplates}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold cursor-pointer transition whitespace-nowrap"
                  title="ডিফল্ট ৬টি স্লিপ ফিরিয়ে আনুন"
                >
                  🔄 রিসেট
                </button>
              </div>
            </div>

            {/* Horizontal Cards for Each Saved Voter Slip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {candidatesList.map((item) => {
                const isSelected = item.id === candidate.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectCandidateTemplate(item)}
                    className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2.5 ${
                      isSelected
                        ? 'bg-indigo-50/90 border-indigo-600 ring-1 ring-indigo-600'
                        : 'bg-slate-50/70 hover:bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={item.candidatePhotoUrl || './candidate-ataur.jpg'}
                        alt={item.name}
                        className="w-10 h-11 rounded-lg object-cover border border-slate-300 bg-white shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = './candidate-default.jpg';
                        }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 truncate">
                          {item.templateTitle || item.name}
                        </div>
                        <div className="text-[11px] text-slate-600 truncate">
                          {item.candidateBadge} · মার্কা: <b>{item.symbolName}</b>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <img
                        src={item.symbolPhotoUrl || './symbol-horse.png'}
                        alt={item.symbolName}
                        className="w-8 h-8 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = './symbol-default.png';
                        }}
                      />
                      {item.isCustom && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTemplate(item.id);
                          }}
                          className="w-6 h-6 rounded-full bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold flex items-center justify-center cursor-pointer"
                          title="কাস্টম স্লিপ মুছুন"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. FULL SLIP CUSTOMIZER / EDITOR PANEL (Expandable) */}
          {isEditingCandidate && (
            <div className="bg-white rounded-2xl p-4 border-2 border-amber-400 shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 flex-wrap gap-2">
                <div>
                  <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                    <span>✏️</span> ভোটার কার্ডের সকল লেখা, ডিজাইন, ছবি ও মার্কা নিজের মতো পরিবর্তন করুন
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    আপনি যা পরিবর্তন করবেন তা সাথে সাথে ডান পাশের লাইভ প্রিভিউতে দেখা যাবে এবং প্রিন্টে আসবে
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingCandidate(false)}
                  className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-extrabold cursor-pointer"
                >
                  ✓ সেভ ও সম্পন্ন
                </button>
              </div>

              {/* A. Choose 1 of 6 Slip Layout Styles */}
              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  ১. ভোটার স্লিপের ডিজাইন স্টাইল বেছে নিন (৬টি ভিন্ন লেআউট):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {SLIP_DESIGN_STYLES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => updateCandidateField({ designStyle: st.id })}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                        currentStyle === st.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 hover:bg-white text-slate-800 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-extrabold">{st.title}</span>
                      </div>
                      <div
                        className={`text-[10px] mt-0.5 ${
                          currentStyle === st.id ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {st.subtitle}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* B. Quick Symbol Gallery + Custom Image Upload */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                <label className="block text-xs font-extrabold text-slate-800">
                  ২. নির্বাচনী মার্কা সিলেক্ট করুন অথবা নিজের ফোন থেকে মার্কা ও প্রার্থীর ছবি আপলোড করুন:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ELECTION_SYMBOLS_GALLERY.map((sym) => {
                    const activeSym = candidate.symbolName === sym.name;
                    return (
                      <button
                        key={sym.id}
                        type="button"
                        onClick={() =>
                          updateCandidateField({
                            symbolName: sym.name,
                            symbolCallout: sym.callout,
                            symbolPhotoUrl: sym.imageUrl,
                          })
                        }
                        className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                          activeSym
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white hover:bg-indigo-50 text-slate-800 border-slate-200'
                        }`}
                      >
                        <img
                          src={sym.imageUrl}
                          alt={sym.name}
                          className="w-5 h-5 object-contain bg-white rounded-xs p-0.5"
                        />
                        <span>{sym.name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      📷 প্রার্থীর ছবি আপলোড করুন (মোবাইল/কম্পিউটার থেকে):
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleCandidatePhotoUpload}
                      className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
                    />
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      🖼️ যেকোনো মার্কার ছবি আপলোড করুন (কাস্টম মার্কা):
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSymbolPhotoUpload}
                      className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* C. All Editable Text Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">
                    স্লিপ টেমপ্লেটের নাম
                  </label>
                  <input
                    type="text"
                    value={candidate.templateTitle || ''}
                    onChange={(e) => updateCandidateField({ templateTitle: e.target.value })}
                    placeholder="যেমন: চেয়ারম্যান কার্ড (ঘোড়া মার্কা)"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">
                    উপরের ধর্মীয় লেখা (বিসমিল্লাহ/আল্লাহ্ সর্বশক্তিমান)
                  </label>
                  <input
                    type="text"
                    value={candidate.religiousHeader || ''}
                    onChange={(e) => updateCandidateField({ religiousHeader: e.target.value })}
                    placeholder="আল্লাহ্ সর্বশক্তিমান / বিসমিল্লাহির রাহমানির রাহিম"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">
                    ডান কোণার ব্যাজ লেখা
                  </label>
                  <input
                    type="text"
                    value={candidate.cardBadgeText ?? 'ভোটার কার্ড'}
                    onChange={(e) => updateCandidateField({ cardBadgeText: e.target.value })}
                    placeholder="ভোটার কার্ড"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">
                    নির্বাচনের শিরোনাম (১ম লাইন)
                  </label>
                  <input
                    type="text"
                    value={candidate.electionTitle || ''}
                    onChange={(e) => updateCandidateField({ electionTitle: e.target.value })}
                    placeholder="আগামী ৮ মে'২৪ বুধবার উপজেলা পরিষদ নির্বাচনে"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">
                    আসন / উপজেলা / ইউনিয়ন ও ওয়ার্ড (২য় লাইন)
                  </label>
                  <input
                    type="text"
                    value={candidate.constituencyText || ''}
                    onChange={(e) => updateCandidateField({ constituencyText: e.target.value })}
                    placeholder="মিরসরাই উপজেলা আসন হতে"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">
                    কালো বক্সের পদবী (চেয়ারম্যান/মেম্বার পদপ্রার্থী)
                  </label>
                  <input
                    type="text"
                    value={candidate.candidateBadge || ''}
                    onChange={(e) =>
                      updateCandidateField({
                        candidateBadge: e.target.value,
                        postTitle: e.target.value,
                      })
                    }
                    placeholder="চেয়ারম্যান পদপ্রার্থী / মেম্বার পদপ্রার্থী"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">
                    প্রার্থীর বিশেষণ / উপাধি (পদবীর পাশে)
                  </label>
                  <input
                    type="text"
                    value={candidate.electionSubtitle || ''}
                    onChange={(e) => updateCandidateField({ electionSubtitle: e.target.value })}
                    placeholder="পরিচ্ছন্ন রাজনীতিবিদ ও শিক্ষানুরাগী"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">
                    প্রার্থীর মূল নাম (বড় অক্ষরে)
                  </label>
                  <input
                    type="text"
                    value={candidate.name || ''}
                    onChange={(e) =>
                      updateCandidateField({
                        name: e.target.value,
                        candidateName: e.target.value,
                      })
                    }
                    placeholder="আলহাজ্ব শেখ মোঃ আতাউর রহমান"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none font-black text-indigo-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">
                    নামের পরের শব্দ (যেমন: কে)
                  </label>
                  <input
                    type="text"
                    value={candidate.candidateSuffix ?? 'কে'}
                    onChange={(e) => updateCandidateField({ candidateSuffix: e.target.value })}
                    placeholder="কে"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">মার্কার নাম</label>
                  <input
                    type="text"
                    value={candidate.symbolName || ''}
                    onChange={(e) => updateCandidateField({ symbolName: e.target.value })}
                    placeholder="ঘোড়া / তালা / আনারস"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">
                    মার্কার ভোটের আহ্বান লেখা
                  </label>
                  <input
                    type="text"
                    value={candidate.symbolCallout || ''}
                    onChange={(e) => updateCandidateField({ symbolCallout: e.target.value })}
                    placeholder="ঘোড়া মার্কায় ভোট দিন"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">
                    মার্কার নিচের স্লোগান / অঙ্গীকার
                  </label>
                  <input
                    type="text"
                    value={candidate.sloganText || ''}
                    onChange={(e) => updateCandidateField({ sloganText: e.target.value })}
                    placeholder="সন্ত্রাস, মাদকমুক্ত, স্মার্ট ও ডিজিটাল মিরসরাই গড়ার সুযোগ দিন"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">ভোট কেন্দ্রের নাম</label>
                  <input
                    type="text"
                    value={candidate.pollingCenter || ''}
                    onChange={(e) => updateCandidateField({ pollingCenter: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">ওয়ার্ড নং</label>
                  <input
                    type="text"
                    value={candidate.wardNo || ''}
                    onChange={(e) => updateCandidateField({ wardNo: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">ভোটার এলাকা / গ্রাম</label>
                  <input
                    type="text"
                    value={candidate.voterArea || ''}
                    onChange={(e) => updateCandidateField({ voterArea: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">
                    নিচের কালো বক্স (বাম: প্রচারে)
                  </label>
                  <input
                    type="text"
                    value={candidate.footerLeftText || ''}
                    onChange={(e) => updateCandidateField({ footerLeftText: e.target.value })}
                    placeholder="প্রচারে: মিরসরাই উপজেলার জনসাধারণ"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">
                    নিচের কালো বক্স (মাঝে: নির্দেশনা)
                  </label>
                  <input
                    type="text"
                    value={candidate.footerCenterText || ''}
                    onChange={(e) => updateCandidateField({ footerCenterText: e.target.value })}
                    placeholder="ভোট কেন্দ্রে আসার সময় দয়া করে কার্ডটি সঙ্গে আনবেন"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-0.5">
                    নিচের কালো বক্স (ডান: মুদ্রণে / সৌজন্যে)
                  </label>
                  <input
                    type="text"
                    value={candidate.footerRightText || ''}
                    onChange={(e) => updateCandidateField({ footerRightText: e.target.value })}
                    placeholder="মুদ্রণে: তিলোত্তমা মুদ্রণালয়, চট্টগ্রাম।"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                  />
                </div>
              </div>

              {/* D. Voter Information Fill Mode Selector */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                <span className="text-xs font-extrabold text-slate-800">
                  কার্ডের ভেতরে ভোটারের তথ্য যেভাবে থাকবে:
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'auto', label: '✅ অটোমেটিক ভোটারের তথ্য বসবে' },
                    { id: 'lined', label: '📝 ভোটার তথ্যের নিচে ডট লাইন' },
                    { id: 'blank', label: '📄 ফাঁকা কার্ড (হাতে লেখার জন্য খালি)' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        updateCandidateField({ voterInfoMode: m.id as VoterInfoFillMode })
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer border transition ${
                        fillMode === m.id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. FAMILY / MULTI-VOTER COLLECTOR PANEL */}
          {(showFamilyFinder || slipQueue.length > 0) && (
            <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-indigo-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm">
                    👨‍👩‍👧‍👦 এক পরিবারের বা একাধিক ভোটারের স্লিপ এক পেজে আনুন
                  </h4>
                  <p className="text-[11px] text-slate-600">
                    তালিকায় ভোটারদের নাম আলাদা জায়গায় থাকলেও এখান থেকে খুঁজে একসাথে এক পেজে প্রিন্ট করতে পারবেন
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      if (isCurrentInQueue) {
                        handleRemoveFromQueue(voterData);
                      } else {
                        handleAddSingleToQueue(voterData);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition ${
                      isCurrentInQueue
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {isCurrentInQueue ? '✓ বর্তমান ভোটার যুক্ত আছে' : '➕ বর্তমান ভোটারকে লিস্টে নিন'}
                  </button>

                  {suggestedFamilyMembers.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAddEntireFamilyToQueue}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-extrabold cursor-pointer transition"
                    >
                      👨‍👩‍👧‍👦 একই পরিবারের আরও {convertToBengaliNumbers(suggestedFamilyMembers.length)} জনকে একসাথে নিন
                    </button>
                  )}
                </div>
              </div>

              {showFamilyFinder && (
                <div className="pt-2 border-t border-slate-100 space-y-2.5">
                  <input
                    type="text"
                    value={familySearchQuery}
                    onChange={(e) => setFamilySearchQuery(e.target.value)}
                    placeholder="🔍 যেকোনো ভোটারের নাম, পিতার নাম, মাতার নাম বা ক্রমিক নং লিখে খুঁজুন..."
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 font-medium"
                  />

                  {familySearchQuery.trim() !== '' && (
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-2.5 max-h-44 overflow-y-auto space-y-1.5">
                      {quickSearchResults.length === 0 ? (
                        <div className="text-xs text-red-500 py-2 text-center font-semibold">
                          কোনো ভোটার পাওয়া যায়নি
                        </div>
                      ) : (
                        quickSearchResults.map((v) => {
                          const inQ = isVoterInSlipQueue(v, slipQueue);
                          return (
                            <div
                              key={getVoterUniqueKey(v)}
                              className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200 text-xs"
                            >
                              <div className="min-w-0">
                                <span className="font-extrabold text-indigo-700 mr-1.5">
                                  ক্রমিক {v.serialNo}:
                                </span>
                                <span className="font-bold text-slate-900">{v.name}</span>
                                <span className="text-slate-500 text-[11px] ml-2">
                                  (পিতা/স্বামী: {v.fatherName || '-'}, {v.villageName || ''})
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  inQ ? handleRemoveFromQueue(v) : handleAddSingleToQueue(v)
                                }
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer ${
                                  inQ
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : 'bg-indigo-600 text-white'
                                }`}
                              >
                                {inQ ? '✓ যুক্ত' : '➕ নিন'}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}

              {slipQueue.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-extrabold text-slate-900">
                      নির্বাচিত ভোটার লিস্ট ({convertToBengaliNumbers(slipQueue.length)} জন):
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleNormalPrint(slipQueue, pageLayoutMode)}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-extrabold cursor-pointer"
                      >
                        🖨️ এক পেজে প্রিন্ট করুন ({convertToBengaliNumbers(slipQueue.length)} জন)
                      </button>
                      <button
                        type="button"
                        onClick={handleClearQueue}
                        className="px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded-lg text-[11px] font-bold cursor-pointer"
                      >
                        সব মুছুন
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {slipQueue.map((item, idx) => (
                      <div
                        key={getVoterUniqueKey(item)}
                        className="inline-flex items-center gap-1.5 bg-white border border-slate-300 text-slate-900 px-2.5 py-1 rounded-lg text-xs font-bold"
                      >
                        <button
                          type="button"
                          onClick={() => setVoterData(item)}
                          className="hover:underline cursor-pointer"
                        >
                          {convertToBengaliNumbers(idx + 1)}. {item.name} (#{item.serialNo})
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromQueue(item)}
                          className="text-red-500 hover:text-red-700 font-black ml-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. MAIN 2-COLUMN WORKSPACE: Voter Selector (Left 5 Cols) + Live Voter Card Preview (Right 7 Cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Left Column: Voter Selector & Page Print Settings (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Quick Style Switcher Bar */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800">
                    🎨 কার্ডের ডিজাইন লেআউট পরিবর্তন:
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingCandidate(!isEditingCandidate)}
                    className="text-xs font-extrabold text-indigo-600 hover:underline cursor-pointer"
                  >
                    ✏️ সব লেখা ও ছবি এডিট করুন
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {SLIP_DESIGN_STYLES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => updateCandidateField({ designStyle: st.id })}
                      className={`px-2.5 py-1.5 rounded-lg border text-left text-[11px] font-bold cursor-pointer transition truncate ${
                        currentStyle === st.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {st.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voter Data Card & Fast Selector */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-200">
                <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                  <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                    👤 ভোটারের তথ্য ও পরিবর্তন
                  </h4>

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
                    className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 cursor-pointer"
                  >
                    ◀ আগের ভোটার
                  </button>

                  <span className="text-xs font-extrabold text-slate-800">
                    ক্রমিক: <span className="text-indigo-600">{voterData.serialNo || '-'}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => handleVoterNavigate('next')}
                    className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 cursor-pointer"
                  >
                    পরের ভোটার ▶
                  </button>
                </div>

                {/* Editable Voter Fields */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-0.5">ভোটারের নাম</label>
                    <input
                      type="text"
                      value={voterData.name || ''}
                      onChange={(e) => setVoterData({ ...voterData, name: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-800 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-0.5">ভোটার আইডি</label>
                    <input
                      type="text"
                      value={voterData.voterId || ''}
                      onChange={(e) => setVoterData({ ...voterData, voterId: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-0.5">পিতা/স্বামীর নাম</label>
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
                    <label className="block text-slate-600 font-semibold mb-0.5">গ্রাম / ঠিকানা</label>
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

              {/* Normal Multi-Slip Page Settings */}
              {activePrintOption === 'normal' && (
                <div className="bg-white rounded-2xl p-3.5 border border-slate-200 space-y-2.5">
                  <h4 className="font-extrabold text-slate-900 text-xs">
                    📄 এক পেজে কয়টি ভোটার কার্ড প্রিন্ট করবেন:
                  </h4>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {[
                      { id: 'sheet4', label: '৪টি কার্ড', sub: 'এক পেজে ৪টি' },
                      { id: 'sheet6', label: '৬টি কার্ড', sub: 'এক পেজে ৬টি' },
                      { id: 'sheet8', label: '৮টি কার্ড', sub: 'এক পেজে ৮টি' },
                      { id: 'single', label: '১টি বড় কার্ড', sub: 'সিঙ্গেল কার্ড' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPageLayoutMode(opt.id as PrintLayoutMode)}
                        className={`p-2 rounded-xl border text-left cursor-pointer transition ${
                          pageLayoutMode === opt.id
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 text-slate-800 border-slate-200'
                        }`}
                      >
                        <div className="text-xs font-extrabold">{opt.label}</div>
                        <div
                          className={`text-[10px] ${
                            pageLayoutMode === opt.id ? 'text-indigo-100' : 'text-slate-500'
                          }`}
                        >
                          {opt.sub}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-bold text-slate-700">প্রিন্ট কালার মোড:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setColorMode('bw')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                          colorMode === 'bw'
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        ⚫ সাদাকালো
                      </button>
                      <button
                        type="button"
                        onClick={() => setColorMode('color')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                          colorMode === 'color'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        🎨 রঙিন
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Live High-Precision Voter Card Preview (7 Cols) */}
            <div className="lg:col-span-7 flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-extrabold text-slate-700">
                  👁️ লাইভ ভোটার কার্ড প্রিভিউ ({SLIP_DESIGN_STYLES.find((s) => s.id === currentStyle)?.title})
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      updateCandidateField({
                        voterInfoMode: fillMode === 'blank' ? 'auto' : 'blank',
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-[11px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    {fillMode === 'blank' ? '✅ ভোটারের তথ্যসহ দেখুন' : '📄 ফাঁকা কার্ড প্রিভিউ দেখুন'}
                  </button>
                </div>
              </div>

              {/* ============================================================
                  STYLE 1 PREVIEW: CLASSIC VOTER CARD (Matches User's Image!)
                  ============================================================ */}
              {currentStyle === 'classic_voter_card' && (
                <div
                  className={`w-full bg-white border-[2.5px] border-slate-950 shadow-xl text-slate-950 select-none overflow-hidden ${
                    colorMode === 'bw' ? 'grayscale contrast-125' : ''
                  }`}
                >
                  <div className="flex items-stretch">
                    {/* Left Column (~31% width, dashed right border): Candidate Photo + Symbol + Callout + Slogan */}
                    <div className="w-[32%] sm:w-[30%] border-r-2 border-dashed border-slate-800 p-2.5 flex flex-col items-center justify-between text-center bg-white shrink-0">
                      <div className="w-full flex justify-center">
                        <img
                          src={candidate.candidatePhotoUrl || './candidate-ataur.jpg'}
                          alt={candidate.name}
                          className="w-full max-w-[140px] h-32 sm:h-36 object-cover object-top border-b-2 border-slate-950"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = './candidate-default.jpg';
                          }}
                        />
                      </div>

                      <div className="w-full flex justify-center py-1.5">
                        <img
                          src={candidate.symbolPhotoUrl || './symbol-horse.png'}
                          alt={candidate.symbolName}
                          className="w-full max-w-[125px] h-24 sm:h-28 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = './symbol-default.png';
                          }}
                        />
                      </div>

                      <div className="w-full">
                        <div className="text-sm sm:text-base font-black text-slate-950 leading-tight">
                          {candidate.symbolCallout || `${candidate.symbolName} মার্কায় ভোট দিন`}
                        </div>
                        {candidate.sloganText && (
                          <div className="text-[10px] sm:text-[11px] font-bold text-slate-900 leading-snug mt-1">
                            {candidate.sloganText}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column (~69% width): Header + Candidate Name + Dashed Line + Voter Info */}
                    <div className="flex-1 p-3 sm:p-4 flex flex-col justify-between relative min-w-0">
                      {/* Vertical Top-Right "ভোটার কার্ড" Ribbon */}
                      <div
                        className="absolute right-1.5 top-0 bg-slate-200 border border-slate-900 px-1.5 py-2 text-[11px] font-black text-slate-950 tracking-tight shadow-2xs"
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                      >
                        {candidate.cardBadgeText || 'ভোটার কার্ড'}
                      </div>

                      <div>
                        {/* Religious Header */}
                        <div className="text-center text-xs font-bold text-slate-950 mb-1.5">
                          {candidate.religiousHeader || 'আল্লাহ্ সর্বশক্তিমান'}
                        </div>

                        {/* Left-Bordered Election Title & Constituency */}
                        <div className="border-l-[4px] border-slate-950 pl-2.5 pr-7 mb-2 space-y-0.5">
                          <div className="text-sm sm:text-base font-extrabold text-slate-950 leading-tight">
                            {candidate.electionTitle}
                          </div>
                          {candidate.constituencyText && (
                            <div className="text-sm sm:text-[15px] font-extrabold text-slate-950 leading-tight">
                              {candidate.constituencyText}
                            </div>
                          )}
                        </div>

                        {/* Solid Black Inverted Position Box + Qualification */}
                        <div className="flex items-baseline gap-2 flex-wrap mb-2">
                          <span className="bg-slate-950 text-white text-sm sm:text-base font-black px-2.5 py-0.5 inline-block">
                            {candidate.candidateBadge || candidate.postTitle || 'চেয়ারম্যান পদপ্রার্থী'}
                          </span>
                          <span className="text-[11px] sm:text-xs font-bold text-slate-900">
                            {candidate.electionSubtitle}
                          </span>
                        </div>

                        {/* Left-Bordered Huge Candidate Name */}
                        <div className="border-l-[4px] border-slate-950 pl-2.5 mb-2 flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-lg sm:text-2xl font-black text-slate-950 leading-none tracking-tight">
                            {candidate.candidateName || candidate.name}
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold text-slate-950">
                            {candidate.candidateSuffix ?? 'কে'}
                          </span>
                        </div>

                        {/* Dashed Horizontal Divider */}
                        <div className="border-b-2 border-dashed border-slate-700 my-2" />
                      </div>

                      {/* Voter Information Area (Auto-filled or Blank lines) */}
                      <div className="flex-1 flex flex-col justify-center">
                        {renderLiveVoterBlock()}
                      </div>
                    </div>
                  </div>

                  {/* Full-Width 3-Column Solid Black Bottom Bar */}
                  <div className="bg-slate-950 text-white grid grid-cols-12 text-[10px] sm:text-[11px] font-extrabold border-t-2 border-slate-950">
                    <div className="col-span-4 px-2 py-1.5 truncate">
                      {candidate.footerLeftText || 'প্রচারে: সর্বস্তরের জনসাধারণ'}
                    </div>
                    <div className="col-span-4 px-2 py-1.5 border-x border-white text-center truncate">
                      {candidate.footerCenterText || 'ভোট কেন্দ্রে আসার সময় দয়া করে কার্ডটি সঙ্গে আনবেন'}
                    </div>
                    <div className="col-span-4 px-2 py-1.5 text-right truncate">
                      {candidate.footerRightText || `ওয়ার্ড নং: ${candidate.wardNo}`}
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================
                  STYLE 2 PREVIEW: MODERN SPLIT BANNER
                  ============================================================ */}
              {currentStyle === 'upazila_horizontal' && (
                <div
                  className={`w-full bg-white border-2 border-slate-950 shadow-xl text-slate-950 select-none overflow-hidden ${
                    colorMode === 'bw' ? 'grayscale contrast-125' : ''
                  }`}
                >
                  <div className="text-center text-xs font-bold py-1 border-b border-dotted border-slate-400">
                    {candidate.religiousHeader}
                  </div>
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <div>
                      <div className="text-sm font-extrabold">{candidate.electionTitle}</div>
                      <div className="text-[11px] text-slate-700">{candidate.electionSubtitle}</div>
                    </div>
                    <span className="bg-slate-950 text-white text-xs font-black px-2.5 py-0.5">
                      {candidate.candidateBadge}
                    </span>
                  </div>
                  <div className="text-center text-lg font-black border-y-2 border-slate-950 bg-slate-50 py-1">
                    {candidate.candidateName || candidate.name} {candidate.candidateSuffix ?? 'কে'}
                  </div>
                  <div className="flex items-stretch p-3 gap-3">
                    <div className="w-24 border-r border-dashed border-slate-400 pr-2 flex flex-col items-center justify-center text-center shrink-0">
                      <img
                        src={candidate.symbolPhotoUrl || './symbol-default.png'}
                        alt="মার্কা"
                        className="w-16 h-16 object-contain"
                      />
                      <div className="text-xs font-black mt-1">মার্কা: {candidate.symbolName}</div>
                      <div className="text-[10px] font-bold border border-slate-900 px-1.5 py-0.5 mt-1">
                        {candidate.symbolCallout}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">{renderLiveVoterBlock()}</div>
                    <div className="w-24 border border-slate-900 flex flex-col justify-between shrink-0">
                      <img
                        src={candidate.candidatePhotoUrl || './candidate-default.jpg'}
                        alt="প্রার্থী"
                        className="w-full h-28 object-cover"
                      />
                      <div className="bg-slate-950 text-white text-[10px] font-bold text-center py-0.5">
                        {candidate.postTitle || 'প্রার্থী'}
                      </div>
                    </div>
                  </div>
                  <div className="bg-slate-950 text-white grid grid-cols-3 text-[10px] font-bold">
                    <div className="px-2 py-1 truncate">{candidate.footerLeftText}</div>
                    <div className="px-2 py-1 border-x border-white text-center truncate">
                      {candidate.footerCenterText}
                    </div>
                    <div className="px-2 py-1 text-right truncate">{candidate.footerRightText}</div>
                  </div>
                </div>
              )}

              {/* ============================================================
                  STYLE 3, 4, 5, 6 PREVIEWS
                  ============================================================ */}
              {currentStyle !== 'classic_voter_card' && currentStyle !== 'upazila_horizontal' && (
                <div
                  className={`w-full bg-white border-2 border-slate-950 shadow-xl text-slate-950 select-none overflow-hidden ${
                    colorMode === 'bw' ? 'grayscale contrast-125' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 p-3 border-b-2 border-slate-950 bg-slate-50">
                    <img
                      src={candidate.candidatePhotoUrl || './candidate-default.jpg'}
                      alt="প্রার্থী"
                      className="w-20 h-24 object-cover border-2 border-slate-900 shrink-0"
                    />
                    <div className="flex-1 text-center min-w-0">
                      <div className="text-[11px] font-bold">{candidate.religiousHeader}</div>
                      <div className="text-xs sm:text-sm font-extrabold">{candidate.electionTitle}</div>
                      {candidate.constituencyText && (
                        <div className="text-xs font-bold text-slate-700">
                          {candidate.constituencyText}
                        </div>
                      )}
                      <div className="inline-block border border-slate-900 px-2 py-0.5 text-[11px] font-black mt-1">
                        {candidate.candidateBadge}
                      </div>
                      <div className="bg-slate-950 text-white text-base sm:text-lg font-black py-1 px-3 mt-1">
                        {candidate.candidateName || candidate.name} {candidate.candidateSuffix ?? 'কে'}
                      </div>
                    </div>
                    <div className="w-20 text-center shrink-0">
                      <img
                        src={candidate.symbolPhotoUrl || './symbol-horse.png'}
                        alt="মার্কা"
                        className="w-16 h-16 object-contain mx-auto"
                      />
                      <div className="text-[10px] font-black border border-slate-900 px-1 py-0.5 mt-1">
                        {candidate.symbolCallout}
                      </div>
                    </div>
                  </div>
                  <div className="p-3">{renderLiveVoterBlock()}</div>
                  <div className="bg-slate-950 text-white grid grid-cols-3 text-[10px] font-bold">
                    <div className="px-2 py-1 truncate">{candidate.footerLeftText}</div>
                    <div className="px-2 py-1 border-x border-white text-center truncate">
                      {candidate.footerCenterText}
                    </div>
                    <div className="px-2 py-1 text-right truncate">{candidate.footerRightText}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Action Bar */}
        <div className="bg-white border-t border-slate-200 px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {activePrintOption === 'bluetooth' ? (
            <>
              <div className="flex items-center gap-2">
                {bluetoothDevice ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                      ব্লুটুথ সংযুক্ত: {bluetoothDevice.name}
                    </span>
                    <button
                      type="button"
                      onClick={handleDisconnectBluetooth}
                      className="text-xs text-red-600 hover:underline font-bold cursor-pointer"
                    >
                      ডিসকানেক্ট
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectBluetooth}
                    disabled={isConnectingBt}
                    className="soft-btn px-3.5 py-2 text-indigo-700 hover:bg-indigo-50 text-xs font-bold cursor-pointer"
                  >
                    📶 {isConnectingBt ? 'প্রিন্টার খুঁজছি...' : 'ব্লুটুথ প্রিন্টার কানেক্ট করুন'}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handlePrintBluetooth([voterData])}
                  disabled={isPrintingBt}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm shadow-sm cursor-pointer transition"
                >
                  ⚡ {isPrintingBt ? `প্রিন্ট হচ্ছে ${btProgress}%...` : 'ব্লুটুথ থার্মাল প্রিন্ট (১ জন)'}
                </button>

                {slipQueue.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handlePrintBluetooth(slipQueue)}
                    disabled={isPrintingBt}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold px-4 py-2.5 rounded-xl text-xs sm:text-sm cursor-pointer transition"
                  >
                    👨‍👩‍👧‍👦 ব্লুটুথে পরিবারের সব প্রিন্ট ({convertToBengaliNumbers(slipQueue.length)} জন)
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDownloadImage}
                  className="soft-btn text-slate-700 font-bold px-3 py-2.5 rounded-xl text-xs cursor-pointer"
                >
                  💾 ছবি সেভ
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <span>
                  নির্বাচিত ভোটার: <b>{convertToBengaliNumbers(effectiveBatchVoters.length)} জন</b>
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500 hidden sm:inline">
                  এক পেজে একাধিক কার্ড সাজিয়ে প্রিন্ট বা PDF সেভ হবে
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleNormalPrint(effectiveBatchVoters, pageLayoutMode)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs sm:text-sm shadow-sm cursor-pointer transition"
                >
                  🖨️{' '}
                  {slipQueue.length > 0
                    ? `এক পেজে সব প্রিন্ট করুন (${convertToBengaliNumbers(slipQueue.length)} জন)`
                    : 'স্বাভাবিক প্রিন্ট / PDF করুন'}
                </button>

                {slipQueue.length === 0 && suggestedFamilyMembers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const famAll = [voterData, ...suggestedFamilyMembers];
                      handleNormalPrint(famAll, 'sheet4');
                    }}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold px-4 py-2.5 rounded-xl text-xs sm:text-sm cursor-pointer transition"
                  >
                    👨‍👩‍👧‍👦 পরিবারের সবাইকে এক পেজে প্রিন্ট (
                    {convertToBengaliNumbers(suggestedFamilyMembers.length + 1)} জন)
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDownloadImage}
                  className="soft-btn text-slate-700 font-bold px-3 py-2.5 rounded-xl text-xs cursor-pointer"
                >
                  💾 ছবি সেভ
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
