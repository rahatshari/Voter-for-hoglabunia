import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandidateProfile,
  SlipBorderStyle,
  SlipCustomSettings,
  SlipDesignStyle,
  SlipOrientation,
  ThermalPaperWidthMm,
  Voter,
  VoterInfoFillMode,
} from '../types';
import {
  DEFAULT_SLIP_FOOTER_TEXT,
  ELECTION_SYMBOLS_GALLERY,
  PrintLayoutMode,
  SLIP_DESIGN_STYLES,
  addToSlipQueue,
  clearSlipQueue,
  createNewCandidateTemplate,
  deleteCandidateProfile,
  getActiveCandidate,
  getAllCandidates,
  getDefaultPrintPrefs,
  getSlipCardStylesheet,
  getSlipQueue,
  getVoterUniqueKey,
  isVoterInSlipQueue,
  printVoterSlips,
  removeFromSlipQueue,
  renderSlipCardByStyleHTML,
  resetDefaultCandidates,
  saveCandidateProfile,
  saveDefaultPrintPrefs,
  searchVotersForSlipQueue,
  setActiveCandidateId,
} from '../lib/voterSlipUtils';
import {
  DEFAULT_SLIP_CUSTOM_SETTINGS,
  ThermalSlipMetrics,
  drawThermalSlipToCanvas,
  getThermalDarknessThreshold,
  prepareCanvasForThermalPrinter,
  resolveSlipCustomSettings,
} from '../lib/thermalSlipRenderer';
import {
  BluetoothPrinterDevice,
  BluetoothPrinterError,
  NativeBluetoothListResult,
  PairedBluetoothDevice,
  autoConnectBluetoothPrinter,
  canvasToEscPosBytes,
  connectBluetoothPrinter,
  connectNativePrinterByAddress,
  createTestPrintEscPosBytes,
  disconnectBluetoothPrinter,
  getConnectedPrinter,
  isAndroidNativeBluetooth,
  isBluetoothSupported,
  listNativePairedPrinters,
  openAndroidBluetoothSettings,
  requestAndroidBluetoothPermissions,
  sendEscPosToPrinter,
} from '../lib/bluetoothPrinter';
import { convertToBengaliNumbers } from '../lib/bengaliUtils';
import { useLockBodyScroll } from '../lib/useLockBodyScroll';

interface VoterSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  voter?: Voter | null;
  allVillages?: Record<string, Voter[]>;
}

type SidePanelMode = 'none' | 'customize' | 'voter_edit';
type CustomizeSubTab = 'layout' | 'sizes' | 'fields' | 'content';

const VISIBILITY_TOGGLES: { key: keyof SlipCustomSettings; label: string }[] = [
  { key: 'showReligiousHeader', label: 'ধর্মীয় হেডার (বিসমিল্লাহ)' },
  { key: 'showElectionTitle', label: 'নির্বাচনের শিরোনাম' },
  { key: 'showCandidatePhoto', label: 'প্রার্থীর ছবি' },
  { key: 'showSymbolPhoto', label: 'মার্কার ছবি' },
  { key: 'showSlogan', label: 'স্লোগান / আহ্বান' },
  { key: 'showPollingCenter', label: 'ভোটকেন্দ্রের নাম' },
  { key: 'showWardAndArea', label: 'ওয়ার্ড নং ও এলাকা' },
  { key: 'showSerial', label: 'ক্রমিক নং' },
  { key: 'showVoterId', label: 'ভোটার আইডি নং' },
  { key: 'showFather', label: 'পিতা / স্বামীর নাম' },
  { key: 'showMother', label: 'মাতার নাম' },
  { key: 'showDob', label: 'জন্ম তারিখ' },
  { key: 'showProfession', label: 'পেশা' },
  { key: 'showAddress', label: 'ঠিকানা' },
  { key: 'showFooter', label: 'নিচের ফুটার বার্তা' },
];

export const VoterSlipModal: React.FC<VoterSlipModalProps> = ({
  isOpen,
  onClose,
  voter,
  allVillages = {},
}) => {
  useLockBodyScroll(isOpen);

  const [activeScreen, setActiveScreen] = useState<'preview' | 'settings'>('preview');
  const [activePrintOption, setActivePrintOption] = useState<'bluetooth' | 'normal'>('bluetooth');
  const [sidePanel, setSidePanel] = useState<SidePanelMode>('none');
  const [customizeTab, setCustomizeTab] = useState<CustomizeSubTab>('layout');
  const [exactScalePreview, setExactScalePreview] = useState<boolean>(false);

  const [candidatesList, setCandidatesList] = useState<CandidateProfile[]>(() =>
    getAllCandidates()
  );
  const [candidate, setCandidate] = useState<CandidateProfile>(() => getActiveCandidate());

  const [pageLayoutMode, setPageLayoutMode] = useState<PrintLayoutMode>(
    () => getDefaultPrintPrefs().pageLayoutMode
  );
  const [colorMode, setColorMode] = useState<'bw' | 'color'>(
    () => getDefaultPrintPrefs().colorMode
  );

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
      villageName: 'হোগলাবুনিয়া',
      profession: 'কৃষি',
    };
  });

  // Manual Multi-Voter Batch Print Queue (No "Family" auto-grouping)
  const [slipQueue, setSlipQueue] = useState<Voter[]>(() => getSlipQueue());
  const [queueSearchQuery, setQueueSearchQuery] = useState('');
  const [showQueuePanel, setShowQueuePanel] = useState(false);

  const villageList = Object.keys(allVillages);
  const [selectedVillage, setSelectedVillage] = useState<string>(
    voter?.villageName || villageList[0] || ''
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

  // Live WYSIWYG Thermal Canvas, Auto-Fit Stage & Metrics
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const printWorkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const normalCardInnerRef = useRef<HTMLDivElement | null>(null);
  const drawSeqRef = useRef(0);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCandidateRef = useRef<CandidateProfile>(candidate);
  const pendingSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [stageWidth, setStageWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? Math.max(240, Math.min(window.innerWidth - 20, 640)) : 360
  );
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>(() =>
    typeof window !== 'undefined'
      ? { w: window.innerWidth, h: window.innerHeight }
      : { w: 390, h: 800 }
  );
  const [naturalCardHeight, setNaturalCardHeight] = useState<number>(260);

  const [thermalMetrics, setThermalMetrics] = useState<ThermalSlipMetrics>({
    orientation: 'portrait',
    paperWidthMm: 58,
    printableRollDots: 384,
    viewWidthPx: 384,
    viewHeightPx: 512,
    viewWidthMm: 58,
    viewHeightMm: 64,
    rollFeedLengthMm: 64,
  });

  latestCandidateRef.current = candidate;

  const flushPendingCandidateSave = () => {
    if (pendingSaveTimerRef.current) {
      clearTimeout(pendingSaveTimerRef.current);
      pendingSaveTimerRef.current = null;
      const list = saveCandidateProfile(latestCandidateRef.current);
      setCandidatesList(list);
    }
  };

  const customSettings = useMemo(() => resolveSlipCustomSettings(candidate), [candidate]);
  const allVotersFlat = useMemo(() => Object.values(allVillages).flat(), [allVillages]);

  const queueSearchResults = useMemo(() => {
    if (!queueSearchQuery.trim()) return [];
    const pool = allVotersFlat.length > 0 ? allVotersFlat : allVillages[selectedVillage] || [];
    return searchVotersForSlipQueue(queueSearchQuery, pool, 25);
  }, [queueSearchQuery, allVotersFlat, allVillages, selectedVillage]);

  useEffect(() => {
    if (isOpen) {
      setActiveScreen('preview');
      setActivePrintOption('bluetooth');
      setShowQueuePanel(false);
      setSidePanel('none');
      setShowBtPicker(false);
      setBtStatusError(null);
      setExactScalePreview(false);
      if (voter) {
        setVoterData(voter);
        if (voter.villageName) setSelectedVillage(voter.villageName);
      }
      setSlipQueue(getSlipQueue());
      const allCands = getAllCandidates();
      const activeCand = getActiveCandidate();
      setCandidatesList(allCands);
      setCandidate(activeCand);
      latestCandidateRef.current = activeCand;
      const prefs = getDefaultPrintPrefs();
      setPageLayoutMode(prefs.pageLayoutMode);
      setColorMode(prefs.colorMode);
    } else {
      flushPendingCandidateSave();
    }
  }, [voter, isOpen]);

  useEffect(() => {
    return () => {
      if (pendingSaveTimerRef.current) {
        clearTimeout(pendingSaveTimerRef.current);
        pendingSaveTimerRef.current = null;
        saveCandidateProfile(latestCandidateRef.current);
      }
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onQueueUpdate = () => setSlipQueue(getSlipQueue());
    window.addEventListener('slip-queue-updated', onQueueUpdate);
    return () => window.removeEventListener('slip-queue-updated', onQueueUpdate);
  }, []);

  // Track viewport & preview stage container width so Portrait & Landscape ALWAYS fit 100% inside frame
  useEffect(() => {
    if (!isOpen) return;
    const updateViewport = () => {
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
      if (previewStageRef.current) {
        const w = previewStageRef.current.clientWidth;
        if (w > 0) setStageWidth(w);
      }
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && previewStageRef.current) {
      ro = new ResizeObserver((entries) => {
        const cr = entries[0]?.contentRect;
        if (cr && cr.width > 0) {
          setStageWidth((prev) => (Math.abs(prev - cr.width) >= 1 ? Math.floor(cr.width) : prev));
        }
      });
      ro.observe(previewStageRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
      ro?.disconnect();
    };
  }, [isOpen, activeScreen, sidePanel, activePrintOption]);

  // Live 3x Super-Retina HD Redraw of Thermal Canvas synced to requestAnimationFrame (60 FPS, zero lag!)
  useEffect(() => {
    if (!isOpen || activeScreen !== 'preview' || activePrintOption !== 'bluetooth') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const seq = ++drawSeqRef.current;
    const rafId = requestAnimationFrame(() => {
      drawThermalSlipToCanvas(canvas, voterData, candidate, {
        pixelScale: 3,
        previewQuality: true,
      }).then((metrics) => {
        if (drawSeqRef.current !== seq) return;
        setThermalMetrics((prev) => {
          if (
            prev.viewWidthPx === metrics.viewWidthPx &&
            prev.viewHeightPx === metrics.viewHeightPx &&
            prev.viewWidthMm === metrics.viewWidthMm &&
            prev.viewHeightMm === metrics.viewHeightMm &&
            prev.orientation === metrics.orientation &&
            prev.paperWidthMm === metrics.paperWidthMm
          ) {
            return prev;
          }
          return metrics;
        });
      });
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [isOpen, activeScreen, activePrintOption, voterData, candidate]);

  // Event-driven Automatic Bluetooth Printer Detection (no 4s background timer jank!)
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
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener('voter_bt_permissions_updated', onPermissionsUpdated);
    };
  }, [isOpen]);

  const showNotice = (msg: string) => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    setNotice(msg);
    noticeTimerRef.current = setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 3200);
  };

  const updateCandidateField = (patch: Partial<CandidateProfile>) => {
    setCandidate((prev) => {
      const updated: CandidateProfile = {
        ...prev,
        ...patch,
      };
      if (patch.name !== undefined && patch.candidateName === undefined) {
        updated.candidateName = patch.name;
      }
      if (patch.candidateName !== undefined && patch.name === undefined) {
        updated.name = patch.candidateName;
      }
      latestCandidateRef.current = updated;

      if (pendingSaveTimerRef.current) {
        clearTimeout(pendingSaveTimerRef.current);
      }
      pendingSaveTimerRef.current = setTimeout(() => {
        pendingSaveTimerRef.current = null;
        const list = saveCandidateProfile(latestCandidateRef.current);
        setCandidatesList(list);
      }, 280);

      return updated;
    });
  };

  const updateCustomSettings = (patch: Partial<SlipCustomSettings>) => {
    setCandidate((prev) => {
      const prevCs = resolveSlipCustomSettings(prev);
      const updated: CandidateProfile = {
        ...prev,
        customSettings: {
          ...prevCs,
          ...patch,
        },
      };
      latestCandidateRef.current = updated;

      if (pendingSaveTimerRef.current) {
        clearTimeout(pendingSaveTimerRef.current);
      }
      pendingSaveTimerRef.current = setTimeout(() => {
        pendingSaveTimerRef.current = null;
        const list = saveCandidateProfile(latestCandidateRef.current);
        setCandidatesList(list);
      }, 280);

      return updated;
    });
  };

  const handleResetCustomSettings = () => {
    updateCandidateField({ customSettings: { ...DEFAULT_SLIP_CUSTOM_SETTINGS } });
    showNotice('🔄 স্লিপের মাপ ও কাস্টমাইজেশন ডিফল্ট অবস্থায় রিসেট করা হয়েছে!');
  };

  const handleSelectDefaultCandidate = (selected: CandidateProfile) => {
    flushPendingCandidateSave();
    setCandidate(selected);
    latestCandidateRef.current = selected;
    setActiveCandidateId(selected.id);
    showNotice(
      `📌 "${selected.templateTitle || selected.name}" ডিফল্ট প্রার্থী হিসেবে সেট করা হয়েছে!`
    );
  };

  const handleUpdatePrintPrefs = (nextLayout: PrintLayoutMode, nextColor: 'bw' | 'color') => {
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
    const list = allVillages[selectedVillage] || allVotersFlat;
    if (list.length === 0) return;
    const currentIndex = list.findIndex(
      (v) => String(v.serialNo) === String(voterData.serialNo) && v.voterId === voterData.voterId
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

  const handleAddSingleToQueue = (v: Voter) => {
    const updated = addToSlipQueue(v);
    setSlipQueue(updated);
    showNotice(`✅ "${v.name}" একসাথে প্রিন্ট কিউতে যুক্ত হয়েছে!`);
  };

  const handleRemoveFromQueue = (v: Voter) => {
    const updated = removeFromSlipQueue(v);
    setSlipQueue(updated);
  };

  const handleClearQueue = () => {
    const updated = clearSlipQueue();
    setSlipQueue(updated);
    showNotice('একসাথে প্রিন্ট কিউ খালি করা হয়েছে।');
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
    if (isAndroidNativeBluetooth()) {
      const listRes = refreshNativeBluetoothList();
      setShowBtPicker(true);
      if (listRes && listRes.success && listRes.devices.length === 1 && !bluetoothDevice) {
        await handleSelectNativePrinter(listRes.devices[0]);
      }
      return;
    }

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
    flushPendingCandidateSave();
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

      const workCanvas = printWorkCanvasRef.current || document.createElement('canvas');
      const threshold = getThermalDarknessThreshold(customSettings.thermalDarkness);

      for (let i = 0; i < votersToPrint.length; i++) {
        const v = votersToPrint[i];
        showNotice(
          votersToPrint.length > 1
            ? `"${printer.name}"-এ প্রিন্ট হচ্ছে (${convertToBengaliNumbers(i + 1)}/${convertToBengaliNumbers(votersToPrint.length)}): ${v.name}`
            : `"${printer.name}"-এ পাঠানো হচ্ছে...`
        );
        const metrics = await drawThermalSlipToCanvas(workCanvas, v, candidate, {
          pixelScale: 1,
          previewQuality: false,
        });
        const rollReadyCanvas = prepareCanvasForThermalPrinter(workCanvas, metrics.orientation);
        const escPosBytes = canvasToEscPosBytes(rollReadyCanvas, threshold);

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
    flushPendingCandidateSave();
    showNotice(
      `🖨️ ${convertToBengaliNumbers(votersToPrint.length)} জন ভোটারের কার্ড প্রিন্ট হচ্ছে...`
    );
    printVoterSlips(votersToPrint, candidate, mode, colorMode);
  };

  const handleDownloadImage = async () => {
    flushPendingCandidateSave();
    const exportCanvas = document.createElement('canvas');
    await drawThermalSlipToCanvas(exportCanvas, voterData, candidate, {
      pixelScale: 3,
      previewQuality: true,
    });
    const dataUrl = exportCanvas.toDataURL('image/png');
    const fileName = `voter_slip_${voterData.serialNo || 'card'}.png`;
    import('../lib/nativeBridge')
      .then(({ saveDataUrlFileCrossPlatform }) => {
        saveDataUrlFileCrossPlatform(dataUrl, fileName, 'image/png');
        showNotice('✅ এইচডি স্লিপ ইমেজ গ্যালারি/ডাউনলোডে সেভ হয়েছে!');
      })
      .catch(() => {
        const link = document.createElement('a');
        link.download = fileName;
        link.href = dataUrl;
        link.click();
        showNotice('✅ এইচডি স্লিপ ইমেজ ডাউনলোড হয়েছে!');
      });
  };

  // True WYSIWYG Normal Card HTML & Stylesheet memo
  const normalPreviewHtml = useMemo(
    () => renderSlipCardByStyleHTML(voterData, candidate, colorMode),
    [voterData, candidate, colorMode]
  );
  const normalPreviewCss = useMemo(
    () => getSlipCardStylesheet(candidate, 'single', false),
    [candidate]
  );

  // Measure natural unscaled Normal Card height so mobile auto-scale wrapper matches exact height
  useEffect(() => {
    if (!isOpen || activeScreen !== 'preview' || activePrintOption !== 'normal') return;
    const el = normalCardInnerRef.current;
    if (!el) return;
    const syncHeight = () => {
      const h = el.offsetHeight;
      if (h > 20) {
        setNaturalCardHeight((prev) => (Math.abs(prev - h) >= 2 ? h : prev));
      }
    };
    syncHeight();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(syncHeight);
      ro.observe(el);
    }
    return () => {
      ro?.disconnect();
    };
  }, [isOpen, activeScreen, activePrintOption, normalPreviewHtml, normalPreviewCss]);

  const isMobileSplitPanel = sidePanel !== 'none' && viewportSize.w < 1024;

  const thermalDisplaySize = useMemo(() => {
    const aspect = thermalMetrics.viewHeightPx / Math.max(1, thermalMetrics.viewWidthPx);
    // Reserve 46px for paper frame padding + vertical side length ruler + safe margin
    const availW = Math.max(150, stageWidth - 46);
    const maxComfortW =
      thermalMetrics.orientation === 'landscape'
        ? customSettings.paperWidthMm === 80
          ? 600
          : 540
        : customSettings.paperWidthMm === 80
        ? 410
        : 320;

    let w = Math.min(availW, maxComfortW);
    let h = w * aspect;

    if (isMobileSplitPanel) {
      const maxSplitH = Math.max(145, Math.floor(viewportSize.h * 0.25));
      if (h > maxSplitH) {
        h = maxSplitH;
        w = h / Math.max(0.2, aspect);
      }
    }

    return {
      width: Math.max(120, Math.round(w)),
      height: Math.max(80, Math.round(h)),
    };
  }, [
    thermalMetrics.viewWidthPx,
    thermalMetrics.viewHeightPx,
    thermalMetrics.orientation,
    customSettings.paperWidthMm,
    stageWidth,
    isMobileSplitPanel,
    viewportSize.h,
  ]);

  const normalDisplayMetrics = useMemo(() => {
    const naturalW = customSettings.orientation === 'portrait' ? 380 : 620;
    const availW = Math.max(180, stageWidth - 20);
    let scale = Math.min(1, availW / naturalW);
    if (isMobileSplitPanel) {
      const maxSplitH = Math.max(150, Math.floor(viewportSize.h * 0.25));
      if (naturalCardHeight * scale > maxSplitH) {
        scale = Math.min(scale, maxSplitH / Math.max(1, naturalCardHeight));
      }
    }
    return {
      naturalW,
      scale,
      scaledW: Math.round(naturalW * scale),
      scaledH: Math.max(96, Math.round(naturalCardHeight * scale)),
    };
  }, [
    customSettings.orientation,
    stageWidth,
    isMobileSplitPanel,
    viewportSize.h,
    naturalCardHeight,
  ]);

  if (!isOpen) return null;

  const isCurrentInQueue = isVoterInSlipQueue(voterData, slipQueue);
  const effectiveBatchVoters = slipQueue.length > 0 ? slipQueue : [voterData];
  const currentStyle: SlipDesignStyle = candidate.designStyle || 'classic_voter_card';
  const fillMode: VoterInfoFillMode = candidate.voterInfoMode || 'auto';

  const renderBluetoothManagerPanel = () => {
    if (!showBtPicker) return null;
    const isNative = isAndroidNativeBluetooth();
    const devices = nativeBtList?.devices || [];
    const errorCode = btStatusError?.code || nativeBtList?.errorCode || '';
    const errorMessage =
      btStatusError?.message || (!nativeBtList?.success ? nativeBtList?.error : '');

    return (
      <div
        data-testid="bluetooth-picker-panel"
        className="w-full max-w-[420px] bg-white border-2 border-emerald-200 rounded-2xl p-3 shadow-sm space-y-2.5 text-xs"
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

        {isNative ? (
          <div className="space-y-1.5">
            {devices.length > 0 && (
              <>
                <div className="text-[11px] font-bold text-slate-600">
                  ফোনে পেয়ার করা ব্লুটুথ ডিভাইস ({convertToBengaliNumbers(devices.length)}টি) — আপনার
                  প্রিন্টারটিতে ট্যাপ করুন:
                </div>
                <div className="max-h-44 overflow-y-auto overscroll-contain space-y-1.5 pr-0.5">
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
                          {isConnectingBt ? '...' : isCurrent ? '✓ সংযুক্ত' : 'কানেক্ট'}
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
                ℹ️ এই ব্রাউজার সরাসরি ব্লুটুথ সাপোর্ট করে না। থার্মাল প্রিন্টারের জন্য{' '}
                <span className="font-extrabold text-slate-900">অ্যান্ড্রয়েড APK অ্যাপ</span> অথবা{' '}
                <span className="font-extrabold text-slate-900">Google Chrome</span> ব্যবহার করুন।
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Live Customizer Studio Panel (used side-by-side next to preview)
  const renderLiveCustomizerStudio = () => (
    <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-3.5 space-y-3 text-xs">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 gap-2">
        <h4 className="font-black text-slate-900 text-xs sm:text-sm">
          🎨 স্লিপ কাস্টমাইজেশন স্টুডিও (লাইভ)
        </h4>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleResetCustomSettings}
            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer"
            title="ডিফল্ট মাপে ফিরুন"
          >
            🔄 রিসেট
          </button>
          <button
            type="button"
            onClick={() => setSidePanel('none')}
            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
          >
            ✓ সম্পন্ন
          </button>
        </div>
      </div>

      {/* 4 Sub-tabs */}
      <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl">
        {[
          { id: 'layout' as CustomizeSubTab, label: 'মাপ ও স্টাইল' },
          { id: 'sizes' as CustomizeSubTab, label: 'ফন্ট ও সাইজ' },
          { id: 'fields' as CustomizeSubTab, label: 'তথ্য অন/অফ' },
          { id: 'content' as CustomizeSubTab, label: 'লেখা ও ছবি' },
        ].map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setCustomizeTab(tb.id)}
            className={`py-1.5 px-1 rounded-lg text-[11px] font-extrabold transition cursor-pointer ${
              customizeTab === tb.id
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Sub-tab 1: Voter-Only Mode, B&W Toggle, Orientation, Paper Width, Borders, Swap, Fill Mode */}
      {customizeTab === 'layout' && (
        <div className="space-y-3">
          <div>
            <label className="block font-extrabold text-slate-700 mb-1">
              স্লিপের ধরন (প্রার্থীসহ / শুধু ভোটারের তথ্য):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => updateCustomSettings({ voterOnlyMode: false })}
                className={`py-2 px-2.5 rounded-xl border font-extrabold cursor-pointer transition ${
                  !customSettings.voterOnlyMode
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-50 text-slate-800 border-slate-200'
                }`}
              >
                🗳️ প্রার্থীসহ পূর্ণ স্লিপ
              </button>
              <button
                type="button"
                onClick={() => {
                  updateCustomSettings({
                    voterOnlyMode: true,
                    orientation: 'landscape',
                  });
                  showNotice('🪪 শুধু ভোটারের তথ্য (বড় ফুল-পেজ ল্যান্ডস্কেপ) চালু হয়েছে!');
                }}
                className={`py-2 px-2.5 rounded-xl border font-extrabold cursor-pointer transition ${
                  customSettings.voterOnlyMode
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-slate-50 text-slate-800 border-slate-200'
                }`}
              >
                🪪 শুধু ভোটার তথ্য (ফুল-পেজ বড়)
              </button>
            </div>
          </div>

          <div>
            <label className="block font-extrabold text-slate-700 mb-1">
              থার্মাল ও স্লিপ রঙের মোড (সাদাকালো / রঙিন):
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  updateCustomSettings({ thermalColorMode: 'bw' });
                  handleUpdatePrintPrefs(pageLayoutMode, 'bw');
                }}
                className={`py-2 px-2.5 rounded-xl border font-extrabold cursor-pointer transition ${
                  (activePrintOption === 'bluetooth'
                    ? customSettings.thermalColorMode
                    : colorMode) === 'bw'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-800 border-slate-200'
                }`}
              >
                ⚫ সাদাকালো (B&amp;W)
              </button>
              <button
                type="button"
                onClick={() => {
                  updateCustomSettings({ thermalColorMode: 'color' });
                  handleUpdatePrintPrefs(pageLayoutMode, 'color');
                }}
                className={`py-2 px-2.5 rounded-xl border font-extrabold cursor-pointer transition ${
                  (activePrintOption === 'bluetooth'
                    ? customSettings.thermalColorMode
                    : colorMode) === 'color'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-800 border-slate-200'
                }`}
              >
                🎨 রঙিন (Color)
              </button>
            </div>
          </div>

          <div>
            <label className="block font-extrabold text-slate-700 mb-1">
              ১. প্রিন্ট ও প্রিভিউ অরিয়েন্টেশন (Portrait / Landscape):
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'portrait', label: '📱 প্রোর্ট্রেট (লম্বালম্বি)' },
                  { id: 'landscape', label: '🖼️ ল্যান্ডস্কেপ (আড়াআড়ি)' },
                ] as { id: SlipOrientation; label: string }[]
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => updateCustomSettings({ orientation: o.id })}
                  className={`py-2 px-2.5 rounded-xl border font-extrabold cursor-pointer transition ${
                    customSettings.orientation === o.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-800 border-slate-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-extrabold text-slate-700 mb-1">
              ২. থার্মাল পেপার রোলের প্রস্থ (Breadth):
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 58, label: '৫৮ মিমি (৩৮৪ px) রোল' },
                  { id: 80, label: '৮০ মিমি (৫৭৬ px) রোল' },
                ] as { id: ThermalPaperWidthMm; label: string }[]
              ).map((pw) => (
                <button
                  key={pw.id}
                  type="button"
                  onClick={() => updateCustomSettings({ paperWidthMm: pw.id })}
                  className={`py-2 px-2.5 rounded-xl border font-extrabold cursor-pointer transition ${
                    customSettings.paperWidthMm === pw.id
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-50 text-slate-800 border-slate-200'
                  }`}
                >
                  {pw.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-extrabold text-slate-700 mb-1">
              ৩. চারপাশের বর্ডার স্টাইল:
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'solid', label: 'সলিড' },
                  { id: 'double', label: 'ডাবল' },
                  { id: 'dashed', label: 'ড্যাশড' },
                  { id: 'none', label: 'বর্ডারহীন' },
                ] as { id: SlipBorderStyle; label: string }[]
              ).map((bs) => (
                <button
                  key={bs.id}
                  type="button"
                  onClick={() => updateCustomSettings({ borderStyle: bs.id })}
                  className={`py-1.5 rounded-lg border font-bold cursor-pointer ${
                    customSettings.borderStyle === bs.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {bs.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                updateCustomSettings({ swapPhotoSymbol: !customSettings.swapPhotoSymbol })
              }
              className={`py-2 px-2.5 rounded-xl border font-bold cursor-pointer ${
                customSettings.swapPhotoSymbol
                  ? 'bg-amber-100 border-amber-400 text-amber-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              ⇄ ছবি ও মার্কা সাইড বদলান
            </button>

            <select
              value={fillMode}
              onChange={(e) =>
                updateCandidateField({ voterInfoMode: e.target.value as VoterInfoFillMode })
              }
              className="py-2 px-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-800"
              aria-label="ভোটার তথ্য ফরম্যাট"
            >
              <option value="auto">ভোটার তথ্য: অটো পূরণ</option>
              <option value="lined">ভোটার তথ্য: দাগযুক্ত</option>
              <option value="blank">ভোটার তথ্য: খালি ফর্ম</option>
            </select>
          </div>

          <div>
            <label className="block font-extrabold text-slate-700 mb-1">
              ৪. থার্মাল কালির গাঢ়ত্ব (Print Darkness):
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'light', label: 'হালকা' },
                  { id: 'normal', label: 'স্বাভাবিক' },
                  { id: 'dark', label: 'গাঢ় কালো' },
                ] as const
              ).map((dk) => (
                <button
                  key={dk.id}
                  type="button"
                  onClick={() => updateCustomSettings({ thermalDarkness: dk.id })}
                  className={`py-1.5 rounded-lg border font-bold cursor-pointer ${
                    customSettings.thermalDarkness === dk.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {dk.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab 2: Granular Font, Photo, Symbol, Length/Spacing Sliders */}
      {customizeTab === 'sizes' && (
        <div className="space-y-2.5">
          {[
            {
              key: 'headerFontScale' as const,
              label: 'শিরোনাম ফন্ট আকার',
              min: 0.7,
              max: 1.4,
              step: 0.05,
              val: customSettings.headerFontScale,
            },
            {
              key: 'candidateFontScale' as const,
              label: 'প্রার্থীর নাম ফন্ট আকার',
              min: 0.7,
              max: 1.45,
              step: 0.05,
              val: customSettings.candidateFontScale,
            },
            {
              key: 'voterFontScale' as const,
              label: 'ভোটার তথ্যের ফন্ট আকার',
              min: 0.75,
              max: 1.45,
              step: 0.05,
              val: customSettings.voterFontScale,
            },
            {
              key: 'photoScale' as const,
              label: 'প্রার্থীর ছবির আকার',
              min: 0.6,
              max: 1.4,
              step: 0.05,
              val: customSettings.photoScale,
            },
            {
              key: 'symbolScale' as const,
              label: 'মার্কার ছবির আকার',
              min: 0.6,
              max: 1.4,
              step: 0.05,
              val: customSettings.symbolScale,
            },
            {
              key: 'lineSpacingScale' as const,
              label: 'লাইনের ফাঁকা / স্লিপের দৈর্ঘ্য',
              min: 0.75,
              max: 1.4,
              step: 0.05,
              val: customSettings.lineSpacingScale,
            },
          ].map((sl) => (
            <div key={sl.key} className="space-y-0.5">
              <div className="flex justify-between font-bold text-slate-700">
                <span>{sl.label}</span>
                <span className="text-indigo-700">
                  {convertToBengaliNumbers(Math.round(sl.val * 100))}%
                </span>
              </div>
              <input
                type="range"
                min={sl.min}
                max={sl.max}
                step={sl.step}
                value={sl.val}
                onChange={(e) =>
                  updateCustomSettings({ [sl.key]: parseFloat(e.target.value) })
                }
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>
          ))}

          <div className="space-y-0.5">
            <div className="flex justify-between font-bold text-slate-700">
              <span>চারপাশের মার্জিন (Padding)</span>
              <span className="text-indigo-700">
                {convertToBengaliNumbers(customSettings.paddingMm)} মিমি
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={0.5}
              value={customSettings.paddingMm}
              onChange={(e) =>
                updateCustomSettings({ paddingMm: parseFloat(e.target.value) })
              }
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Sub-tab 3: Show/Hide Every Individual Field */}
      {customizeTab === 'fields' && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-slate-500 font-semibold mb-1">
            যেসব তথ্য স্লিপে রাখতে চান সেগুলোতে টিক (✓) দিন:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {VISIBILITY_TOGGLES.map((item) => {
              const checked = Boolean(customSettings[item.key]);
              return (
                <label
                  key={item.key}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border cursor-pointer transition ${
                    checked
                      ? 'bg-emerald-50/70 border-emerald-300 text-slate-900 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      updateCustomSettings({ [item.key]: e.target.checked })
                    }
                    className="accent-emerald-600 w-4 h-4"
                  />
                  <span className="truncate">{item.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-tab 4: Quick Candidate Texts & Photos */}
      {customizeTab === 'content' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <label className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 rounded-xl p-2 text-center font-extrabold cursor-pointer">
              📷 প্রার্থীর ছবি বদলান
              <input
                type="file"
                accept="image/*"
                onChange={handleCandidatePhotoUpload}
                className="hidden"
              />
            </label>
            <label className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl p-2 text-center font-extrabold cursor-pointer">
              🖼️ মার্কার ছবি বদলান
              <input
                type="file"
                accept="image/*"
                onChange={handleSymbolPhotoUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="space-y-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-600">প্রার্থীর নাম</label>
              <input
                type="text"
                value={candidate.name || ''}
                onChange={(e) =>
                  updateCandidateField({ name: e.target.value, candidateName: e.target.value })
                }
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-600">পদবী</label>
                <input
                  type="text"
                  value={candidate.candidateBadge || ''}
                  onChange={(e) =>
                    updateCandidateField({
                      candidateBadge: e.target.value,
                      postTitle: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600">মার্কার নাম</label>
                <input
                  type="text"
                  value={candidate.symbolName || ''}
                  onChange={(e) => updateCandidateField({ symbolName: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600">ভোটকেন্দ্রের নাম</label>
              <input
                type="text"
                value={candidate.pollingCenter || ''}
                onChange={(e) => updateCandidateField({ pollingCenter: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-600">ওয়ার্ড নং</label>
                <input
                  type="text"
                  value={candidate.wardNo || ''}
                  onChange={(e) => updateCandidateField({ wardNo: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600">মার্কার আহ্বান</label>
                <input
                  type="text"
                  value={candidate.symbolCallout || ''}
                  onChange={(e) => updateCandidateField({ symbolCallout: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600">ফুটার বার্তা</label>
              <input
                type="text"
                value={candidate.footerCenterText || ''}
                onChange={(e) => updateCandidateField({ footerCenterText: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 flex items-stretch sm:items-center justify-center p-0 sm:p-3 overscroll-contain overflow-hidden">
      <canvas ref={printWorkCanvasRef} className="hidden" />

      <div className="bg-white text-slate-900 w-full max-w-[100vw] sm:max-w-5xl h-[100dvh] sm:h-[93dvh] max-h-[100dvh] sm:max-h-[93dvh] rounded-none sm:rounded-3xl shadow-2xl border-0 sm:border border-slate-200 overflow-hidden flex flex-col">
        {/* TOP HEADER BAR */}
        <div className="bg-slate-900 text-white px-3 py-2 sm:px-5 sm:py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl sm:text-2xl shrink-0">
              {activeScreen === 'preview' ? '🗳️' : '⚙️'}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-bold text-xs sm:text-base leading-tight truncate">
                  {activeScreen === 'preview'
                    ? 'ভোটার স্লিপ এইচডি প্রিভিউ'
                    : 'স্লিপ সেটিং ও ডিফল্ট প্রার্থী'}
                </h3>
                <span className="text-[10px] sm:text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-1.5 py-0.5 rounded-md font-bold truncate max-w-[140px] sm:max-w-none">
                  {candidate.candidateName || candidate.name} ({candidate.symbolName})
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-slate-300 mt-0.5 truncate">
                {activeScreen === 'preview'
                  ? 'স্ক্রিনে দৈর্ঘ্য ও প্রস্থ যেভাবে দেখাচ্ছে, প্রিন্টারে ঠিক সেই মাপেই এইচডি প্রিন্ট হবে'
                  : 'ডিফল্ট প্রার্থী, ৬টি কার্ড টেমপ্লেট ও সকল লেখা সংরক্ষণ করুন'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {activeScreen === 'preview' ? (
              <button
                type="button"
                onClick={() => {
                  flushPendingCandidateSave();
                  setActiveScreen('settings');
                }}
                className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-amber-300 border border-amber-400/30 text-[11px] sm:text-xs font-extrabold flex items-center gap-1 cursor-pointer transition"
              >
                <span>⚙️</span>
                <span>সেটিং</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  flushPendingCandidateSave();
                  setActiveScreen('preview');
                  showNotice('✅ ডিফল্ট সেটিং সংরক্ষিত হয়েছে!');
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] sm:text-xs font-extrabold flex items-center gap-1 cursor-pointer transition"
              >
                <span>⬅️</span>
                <span>প্রিভিউ</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                flushPendingCandidateSave();
                onClose();
              }}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm cursor-pointer transition shrink-0"
              title="বন্ধ করুন"
            >
              ✕
            </button>
          </div>
        </div>

        {notice && (
          <div className="bg-indigo-600 text-white text-[11px] sm:text-xs font-bold py-1.5 px-3 text-center shrink-0 truncate">
            {notice}
          </div>
        )}

        {/* =====================================================================
            SCREEN 1: LIVE HD WYSIWYG PREVIEW + AUTO-FIT PORTRAIT/LANDSCAPE
            ===================================================================== */}
        {activeScreen === 'preview' && (
          <>
            {/* Compact Responsive Mode & Orientation Switcher Bar */}
            <div className="bg-slate-100 px-2.5 sm:px-5 py-1.5 sm:py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-1.5 shrink-0 w-full min-w-0">
              <div className="flex items-center gap-1 flex-wrap min-w-0">
                <button
                  type="button"
                  onClick={() => setActivePrintOption('bluetooth')}
                  className={`px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-extrabold flex items-center gap-1 cursor-pointer transition ${
                    activePrintOption === 'bluetooth'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>📶</span>
                  <span>থার্মাল</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActivePrintOption('normal')}
                  className={`px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-extrabold flex items-center gap-1 cursor-pointer transition ${
                    activePrintOption === 'normal'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>🖨️</span>
                  <span>পেজ প্রিন্ট</span>
                </button>

                {/* Instant Candidate vs Voter-Only (Full-Page Large Landscape) Switcher */}
                <div className="inline-flex rounded-xl bg-white border border-slate-200 p-0.5 text-[11px] sm:text-xs font-extrabold">
                  <button
                    type="button"
                    onClick={() => updateCustomSettings({ voterOnlyMode: false })}
                    className={`px-2 py-0.5 sm:py-1 rounded-lg cursor-pointer transition ${
                      !customSettings.voterOnlyMode
                        ? 'bg-emerald-700 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="প্রার্থীর ছবি ও নামসহ পূর্ণ ভোটার স্লিপ"
                  >
                    🗳️ প্রার্থীসহ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateCustomSettings({
                        voterOnlyMode: true,
                        orientation: 'landscape',
                      });
                      showNotice('🪪 শুধু ভোটার তথ্য (বড় ফুল-পেজ ল্যান্ডস্কেপ) চালু হয়েছে!');
                    }}
                    className={`px-2 py-0.5 sm:py-1 rounded-lg cursor-pointer transition ${
                      customSettings.voterOnlyMode
                        ? 'bg-amber-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="প্রার্থীর তথ্য ছাড়া শুধুমাত্র ভোটারের তথ্য বড় ফন্টে ফুল-পেজ ল্যান্ডস্কেপ প্রিন্ট"
                  >
                    🪪 শুধু ভোটার তথ্য
                  </button>
                </div>

                {/* Instant Black & White vs Color Switcher (works in both Thermal & Page Print) */}
                {!customSettings.voterOnlyMode && (
                  <div className="inline-flex rounded-xl bg-white border border-slate-200 p-0.5 text-[11px] sm:text-xs font-extrabold">
                    <button
                      type="button"
                      onClick={() => {
                        updateCustomSettings({ thermalColorMode: 'bw' });
                        handleUpdatePrintPrefs(pageLayoutMode, 'bw');
                      }}
                      className={`px-2 py-0.5 sm:py-1 rounded-lg cursor-pointer transition ${
                        (activePrintOption === 'bluetooth'
                          ? customSettings.thermalColorMode
                          : colorMode) === 'bw'
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="সাদাকালো প্রিন্ট ও প্রিভিউ"
                    >
                      ⚫ সাদাকালো
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateCustomSettings({ thermalColorMode: 'color' });
                        handleUpdatePrintPrefs(pageLayoutMode, 'color');
                      }}
                      className={`px-2 py-0.5 sm:py-1 rounded-lg cursor-pointer transition ${
                        (activePrintOption === 'bluetooth'
                          ? customSettings.thermalColorMode
                          : colorMode) === 'color'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="রঙিন প্রিভিউ ও প্রিন্ট"
                    >
                      🎨 রঙিন
                    </button>
                  </div>
                )}

                {/* Instant Portrait vs Landscape Switcher */}
                <div className="inline-flex rounded-xl bg-white border border-slate-200 p-0.5 text-[11px] sm:text-xs font-extrabold">
                  <button
                    type="button"
                    onClick={() => updateCustomSettings({ orientation: 'portrait' })}
                    className={`px-2 py-0.5 sm:py-1 rounded-lg cursor-pointer transition ${
                      customSettings.orientation === 'portrait'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📱 প্রোর্ট্রেট
                  </button>
                  <button
                    type="button"
                    onClick={() => updateCustomSettings({ orientation: 'landscape' })}
                    className={`px-2 py-0.5 sm:py-1 rounded-lg cursor-pointer transition ${
                      customSettings.orientation === 'landscape'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🖼️ ল্যান্ডস্কেপ
                  </button>
                </div>

                {/* Instant 58mm vs 80mm Switcher when in Bluetooth mode */}
                {activePrintOption === 'bluetooth' && (
                  <div className="inline-flex rounded-xl bg-white border border-slate-200 p-0.5 text-[11px] sm:text-xs font-extrabold">
                    <button
                      type="button"
                      onClick={() => updateCustomSettings({ paperWidthMm: 58 })}
                      className={`px-2 py-0.5 sm:py-1 rounded-lg cursor-pointer ${
                        customSettings.paperWidthMm === 58
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600'
                      }`}
                    >
                      ৫৮মিমি
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCustomSettings({ paperWidthMm: 80 })}
                      className={`px-2 py-0.5 sm:py-1 rounded-lg cursor-pointer ${
                        customSettings.paperWidthMm === 80
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600'
                      }`}
                    >
                      ৮০মিমি
                    </button>
                  </div>
                )}
              </div>

              {/* Right Quick Controls */}
              <div className="flex items-center gap-1 flex-wrap min-w-0">
                <div className="flex items-center gap-0.5 bg-white px-1.5 py-0.5 sm:py-1 rounded-xl border border-slate-200 text-[11px] sm:text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => handleVoterNavigate('prev')}
                    className="px-1.5 py-0.5 hover:bg-slate-100 rounded text-slate-700 cursor-pointer"
                    title="আগের ভোটার"
                  >
                    ◀
                  </button>
                  <span className="px-1 text-slate-800 truncate max-w-[92px] sm:max-w-[130px]">
                    #{voterData.serialNo} {voterData.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleVoterNavigate('next')}
                    className="px-1.5 py-0.5 hover:bg-slate-100 rounded text-slate-700 cursor-pointer"
                    title="পরের ভোটার"
                  >
                    ▶
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSidePanel((p) => (p === 'customize' ? 'none' : 'customize'))
                  }
                  className={`px-2 py-1 rounded-xl text-[11px] sm:text-xs font-extrabold border cursor-pointer transition ${
                    sidePanel === 'customize'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'
                  }`}
                >
                  🎨 কাস্টমাইজ
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setSidePanel((p) => (p === 'voter_edit' ? 'none' : 'voter_edit'))
                  }
                  className={`px-2 py-1 rounded-xl text-[11px] sm:text-xs font-extrabold border cursor-pointer transition ${
                    sidePanel === 'voter_edit'
                      ? 'bg-amber-500 text-slate-950 border-amber-500'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  ✏️ এডিট
                </button>

                <button
                  type="button"
                  onClick={() => setShowQueuePanel((v) => !v)}
                  className={`px-2 py-1 rounded-xl text-[11px] sm:text-xs font-extrabold border cursor-pointer transition ${
                    showQueuePanel || slipQueue.length > 0
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  📋 কিউ ({convertToBengaliNumbers(slipQueue.length)})
                </button>
              </div>
            </div>

            {/* Optional Multi-Voter Batch Queue Panel */}
            {(showQueuePanel || slipQueue.length > 0) && (
              <div className="bg-indigo-50/60 border-b border-indigo-200 px-3 sm:px-5 py-2 shrink-0 space-y-2 max-h-[34dvh] overflow-y-auto overscroll-contain">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[11px] sm:text-xs font-extrabold text-slate-900">
                    📋 একসাথে প্রিন্ট কিউ ({convertToBengaliNumbers(slipQueue.length)} জন)
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
                      {isCurrentInQueue ? '✓ বর্তমান ভোটার যুক্ত' : '➕ বর্তমান ভোটার যোগ'}
                    </button>

                    {slipQueue.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearQueue}
                        className="px-2 py-1 bg-red-50 text-red-600 rounded-lg text-[11px] font-bold cursor-pointer"
                      >
                        খালি করুন
                      </button>
                    )}

                    {showQueuePanel && (
                      <button
                        type="button"
                        onClick={() => setShowQueuePanel(false)}
                        className="px-2 py-1 bg-white border border-slate-200 text-slate-600 rounded-lg text-[11px] font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {showQueuePanel && (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={queueSearchQuery}
                      onChange={(e) => setQueueSearchQuery(e.target.value)}
                      placeholder="🔍 অন্য ভোটারের নাম, পিতার নাম বা ক্রমিক নং লিখে কিউতে যোগ করুন..."
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600"
                    />
                    {queueSearchQuery.trim() !== '' && (
                      <div className="bg-white rounded-xl border border-slate-200 p-1.5 max-h-32 overflow-y-auto overscroll-contain space-y-1">
                        {queueSearchResults.length === 0 ? (
                          <div className="text-xs text-red-500 py-1 text-center font-semibold">
                            কোনো ভোটার পাওয়া যায়নি
                          </div>
                        ) : (
                          queueSearchResults.map((v) => {
                            const inQ = isVoterInSlipQueue(v, slipQueue);
                            return (
                              <div
                                key={getVoterUniqueKey(v)}
                                className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
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
                  <div className="flex flex-wrap gap-1">
                    {slipQueue.map((item, idx) => (
                      <div
                        key={getVoterUniqueKey(item)}
                        className="inline-flex items-center gap-1 bg-white border border-slate-300 text-slate-900 px-2 py-0.5 rounded-lg text-[11px] font-bold"
                      >
                        <button
                          type="button"
                          onClick={() => setVoterData(item)}
                          className="hover:underline cursor-pointer truncate max-w-[150px]"
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

            {/* =================================================================
                MAIN WORKSPACE: PINNED AUTO-FIT HD PREVIEW + SMOOTH STUDIO SPLIT
                ================================================================= */}
            <div className="flex-1 min-h-0 w-full bg-slate-100/90 flex flex-col lg:flex-row overflow-hidden">
              {/* LEFT / TOP PREVIEW STAGE (Measured by ResizeObserver for 100% Auto-Fit!) */}
              <div
                ref={previewStageRef}
                className={`w-full min-w-0 overscroll-contain flex flex-col items-center justify-start ${
                  sidePanel !== 'none'
                    ? 'shrink-0 max-h-[43dvh] lg:max-h-none lg:h-full lg:w-[58%] overflow-y-auto p-2 sm:p-4 border-b lg:border-b-0 lg:border-r border-slate-200/90 space-y-2'
                    : 'flex-1 min-h-0 overflow-y-auto p-2.5 sm:p-5 space-y-2.5'
                }`}
              >
                {activePrintOption === 'bluetooth' ? (
                  <div className="w-full min-w-0 flex flex-col items-center space-y-2">
                    {/* Compact Physical Dimension & HD Status Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 w-full max-w-xl bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 text-[11px] sm:text-xs shadow-2xs">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-black text-[10px] tracking-wide">
                          HD
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-200 font-extrabold">
                          {convertToBengaliNumbers(thermalMetrics.viewWidthMm)}×
                          {convertToBengaliNumbers(thermalMetrics.viewHeightMm)} মিমি
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                          ({thermalMetrics.viewWidthPx}×{thermalMetrics.viewHeightPx} ডট)
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setExactScalePreview((v) => !v)}
                          className={`px-2 py-0.5 sm:py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition ${
                            exactScalePreview
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                          title="অটো স্ক্রিন ফিট বনাম ১:১ জুম"
                        >
                          {exactScalePreview ? '🔍 ১:১ জুম' : '📱 অটো ফিট'}
                        </button>

                        {bluetoothDevice ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (isAndroidNativeBluetooth()) refreshNativeBluetoothList();
                              setShowBtPicker((prev) => !prev);
                            }}
                            className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 sm:py-1 rounded-lg font-bold text-[11px] cursor-pointer flex items-center gap-1"
                          >
                            <span>🟢</span>
                            <span className="max-w-[76px] sm:max-w-[100px] truncate">
                              {bluetoothDevice.name}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleConnectBluetooth}
                            disabled={isConnectingBt}
                            className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 sm:py-1 rounded-lg font-bold text-[11px] cursor-pointer"
                          >
                            {isConnectingBt ? 'খুঁজছি...' : '🔗 প্রিন্টার'}
                          </button>
                        )}
                      </div>
                    </div>

                    {renderBluetoothManagerPanel()}

                    {/* HD Thermal Paper Frame — Single persistent canvas, 100% Auto-Fit in Portrait & Landscape */}
                    <div
                      className={
                        exactScalePreview
                          ? 'w-full overflow-x-auto overscroll-x-contain py-1'
                          : 'w-full flex flex-col items-center py-0.5 overflow-hidden'
                      }
                    >
                      <div className={exactScalePreview ? 'w-max mx-auto px-1' : 'flex flex-col items-center max-w-full'}>
                        {/* Top Breadth Dimension Indicator */}
                        <div
                          className="flex items-center gap-1.5 text-[10px] font-extrabold text-slate-600 mb-1 max-w-full"
                          style={{
                            width: `${(exactScalePreview ? thermalMetrics.viewWidthPx : thermalDisplaySize.width) + 16}px`,
                          }}
                        >
                          <span className="h-px flex-1 bg-slate-400" />
                          <span className="truncate">
                            প্রস্থ: {convertToBengaliNumbers(thermalMetrics.viewWidthMm)} মিমি (
                            {thermalMetrics.orientation === 'landscape'
                              ? `${convertToBengaliNumbers(customSettings.paperWidthMm)}মিমি আড়াআড়ি`
                              : `${convertToBengaliNumbers(customSettings.paperWidthMm)}মিমি রোল`}
                            )
                          </span>
                          <span className="h-px flex-1 bg-slate-400" />
                        </div>

                        <div className="flex items-stretch justify-center gap-1.5 max-w-full">
                          {/* Crisp Studio Paper Ticket Sheet (No harsh CSS contrast filter!) */}
                          <div className="bg-white p-2 rounded-[3px] shadow-[0_8px_28px_rgba(15,23,42,0.12)] ring-1 ring-slate-300/90 shrink-0">
                            <canvas
                              ref={previewCanvasRef}
                              style={{
                                width: `${exactScalePreview ? thermalMetrics.viewWidthPx : thermalDisplaySize.width}px`,
                                height: `${exactScalePreview ? thermalMetrics.viewHeightPx : thermalDisplaySize.height}px`,
                              }}
                              className="block bg-white"
                            />
                          </div>

                          {/* Side Length Dimension Indicator */}
                          <div className="flex flex-col items-center justify-between text-[10px] font-extrabold text-slate-600 py-1 w-4 shrink-0">
                            <span className="w-px flex-1 bg-slate-400" />
                            <span
                              className="py-1 whitespace-nowrap"
                              style={{ writingMode: 'vertical-rl' }}
                            >
                              দৈর্ঘ্য: {convertToBengaliNumbers(thermalMetrics.viewHeightMm)} মিমি
                            </span>
                            <span className="w-px flex-1 bg-slate-400" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* TRUE WYSIWYG NORMAL CARD / PAGE PREVIEW WITH AUTOMATIC FRAME FIT */
                  <div className="w-full min-w-0 flex flex-col items-center space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-1.5 w-full max-w-xl bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 text-[11px] sm:text-xs shadow-2xs">
                      <span className="font-extrabold text-slate-800">
                        🖨️ পেজ প্রিভিউ •{' '}
                        {customSettings.orientation === 'landscape'
                          ? 'ল্যান্ডস্কেপ'
                          : 'প্রোর্ট্রেট'}
                      </span>
                      <span className="text-indigo-700 font-bold text-[11px]">
                        {pageLayoutMode === 'sheet4'
                          ? '৪টি কার্ড/পেজ'
                          : pageLayoutMode === 'sheet6'
                          ? '৬টি কার্ড/পেজ'
                          : pageLayoutMode === 'sheet8'
                          ? '৮টি কার্ড/পেজ'
                          : 'সিঙ্গেল কার্ড'}{' '}
                        • {colorMode === 'bw' ? 'সাদাকালো' : 'রঙিন'}
                      </span>
                    </div>

                    <div className="w-full flex justify-center py-0.5 overflow-hidden">
                      <div
                        className="bg-white rounded-[3px] shadow-[0_8px_28px_rgba(15,23,42,0.12)] ring-1 ring-slate-300/90 overflow-hidden shrink-0"
                        style={{
                          width: `${normalDisplayMetrics.scaledW}px`,
                          height: `${normalDisplayMetrics.scaledH}px`,
                        }}
                      >
                        <div
                          ref={normalCardInnerRef}
                          className="bg-white p-2.5"
                          style={{
                            width: `${normalDisplayMetrics.naturalW}px`,
                            transform: `scale(${normalDisplayMetrics.scale})`,
                            transformOrigin: 'top left',
                          }}
                        >
                          <style>{normalPreviewCss}</style>
                          <div
                            className="slips-container"
                            dangerouslySetInnerHTML={{ __html: normalPreviewHtml }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT / BOTTOM SCROLLABLE LIVE CUSTOMIZER OR VOTER EDITOR */}
              {sidePanel !== 'none' && (
                <div className="flex-1 min-h-0 w-full lg:w-[42%] overflow-y-auto overscroll-contain p-2.5 sm:p-4 bg-slate-50">
                  {sidePanel === 'customize' && (
                    <div className="w-full max-w-md mx-auto">
                      {renderLiveCustomizerStudio()}
                    </div>
                  )}

                  {sidePanel === 'voter_edit' && (
                    <div className="w-full max-w-md mx-auto bg-white rounded-2xl border border-amber-300 shadow-sm p-3.5 space-y-2.5 text-xs">
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
                            onClick={() => setSidePanel('none')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                          >
                            ✓ সম্পন্ন
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            ভোটারের নাম
                          </label>
                          <input
                            type="text"
                            value={voterData.name || ''}
                            onChange={(e) => setVoterData({ ...voterData, name: e.target.value })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-900"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            ক্রমিক নং
                          </label>
                          <input
                            type="text"
                            value={voterData.serialNo || ''}
                            onChange={(e) =>
                              setVoterData({ ...voterData, serialNo: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            ভোটার আইডি নং
                          </label>
                          <input
                            type="text"
                            value={voterData.voterId || ''}
                            onChange={(e) =>
                              setVoterData({ ...voterData, voterId: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            পিতা / স্বামীর নাম
                          </label>
                          <input
                            type="text"
                            value={voterData.fatherName || ''}
                            onChange={(e) =>
                              setVoterData({ ...voterData, fatherName: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            মাতার নাম
                          </label>
                          <input
                            type="text"
                            value={voterData.motherName || ''}
                            onChange={(e) =>
                              setVoterData({ ...voterData, motherName: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            জন্ম তারিখ
                          </label>
                          <input
                            type="text"
                            value={voterData.dob || ''}
                            onChange={(e) => setVoterData({ ...voterData, dob: e.target.value })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            পেশা
                          </label>
                          <input
                            type="text"
                            value={voterData.profession || ''}
                            onChange={(e) =>
                              setVoterData({ ...voterData, profession: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            এলাকা / গ্রাম
                          </label>
                          <input
                            type="text"
                            value={voterData.villageName || ''}
                            onChange={(e) =>
                              setVoterData({ ...voterData, villageName: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            ঠিকানা
                          </label>
                          <input
                            type="text"
                            value={voterData.address || ''}
                            onChange={(e) =>
                              setVoterData({ ...voterData, address: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Immediate Print Action Bar (Safe-area aware & mobile fitted) */}
            <div className="bg-white border-t border-slate-200 px-2.5 py-2 sm:px-5 sm:py-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex flex-wrap items-center justify-between gap-2 shrink-0">
              {activePrintOption === 'bluetooth' ? (
                <>
                  <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => handlePrintBluetooth([voterData])}
                      disabled={isPrintingBt}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-black px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm shadow-md cursor-pointer transition flex items-center justify-center gap-1.5"
                    >
                      <span>⚡</span>
                      <span>
                        {isPrintingBt
                          ? `প্রিন্ট ${btProgress}%...`
                          : 'থার্মাল প্রিন্ট করুন'}
                      </span>
                    </button>

                    {slipQueue.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handlePrintBluetooth(slipQueue)}
                        disabled={isPrintingBt}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold px-3 py-2 sm:py-2.5 rounded-xl text-xs cursor-pointer transition"
                      >
                        📋 সব ({convertToBengaliNumbers(slipQueue.length)})
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleNormalPrint(effectiveBatchVoters, pageLayoutMode)}
                      className="px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-extrabold text-[11px] sm:text-xs cursor-pointer transition"
                    >
                      🖨️ পেজ প্রিন্ট
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadImage}
                      className="px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] sm:text-xs cursor-pointer transition"
                    >
                      💾 সেভ
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleNormalPrint(effectiveBatchVoters, pageLayoutMode)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm shadow-md cursor-pointer transition flex items-center justify-center gap-1.5"
                    >
                      <span>🖨️</span>
                      <span>
                        {slipQueue.length > 1
                          ? `প্রিন্ট করুন (${convertToBengaliNumbers(slipQueue.length)} জন)`
                          : 'এখনই প্রিন্ট করুন'}
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handlePrintBluetooth([voterData])}
                      disabled={isPrintingBt}
                      className="px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-extrabold text-[11px] sm:text-xs cursor-pointer transition"
                    >
                      📶 থার্মাল
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadImage}
                      className="px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] sm:text-xs cursor-pointer transition"
                    >
                      💾 সেভ
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* =====================================================================
            SCREEN 2: FULL TEMPLATE & CANDIDATE SETTINGS PAGE
            ===================================================================== */}
        {activeScreen === 'settings' && (
          <>
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-4 bg-slate-50">
              {/* 1. DEFAULT CANDIDATE & TEMPLATE SELECTOR */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm">
                      📌 ১. ডিফল্ট প্রার্থী ও স্লিপ টেমপ্লেট সিলেক্ট করুন ({convertToBengaliNumbers(candidatesList.length)}টি)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      এখানে যা সিলেক্ট করে রাখবেন, স্লিপ প্রিন্টে ক্লিক করলে সেটিই সরাসরি সামনে আসবে
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCreateCustomTemplate}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold cursor-pointer transition"
                    >
                      ➕ নতুন কাস্টম স্লিপ
                    </button>
                    <button
                      type="button"
                      onClick={handleResetTemplates}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold cursor-pointer transition"
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
                                ✓ ডিফল্ট
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
                      📄 পেজ প্রিন্টে এক পেজে কয়টি কার্ড থাকবে:
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
                        🎨 প্রিন্ট কালার মোড:
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

              {/* 3. CANDIDATE DETAILS, PHOTOS & ALL TEXT FIELDS */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-4">
                <h4 className="font-black text-slate-900 text-xs sm:text-sm">
                  ✏️ ৩. প্রার্থীর নাম, ছবি, মার্কা ও কার্ডের সব লেখা পরিবর্তন করুন:
                </h4>

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

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">টেমপ্লেটের নাম</label>
                    <input
                      type="text"
                      value={candidate.templateTitle || ''}
                      onChange={(e) => updateCandidateField({ templateTitle: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">উপরের ধর্মীয় লেখা</label>
                    <input
                      type="text"
                      value={candidate.religiousHeader || ''}
                      onChange={(e) => updateCandidateField({ religiousHeader: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">ডান কোণার ব্যাজ লেখা</label>
                    <input
                      type="text"
                      value={candidate.cardBadgeText ?? ''}
                      onChange={(e) => updateCandidateField({ cardBadgeText: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">নির্বাচনের শিরোনাম (১ম লাইন)</label>
                    <input
                      type="text"
                      value={candidate.electionTitle || ''}
                      onChange={(e) => updateCandidateField({ electionTitle: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">আসন / ইউনিয়ন (২য় লাইন)</label>
                    <input
                      type="text"
                      value={candidate.constituencyText || ''}
                      onChange={(e) => updateCandidateField({ constituencyText: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">কালো বক্সের পদবী</label>
                    <input
                      type="text"
                      value={candidate.candidateBadge || ''}
                      onChange={(e) =>
                        updateCandidateField({
                          candidateBadge: e.target.value,
                          postTitle: e.target.value,
                        })
                      }
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">প্রার্থীর বিশেষণ / উপাধি</label>
                    <input
                      type="text"
                      value={candidate.electionSubtitle || ''}
                      onChange={(e) => updateCandidateField({ electionSubtitle: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">প্রার্থীর মূল নাম</label>
                    <input
                      type="text"
                      value={candidate.name || ''}
                      onChange={(e) =>
                        updateCandidateField({ name: e.target.value, candidateName: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-black text-indigo-900"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">নামের পরের শব্দ (কে)</label>
                    <input
                      type="text"
                      value={candidate.candidateSuffix ?? 'কে'}
                      onChange={(e) => updateCandidateField({ candidateSuffix: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">মার্কার নাম</label>
                    <input
                      type="text"
                      value={candidate.symbolName || ''}
                      onChange={(e) => updateCandidateField({ symbolName: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">মার্কার আহ্বান লেখা</label>
                    <input
                      type="text"
                      value={candidate.symbolCallout || ''}
                      onChange={(e) => updateCandidateField({ symbolCallout: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">স্লোগান / অঙ্গীকার</label>
                    <input
                      type="text"
                      value={candidate.sloganText || ''}
                      onChange={(e) => updateCandidateField({ sloganText: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">ভোটকেন্দ্রের নাম</label>
                    <input
                      type="text"
                      value={candidate.pollingCenter || ''}
                      onChange={(e) => updateCandidateField({ pollingCenter: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">ওয়ার্ড নং</label>
                    <input
                      type="text"
                      value={candidate.wardNo || ''}
                      onChange={(e) => updateCandidateField({ wardNo: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">ভোটার এলাকা</label>
                    <input
                      type="text"
                      value={candidate.voterArea || ''}
                      onChange={(e) => updateCandidateField({ voterArea: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">ফুটার বাম পাশ</label>
                    <input
                      type="text"
                      value={candidate.footerLeftText || ''}
                      onChange={(e) => updateCandidateField({ footerLeftText: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">ফুটার মাঝখান</label>
                    <input
                      type="text"
                      value={candidate.footerCenterText || ''}
                      onChange={(e) => updateCandidateField({ footerCenterText: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-0.5">ফুটার ডান পাশ</label>
                    <input
                      type="text"
                      value={candidate.footerRightText || ''}
                      onChange={(e) => updateCandidateField({ footerRightText: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border-t border-slate-200 px-4 py-3 sm:px-6 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500 font-semibold">
                ✅ সকল পরিবর্তন স্বয়ংক্রিয়ভাবে সেভ হয়েছে
              </span>
              <button
                type="button"
                onClick={() => setActiveScreen('preview')}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-black cursor-pointer"
              >
                ✓ প্রিভিউ ও প্রিন্ট পেজে ফিরুন
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
