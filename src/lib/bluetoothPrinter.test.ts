import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNativeBluetoothListResponse,
  selectBestPairedPrinter,
  sendBleChunksAdaptive,
  uint8ArrayToBase64,
  createTestPrintEscPosBytes,
  PairedBluetoothDevice,
  BleWritableCharacteristicLike,
} from './bluetoothPrinter';

describe('bluetoothPrinter pure logic', () => {
  it('parses Android native paired devices JSON accurately', () => {
    const raw = JSON.stringify({
      success: true,
      errorCode: '',
      bluetoothEnabled: true,
      permissionGranted: true,
      devices: [
        { name: 'Goojprt-PT210', address: 'AA:BB:CC:DD:EE:01', isLikelyPrinter: true },
        { name: 'My Earbuds', address: 'AA:BB:CC:DD:EE:02', isLikelyPrinter: false },
      ],
    });
    const parsed = parseNativeBluetoothListResponse(raw);
    assert.equal(parsed.success, true);
    assert.equal(parsed.bluetoothEnabled, true);
    assert.equal(parsed.permissionGranted, true);
    assert.equal(parsed.devices.length, 2);
    assert.equal(parsed.devices[0].name, 'Goojprt-PT210');
    assert.equal(parsed.devices[0].isLikelyPrinter, true);
  });

  it('parses PERMISSION_DENIED and BLUETOOTH_DISABLED native errors cleanly', () => {
    const permRes = parseNativeBluetoothListResponse(
      JSON.stringify({
        success: false,
        errorCode: 'PERMISSION_DENIED',
        bluetoothEnabled: false,
        permissionGranted: false,
        error: 'Permission needed',
        devices: [],
      })
    );
    assert.equal(permRes.success, false);
    assert.equal(permRes.errorCode, 'PERMISSION_DENIED');
    assert.equal(permRes.permissionGranted, false);

    const malformed = parseNativeBluetoothListResponse('not-json');
    assert.equal(malformed.success, false);
    assert.equal(malformed.errorCode, 'UNKNOWN_ERROR');
  });

  it('selectBestPairedPrinter prioritizes saved printer address even among multiple devices', () => {
    const devices: PairedBluetoothDevice[] = [
      { name: 'Car Audio', address: '11:22:33:44:55:01', isLikelyPrinter: false },
      { name: 'Custom-BT-Box', address: '11:22:33:44:55:02', isLikelyPrinter: false },
      { name: 'MTP-II', address: '11:22:33:44:55:03', isLikelyPrinter: true },
    ];
    const picked = selectBestPairedPrinter(devices, '11:22:33:44:55:02');
    assert.ok(picked);
    assert.equal(picked.name, 'Custom-BT-Box');
  });

  it('selectBestPairedPrinter picks unique likely printer automatically, and returns null when ambiguous', () => {
    const withOnePrinter: PairedBluetoothDevice[] = [
      { name: 'Earbuds', address: '00:11:22:33:44:01', isLikelyPrinter: false },
      { name: 'RPP02N', address: '00:11:22:33:44:02', isLikelyPrinter: true },
    ];
    assert.equal(selectBestPairedPrinter(withOnePrinter)?.address, '00:11:22:33:44:02');

    const ambiguousNonPrinters: PairedBluetoothDevice[] = [
      { name: 'Earbuds', address: '00:11:22:33:44:01', isLikelyPrinter: false },
      { name: 'Device-XYZ', address: '00:11:22:33:44:02', isLikelyPrinter: false },
    ];
    assert.equal(selectBestPairedPrinter(ambiguousNonPrinters), null);

    const singleDevice: PairedBluetoothDevice[] = [
      { name: 'Device-XYZ', address: '00:11:22:33:44:02', isLikelyPrinter: false },
    ];
    assert.equal(selectBestPairedPrinter(singleDevice)?.address, '00:11:22:33:44:02');
  });

  it('sendBleChunksAdaptive falls back from 100-byte MTU error to 20-byte chunks without losing a single byte', async () => {
    const received: number[] = [];
    const payload = new Uint8Array(95);
    for (let i = 0; i < payload.length; i++) {
      payload[i] = (i * 7 + 3) % 256;
    }

    const mockChar: BleWritableCharacteristicLike = {
      properties: { writeWithoutResponse: true, write: false },
      async writeValueWithoutResponse(value: BufferSource) {
        const view = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
        if (view.byteLength > 20) {
          throw new Error('GATT Error: exceeds 20 byte ATT MTU');
        }
        for (const b of view) received.push(b);
      },
    };

    const progressMarks: number[] = [];
    const result = await sendBleChunksAdaptive(
      mockChar,
      payload,
      (p) => progressMarks.push(p),
      async () => {}
    );

    assert.equal(result.chunkSizeUsed, 20);
    assert.equal(result.chunksSent, 5); // 20+20+20+20+15 = 95
    assert.deepEqual(received, Array.from(payload));
    assert.equal(progressMarks[progressMarks.length - 1], 100);
  });

  it('uint8ArrayToBase64 encodes binary ESC/POS bytes accurately', () => {
    const sample = new Uint8Array([0x1b, 0x40, 0x1d, 0x76, 0x30, 0x00]);
    const b64 = uint8ArrayToBase64(sample);
    const decoded = new Uint8Array(Buffer.from(b64, 'base64'));
    assert.deepEqual(Array.from(decoded), Array.from(sample));
  });

  it('createTestPrintEscPosBytes starts with ESC @ init and includes readable text', () => {
    const bytes = createTestPrintEscPosBytes('MTP-II');
    assert.equal(bytes[0], 0x1b);
    assert.equal(bytes[1], 0x40);
    const decoded = new TextDecoder().decode(bytes);
    assert.ok(decoded.includes('TEST PRINT OK'));
    assert.ok(decoded.includes('MTP-II'));
  });
});
