/**
 * Safe storage wrapper that never throws SecurityError inside cross-origin preview iframes,
 * Safari Private Browsing, or restricted Android WebViews.
 */
const memoryStore = new Map<string, string>();

export function safeLocalGet(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = window.localStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch {
    // Storage blocked by iframe / browser policy
  }
  return memoryStore.get(key) ?? null;
}

export function safeLocalSet(key: string, value: string): void {
  memoryStore.set(key, value);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Kept safely in memoryStore
  }
}

export function safeLocalRemove(key: string): void {
  memoryStore.delete(key);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore
  }
}
