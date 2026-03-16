/**
 * lib/idb.js — Minimal IndexedDB wrapper for offline support.
 *
 * Two object stores:
 *   sync-queue      — completion toggles waiting to be sent to /api/complete
 *   dashboard-cache — last-known good dashboard payload per date (for offline reads)
 *
 * All functions return Promises and are safe to call on SSR (window guard).
 */

const DB_NAME    = 'fitstreak-offline';
const DB_VERSION = 1;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(req.error);
    req.onsuccess = () => { _db = req.result; resolve(_db); };

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Pending completion writes (habitId, date, completed, userId)
      if (!db.objectStoreNames.contains('sync-queue')) {
        db.createObjectStore('sync-queue', { keyPath: 'id', autoIncrement: true });
      }

      // Last-known dashboard response keyed by date string
      if (!db.objectStoreNames.contains('dashboard-cache')) {
        db.createObjectStore('dashboard-cache', { keyPath: 'date' });
      }
    };
  });
}

// ── Sync Queue ───────────────────────────────────────────────────────────────

/** Enqueue a completion toggle. Returns the auto-incremented id. */
export async function enqueueSyncItem(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('sync-queue', 'readwrite');
    const req = tx.objectStore('sync-queue').add({ ...item, queuedAt: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Fetch all queued items in insertion order. */
export async function getAllSyncItems() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('sync-queue', 'readonly');
      const req = tx.objectStore('sync-queue').getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Remove a single item by its auto-incremented id (after successful sync). */
export async function removeSyncItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('sync-queue', 'readwrite');
    const req = tx.objectStore('sync-queue').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** Count pending items without fetching their payloads. */
export async function countSyncItems() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('sync-queue', 'readonly');
      const req = tx.objectStore('sync-queue').count();
      req.onsuccess = () => resolve(req.result ?? 0);
      req.onerror   = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

// ── Dashboard Cache ──────────────────────────────────────────────────────────

/** Persist a full dashboard API response for a given date. */
export async function saveDashboardCache(date, data) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('dashboard-cache', 'readwrite');
      const req = tx.objectStore('dashboard-cache').put({ date, data, savedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch {
    // Silently skip if IDB unavailable
  }
}

/** Retrieve a cached dashboard response. Returns null if none stored. */
export async function getDashboardCache(date) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('dashboard-cache', 'readonly');
      const req = tx.objectStore('dashboard-cache').get(date);
      req.onsuccess = () => resolve(req.result?.data ?? null);
      req.onerror   = () => reject(req.error);
    });
  } catch {
    return null;
  }
}
