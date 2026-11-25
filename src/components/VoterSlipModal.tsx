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
  getDefaultPrintPrefs,
  saveDefaultPrintPrefs,
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
  DEFAULT_SLIP_FOOTER_TEXT,
} from '../lib/voterSlipUtils';
import {
  connectBluetoothPrinter,
  disconnectBluetoothPrinter,
  getConnectedPrinter,
  autoConnectBluetoothPrinter,
  canvasToEscPosBytes,
  sendEscPosToPrinter,
  BluetoothPrinterDevice,
  BluetoothPrinterError,
  PairedBluetoothDevice,
  NativeBluetoothListResult,
  isAndroidNativeBluetooth,
  isBluetoothSupported,
  listNativePairedPrinters,
  connectNativePrinterByAddress,
  openAndroidBluetoothSettings,
  requestAndroidBluetoothPermissions,
  createTestPrintEscPosBytes,
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

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawImageCoverTop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / boxRatio;
    sy = 0; // Keep top aligned so candidate head/face is never cropped
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/**
 * Draw Voter Slip onto a 384px wide canvas (Standard 58mm POS thermal printer width)
 * NO QR CODE — clean, high-contrast thermal layout with prominent Candidate Photo & Symbol
 */
async function drawThermalSlipToCanvas(
  canvas: HTMLCanvasElement,
  voter: Voter,
  config: CandidateProfile
): Promise<void> {
  const width = 384;
  const height = 510;
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

  if (config.electionTitle) {
    ctx.font = '900 15px "Noto Sans Bengali", sans-serif';
    ctx.fillText(config.electionTitle.slice(0, 34), width / 2, 28);
  }

  ctx.font = 'bold 11px "Noto Sans Bengali", sans-serif';
  ctx.fillText(
    (config.constituencyText || config.electionSubtitle || '').slice(0, 42),
    width / 2,
    49
  );

  ctx.font = 'bold 12px monospace';
  ctx.fillText('------------------------------------------------', width / 2, 66);

  // Left: Symbol (large & clear, 84x80)
  if (symImg) {
    drawImageContain(ctx, symImg, 8, 78, 84, 80);
  }
  ctx.font = 'bold 11.5px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`মার্কা: ${config.symbolName || 'ঘোড়া'}`, 50, 162, 92);
  ctx.strokeRect(6, 179, 88, 19);
  ctx.font = 'bold 10px "Noto Sans Bengali", sans-serif';
  ctx.fillText((config.symbolCallout || 'ভোট দিন').slice(0, 16), 50, 183, 84);

  // Right: Candidate Photo (maximally sized 116x138 — noticeably larger than symbol!)
  if (candImg) {
    drawImageCoverTop(ctx, candImg, width - 124, 76, 116, 138);
  }
  ctx.lineWidth = 1.5;
  ctx.strokeRect(width - 124, 76, 116, 138);
  ctx.lineWidth = 1;
  ctx.font = 'bold 10.5px "Noto Sans Bengali", sans-serif';
  ctx.fillText('প্রার্থী', width - 66, 217);

  // Center text column (x: 98..254, center 176)
  const centerX = 176;
  ctx.fillStyle = '#000000';
  ctx.fillRect(102, 86, 148, 22);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 11.5px "Noto Sans Bengali", sans-serif';
  ctx.fillText(config.candidateBadge || config.postTitle || 'পদপ্রার্থী', centerX, 91, 140);

  ctx.fillStyle = '#000000';
  ctx.font = '900 16px "Noto Sans Bengali", sans-serif';
  ctx.fillText(
    `${config.candidateName || config.name} ${config.candidateSuffix || 'কে'}`.slice(0, 22),
    centerX,
    118,
    152
  );

  ctx.font = 'bold 10.5px "Noto Sans Bengali", sans-serif';
  ctx.fillText((config.electionSubtitle || '').slice(0, 26), centerX, 145, 152);

  ctx.font = 'bold 12px monospace';
  ctx.fillText('================================================', width / 2, 232);

  ctx.textAlign = 'left';
  ctx.font = 'bold 13px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`ভোট কেন্দ্র: ${config.pollingCenter || '-'}`, 12, 250);
  ctx.fillText(`এলাকা: ${voter.villageName || config.voterArea || '-'}`, 12, 270);
  ctx.textAlign = 'right';
  ctx.fillText(`ওয়ার্ড নং: ${config.wardNo || '-'}`, width - 12, 270);

  ctx.textAlign = 'center';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('------------------------------------------------', width / 2, 288);

  ctx.textAlign = 'left';
  ctx.font = '900 16px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`ক্রমিক: ${voter.serialNo || '-'} | ${voter.name || '-'}`, 14, 308);

  ctx.font = 'bold 14px monospace';
  ctx.fillText(`ভোটার আইডি: ${voter.voterId || '-'}`, 14, 334);

  ctx.font = 'bold 13px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`পিতা/স্বামী: ${voter.fatherName || '-'}`, 14, 357);
  ctx.fillText(`মাতা: ${voter.motherName || '-'}`, 14, 380);

  const extraLine = [
    voter.dob ? `জন্ম: ${voter.dob}` : '',
    voter.profession ? `পেশা: ${voter.profession}` : '',
  ]
    .filter(Boolean)
    .join('  |  ');
  if (extraLine) {
    ctx.font = 'bold 12px "Noto Sans Bengali", sans-serif';
    ctx.fillText(extraLine, 14, 403);
  }

  ctx.font = 'bold 12px "Noto Sans Bengali", sans-serif';
  ctx.fillText(`ঠিকানা: ${voter.address || voter.villageName || '-'}`, 14, 424);

  ctx.textAlign = 'center';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('------------------------------------------------', width / 2, 445);
  ctx.font = 'bold 12px "Noto Sans Bengali", sans-serif';
  ctx.fillText(
    (config.footerCenterText || DEFAULT_SLIP_FOOTER_TEXT).slice(0, 44),
    width / 2,
    463
  );
  ctx.font = 'bold 11px monospace';
  ctx.fillText('================================================', width / 2, 484);
}

export const VoterSlipModal: React.FC<VoterSlipModalProps> = ({
  isOpen,
  onClose,
  voter,
  allVillages = {},
}) => {
  // Two separate screens:
  // 'preview' = Front instant print preview page (Always opens first, no settings clutter!)
  // 'settings' = Back settings page where default candidate, card layout, photos & print options are configured
  const [activeScreen, setActiveScreen] = useState<'preview' | 'settings'>('preview');

  // Bluetooth Print Preview is ALWAYS the default when opening voter slip print!
  const [activePrintOption, setActivePrintOption] = useState<'bluetooth' | 'normal'>('bluetooth');

  const [candidatesList, setCandidatesList] = useState<CandidateProfile[]>(() =>
    getAllCandidates()
  );
  const [candidate, setCandidate] = useState<CandidateProfile>(() => getActiveCandidate());

  // Default Print Page Preferences (saved in localStorage so user sets once in Settings)
  const [pageLayoutMode, setPageLayoutMode] = useState<PrintLayoutMode>(
    () => getDefaultPrintPrefs().pageLayoutMode
  );
  const [colorMode, setColorMode] = useState<'bw' | 'color'>(
    () => getDefaultPrintPrefs().colorMode
  );

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
  const [isEditingVoter, setIsEditingVoter] = useState(false);

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
  const [isTestingBt, setIsTestingBt] = useState(false);
  const [btProgress, setBtProgress] = useState(0);
  const [showBtPicker, setShowBtPicker] = useState(false);
  const [nativeBtList, setNativeBtList] = useState<NativeBluetoothListResult | null>(null);
  const [btStatusError, setBtStatusError] = useState<{ code?: string; message: string } | null>(
    null
  );
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

  // Every time the modal opens for a voter:
  // 1. Always show the clean Front Print Preview page ('preview')
  // 2. Always default to Bluetooth Print Preview ('bluetooth')
  // 3. Always load the user's saved Default Candidate & Default Print Preferences
  useEffect(() => {
    if (isOpen) {
      setActiveScreen('preview');
      setActivePrintOption('bluetooth');
      setShowFamilyFinder(false);
      setIsEditingVoter(false);
      setShowBtPicker(false);
      setBtStatusError(null);
      if (voter) {
        setVoterData(voter);
        if (voter.villageName) setSelectedVillage(voter.villageName);
      }
      setSlipQueue(getSlipQueue());
      setCandidatesList(getAllCandidates());
      setCandidate(getActiveCandidate());
      const prefs = getDefaultPrintPrefs();
      setPageLayoutMode(prefs.pageLayoutMode);
      setColorMode(prefs.colorMode);
    }
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
      if (document.visibilityState === 'visible') {
        checkAutoConnect();
        if (isAndroidNativeBluetooth()) {
          const refreshed = listNativePairedPrinters();
          if (mounted) setNativeBtList(refreshed);
        }
      }
    };
    const onPermissionsUpdated = () => {
      if (isAndroidNativeBluetooth()) {
        const refreshed = listNativePairedPrinters();
        if (mounted) {
          setNativeBtList(refreshed);
          if (refreshed.success) {
            setBtStatusError(null);
          }
        }
      }
      checkAutoConnect();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    window.addEventListener('voter_bt_permissions_updated', onPermissionsUpdated);

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener('voter_bt_permissions_updated', onPermissionsUpdated);
    };
  }, [isOpen]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  // Update active candidate field & persist immediately as Default Candidate
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

  const handleSelectDefaultCandidate = (selected: CandidateProfile) => {
    setCandidate(selected);
    setActiveCandidateId(selected.id);
    showNotice(
      `📌 "${selected.templateTitle || selected.name}" ডিফল্ট প্রার্থী হিসেবে সেট করা হয়েছে!`
    );
  };

  const handleUpdatePrintPrefs = (
    nextLayout: PrintLayoutMode,
    nextColor: 'bw' | 'color'
  ) => {
    setPageLayoutMode(nextLayout);
    setColorMode(nextColor);
    saveDefaultPrintPrefs({
      pageLayoutMode: nextLayout,
      colorMode: nextColor,
    });
  };

  const handleCreateCustomTemplate = () => {
    const created = createNewCandidateTemplate(candidate);
    setCandidatesList(getAllCandidates());
    setCandidate(created);
    showNotice('✨ নতুন কাস্টম ভোটার স্লিপ তৈরি ও ডিফল্ট হিসেবে সেট হয়েছে!');
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
          showNotice('✅ প্রার্থীর ছবি আপডেট ও ডিফল্ট হিসেবে সেভ হয়েছে!');
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
          showNotice('✅ মার্কার ছবি আপডেট ও ডিফল্ট হিসেবে সেভ হয়েছে!');
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

  const refreshNativeBluetoothList = (): NativeBluetoothListResult | null => {
    if (!isAndroidNativeBluetooth()) return null;
    const listRes = listNativePairedPrinters();
    setNativeBtList(listRes);
    if (!listRes.success) {
      setBtStatusError({ code: listRes.errorCode, message: listRes.error });
    } else {
      setBtStatusError(null);
    }
    return listRes;
  };

  const handleSelectNativePrinter = async (dev: PairedBluetoothDevice) => {
    setIsConnectingBt(true);
    setBtStatusError(null);
    try {
      const connected = await connectNativePrinterByAddress(dev.address, dev.name);
      setBluetoothDevice(connected);
      setShowBtPicker(false);
      showNotice(`✅ "${connected.name}" প্রিন্টারের সাথে সফলভাবে কানেক্ট হয়েছে!`);
    } catch (err: any) {
      const code = err instanceof BluetoothPrinterError ? err.code : 'CONNECT_FAILED';
      const message =
        err?.message || 'প্রিন্টারে কানেক্ট করা যায়নি। প্রিন্টারটি অন আছে কিনা দেখুন।';
      setBtStatusError({ code, message });
      showNotice(`⚠️ ${message}`);
    } finally {
      setIsConnectingBt(false);
    }
  };

  const handleConnectBluetooth = async () => {
    // Inside Android APK: open the Paired Bluetooth Printer Picker so user can pick ANY paired printer
    if (isAndroidNativeBluetooth()) {
      const listRes = refreshNativeBluetoothList();
      setShowBtPicker(true);
      if (listRes && listRes.success && listRes.devices.length === 1 && !bluetoothDevice) {
        await handleSelectNativePrinter(listRes.devices[0]);
      }
      return;
    }

    // In Web Browser (Chrome / Edge / Safari)
    setIsConnectingBt(true);
    setBtStatusError(null);
    try {
      const dev = await connectBluetoothPrinter();
      setBluetoothDevice(dev);
      setShowBtPicker(false);
      showNotice(`✅ "${dev.name}" প্রিন্টারের সাথে সফলভাবে কানেক্ট হয়েছে!`);
    } catch (err: any) {
      if (err?.name !== 'NotFoundError') {
        const code = err instanceof BluetoothPrinterError ? err.code : 'CONNECT_FAILED';
        const message = err?.message || 'প্রিন্টারের ব্লুটুথ অন রাখুন';
        setBtStatusError({ code, message });
        setShowBtPicker(true);
        showNotice(`⚠️ কানেক্ট ব্যর্থ: ${message}`);
      }
    } finally {
      setIsConnectingBt(false);
    }
  };

  const handleDisconnectBluetooth = async () => {
    await disconnectBluetoothPrinter();
    setBluetoothDevice(null);
    setBtStatusError(null);
    showNotice('ব্লুটুথ প্রিন্টার ডিসকানেক্ট করা হয়েছে।');
  };

  const handleTestBluetoothPrint = async () => {
    const printer = bluetoothDevice || getConnectedPrinter();
    if (!printer) {
      setShowBtPicker(true);
      refreshNativeBluetoothList();
      showNotice('আগে আপনার ব্লুটুথ প্রিন্টারটি সিলেক্ট করুন।');
      return;
    }
    setIsTestingBt(true);
    setBtStatusError(null);
    try {
      const testBytes = createTestPrintEscPosBytes(printer.name);
      await sendEscPosToPrinter(printer, testBytes);
      showNotice(`✅ "${printer.name}"-এ টেস্ট প্রিন্ট পাঠানো হয়েছে!`);
    } catch (err: any) {
      const code = err instanceof BluetoothPrinterError ? err.code : 'PRINT_FAILED';
      const message = err?.message || 'টেস্ট প্রিন্ট ব্যর্থ হয়েছে। প্রিন্টারটি অন আছে কিনা দেখুন।';
      setBtStatusError({ code, message });
      setShowBtPicker(true);
      showNotice(`⚠️ ${message}`);
    } finally {
      setIsTestingBt(false);
    }
  };

  const handlePrintBluetooth = async (votersToPrint: Voter[]) => {
    if (votersToPrint.length === 0) return;
    setIsPrintingBt(true);
    setBtProgress(0);
    setBtStatusError(null);
    try {
      let printer = bluetoothDevice || getConnectedPrinter();
      if (!printer) {
        printer = await autoConnectBluetoothPrinter();
      }
      if (!printer) {
        if (isAndroidNativeBluetooth()) {
          const listRes = refreshNativeBluetoothList();
          if (!listRes || !listRes.success) {
            setShowBtPicker(true);
            showNotice(`⚠️ ${listRes?.error || 'ব্লুটুথ প্রিন্টার পাওয়া যায়নি।'}`);
            return;
          }
          if (listRes.devices.length === 1) {
            printer = await connectNativePrinterByAddress(
              listRes.devices[0].address,
              listRes.devices[0].name
            );
          } else {
            setShowBtPicker(true);
            showNotice('নিচের তালিকা থেকে আপনার ব্লুটুথ প্রিন্টারটি সিলেক্ট করুন।');
            return;
          }
        } else {
          showNotice('ডিভাইস খুঁজছি... আপনার ব্লুটুথ প্রিন্টারটি সিলেক্ট করুন');
          printer = await connectBluetoothPrinter();
        }
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

      setShowBtPicker(false);
      showNotice(
        `🎉 থার্মাল প্রিন্টারে ${convertToBengaliNumbers(votersToPrint.length)}টি ভোটার স্লিপ সফলভাবে প্রিন্ট হয়েছে!`
      );
    } catch (err: any) {
      console.warn('Bluetooth print error:', err);
      if (err?.name !== 'NotFoundError') {
        const code = err instanceof BluetoothPrinterError ? err.code : 'PRINT_FAILED';
        const message = err?.message || 'প্রিন্টারটি অন করে আবার চেষ্টা করুন';
        setBtStatusError({ code, message });
        setShowBtPicker(true);
        if (isAndroidNativeBluetooth()) {
          refreshNativeBluetoothList();
        }
        showNotice(`⚠️ প্রিন্ট ত্রুটি: ${message}`);
      }
    } finally {
      setIsPrintingBt(false);
    }
  };

  const handleNormalPrint = (votersToPrint: Voter[], mode: PrintLayoutMode = pageLayoutMode) => {
    if (votersToPrint.length === 0) return;
    showNotice(
      `🖨️ ${convertToBengaliNumbers(votersToPrint.length)} জন ভোটারের কার্ড প্রিন্ট হচ্ছে...`
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

  // Helper to render voter info inside Normal Card live preview
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

  // Helper to render the Normal Print Card Preview (used in Normal Print Preview & Settings Live Preview)
  const renderNormalCardPreview = () => {
    if (currentStyle === 'classic_voter_card') {
      return (
        <div
          className={`w-full max-w-2xl mx-auto bg-white border-[2.5px] border-slate-950 shadow-xl text-slate-950 select-none overflow-hidden ${
            colorMode === 'bw' ? 'grayscale contrast-125' : ''
          }`}
        >
          <div className="flex items-stretch">
            {/* Left Column: Candidate Photo + Symbol + Callout + Slogan */}
            <div className="w-[38%] sm:w-[37%] border-r-2 border-dashed border-slate-800 p-2 sm:p-2.5 flex flex-col items-center justify-between text-center bg-white shrink-0">
              <div className="w-full flex justify-center">
                <img
                  src={candidate.candidatePhotoUrl || './candidate-ataur.jpg'}
                  alt={candidate.name}
                  className="w-full max-w-[196px] h-44 sm:h-52 object-cover object-top border-b-2 border-slate-950"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = './candidate-default.jpg';
                  }}
                />
              </div>

              <div className="w-full flex justify-center py-1.5">
                <img
                  src={candidate.symbolPhotoUrl || './symbol-horse.png'}
                  alt={candidate.symbolName}
                  className="w-full max-w-[132px] h-24 sm:h-28 object-contain"
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

            {/* Right Column: Header + Candidate Name + Dashed Line + Voter Info */}
            <div className="flex-1 p-3 sm:p-4 flex flex-col justify-between relative min-w-0">
              {candidate.cardBadgeText && (
                <div
                  className="absolute right-1.5 top-0 bg-slate-200 border border-slate-900 px-1.5 py-2 text-[11px] font-black text-slate-950 tracking-tight shadow-2xs"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  {candidate.cardBadgeText}
                </div>
              )}

              <div>
                <div className="text-center text-xs font-bold text-slate-950 mb-1.5">
                  {candidate.religiousHeader || 'আল্লাহ্ সর্বশক্তিমান'}
                </div>

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

                <div className="flex items-baseline gap-2 flex-wrap mb-2">
                  <span className="bg-slate-950 text-white text-sm sm:text-base font-black px-2.5 py-0.5 inline-block">
                    {candidate.candidateBadge || candidate.postTitle || 'চেয়ারম্যান পদপ্রার্থী'}
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-900">
                    {candidate.electionSubtitle}
                  </span>
                </div>

                <div className="border-l-[4px] border-slate-950 pl-2.5 mb-2 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-lg sm:text-2xl font-black text-slate-950 leading-none tracking-tight">
                    {candidate.candidateName || candidate.name}
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-slate-950">
                    {candidate.candidateSuffix ?? 'কে'}
                  </span>
                </div>

                <div className="border-b-2 border-dashed border-slate-700 my-2" />
              </div>

              <div className="flex-1 flex flex-col justify-center">{renderLiveVoterBlock()}</div>
            </div>
          </div>

          <div className="bg-slate-950 text-white grid grid-cols-12 text-[10px] sm:text-[11px] font-extrabold border-t-2 border-slate-950">
            <div className="col-span-4 px-2 py-1.5 truncate">
              {candidate.footerLeftText || 'প্রচারে: সর্বস্তরের জনসাধারণ'}
            </div>
            <div className="col-span-4 px-2 py-1.5 border-x border-white text-center truncate">
              {candidate.footerCenterText || DEFAULT_SLIP_FOOTER_TEXT}
            </div>
            <div className="col-span-4 px-2 py-1.5 text-right truncate">
              {candidate.footerRightText || `ওয়ার্ড নং: ${candidate.wardNo}`}
            </div>
          </div>
        </div>
      );
    }

    if (currentStyle === 'upazila_horizontal') {
      return (
        <div
          className={`w-full max-w-2xl mx-auto bg-white border-2 border-slate-950 shadow-xl text-slate-950 select-none overflow-hidden ${
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
          <div className="flex items-stretch p-3 gap-2.5">
            <div className="w-24 sm:w-28 border-r border-dashed border-slate-400 pr-2 flex flex-col items-center justify-center text-center shrink-0">
              <img
                src={candidate.symbolPhotoUrl || './symbol-default.png'}
                alt="মার্কা"
                className="w-20 h-20 object-contain"
              />
              <div className="text-xs font-black mt-1">মার্কা: {candidate.symbolName}</div>
              <div className="text-[10px] font-bold border border-slate-900 px-1.5 py-0.5 mt-1">
                {candidate.symbolCallout}
              </div>
            </div>
            <div className="flex-1 min-w-0">{renderLiveVoterBlock()}</div>
            <div className="w-32 sm:w-36 border border-slate-900 flex flex-col justify-between shrink-0">
              <img
                src={candidate.candidatePhotoUrl || './candidate-default.jpg'}
                alt="প্রার্থী"
                className="w-full h-36 sm:h-40 object-cover object-top"
              />
              <div className="bg-slate-950 text-white text-[10px] font-bold text-center py-0.5">
                {candidate.postTitle || 'প্রার্থী'}
              </div>
            </div>
          </div>
          <div className="bg-slate-950 text-white grid grid-cols-3 text-[10px] font-bold">
            <div className="px-2 py-1 truncate">{candidate.footerLeftText}</div>
            <div className="px-2 py-1 border-x border-white text-center truncate">
              {candidate.footerCenterText || DEFAULT_SLIP_FOOTER_TEXT}
            </div>
            <div className="px-2 py-1 text-right truncate">{candidate.footerRightText}</div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`w-full max-w-2xl mx-auto bg-white border-2 border-slate-950 shadow-xl text-slate-950 select-none overflow-hidden ${
          colorMode === 'bw' ? 'grayscale contrast-125' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2.5 p-3 border-b-2 border-slate-950 bg-slate-50">
          <img
            src={candidate.candidatePhotoUrl || './candidate-default.jpg'}
            alt="প্রার্থী"
            className="w-28 sm:w-32 h-36 sm:h-40 object-cover object-top border-2 border-slate-900 shrink-0"
          />
          <div className="flex-1 text-center min-w-0">
            <div className="text-[11px] font-bold">{candidate.religiousHeader}</div>
            <div className="text-xs sm:text-sm font-extrabold">{candidate.electionTitle}</div>
            {candidate.constituencyText && (
              <div className="text-xs font-bold text-slate-700">{candidate.constituencyText}</div>
            )}
            <div className="inline-block border border-slate-900 px-2 py-0.5 text-[11px] font-black mt-1">
              {candidate.candidateBadge}
            </div>
            <div className="bg-slate-950 text-white text-base sm:text-lg font-black py-1 px-3 mt-1">
              {candidate.candidateName || candidate.name} {candidate.candidateSuffix ?? 'কে'}
            </div>
          </div>
          <div className="w-24 sm:w-28 text-center shrink-0">
            <img
              src={candidate.symbolPhotoUrl || './symbol-horse.png'}
              alt="মার্কা"
              className="w-20 h-20 object-contain mx-auto"
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
            {candidate.footerCenterText || DEFAULT_SLIP_FOOTER_TEXT}
          </div>
          <div className="px-2 py-1 text-right truncate">{candidate.footerRightText}</div>
        </div>
      </div>
    );
  };

  // Helper to render the 58mm Bluetooth Thermal Receipt Preview
  const renderBluetoothThermalPreview = () => {
    return (
      <div className="w-full max-w-[360px] mx-auto bg-white border-2 border-slate-900 shadow-xl p-4 text-slate-950 font-sans select-none grayscale contrast-125">
        <div className="text-center border-b-2 border-dashed border-slate-900 pb-2">
          <div className="text-xs font-bold">
            {candidate.religiousHeader || 'বিসমিল্লাহির রাহমানির রাহিম'}
          </div>
          {candidate.electionTitle && (
            <div className="text-sm font-black mt-0.5 leading-snug">{candidate.electionTitle}</div>
          )}
          {(candidate.constituencyText || candidate.electionSubtitle) && (
            <div className="text-[11px] font-bold text-slate-800 mt-0.5">
              {candidate.constituencyText || candidate.electionSubtitle}
            </div>
          )}
        </div>

        {/* Candidate Photo + Symbol + Name block */}
        <div className="flex items-center justify-between gap-2 py-2.5 border-b-2 border-double border-slate-950">
          <div className="w-[84px] shrink-0 flex flex-col items-center text-center">
            <img
              src={candidate.symbolPhotoUrl || './symbol-horse.png'}
              alt={candidate.symbolName}
              className="w-[74px] h-[70px] object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = './symbol-default.png';
              }}
            />
            <span className="text-[10.5px] font-black mt-0.5 leading-tight">মার্কা: {candidate.symbolName}</span>
          </div>

          <div className="flex-1 min-w-0 text-center space-y-1">
            <span className="inline-block bg-slate-950 text-white text-[10.5px] font-black px-2 py-0.5">
              {candidate.candidateBadge || candidate.postTitle || 'পদপ্রার্থী'}
            </span>
            <div className="text-[15px] font-black leading-tight break-words">
              {candidate.candidateName || candidate.name} {candidate.candidateSuffix ?? 'কে'}
            </div>
            <div className="inline-block border border-slate-950 text-[9.5px] font-black px-1.5 py-0.5 leading-tight">
              {candidate.symbolCallout || `${candidate.symbolName} মার্কায় ভোট দিন`}
            </div>
          </div>

          <div className="w-[114px] shrink-0 flex flex-col items-center text-center">
            <img
              src={candidate.candidatePhotoUrl || './candidate-ataur.jpg'}
              alt={candidate.name}
              className="w-[110px] h-[130px] object-cover object-top border-[1.5px] border-slate-950"
              onError={(e) => {
                (e.target as HTMLImageElement).src = './candidate-default.jpg';
              }}
            />
            <span className="text-[10px] font-bold mt-0.5">প্রার্থী</span>
          </div>
        </div>

        {/* Center & Ward */}
        <div className="py-1.5 border-b border-dashed border-slate-800 text-xs font-bold space-y-0.5">
          <div>
            ভোট কেন্দ্র: <span className="font-black">{candidate.pollingCenter || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span>এলাকা: {voterData.villageName || candidate.voterArea || '-'}</span>
            <span>ওয়ার্ড নং: {candidate.wardNo || '-'}</span>
          </div>
        </div>

        {/* Voter Details */}
        <div className="py-2 space-y-1 text-xs">
          <div className="text-sm font-black bg-slate-100 border border-slate-900 px-2 py-1">
            ক্রমিক: {voterData.serialNo || '-'} | {voterData.name || '-'}
          </div>
          <div className="font-mono font-black text-[13px] pt-0.5">
            ভোটার আইডি: {voterData.voterId || '-'}
          </div>
          <div className="font-bold">পিতা/স্বামী: {voterData.fatherName || '-'}</div>
          <div className="font-bold">মাতা: {voterData.motherName || '-'}</div>
          {(voterData.dob || voterData.profession) && (
            <div className="font-bold text-[11px]">
              {voterData.dob ? `জন্ম: ${voterData.dob}` : ''}{' '}
              {voterData.profession ? `| পেশা: ${voterData.profession}` : ''}
            </div>
          )}
          <div className="font-bold">
            ঠিকানা: {voterData.address || voterData.villageName || '-'}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t-2 border-dashed border-slate-900 pt-1.5 text-center text-[11px] font-extrabold">
          {candidate.footerCenterText || DEFAULT_SLIP_FOOTER_TEXT}
        </div>
      </div>
    );
  };

  // Inline Bluetooth Printer Picker & Diagnostics Panel (Android Native SPP + Web BLE)
  const renderBluetoothManagerPanel = () => {
    if (!showBtPicker) return null;
    const isNative = isAndroidNativeBluetooth();
    const devices = nativeBtList?.devices || [];
    const errorCode = btStatusError?.code || nativeBtList?.errorCode || '';
    const errorMessage = btStatusError?.message || (!nativeBtList?.success ? nativeBtList?.error : '');

    return (
      <div
        data-testid="bluetooth-picker-panel"
        className="w-full max-w-[380px] bg-white border-2 border-emerald-200 rounded-2xl p-3 shadow-sm space-y-2.5 text-xs"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div className="font-black text-slate-900 flex items-center gap-1.5">
            <span>📶</span>
            <span>ব্লুটুথ প্রিন্টার নির্বাচন ও সংযোগ</span>
          </div>
          <button
            type="button"
            onClick={() => setShowBtPicker(false)}
            className="text-slate-400 hover:text-slate-700 font-bold px-1.5 py-0.5 rounded cursor-pointer"
            aria-label="ব্লুটুথ প্যানেল বন্ধ করুন"
          >
            ✕
          </button>
        </div>

        {/* Active connected printer banner */}
        {bluetoothDevice && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-extrabold text-emerald-900 truncate">
                  🟢 সংযুক্ত: {bluetoothDevice.name}
                </div>
                {bluetoothDevice.address && (
                  <div className="text-[10px] font-mono text-emerald-700">
                    {bluetoothDevice.address}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleDisconnectBluetooth}
                className="px-2 py-1 rounded-lg bg-white border border-red-200 text-red-600 font-bold text-[11px] hover:bg-red-50 cursor-pointer shrink-0"
              >
                ডিসকানেক্ট
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleTestBluetoothPrint}
                disabled={isTestingBt || isPrintingBt}
                className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-extrabold text-[11px] cursor-pointer"
              >
                {isTestingBt ? '⏳ টেস্ট হচ্ছে...' : '🧪 টেস্ট প্রিন্ট করুন'}
              </button>
              {isNative && (
                <button
                  type="button"
                  onClick={refreshNativeBluetoothList}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 font-bold text-[11px] hover:bg-emerald-100 cursor-pointer"
                >
                  🔄 রিফ্রেশ
                </button>
              )}
            </div>
          </div>
        )}

        {/* Clear error notice + one-tap Android recovery buttons */}
        {errorMessage && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-2.5 space-y-2">
            <p className="font-bold leading-snug">⚠️ {errorMessage}</p>
            {isNative && (
              <div className="flex flex-wrap gap-1.5">
                {errorCode === 'PERMISSION_DENIED' && (
                  <button
                    type="button"
                    onClick={() => {
                      requestAndroidBluetoothPermissions();
                      showNotice('ব্লুটুথ (Nearby Devices) অনুমতি Allow করুন।');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] cursor-pointer"
                  >
                    🔐 ব্লুটুথ অনুমতি দিন
                  </button>
                )}
                {(errorCode === 'BLUETOOTH_DISABLED' ||
                  errorCode === 'NO_PAIRED_DEVICES' ||
                  errorCode === 'CONNECT_FAILED' ||
                  errorCode === 'PRINT_FAILED') && (
                  <button
                    type="button"
                    onClick={() => openAndroidBluetoothSettings()}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[11px] cursor-pointer"
                  >
                    ⚙️ ফোনের ব্লুটুথ সেটিংস
                  </button>
                )}
                <button
                  type="button"
                  onClick={refreshNativeBluetoothList}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-amber-400 text-amber-900 font-bold text-[11px] hover:bg-amber-100 cursor-pointer"
                >
                  🔄 আবার খুঁজুন
                </button>
              </div>
            )}
          </div>
        )}

        {/* Android Native Paired Devices List */}
        {isNative ? (
          <div className="space-y-1.5">
            {devices.length > 0 && (
              <>
                <div className="text-[11px] font-bold text-slate-600">
                  ফোনে পেয়ার করা ব্লুটুথ ডিভাইস ({convertToBengaliNumbers(devices.length)}টি) — আপনার
                  প্রিন্টারটিতে ট্যাপ করুন:
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-0.5">
                  {devices.map((dev) => {
                    const isCurrent =
                      bluetoothDevice?.address &&
                      bluetoothDevice.address.toLowerCase() === dev.address.toLowerCase();
                    return (
                      <button
                        key={dev.address}
                        type="button"
                        disabled={isConnectingBt}
                        onClick={() => handleSelectNativePrinter(dev)}
                        className={`w-full text-left px-3 py-2 rounded-xl border transition flex items-center justify-between gap-2 cursor-pointer ${
                          isCurrent
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                            : 'bg-slate-50 hover:bg-emerald-50 border-slate-200 hover:border-emerald-300 text-slate-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-extrabold truncate flex items-center gap-1.5">
                            <span>{dev.isLikelyPrinter ? '🖨️' : '📶'}</span>
                            <span className="truncate">{dev.name}</span>
                            {dev.isLikelyPrinter && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold shrink-0">
                                প্রিন্টার
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                            {dev.address}
                          </div>
                        </div>
                        <span className="text-[11px] font-extrabold text-emerald-700 shrink-0">
                          {isConnectingBt
                            ? '...'
                            : isCurrent
                            ? '✓ সংযুক্ত'
                            : 'কানেক্ট'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
              <button
                type="button"
                onClick={() => openAndroidBluetoothSettings()}
                className="text-[11px] font-bold text-indigo-700 hover:underline cursor-pointer"
              >
                ⚙️ নতুন প্রিন্টার পেয়ার করুন (ফোন সেটিংস)
              </button>
              <button
                type="button"
                onClick={refreshNativeBluetoothList}
                className="text-[11px] font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                🔄 রিফ্রেশ
              </button>
            </div>
          </div>
        ) : (
          /* Web Browser (Chrome/Edge/Safari) Bluetooth Controls */
          <div className="space-y-2">
            {isBluetoothSupported() ? (
              <button
                type="button"
                onClick={async () => {
                  setIsConnectingBt(true);
                  setBtStatusError(null);
                  try {
                    const dev = await connectBluetoothPrinter();
                    setBluetoothDevice(dev);
                    setShowBtPicker(false);
                    showNotice(`✅ "${dev.name}" প্রিন্টারের সাথে সফলভাবে কানেক্ট হয়েছে!`);
                  } catch (err: any) {
                    if (err?.name !== 'NotFoundError') {
                      setBtStatusError({
                        code: err instanceof BluetoothPrinterError ? err.code : 'CONNECT_FAILED',
                        message: err?.message || 'প্রিন্টারে কানেক্ট করা যায়নি।',
                      });
                    }
                  } finally {
                    setIsConnectingBt(false);
                  }
                }}
                disabled={isConnectingBt}
                className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold cursor-pointer"
              >
                {isConnectingBt ? '⏳ ডিভাইস খুঁজছি...' : '🔍 ব্লুটুথ প্রিন্টার খুঁজুন (Web Bluetooth)'}
              </button>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-700 font-semibold leading-relaxed">
                ℹ️ এই ব্রাউজার সরাসরি ব্লুটুথ সাপোর্ট করে না। ৫৮মিমি থার্মাল প্রিন্টারের জন্য{' '}
                <span className="font-extrabold text-slate-900">অ্যান্ড্রয়েড APK অ্যাপ</span> অথবা{' '}
                <span className="font-extrabold text-slate-900">Google Chrome</span> ব্যবহার করুন।
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 flex items-end sm:items-center justify-center p-0 sm:p-3 overflow-y-auto">
      <canvas ref={canvasRef} className="hidden" />

      <div className="bg-white text-slate-900 w-full max-w-4xl rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        {/* =====================================================================
            TOP HEADER BAR
            ===================================================================== */}
        <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-2xl shrink-0">{activeScreen === 'preview' ? '🗳️' : '⚙️'}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base leading-tight truncate">
                  {activeScreen === 'preview'
                    ? 'ভোটার স্লিপ প্রিন্ট প্রিভিউ'
                    : 'স্লিপ সেটিং ও ডিফল্ট প্রার্থী সেটআপ পেজ'}
                </h3>
                <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-md font-bold truncate">
                  ডিফল্ট: {candidate.candidateName || candidate.name} ({candidate.symbolName})
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5 truncate">
                {activeScreen === 'preview'
                  ? 'ডিফল্ট প্রার্থীর স্লিপ প্রস্তুত — প্রিভিউ দেখে সরাসরি প্রিন্ট বাটনে চাপ দিন'
                  : 'এখানে যা সেটআপ করে রাখবেন, যেকোনো ভোটার স্লিপ প্রিন্টে ক্লিক করলে সেটিই সবসময় সামনে আসবে'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeScreen === 'preview' ? (
              <button
                type="button"
                onClick={() => setActiveScreen('settings')}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-amber-300 border border-amber-400/30 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition"
                title="ডিফল্ট প্রার্থী ও প্রিন্ট সেটিং পরিবর্তন করুন"
              >
                <span>⚙️</span>
                <span>সেটিং</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActiveScreen('preview');
                  showNotice('✅ ডিফল্ট সেটিং সংরক্ষিত হয়েছে!');
                }}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition"
              >
                <span>⬅️</span>
                <span>প্রিন্ট প্রিভিউতে ফিরুন</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm cursor-pointer transition shrink-0"
              title="বন্ধ করুন"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Notice Banner */}
        {notice && (
          <div className="bg-indigo-600 text-white text-xs font-bold py-2 px-4 text-center shrink-0">
            {notice}
          </div>
        )}

        {/* =====================================================================
            SCREEN 1: CLEAN FRONT PRINT PREVIEW PAGE (NO SETTINGS CLUTTER!)
            ===================================================================== */}
        {activeScreen === 'preview' && (
          <>
            {/* Top Mode Switcher Bar: Bluetooth Print Preview (Default) vs Normal Print Preview */}
            <div className="bg-slate-100 px-3 sm:px-6 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActivePrintOption('bluetooth')}
                  className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                    activePrintOption === 'bluetooth'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                  }`}
                >
                  <span>📶</span>
                  <span>ব্লুটুথ প্রিন্ট প্রিভিউ (ডিফল্ট)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActivePrintOption('normal')}
                  className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                    activePrintOption === 'normal'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                  }`}
                >
                  <span>🖨️</span>
                  <span>সাধারণ প্রিন্ট প্রিভিউ</span>
                </button>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                {/* Compact Voter Switcher */}
                <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => handleVoterNavigate('prev')}
                    className="px-2 py-0.5 hover:bg-slate-100 rounded-md text-slate-700 cursor-pointer"
                    title="আগের ভোটার"
                  >
                    ◀
                  </button>
                  <span className="px-1.5 text-slate-800 truncate max-w-[150px]">
                    #{voterData.serialNo} {voterData.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleVoterNavigate('next')}
                    className="px-2 py-0.5 hover:bg-slate-100 rounded-md text-slate-700 cursor-pointer"
                    title="পরের ভোটার"
                  >
                    ▶
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowFamilyFinder(!showFamilyFinder)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 cursor-pointer transition border whitespace-nowrap ${
                    showFamilyFinder || slipQueue.length > 0
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                      : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                  }`}
                >
                  <span>👨‍👩‍👧‍👦</span>
                  <span>একসাথে ({convertToBengaliNumbers(slipQueue.length)})</span>
                </button>
              </div>
            </div>

            {/* Center Preview Workspace */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-50 flex flex-col items-center justify-start space-y-4">
              {/* Optional Expandable Family / Multi-Voter Queue Box */}
              {(showFamilyFinder || slipQueue.length > 0) && (
                <div className="w-full max-w-2xl bg-white rounded-2xl p-3.5 border border-indigo-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-slate-900">
                      👨‍👩‍👧‍👦 এক পরিবারের বা একাধিক ভোটার একসাথে প্রিন্ট ({convertToBengaliNumbers(slipQueue.length)} জন)
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() =>
                          isCurrentInQueue
                            ? handleRemoveFromQueue(voterData)
                            : handleAddSingleToQueue(voterData)
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer ${
                          isCurrentInQueue
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-indigo-600 text-white'
                        }`}
                      >
                        {isCurrentInQueue ? '✓ বর্তমান ভোটার যুক্ত' : '➕ বর্তমান ভোটার যোগ করুন'}
                      </button>

                      {suggestedFamilyMembers.length > 0 && (
                        <button
                          type="button"
                          onClick={handleAddEntireFamilyToQueue}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-[11px] font-extrabold cursor-pointer"
                        >
                          👨‍👩‍👧‍👦 পরিবারের সবাইকে নিন (+{convertToBengaliNumbers(suggestedFamilyMembers.length)})
                        </button>
                      )}

                      {slipQueue.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearQueue}
                          className="px-2 py-1 bg-red-50 text-red-600 rounded-lg text-[11px] font-bold cursor-pointer"
                        >
                          খালি করুন
                        </button>
                      )}
                    </div>
                  </div>

                  {showFamilyFinder && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={familySearchQuery}
                        onChange={(e) => setFamilySearchQuery(e.target.value)}
                        placeholder="🔍 অন্য ভোটারের নাম, পিতার নাম বা ক্রমিক নং লিখে খুঁজুন..."
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600"
                      />
                      {familySearchQuery.trim() !== '' && (
                        <div className="bg-slate-50 rounded-xl border border-slate-200 p-2 max-h-36 overflow-y-auto space-y-1">
                          {quickSearchResults.length === 0 ? (
                            <div className="text-xs text-red-500 py-1 text-center font-semibold">
                              কোনো ভোটার পাওয়া যায়নি
                            </div>
                          ) : (
                            quickSearchResults.map((v) => {
                              const inQ = isVoterInSlipQueue(v, slipQueue);
                              return (
                                <div
                                  key={getVoterUniqueKey(v)}
                                  className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white border border-slate-200 text-xs"
                                >
                                  <div className="min-w-0 truncate">
                                    <b className="text-indigo-700">#{v.serialNo}</b> {v.name}{' '}
                                    <span className="text-slate-500 text-[11px]">
                                      ({v.fatherName || '-'})
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      inQ ? handleRemoveFromQueue(v) : handleAddSingleToQueue(v)
                                    }
                                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0 cursor-pointer ${
                                      inQ
                                        ? 'bg-emerald-100 text-emerald-800'
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
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {slipQueue.map((item, idx) => (
                        <div
                          key={getVoterUniqueKey(item)}
                          className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-300 text-slate-900 px-2 py-0.5 rounded-lg text-[11px] font-bold"
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
                            className="text-red-500 font-black cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* LIVE PREVIEW DISPLAY + OPTIONAL INLINE VOTER INFO EDITOR */}
              <div
                className={`w-full ${
                  isEditingVoter
                    ? 'max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-4 items-start'
                    : 'flex flex-col items-center'
                }`}
              >
                <div className={isEditingVoter ? 'lg:col-span-7 w-full' : 'w-full'}>
                  {activePrintOption === 'bluetooth' ? (
                    <div className="w-full flex flex-col items-center space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 w-full max-w-[360px] text-xs">
                        <span className="font-extrabold text-slate-700">
                          📶 থার্মাল প্রিন্ট প্রিভিউ (৫৮মিমি)
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setIsEditingVoter((prev) => !prev)}
                            className={`px-2.5 py-1 rounded-lg font-extrabold text-[11px] border cursor-pointer transition flex items-center gap-1 ${
                              isEditingVoter
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'
                            }`}
                          >
                            <span>{isEditingVoter ? '✅' : '✏️'}</span>
                            <span>{isEditingVoter ? 'এডিট বন্ধ' : 'ভোটারের তথ্য এডিট'}</span>
                          </button>

                          {bluetoothDevice ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (isAndroidNativeBluetooth()) refreshNativeBluetoothList();
                                setShowBtPicker((prev) => !prev);
                              }}
                              className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg font-bold text-[11px] cursor-pointer flex items-center gap-1"
                              title="প্রিন্টার ম্যানেজ বা পরিবর্তন করুন"
                            >
                              <span>🟢</span>
                              <span className="max-w-[110px] truncate">{bluetoothDevice.name}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={handleConnectBluetooth}
                              disabled={isConnectingBt}
                              className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg font-bold text-[11px] cursor-pointer"
                            >
                              {isConnectingBt ? 'খুঁজছি...' : '🔗 প্রিন্টার'}
                            </button>
                          )}
                        </div>
                      </div>

                      {renderBluetoothManagerPanel()}

                      {renderBluetoothThermalPreview()}
                    </div>
                  ) : (
                    <div className="w-full flex flex-col items-center space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 w-full max-w-2xl text-xs">
                        <span className="font-extrabold text-slate-700">
                          🖨️ সাধারণ প্রিন্ট প্রিভিউ (
                          {SLIP_DESIGN_STYLES.find((s) => s.id === currentStyle)?.title})
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-semibold text-[11px] hidden sm:inline">
                            {pageLayoutMode === 'sheet4'
                              ? 'এক পেজে ৪টি'
                              : pageLayoutMode === 'sheet6'
                              ? 'এক পেজে ৬টি'
                              : pageLayoutMode === 'sheet8'
                              ? 'এক পেজে ৮টি'
                              : '১টি বড় কার্ড'}{' '}
                            · {colorMode === 'bw' ? 'সাদাকালো' : 'রঙিন'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsEditingVoter((prev) => !prev)}
                            className={`px-2.5 py-1 rounded-lg font-extrabold text-[11px] border cursor-pointer transition flex items-center gap-1 ${
                              isEditingVoter
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'
                            }`}
                          >
                            <span>{isEditingVoter ? '✅' : '✏️'}</span>
                            <span>{isEditingVoter ? 'এডিট বন্ধ' : 'ভোটারের তথ্য এডিট'}</span>
                          </button>
                        </div>
                      </div>

                      {renderNormalCardPreview()}
                    </div>
                  )}
                </div>

                {/* On-Demand Inline Voter Info Editor right beside Print Preview */}
                {isEditingVoter && (
                  <div className="lg:col-span-5 w-full max-w-md mx-auto bg-white rounded-2xl border border-indigo-200 shadow-sm p-3.5 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h4 className="font-black text-slate-900 text-xs sm:text-sm">
                        ✏️ ভোটারের তথ্য এডিট করুন
                      </h4>
                      <div className="flex items-center gap-1.5">
                        {voter && (
                          <button
                            type="button"
                            onClick={() => {
                              setVoterData(voter);
                              showNotice('🔄 মূল ভোটারের তথ্য পুনরায় আনা হয়েছে।');
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer"
                          >
                            🔄 রিসেট
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsEditingVoter(false)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                        >
                          ✓ সম্পন্ন
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="edit-voter-name"
                          className="block text-[11px] font-bold text-slate-600 mb-0.5"
                        >
                          ভোটারের নাম
                        </label>
                        <input
                          id="edit-voter-name"
                          type="text"
                          value={voterData.name || ''}
                          onChange={(e) => setVoterData({ ...voterData, name: e.target.value })}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="edit-voter-serial"
                          className="block text-[11px] font-bold text-slate-600 mb-0.5"
                        >
                          ক্রমিক নং
                        </label>
                        <input
                          id="edit-voter-serial"
                          type="text"
                          value={voterData.serialNo || ''}
                          onChange={(e) => setVoterData({ ...voterData, serialNo: e.target.value })}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none font-bold"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="edit-voter-id"
                          className="block text-[11px] font-bold text-slate-600 mb-0.5"
                        >
                          ভোটার আইডি নং
                        </label>
                        <input
                          id="edit-voter-id"
                          type="text"
                          value={voterData.voterId || ''}
                          onChange={(e) => setVoterData({ ...voterData, voterId: e.target.value })}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none font-mono"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="edit-voter-father"
                          className="block text-[11px] font-bold text-slate-600 mb-0.5"
                        >
                          পিতা / স্বামীর নাম
                        </label>
                        <input
                          id="edit-voter-father"
                          type="text"
                          value={voterData.fatherName || ''}
                          onChange={(e) =>
                            setVoterData({ ...voterData, fatherName: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="edit-voter-mother"
                          className="block text-[11px] font-bold text-slate-600 mb-0.5"
                        >
                          মাতার নাম
                        </label>
                        <input
                          id="edit-voter-mother"
                          type="text"
                          value={voterData.motherName || ''}
                          onChange={(e) =>
                            setVoterData({ ...voterData, motherName: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="edit-voter-dob"
                          className="block text-[11px] font-bold text-slate-600 mb-0.5"
                        >
                          জন্ম তারিখ
                        </label>
                        <input
                          id="edit-voter-dob"
                          type="text"
                          value={voterData.dob || ''}
                          onChange={(e) => setVoterData({ ...voterData, dob: e.target.value })}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="edit-voter-profession"
                          className="block text-[11px] font-bold text-slate-600 mb-0.5"
                        >
                          পেশা
                        </label>
                        <input
                          id="edit-voter-profession"
                          type="text"
                          value={voterData.profession || ''}
                          onChange={(e) =>
                            setVoterData({ ...voterData, profession: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="edit-voter-village"
                          className="block text-[11px] font-bold text-slate-600 mb-0.5"
                        >
                          এলাকা / গ্রাম
                        </label>
                        <input
                          id="edit-voter-village"
                          type="text"
                          value={voterData.villageName || ''}
                          onChange={(e) =>
                            setVoterData({ ...voterData, villageName: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="edit-voter-address"
                          className="block text-[11px] font-bold text-slate-600 mb-0.5"
                        >
                          ঠিকানা
                        </label>
                        <input
                          id="edit-voter-address"
                          type="text"
                          value={voterData.address || ''}
                          onChange={(e) => setVoterData({ ...voterData, address: e.target.value })}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                        />
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-500 pt-0.5">
                      💡 এখানে যেকোনো তথ্য পরিবর্তন করলে সাথে সাথে প্রিভিউ ও প্রিন্ট স্লিপে আপডেট হবে।
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Immediate Print Action Bar */}
            <div className="bg-white border-t border-slate-200 px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
              {activePrintOption === 'bluetooth' ? (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePrintBluetooth([voterData])}
                      disabled={isPrintingBt}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-3 rounded-xl text-sm sm:text-base shadow-md cursor-pointer transition flex items-center gap-2"
                    >
                      <span>⚡</span>
                      <span>
                        {isPrintingBt
                          ? `প্রিন্ট হচ্ছে ${btProgress}%...`
                          : 'এখনই ব্লুটুথ প্রিন্ট করুন'}
                      </span>
                    </button>

                    {slipQueue.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handlePrintBluetooth(slipQueue)}
                        disabled={isPrintingBt}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold px-4 py-3 rounded-xl text-xs sm:text-sm cursor-pointer transition"
                      >
                        👨‍👩‍👧‍👦 সব প্রিন্ট ({convertToBengaliNumbers(slipQueue.length)} জন)
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleNormalPrint(effectiveBatchVoters, pageLayoutMode)}
                      className="px-3.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-extrabold text-xs cursor-pointer transition"
                    >
                      🖨️ সাধারণ প্রিন্ট
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadImage}
                      className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition"
                    >
                      💾 ছবি সেভ
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleNormalPrint(effectiveBatchVoters, pageLayoutMode)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-3 rounded-xl text-sm sm:text-base shadow-md cursor-pointer transition flex items-center gap-2"
                    >
                      <span>🖨️</span>
                      <span>
                        {slipQueue.length > 1
                          ? `এখনই এক পেজে প্রিন্ট করুন (${convertToBengaliNumbers(slipQueue.length)} জন)`
                          : 'এখনই প্রিন্ট করুন'}
                      </span>
                    </button>

                    {slipQueue.length === 0 && suggestedFamilyMembers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const famAll = [voterData, ...suggestedFamilyMembers];
                          handleNormalPrint(famAll, pageLayoutMode);
                        }}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold px-4 py-3 rounded-xl text-xs sm:text-sm cursor-pointer transition"
                      >
                        👨‍👩‍👧‍👦 পরিবারের সবাইকে এক পেজে প্রিন্ট (
                        {convertToBengaliNumbers(suggestedFamilyMembers.length + 1)} জন)
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePrintBluetooth([voterData])}
                      disabled={isPrintingBt}
                      className="px-3.5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-extrabold text-xs cursor-pointer transition"
                    >
                      📶 ব্লুটুথ প্রিন্ট
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadImage}
                      className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition"
                    >
                      💾 ছবি সেভ
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* =====================================================================
            SCREEN 2: SEPARATE BEHIND-THE-SCENES SETTINGS & DEFAULT SETUP PAGE
            ===================================================================== */}
        {activeScreen === 'settings' && (
          <>
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 bg-slate-50">
              {/* 1. DEFAULT CANDIDATE & TEMPLATE SELECTOR */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm">
                      📌 ১. আপনার ডিফল্ট প্রার্থী ও ভোটার স্লিপ টেমপ্লেট সিলেক্ট করুন ({convertToBengaliNumbers(candidatesList.length)}টি)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      এখানে যে প্রার্থী ও স্লিপটি সিলেক্ট করে রাখবেন, যেকোনো ভোটার স্লিপ প্রিন্টে ক্লিক করলে সেটিই সরাসরি সামনে আসবে
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
                    >
                      🔄 রিসেট
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {candidatesList.map((item) => {
                    const isSelected = item.id === candidate.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectDefaultCandidate(item)}
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
                            {isSelected && (
                              <span className="inline-block text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-xs mt-0.5">
                                ✓ ডিফল্ট সেট করা আছে
                              </span>
                            )}
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

              {/* 2. SLIP LAYOUT STYLE & PRINT PAGE PREFERENCES */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-900 mb-2">
                    🎨 ২. ভোটার কার্ডের ডিফল্ট ডিজাইন লেআউট বেছে নিন (৬টি স্টাইল):
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
                        <div className="text-xs font-extrabold">{st.title}</div>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-200">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                      📄 সাধারণ প্রিন্টে এক পেজে কয়টি কার্ড থাকবে (ডিফল্ট):
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'sheet4', label: '৪টি কার্ড (এক পেজে ৪টি)' },
                        { id: 'sheet6', label: '৬টি কার্ড (এক পেজে ৬টি)' },
                        { id: 'sheet8', label: '৮টি কার্ড (এক পেজে ৮টি)' },
                        { id: 'single', label: '১টি বড় সিঙ্গেল কার্ড' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            handleUpdatePrintPrefs(opt.id as PrintLayoutMode, colorMode)
                          }
                          className={`px-2.5 py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                            pageLayoutMode === opt.id
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 text-slate-800 border-slate-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                        🎨 ডিফল্ট প্রিন্ট কালার মোড:
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdatePrintPrefs(pageLayoutMode, 'bw')}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                            colorMode === 'bw'
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          ⚫ সাদাকালো প্রিন্ট
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdatePrintPrefs(pageLayoutMode, 'color')}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                            colorMode === 'color'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          🎨 রঙিন প্রিন্ট
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-extrabold text-slate-800 mb-1">
                        📶 ব্লুটুথ থার্মাল প্রিন্টার সংযোগ:
                      </label>
                      {bluetoothDevice ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-xs">
                          <span className="font-bold text-emerald-800 truncate">
                            🟢 সংযুক্ত: {bluetoothDevice.name}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={handleTestBluetoothPrint}
                              disabled={isTestingBt}
                              className="text-emerald-700 font-extrabold hover:underline cursor-pointer"
                            >
                              {isTestingBt ? '⏳ টেস্ট...' : '🧪 টেস্ট'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (isAndroidNativeBluetooth()) refreshNativeBluetoothList();
                                setShowBtPicker((prev) => !prev);
                              }}
                              className="text-indigo-700 font-bold hover:underline cursor-pointer"
                            >
                              বদলান
                            </button>
                            <button
                              type="button"
                              onClick={handleDisconnectBluetooth}
                              className="text-red-600 font-bold hover:underline cursor-pointer"
                            >
                              ডিসকানেক্ট
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleConnectBluetooth}
                          disabled={isConnectingBt}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold cursor-pointer"
                        >
                          📶 {isConnectingBt ? 'খুঁজছি...' : 'ব্লুটুথ প্রিন্টার পেয়ার / কানেক্ট করুন'}
                        </button>
                      )}
                      {activeScreen === 'settings' && renderBluetoothManagerPanel()}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. CANDIDATE DETAILS, PHOTOS & SYMBOL CUSTOMIZER */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-4">
                <h4 className="font-black text-slate-900 text-xs sm:text-sm">
                  ✏️ ৩. ডিফল্ট প্রার্থীর নাম, ছবি, মার্কা ও কার্ডের সব লেখা কাস্টমাইজ করুন:
                </h4>

                {/* Quick Symbol Gallery + Uploads */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                  <label className="block text-xs font-extrabold text-slate-800">
                    নির্বাচনী মার্কা গ্যালারি (অথবা নিজের ছবি আপলোড করুন):
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
                        📷 প্রার্থীর ছবি আপলোড করুন:
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
                        🖼️ কাস্টম মার্কার ছবি আপলোড করুন:
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

                {/* All Editable Text Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">
                      টেমপ্লেটের নাম
                    </label>
                    <input
                      type="text"
                      value={candidate.templateTitle || ''}
                      onChange={(e) => updateCandidateField({ templateTitle: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">
                      উপরের ধর্মীয় লেখা
                    </label>
                    <input
                      type="text"
                      value={candidate.religiousHeader || ''}
                      onChange={(e) => updateCandidateField({ religiousHeader: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">
                      ডান কোণার ব্যাজ লেখা
                    </label>
                    <input
                      type="text"
                      value={candidate.cardBadgeText ?? ''}
                      onChange={(e) => updateCandidateField({ cardBadgeText: e.target.value })}
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
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">
                      আসন / উপজেলা / ইউনিয়ন (২য় লাইন)
                    </label>
                    <input
                      type="text"
                      value={candidate.constituencyText || ''}
                      onChange={(e) => updateCandidateField({ constituencyText: e.target.value })}
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
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">
                      প্রার্থীর বিশেষণ / উপাধি
                    </label>
                    <input
                      type="text"
                      value={candidate.electionSubtitle || ''}
                      onChange={(e) => updateCandidateField({ electionSubtitle: e.target.value })}
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
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">মার্কার নাম</label>
                    <input
                      type="text"
                      value={candidate.symbolName || ''}
                      onChange={(e) => updateCandidateField({ symbolName: e.target.value })}
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
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">
                      নিচের কালো বক্স (ডান: মুদ্রণে)
                    </label>
                    <input
                      type="text"
                      value={candidate.footerRightText || ''}
                      onChange={(e) => updateCandidateField({ footerRightText: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-indigo-600 outline-none"
                    />
                  </div>
                </div>

                {/* Voter Info Fill Mode */}
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

              {/* 4. LIVE MINI PREVIEW INSIDE SETTINGS */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2.5">
                <span className="text-xs font-extrabold text-slate-700 block">
                  👁️ আপনার সেটআপকৃত ডিফল্ট কার্ডের প্রিভিউ:
                </span>
                {renderNormalCardPreview()}
              </div>
            </div>

            {/* Settings Bottom Bar */}
            <div className="bg-white border-t border-slate-200 px-4 py-3 sm:px-6 flex items-center justify-between gap-3 shrink-0">
              <span className="text-xs font-bold text-slate-600">
                আপনার সকল পরিবর্তন স্বয়ংক্রিয়ভাবে ডিফল্ট হিসেবে সংরক্ষিত হয়েছে
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveScreen('preview');
                  showNotice('✅ ডিফল্ট সেটিং সংরক্ষিত হয়েছে!');
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-2.5 rounded-xl text-xs sm:text-sm cursor-pointer transition"
              >
                ✅ সেভ করে প্রিন্ট প্রিভিউতে যান
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
