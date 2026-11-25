/**
 * Cross-platform bridge for Android Native WebView (`window.AndroidNative`) + Standard Web APIs.
 * Ensures Voice Search, File Downloads (CSV/JSON/PNG), Share Sheet, and WhatsApp/External links
 * work reliably in both the Android APK and mobile/desktop browsers.
 */

export function getNativeBridge(): any {
  if (typeof window !== 'undefined' && (window as any).AndroidNative) {
    return (window as any).AndroidNative;
  }
  return null;
}

export function openExternalLink(url: string): void {
  const native = getNativeBridge();
  if (native && typeof native.openExternalUrl === 'function') {
    try {
      native.openExternalUrl(url);
      return;
    } catch {
      // fallback below
    }
  }
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function shareTextCrossPlatform(
  title: string,
  text: string,
  onFallbackCopy?: () => void
): Promise<void> {
  const native = getNativeBridge();
  if (native && typeof native.shareText === 'function') {
    try {
      native.shareText(title, text);
      return;
    } catch {
      // fallback below
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
    }
  }

  if (onFallbackCopy) {
    onFallbackCopy();
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(binary);
}

export function saveTextFileCrossPlatform(
  content: string,
  fileName: string,
  mimeType: string
): boolean {
  const native = getNativeBridge();
  if (native && typeof native.saveBase64File === 'function') {
    try {
      const encoder = new TextEncoder();
      const b64 = uint8ToBase64(encoder.encode(content));
      return Boolean(native.saveBase64File(b64, fileName, mimeType));
    } catch {
      // fallback to browser blob download
    }
  }

  if (typeof document === 'undefined') return false;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
}

export function saveDataUrlFileCrossPlatform(
  dataUrl: string,
  fileName: string,
  mimeType = 'image/png'
): boolean {
  const native = getNativeBridge();
  if (native && typeof native.saveBase64File === 'function') {
    try {
      const commaIdx = dataUrl.indexOf(',');
      const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      return Boolean(native.saveBase64File(b64, fileName, mimeType));
    } catch {
      // fallback below
    }
  }

  if (typeof document === 'undefined') return false;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
}

export function startBengaliVoiceInput(callbacks: {
  onStart?: () => void;
  onResult: (transcript: string) => void;
  onError?: (msg: string) => void;
  onEnd?: () => void;
}): void {
  if (typeof window === 'undefined') return;

  // 1. Prefer Android Native Speech Recognizer inside Android APK WebView
  const native = getNativeBridge();
  if (native && typeof native.startVoiceRecognition === 'function') {
    const cleanup = () => {
      window.removeEventListener('voter_native_voice_result', onNativeResult);
      window.removeEventListener('voter_native_voice_error', onNativeError);
    };
    const onNativeResult = (e: Event) => {
      cleanup();
      const text = String((e as CustomEvent)?.detail?.text || '').trim();
      if (callbacks.onEnd) callbacks.onEnd();
      if (text) callbacks.onResult(text);
    };
    const onNativeError = (e: Event) => {
      cleanup();
      if (callbacks.onEnd) callbacks.onEnd();
      const msg = String(
        (e as CustomEvent)?.detail?.message || 'ভয়েস বুঝতে সমস্যা হয়েছে, আবার চেষ্টা করুন'
      );
      if (callbacks.onError) callbacks.onError(msg);
    };

    window.addEventListener('voter_native_voice_result', onNativeResult, { once: true });
    window.addEventListener('voter_native_voice_error', onNativeError, { once: true });

    try {
      if (callbacks.onStart) callbacks.onStart();
      native.startVoiceRecognition('bn-BD');
      return;
    } catch {
      cleanup();
      if (callbacks.onEnd) callbacks.onEnd();
    }
  }

  // 2. Standard Web Speech API (Chrome / Edge / Mobile Web)
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (callbacks.onError) {
      callbacks.onError('এই ব্রাউজারে ভয়েস সার্চ সাপোর্ট নেই (Chrome বা Android অ্যাপ ব্যবহার করুন)');
    }
    return;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.lang = 'bn-BD';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    if (callbacks.onStart) callbacks.onStart();

    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim();
      if (callbacks.onEnd) callbacks.onEnd();
      if (transcript) {
        callbacks.onResult(transcript);
      }
    };
    recognition.onerror = () => {
      if (callbacks.onEnd) callbacks.onEnd();
      if (callbacks.onError) {
        callbacks.onError('ভয়েস বুঝতে সমস্যা হয়েছে, মাইক্রোফোন অনুমতি দিয়ে আবার চেষ্টা করুন');
      }
    };
    recognition.onend = () => {
      if (callbacks.onEnd) callbacks.onEnd();
    };
    recognition.start();
  } catch {
    if (callbacks.onEnd) callbacks.onEnd();
    if (callbacks.onError) {
      callbacks.onError('ভয়েস সার্চ চালু করা যায়নি');
    }
  }
}
