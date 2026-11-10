/// <reference types="web-bluetooth" />

// Enhanced Bluetooth ESC/POS Driver for 58mm / 80mm Mini Portable Thermal Printers
// Supports:
// 1. Android Native Bluetooth SPP Bridge (auto-detects & connects printers paired in Phone Bluetooth Settings!)
// 2. Web Bluetooth API with automatic reconnection via navigator.bluetooth.getDevices()

export interface BluetoothPrinterDevice {
  device?: BluetoothDevice;
  characteristic?: BluetoothRemoteGATTCharacteristic;
  name: string;
  isNativeAndroid?: boolean;
  address?: string;
}

const COMMON_BLE_PRINT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Print Service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // Common POS (MPT-II, Goojprt, PT-210)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent UART
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // XPrinter / Netum
  '0000af30-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
];

const LAST_PRINTER_STORAGE_KEY = 'voter_app_last_bt_printer_v1';

let connectedPrinter: BluetoothPrinterDevice | null = null;

export function isBluetoothSupported(): boolean {
  if (typeof window !== 'undefined' && (window as any).AndroidNative) {
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

async function findWritableCharacteristic(
  server: BluetoothRemoteGATTServer
): Promise<BluetoothRemoteGATTCharacteristic | null> {
  for (const serviceUuid of COMMON_BLE_PRINT_SERVICES) {
    try {
      const service = await server.getPrimaryService(serviceUuid);
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
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
        if (char.properties.write || char.properties.writeWithoutResponse) {
          return char;
        }
      }
    }
  } catch {}

  return null;
}

/**
 * Automatically checks if a Bluetooth printer is already connected/paired in:
 * 1. Android Phone Bluetooth Settings (via AndroidNative bridge)
 * 2. Previously authorized Web Bluetooth devices (navigator.bluetooth.getDevices)
 */
export async function autoConnectBluetoothPrinter(): Promise<BluetoothPrinterDevice | null> {
  const existing = getConnectedPrinter();
  if (existing) return existing;

  // 1. Check Android Native Bluetooth (Phone Settings Paired Printer)
  if (typeof window !== 'undefined' && (window as any).AndroidNative) {
    const bridge = (window as any).AndroidNative;
    try {
      if (typeof bridge.getPairedPrinterInfo === 'function') {
        const infoRaw = bridge.getPairedPrinterInfo();
        if (infoRaw) {
          const parsed = JSON.parse(infoRaw);
          if (parsed && parsed.name) {
            connectedPrinter = {
              name: parsed.name,
              address: parsed.address || '',
              isNativeAndroid: true,
            };
            return connectedPrinter;
          }
        }
      }
    } catch (e) {
      console.warn('Android native Bluetooth auto-detect error:', e);
    }
  }

  // 2. Check Web Bluetooth previously permitted devices (navigator.bluetooth.getDevices)
  try {
    if (
      typeof navigator !== 'undefined' &&
      'bluetooth' in navigator &&
      typeof (navigator.bluetooth as any).getDevices === 'function'
    ) {
      const devices: BluetoothDevice[] = await (navigator.bluetooth as any).getDevices();
      const savedPrinterId = localStorage.getItem(LAST_PRINTER_STORAGE_KEY);

      // Sort so last used printer is tried first
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
  } catch (e) {
    // getDevices not enabled or no devices
  }

  return null;
}

export async function connectBluetoothPrinter(): Promise<BluetoothPrinterDevice> {
  // 1. First try automatic connection to paired Android printer if inside APK
  if (typeof window !== 'undefined' && (window as any).AndroidNative) {
    const bridge = (window as any).AndroidNative;
    try {
      if (typeof bridge.connectPairedPrinter === 'function') {
        const resRaw = bridge.connectPairedPrinter();
        if (resRaw) {
          const parsed = JSON.parse(resRaw);
          if (parsed.success && parsed.name) {
            connectedPrinter = {
              name: parsed.name,
              address: parsed.address || '',
              isNativeAndroid: true,
            };
            return connectedPrinter;
          } else if (parsed.error && !('bluetooth' in navigator)) {
            throw new Error(parsed.error);
          }
        }
      }
    } catch (e: any) {
      if (!('bluetooth' in navigator)) {
        throw e;
      }
    }
  }

  if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
    throw new Error(
      'ব্লুটুথ প্রিন্টার কানেক্ট করতে ফোনের ব্লুটুথ সেটিংস থেকে প্রিন্টারটি পেয়ার (Pair) করুন অথবা Google Chrome ব্যবহার করুন।'
    );
  }

  // 2. Request device via Web Bluetooth
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: COMMON_BLE_PRINT_SERVICES,
  });

  if (!device.gatt) {
    throw new Error('ব্লুটুথ ডিভাইস GATT সার্ভার খুঁজে পাওয়া যায়নি।');
  }

  const server = await device.gatt.connect();
  const writeCharacteristic = await findWritableCharacteristic(server);

  if (!writeCharacteristic) {
    throw new Error('প্রিন্টারের রাইট চ্যানেল (Writable Characteristic) পাওয়া যায়নি।');
  }

  try {
    localStorage.setItem(LAST_PRINTER_STORAGE_KEY, device.id);
  } catch {}

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
    } catch {}
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
  return typeof btoa === 'function' ? btoa(binary) : '';
}

// Convert an HTML Canvas to ESC/POS Raster bit image (GS v 0) bytes
export function canvasToEscPosBytes(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8Array();

  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Bytes per line (width must be multiple of 8, for 384 width -> 48 bytes)
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
      const newVal = oldVal < 145 ? 0 : 255;
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

// Send binary data to Bluetooth printer (supports both Native Android SPP and Web Bluetooth BLE)
export async function sendEscPosToPrinter(
  printer: BluetoothPrinterDevice,
  data: Uint8Array,
  onProgress?: (percent: number) => void
): Promise<void> {
  // 1. Native Android Bluetooth SPP Printer
  if (
    printer.isNativeAndroid &&
    typeof window !== 'undefined' &&
    (window as any).AndroidNative?.printEscPosBase64
  ) {
    if (onProgress) onProgress(30);
    const b64 = uint8ArrayToBase64(data);
    const resultRaw = (window as any).AndroidNative.printEscPosBase64(b64, printer.address || '');
    const result = resultRaw ? JSON.parse(resultRaw) : { success: false };
    if (!result.success) {
      throw new Error(result.error || 'ব্লুটুথ প্রিন্টারে ডাটা পাঠানো যায়নি। প্রিন্টারটি অন আছে কিনা দেখুন।');
    }
    if (onProgress) onProgress(100);
    return;
  }

  // 2. Web Bluetooth BLE Characteristic
  const characteristic = printer.characteristic;
  if (!characteristic) {
    throw new Error('ব্লুটুথ প্রিন্টার সংযুক্ত নেই।');
  }

  const chunkSize = 128;
  const total = data.length;
  let offset = 0;

  while (offset < total) {
    const end = Math.min(offset + chunkSize, total);
    const chunk = data.slice(offset, end);

    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }

    offset = end;
    if (onProgress) {
      onProgress(Math.round((offset / total) * 100));
    }

    await new Promise((resolve) => setTimeout(resolve, 22));
  }
}
