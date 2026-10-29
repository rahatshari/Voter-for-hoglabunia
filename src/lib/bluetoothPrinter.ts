/// <reference types="web-bluetooth" />

// Web Bluetooth ESC/POS Driver for 58mm / 80mm Mini Portable Thermal Printers
// Supports any standard BLE POS printer (MPT-II, PT-210, RPP02, POS-58, Goojprt, etc.)

export interface BluetoothPrinterDevice {
  device: BluetoothDevice;
  characteristic: BluetoothRemoteGATTCharacteristic;
  name: string;
}

const COMMON_BLE_PRINT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Print Service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // Common Chinese POS (MPT-II, Goojprt)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent UART
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // XPrinter / Netum
  '0000af30-0000-1000-8000-00805f9b34fb',
];

let connectedPrinter: BluetoothPrinterDevice | null = null;

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function getConnectedPrinter(): BluetoothPrinterDevice | null {
  if (connectedPrinter && connectedPrinter.device.gatt?.connected) {
    return connectedPrinter;
  }
  return null;
}

export async function connectBluetoothPrinter(): Promise<BluetoothPrinterDevice> {
  if (!isBluetoothSupported()) {
    throw new Error('আপনার ব্রাউজারে Web Bluetooth সাপোর্ট করছে না। গুগল ক্রোম (Google Chrome) ব্যবহার করুন।');
  }

  // Request device
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: COMMON_BLE_PRINT_SERVICES,
  });

  if (!device.gatt) {
    throw new Error('ব্লুটুথ ডিভাইস GATT সার্ভার খুঁজে পাওয়া যায়নি।');
  }

  const server = await device.gatt.connect();

  // Find a writable characteristic across available services
  let writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

  for (const serviceUuid of COMMON_BLE_PRINT_SERVICES) {
    try {
      const service = await server.getPrimaryService(serviceUuid);
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          writeCharacteristic = char;
          break;
        }
      }
      if (writeCharacteristic) break;
    } catch (e) {
      // Continue to next service
    }
  }

  // If none found by predefined UUIDs, try querying all services
  if (!writeCharacteristic) {
    try {
      const services = await server.getPrimaryServices();
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            writeCharacteristic = char;
            break;
          }
        }
        if (writeCharacteristic) break;
      }
    } catch (e) {}
  }

  if (!writeCharacteristic) {
    throw new Error('প্রিন্টারের রাইট চ্যানেল (Writable Characteristic) পাওয়া যায়নি।');
  }

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
  if (connectedPrinter?.device.gatt?.connected) {
    connectedPrinter.device.gatt.disconnect();
  }
  connectedPrinter = null;
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

  // Floyd-Steinberg error diffusion dithering for crystal clear thermal photos
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const oldVal = gray[i];
      const newVal = oldVal < 140 ? 0 : 255;
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

  // Footer: Feed 4 lines and partial cut
  const footer = [
    0x1b, 0x64, 0x04, // ESC d 4 (Feed 4 lines)
    0x1d, 0x56, 0x42, 0x00, // GS V B 0 (Feed and cut)
  ];

  const output = new Uint8Array(header.length + imageBytes.length + footer.length);
  output.set(header, 0);
  output.set(imageBytes, header.length);
  output.set(footer, header.length + imageBytes.length);

  return output;
}

// Send binary data to Bluetooth printer in safe chunks (preventing buffer overflow)
export async function sendEscPosToPrinter(
  characteristic: BluetoothRemoteGATTCharacteristic,
  data: Uint8Array,
  onProgress?: (percent: number) => void
): Promise<void> {
  const chunkSize = 128; // 128-byte chunks for reliable BLE transfer
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

    // Small delay between packets to prevent printer buffer overrun
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
