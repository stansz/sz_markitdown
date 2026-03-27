/**
 * Cache utility for OCR results and models
 * Uses browser's IndexedDB for persistent storage
 */

const DB_NAME = 'markitdown-cache';
const DB_VERSION = 1;
const STORE_NAME = 'ocr-results';

interface CacheEntry {
  key: string;
  value: string;
  timestamp: number;
  expiresAt: number;
}

/**
 * Open IndexedDB database
 */
async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open cache database'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
}

/**
 * Get value from cache
 */
export async function getFromCache(key: string): Promise<string | null> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const entry: CacheEntry | undefined = request.result;
        if (entry && entry.expiresAt > Date.now()) {
          resolve(entry.value);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => {
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Set value in cache
 */
export async function setInCache(
  key: string,
  value: string,
  ttlMs: number = 24 * 60 * 60 * 1000 // Default: 24 hours
): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const entry: CacheEntry = {
      key,
      value,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };

    store.put(entry);
  } catch {
    // Silently fail if caching is not available
  }
}

/**
 * Delete value from cache
 */
export async function deleteFromCache(key: string): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(key);
  } catch {
    // Silently fail
  }
}

/**
 * Clear all cache entries
 */
export async function clearCache(): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
  } catch {
    // Silently fail
  }
}

/**
 * Generate cache key from file content
 */
export function generateCacheKey(file: File, mode: string): string {
  // Use file name, size, and last modified as cache key
  return `${file.name}-${file.size}-${file.lastModified}-${mode}`;
}

/**
 * Cache OCR results for a file
 */
export async function cacheOcrResult(
  file: File,
  mode: string,
  markdown: string
): Promise<void> {
  const key = generateCacheKey(file, mode);
  await setInCache(key, markdown);
}

/**
 * Get cached OCR result for a file
 */
export async function getCachedOcrResult(
  file: File,
  mode: string
): Promise<string | null> {
  const key = generateCacheKey(file, mode);
  return getFromCache(key);
}
