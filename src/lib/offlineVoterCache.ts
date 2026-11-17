import { Voter } from '../types';

const DB_NAME = 'voter_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const VILLAGES_KEY = 'prepared_villages_v1';

let memoryVillagesFallback: Record<string, Voter[]> | null = null;

export function hasValidVillagesData(data: unknown): data is Record<string, Voter[]> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) return false;
  return entries.some(([, list]) => Array.isArray(list) && list.length > 0);
}

export function isDeviceOffline(): boolean {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine === false;
    }
  } catch {
    // ignore
  }
  return false;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallbackValue: T
): Promise<T> {
  if (timeoutMs <= 0) {
    return promise.catch(() => fallbackValue);
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallbackValue);
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([
      promise.catch(() => fallbackValue),
      timeoutPromise,
    ]);
    return result;
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveVillagesToOfflineCache(
  villages: Record<string, Voter[]>
): Promise<boolean> {
  if (!hasValidVillagesData(villages)) return false;
  memoryVillagesFallback = villages;

  const db = await openOfflineDb();
  if (!db) return true;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(
        {
          savedAt: Date.now(),
          data: villages,
        },
        VILLAGES_KEY
      );
      tx.oncomplete = () => {
        try {
          db.close();
        } catch {}
        resolve(true);
      };
      tx.onerror = () => {
        try {
          db.close();
        } catch {}
        resolve(false);
      };
    } catch {
      try {
        db.close();
      } catch {}
      resolve(false);
    }
  });
}

export async function loadVillagesFromOfflineCache(): Promise<Record<string, Voter[]> | null> {
  const db = await openOfflineDb();
  if (db) {
    const fromDb = await new Promise<Record<string, Voter[]> | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(VILLAGES_KEY);
        req.onsuccess = () => {
          const val = req.result;
          const payload = val && typeof val === 'object' && 'data' in val ? val.data : val;
          if (hasValidVillagesData(payload)) {
            resolve(payload);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
        tx.oncomplete = () => {
          try {
            db.close();
          } catch {}
        };
      } catch {
        try {
          db.close();
        } catch {}
        resolve(null);
      }
    });
    if (fromDb) {
      memoryVillagesFallback = fromDb;
      return fromDb;
    }
  }

  return hasValidVillagesData(memoryVillagesFallback) ? memoryVillagesFallback : null;
}

export function clearMemoryOfflineCacheForTest(): void {
  memoryVillagesFallback = null;
}
