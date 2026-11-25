/// <reference types="web-bluetooth" />

// Enhanced Bluetooth ESC/POS Driver for 58mm / 80mm Mini Portable Thermal Printers
// Supports:
// 1. Android Native Bluetooth SPP Bridge (paired printer picker, 3-tier RFCOMM fallback, detailed errors)
// 2. Web Bluetooth API (BLE adaptive 20-byte MTU chunking + automatic reconnection via getDevices())

export type BluetoothErrorCode =
  | ''
  | 'PERMISSION_DENIED'
  | 'BLUETOOTH_DISABLED'
  | 'NO_PAIRED_DEVICES'
  | 'MULTIPLE_DEVICES_SELECT_REQUIRED'
  | 'CONNECT_FAILED'
  | 'PRINT_FAILED'
  | 'NO_ADAPTER'
  | 'DEVICE_NOT_FOUND'
  | 'UNSUPPORTED'
  | 'UNKNOWN_ERROR';

export interface PairedBluetoothDevice {
  name: string;
  address: string;
  isLikelyPrinter: boolean;
}

export interface NativeBluetoothListResult {
  success: boolean;
  errorCode: BluetoothErrorCode;
  error: string;
  bluetoothEnabled: boolean;
  permissionGranted: boolean;
  devices: PairedBluetoothDevice[];
}

export interface BluetoothPrinterDevice {
  device?: BluetoothDevice;
  characteristic?: BluetoothRemoteGATTCharacteristic;
  name: string;
  isNativeAndroid?: boolean;
  address?: string;
}

export interface BleWritableCharacteristicLike {
  properties: {
    write?: boolean;
    writeWithoutResponse?: boolean;
  };
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
  writeValue?: (value: BufferSource) => Promise<void>;
}

export class BluetoothPrinterError extends Error {
  code: BluetoothErrorCode;
  devices: PairedBluetoothDevice[];

  constructor(
    message: string,
    code: BluetoothErrorCode = 'UNKNOWN_ERROR',
    devices: PairedBluetoothDevice[] = []
  ) {
    super(message);
    this.name = 'BluetoothPrinterError';
    this.code = code;
    this.devices = devices;
  }
}

const COMMON_BLE_PRINT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Print Service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // Common POS (MPT-II, Goojprt, PT-210)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent UART
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // XPrinter / Netum
  '0000af30-0000-1000-8000-00805f9b34fb', // Mini Thermal Printer
  '0000ff00-0000-1000-8000-00805f9b34fb', // Generic POS BLE
  '0000ae30-0000-1000-8000-00805f9b34fb', // Cat / Mini Thermal Printer
  '0000fff0-0000-1000-8000-00805f9b34fb', // Rongta / GPrinter BLE
  '0000fee7-0000-1000-8000-00805f9b34fb', // PeriPage / Phomemo BLE
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', // Generic SPP-over-BLE
];

const LAST_PRINTER_STORAGE_KEY = 'voter_app_last_bt_printer_v1';

let connectedPrinter: BluetoothPrinterDevice | null = null;

export interface SavedPrinterPreference {
  id?: string;
  address?: string;
  name?: string;
}

export function getSavedPreferredPrinter(): SavedPrinterPreference | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_PRINTER_STORAGE_KEY);
    if (!raw) return null;
    if (raw.trim().startsWith('{')) {
      const parsed = JSON.parse(raw);
      return {
        id: typeof parsed.id === 'string' ? parsed.id : undefined,
        address: typeof parsed.address === 'string' ? parsed.address : undefined,
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
      };
    }
    // Backward compatibility with legacy plain device.id string
    return { id: raw };
  } catch {
    return null;
  }
}

export function savePreferredPrinter(pref: SavedPrinterPreference): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LAST_PRINTER_STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // Ignore storage quota errors
  }
}

export function isAndroidNativeBluetooth(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).AndroidNative);
}

export function isBluetoothSupported(): boolean {
  if (isAndroidNativeBluetooth()) {
    return true;
  }
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function getConnectedPrinter(): BluetoothPrinterDevice | null {
  if (connectedPrinter) {
    if (connectedPrinter.isNativeAndroid) {
      return connectedPrinter;
    }
    if (connectedPrinter.device?.gatt?.connected) {
      return connectedPrinter;
    }
  }
  return null;
}

/**
 * Pure parser for AndroidNative.getPairedBluetoothDevices() JSON response
 */
export function parseNativeBluetoothListResponse(raw: unknown): NativeBluetoothListResult {
  const emptyError = (
    errorCode: BluetoothErrorCode,
    error: string,
    bluetoothEnabled = false,
    permissionGranted = true
  ): NativeBluetoothListResult => ({
    success: false,
    errorCode,
    error,
    bluetoothEnabled,
    permissionGranted,
    devices: [],
  });

  if (!raw || typeof raw !== 'string') {
    return emptyError(
      'UNKNOWN_ERROR',
      'ব্লুটুথ প্রিন্টারের তালিকা পাওয়া যায়নি। ফোনের ব্লুটুথ অন করে আবার চেষ্টা করুন।'
    );
  }

  try {
    const parsed = JSON.parse(raw);
    const devices: PairedBluetoothDevice[] = Array.isArray(parsed.devices)
      ? parsed.devices
          .filter((d: any) => d && typeof d.address === 'string' && d.address.trim().length > 0)
          .map((d: any) => ({
            name: typeof d.name === 'string' && d.name.trim() ? d.name.trim() : 'Bluetooth Device',
            address: d.address.trim(),
            isLikelyPrinter: Boolean(d.isLikelyPrinter),
          }))
      : [];

    const errorCode = (
      typeof parsed.errorCode === 'string' ? parsed.errorCode : ''
    ) as BluetoothErrorCode;

    return {
      success: Boolean(parsed.success),
      errorCode,
      error: typeof parsed.error === 'string' ? parsed.error : '',
      bluetoothEnabled:
        typeof parsed.bluetoothEnabled === 'boolean' ? parsed.bluetoothEnabled : Boolean(parsed.success),
      permissionGranted:
        typeof parsed.permissionGranted === 'boolean'
          ? parsed.permissionGranted
          : errorCode !== 'PERMISSION_DENIED',
      devices,
    };
  } catch {
    return emptyError(
      'UNKNOWN_ERROR',
      'ব্লুটুথ তথ্য পড়তে সমস্যা হয়েছে। অ্যাপটি আপডেট করে আবার চেষ্টা করুন।'
    );
  }
}

/**
 * Pure heuristic to auto-select the best paired printer without guessing wrong when multiple non-printer devices exist
 */
export function selectBestPairedPrinter(
  devices: PairedBluetoothDevice[],
  savedAddress?: string | null
): PairedBluetoothDevice | null {
  if (!devices || devices.length === 0) return null;

  // 1. Highest priority: exact printer previously selected by the user
  if (savedAddress && savedAddress.trim()) {
    const normalizedSaved = savedAddress.trim().toLowerCase();
    const savedMatch = devices.find((d) => d.address.trim().toLowerCase() === normalizedSaved);
    if (savedMatch) return savedMatch;
  }

  // 2. If exactly one likely thermal printer is paired, pick it automatically
  const likelyPrinters = devices.filter((d) => d.isLikelyPrinter);
  if (likelyPrinters.length === 1) {
    return likelyPrinters[0];
  }

  // 3. If only 1 total Bluetooth device is paired on the phone, pick it
  if (devices.length === 1) {
    return devices[0];
  }

  // 4. Multiple devices (or multiple printers) — let user pick explicitly!
  return null;
}

/**
 * Query Android Native bridge for ALL paired Bluetooth devices + exact permission/power state
 */
export function listNativePairedPrinters(): NativeBluetoothListResult {
  if (!isAndroidNativeBluetooth()) {
    return {
      success: false,
      errorCode: 'UNSUPPORTED',
      error: 'নেটিভ অ্যান্ড্রয়েড ব্লুটুথ ব্রিজ পাওয়া যায়নি।',
      bluetoothEnabled: false,
      permissionGranted: false,
      devices: [],
    };
  }

  const bridge = (window as any).AndroidNative;

  // Preferred new API (returns full device list + exact errorCode)
  if (typeof bridge.getPairedBluetoothDevices === 'function') {
    try {
      const raw = bridge.getPairedBluetoothDevices();
      return parseNativeBluetoothListResponse(raw);
    } catch {
      return {
        success: false,
        errorCode: 'UNKNOWN_ERROR',
        error: 'ব্লুটুথ তালিকা লোড করতে সমস্যা হয়েছে।',
        bluetoothEnabled: false,
        permissionGranted: true,
        devices: [],
      };
    }
  }

  // Fallback for older APK builds that only expose getPairedPrinterInfo()
  if (typeof bridge.getPairedPrinterInfo === 'function') {
    try {
      const raw = bridge.getPairedPrinterInfo();
      if (raw && typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.name) {
          return {
            success: true,
            errorCode: '',
            error: '',
            bluetoothEnabled: true,
            permissionGranted: true,
            devices: [
              {
                name: parsed.name,
                address: parsed.address || 'PAIRED_PRINTER',
                isLikelyPrinter: true,
              },
            ],
          };
        }
        if (parsed && parsed.errorCode) {
          return parseNativeBluetoothListResponse(raw);
        }
      }
    } catch {
      // Fall through to helpful prompt
    }
  }

  return {
    success: false,
    errorCode: 'NO_PAIRED_DEVICES',
    error:
      'কোনো পেয়ার করা প্রিন্টার পাওয়া যায়নি। ফোনের ব্লুটুথ চালু করে প্রিন্টারটি পেয়ার (Pair) করুন এবং নতুন APK আপডেট ব্যবহার করুন।',
    bluetoothEnabled: false,
    permissionGranted: true,
    devices: [],
  };
}

export function openAndroidBluetoothSettings(): boolean {
  if (!isAndroidNativeBluetooth()) return false;
  const bridge = (window as any).AndroidNative;
  if (typeof bridge.openBluetoothSettings === 'function') {
    try {
      bridge.openBluetoothSettings();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function requestAndroidBluetoothPermissions(): boolean {
  if (!isAndroidNativeBluetooth()) return false;
  const bridge = (window as any).AndroidNative;
  if (typeof bridge.requestBluetoothPermissions === 'function') {
    try {
      bridge.requestBluetoothPermissions();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Connect to a specific Android paired Bluetooth printer by its MAC address
 */
export async function connectNativePrinterByAddress(
  address: string,
  nameHint?: string
): Promise<BluetoothPrinterDevice> {
  if (!isAndroidNativeBluetooth()) {
    throw new BluetoothPrinterError(
      'অ্যান্ড্রয়েড ব্লুটুথ ব্রিজ পাওয়া যায়নি।',
      'UNSUPPORTED'
    );
  }

  const bridge = (window as any).AndroidNative;

  if (typeof bridge.connectPrinterByAddress === 'function') {
    const raw = bridge.connectPrinterByAddress(address);
    const parsed = typeof raw === 'string' && raw.trim().startsWith('{') ? JSON.parse(raw) : null;
    if (parsed && parsed.success) {
      const printer: BluetoothPrinterDevice = {
        name: parsed.name || nameHint || 'ব্লুটুথ প্রিন্টার',
        address: parsed.address || address,
        isNativeAndroid: true,
      };
      connectedPrinter = printer;
      savePreferredPrinter({ address: printer.address, name: printer.name });
      return printer;
    }
    throw new BluetoothPrinterError(
      parsed?.error || 'প্রিন্টারে কানেক্ট করা যায়নি। প্রিন্টারটি অন আছে কিনা দেখুন।',
      (parsed?.errorCode as BluetoothErrorCode) || 'CONNECT_FAILED'
    );
  }

  // Legacy APK fallback
  if (typeof bridge.connectPairedPrinter === 'function') {
    const raw = bridge.connectPairedPrinter();
    const parsed = typeof raw === 'string' && raw.trim().startsWith('{') ? JSON.parse(raw) : null;
    if (parsed && (parsed.success || parsed.name)) {
      const printer: BluetoothPrinterDevice = {
        name: parsed.name || nameHint || 'ব্লুটুথ প্রিন্টার',
        address: parsed.address || address,
        isNativeAndroid: true,
      };
      connectedPrinter = printer;
      savePreferredPrinter({ address: printer.address, name: printer.name });
      return printer;
    }
  }

  throw new BluetoothPrinterError(
    'প্রিন্টারের সাথে কানেক্ট করা যায়নি। প্রিন্টারটি অন আছে ও পেয়ার করা আছে কিনা দেখুন।',
    'CONNECT_FAILED'
  );
}

async function findWritableCharacteristic(
  server: BluetoothRemoteGATTServer
): Promise<BluetoothRemoteGATTCharacteristic | null> {
  for (const serviceUuid of COMMON_BLE_PRINT_SERVICES) {
    try {
      const service = await server.getPrimaryService(serviceUuid);
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.writeWithoutResponse || char.properties.write) {
          return char;
        }
      }
    } catch {
      // Continue to next service
    }
  }

  try {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.writeWithoutResponse || char.properties.write) {
          return char;
        }
      }
    }
  } catch {
    // No accessible services
  }

  return null;
}

/**
 * Automatically checks if a Bluetooth printer is already connected/paired in:
 * 1. Android Phone Bluetooth Settings (via AndroidNative bridge + saved preference)
 * 2. Previously authorized Web Bluetooth devices (navigator.bluetooth.getDevices)
 */
export async function autoConnectBluetoothPrinter(): Promise<BluetoothPrinterDevice | null> {
  const existing = getConnectedPrinter();
  if (existing) return existing;

  // 1. Check Android Native Bluetooth (Phone Settings Paired Printer)
  if (isAndroidNativeBluetooth()) {
    const listRes = listNativePairedPrinters();
    if (listRes.success && listRes.devices.length > 0) {
      const saved = getSavedPreferredPrinter();
      const best = selectBestPairedPrinter(listRes.devices, saved?.address);
      if (best) {
        connectedPrinter = {
          name: best.name,
          address: best.address,
          isNativeAndroid: true,
        };
        return connectedPrinter;
      }
    }
    return null;
  }

  // 2. Check Web Bluetooth previously permitted devices (navigator.bluetooth.getDevices)
  try {
    if (
      typeof navigator !== 'undefined' &&
      'bluetooth' in navigator &&
      typeof (navigator.bluetooth as any).getDevices === 'function'
    ) {
      const devices: BluetoothDevice[] = await (navigator.bluetooth as any).getDevices();
      const saved = getSavedPreferredPrinter();
      const savedPrinterId = saved?.id;

      const sorted = [...devices].sort((a, b) =>
        a.id === savedPrinterId ? -1 : b.id === savedPrinterId ? 1 : 0
      );

      for (const device of sorted) {
        if (!device.gatt) continue;
        try {
          const server = await device.gatt.connect();
          const writeChar = await findWritableCharacteristic(server);
          if (writeChar) {
            connectedPrinter = {
              device,
              characteristic: writeChar,
              name: device.name || 'ব্লুটুথ প্রিন্টার',
            };
            device.addEventListener('gattserverdisconnected', () => {
              connectedPrinter = null;
            });
            return connectedPrinter;
          }
        } catch {
          // Device might be out of range or off right now
        }
      }
    }
  } catch {
    // getDevices not enabled or no devices
  }

  return null;
}

export async function connectBluetoothPrinter(): Promise<BluetoothPrinterDevice> {
  // 1. Android Native APK Bluetooth Bridge
  if (isAndroidNativeBluetooth()) {
    const listRes = listNativePairedPrinters();
    if (!listRes.success) {
      throw new BluetoothPrinterError(
        listRes.error ||
          'ব্লুটুথ প্রিন্টার পাওয়া যায়নি। ফোনের ব্লুটুথ চালু করে প্রিন্টারটি পেয়ার করুন।',
        listRes.errorCode || 'NO_PAIRED_DEVICES',
        listRes.devices
      );
    }

    const saved = getSavedPreferredPrinter();
    const best = selectBestPairedPrinter(listRes.devices, saved?.address);
    if (!best) {
      throw new BluetoothPrinterError(
        'একাধিক ব্লুটুথ ডিভাইস পাওয়া গেছে। নিচের তালিকা থেকে আপনার প্রিন্টারটি সিলেক্ট করুন।',
        'MULTIPLE_DEVICES_SELECT_REQUIRED',
        listRes.devices
      );
    }

    return connectNativePrinterByAddress(best.address, best.name);
  }

  // 2. Web Bluetooth API (Chrome / Edge on Android & Desktop)
  if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
    throw new BluetoothPrinterError(
      'এই ব্রাউজারে ওয়েব ব্লুটুথ সাপোর্ট নেই। অনুগ্রহ করে অ্যান্ড্রয়েড APK অ্যাপ অথবা Google Chrome ব্যবহার করুন।',
      'UNSUPPORTED'
    );
  }

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: COMMON_BLE_PRINT_SERVICES,
  });

  if (!device.gatt) {
    throw new BluetoothPrinterError(
      'ব্লুটুথ ডিভাইস GATT সার্ভার খুঁজে পাওয়া যায়নি।',
      'CONNECT_FAILED'
    );
  }

  const server = await device.gatt.connect();
  const writeCharacteristic = await findWritableCharacteristic(server);

  if (!writeCharacteristic) {
    throw new BluetoothPrinterError(
      'প্রিন্টারের রাইট চ্যানেল (Writable Characteristic) পাওয়া যায়নি। এই প্রিন্টারটি শুধু Classic Bluetooth (SPP) হলে অ্যান্ড্রয়েড APK অ্যাপ দিয়ে প্রিন্ট করুন।',
      'CONNECT_FAILED'
    );
  }

  savePreferredPrinter({ id: device.id, name: device.name || 'মিনি ব্লুটুথ প্রিন্টার' });

  connectedPrinter = {
    device,
    characteristic: writeCharacteristic,
    name: device.name || 'মিনি ব্লুটুথ প্রিন্টার',
  };

  device.addEventListener('gattserverdisconnected', () => {
    connectedPrinter = null;
  });

  return connectedPrinter;
}

export async function disconnectBluetoothPrinter(): Promise<void> {
  if (connectedPrinter?.device?.gatt?.connected) {
    connectedPrinter.device.gatt.disconnect();
  }
  if (
    connectedPrinter?.isNativeAndroid &&
    typeof window !== 'undefined' &&
    (window as any).AndroidNative?.disconnectPrinter
  ) {
    try {
      (window as any).AndroidNative.disconnectPrinter();
    } catch {
      // Ignore bridge disconnect error
    }
  }
  connectedPrinter = null;
}

// Convert Uint8Array to Base64 string for Android Native Bluetooth SPP transfer
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  return '';
}

/**
 * Compact ESC/POS Test Receipt bytes to verify Bluetooth printer connection
 */
export function createTestPrintEscPosBytes(printerName = 'Thermal Printer'): Uint8Array {
  const safeName = printerName.replace(/[^\x20-\x7E]/g, '').trim() || 'Bluetooth Printer';
  const lines = [
    '================================',
    '    VOTER APP - TEST PRINT OK   ',
    '================================',
    `Printer: ${safeName.slice(0, 22)}`,
    'Status : Connected & Ready',
    '--------------------------------',
    '',
    '',
  ].join('\n');

  const encoder = new TextEncoder();
  const textBytes = encoder.encode(lines);
  const header = new Uint8Array([
    0x1b, 0x40, // ESC @ initialize
    0x1b, 0x61, 0x01, // Center align
  ]);
  const footer = new Uint8Array([
    0x1b, 0x64, 0x03, // Feed 3 lines
  ]);

  const out = new Uint8Array(header.length + textBytes.length + footer.length);
  out.set(header, 0);
  out.set(textBytes, header.length);
  out.set(footer, header.length + textBytes.length);
  return out;
}

// Convert an HTML Canvas to ESC/POS Raster bit image (GS v 0) bytes
export function canvasToEscPosBytes(
  canvas: HTMLCanvasElement,
  darknessThreshold = 145
): Uint8Array {
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8Array();

  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Bytes per line (width must be multiple of 8, for 384 width -> 48 bytes, for 576 width -> 72 bytes)
  const bytesWidth = Math.ceil(width / 8);
  const xL = bytesWidth % 256;
  const xH = Math.floor(bytesWidth / 256);
  const yL = height % 256;
  const yH = Math.floor(height / 256);

  const header = [
    0x1b, 0x40, // ESC @ (Initialize printer)
    0x1b, 0x61, 0x01, // Center align
    0x1d, 0x76, 0x30, 0x00, // GS v 0 m (Raster bit image)
    xL, xH,
    yL, yH,
  ];

  const totalBytes = bytesWidth * height;
  const imageBytes = new Uint8Array(totalBytes);

  // Convert image data to grayscale array for error-diffusion dithering
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const a = data[idx + 3];
    if (a < 128) {
      gray[i] = 255; // White for transparent
    } else {
      gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
  }

  // Floyd-Steinberg error diffusion dithering for crystal clear thermal photos & Bengali text
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const oldVal = gray[i];
      const newVal = oldVal < darknessThreshold ? 0 : 255;
      gray[i] = newVal;
      const err = oldVal - newVal;

      if (x + 1 < width) gray[i + 1] += (err * 7) / 16;
      if (x - 1 >= 0 && y + 1 < height) gray[i + width - 1] += (err * 3) / 16;
      if (y + 1 < height) gray[i + width] += (err * 5) / 16;
      if (x + 1 < width && y + 1 < height) gray[i + width + 1] += (err * 1) / 16;
    }
  }

  // Pack dithered 1-bit pixels into ESC/POS bytes
  let byteIdx = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < bytesWidth; x++) {
      let byteVal = 0;
      for (let bit = 0; bit < 8; bit++) {
        const pixelX = x * 8 + bit;
        if (pixelX < width) {
          const isBlack = gray[y * width + pixelX] === 0;
          if (isBlack) {
            byteVal |= 1 << (7 - bit);
          }
        }
      }
      imageBytes[byteIdx++] = byteVal;
    }
  }

  // Footer: Feed 3 lines and partial cut
  const footer = [
    0x1b, 0x64, 0x03, // ESC d 3 (Feed 3 lines)
    0x1d, 0x56, 0x42, 0x00, // GS V B 0 (Feed and cut)
  ];

  const output = new Uint8Array(header.length + imageBytes.length + footer.length);
  output.set(header, 0);
  output.set(imageBytes, header.length);
  output.set(footer, header.length + imageBytes.length);

  return output;
}

async function writeSingleBleChunk(
  characteristic: BleWritableCharacteristicLike,
  chunk: Uint8Array,
  preferWithoutResponse: boolean
): Promise<void> {
  const canWithoutResp =
    Boolean(characteristic.properties.writeWithoutResponse) &&
    typeof characteristic.writeValueWithoutResponse === 'function';
  const canWithResp =
    Boolean(characteristic.properties.write) && typeof characteristic.writeValue === 'function';

  if (preferWithoutResponse && canWithoutResp) {
    try {
      await characteristic.writeValueWithoutResponse!(chunk as BufferSource);
      return;
    } catch (err) {
      if (canWithResp) {
        await characteristic.writeValue!(chunk as BufferSource);
        return;
      }
      throw err;
    }
  }

  if (canWithResp) {
    try {
      await characteristic.writeValue!(chunk as BufferSource);
      return;
    } catch (err) {
      if (canWithoutResp) {
        await characteristic.writeValueWithoutResponse!(chunk as BufferSource);
        return;
      }
      throw err;
    }
  }

  if (canWithoutResp) {
    await characteristic.writeValueWithoutResponse!(chunk as BufferSource);
    return;
  }

  throw new BluetoothPrinterError(
    'প্রিন্টারের ব্লুটুথ রাইট চ্যানেল সক্রিয় নয়।',
    'PRINT_FAILED'
  );
}

/**
 * Adaptive BLE GATT chunk writer:
 * Starts at 100 bytes; if the device enforces standard 20-byte BLE ATT MTU,
 * automatically drops down to 20-byte chunks and retries cleanly without dropping data!
 */
export async function sendBleChunksAdaptive(
  characteristic: BleWritableCharacteristicLike,
  data: Uint8Array,
  onProgress?: (percent: number) => void,
  sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<{ chunkSizeUsed: number; chunksSent: number }> {
  const total = data.length;
  if (total === 0) {
    if (onProgress) onProgress(100);
    return { chunkSizeUsed: 20, chunksSent: 0 };
  }

  let chunkSize = 100;
  let offset = 0;
  let chunksSent = 0;
  const preferWithoutResponse = Boolean(characteristic.properties.writeWithoutResponse);

  while (offset < total) {
    const end = Math.min(offset + chunkSize, total);
    const chunk = new Uint8Array(data.subarray(offset, end));

    try {
      await writeSingleBleChunk(characteristic, chunk, preferWithoutResponse);
      offset = end;
      chunksSent++;
      if (onProgress) {
        onProgress(Math.round((offset / total) * 100));
      }
      if (offset < total) {
        await sleepFn(chunkSize <= 20 ? 15 : 22);
      }
    } catch (err) {
      // Standard BLE ATT MTU is 23 bytes (20-byte payload). Drop down and retry same offset!
      if (chunkSize > 20) {
        chunkSize = 20;
        await sleepFn(25);
        continue;
      }
      throw err;
    }
  }

  return { chunkSizeUsed: chunkSize, chunksSent };
}

// Send binary data to Bluetooth printer (supports both Native Android SPP and Web Bluetooth BLE)
export async function sendEscPosToPrinter(
  printer: BluetoothPrinterDevice,
  data: Uint8Array,
  onProgress?: (percent: number) => void
): Promise<void> {
  // 1. Native Android Bluetooth SPP Printer
  if (printer.isNativeAndroid && isAndroidNativeBluetooth()) {
    const bridge = (window as any).AndroidNative;
    if (onProgress) onProgress(25);
    const b64 = uint8ArrayToBase64(data);
    if (onProgress) onProgress(55);

    if (typeof bridge.printEscPosBase64Detailed === 'function') {
      const resultRaw = bridge.printEscPosBase64Detailed(b64, printer.address || '');
      const result =
        typeof resultRaw === 'string' && resultRaw.trim().startsWith('{')
          ? JSON.parse(resultRaw)
          : { success: Boolean(resultRaw) };
      if (!result.success) {
        throw new BluetoothPrinterError(
          result.error ||
            'ব্লুটুথ প্রিন্টারে ডাটা পাঠানো যায়নি। প্রিন্টারটি অন আছে ও কাগজ আছে কিনা দেখুন।',
          (result.errorCode as BluetoothErrorCode) || 'PRINT_FAILED'
        );
      }
      if (onProgress) onProgress(100);
      return;
    }

    if (typeof bridge.printEscPosBase64 === 'function') {
      const resultRaw = bridge.printEscPosBase64(b64, printer.address || '');
      if (typeof resultRaw === 'boolean') {
        if (!resultRaw) {
          throw new BluetoothPrinterError(
            'ব্লুটুথ প্রিন্টারে ডাটা পাঠানো যায়নি। প্রিন্টারটি অন আছে কিনা দেখুন।',
            'PRINT_FAILED'
          );
        }
        if (onProgress) onProgress(100);
        return;
      }
      const result =
        typeof resultRaw === 'string' && resultRaw.trim().startsWith('{')
          ? JSON.parse(resultRaw)
          : { success: Boolean(resultRaw) };
      if (!result.success) {
        throw new BluetoothPrinterError(
          result.error || 'ব্লুটুথ প্রিন্টারে ডাটা পাঠানো যায়নি। প্রিন্টারটি অন আছে কিনা দেখুন।',
          (result.errorCode as BluetoothErrorCode) || 'PRINT_FAILED'
        );
      }
      if (onProgress) onProgress(100);
      return;
    }

    throw new BluetoothPrinterError(
      'ব্লুটুথ প্রিন্ট সার্ভিস পাওয়া যায়নি। অ্যাপটি নতুন ভার্সনে আপডেট করুন।',
      'UNSUPPORTED'
    );
  }

  // 2. Web Bluetooth BLE Characteristic (with adaptive 20-byte MTU fallback)
  const characteristic = printer.characteristic;
  if (!characteristic) {
    throw new BluetoothPrinterError('ব্লুটুথ প্রিন্টার সংযুক্ত নেই।', 'CONNECT_FAILED');
  }

  await sendBleChunksAdaptive(characteristic, data, onProgress);
}
