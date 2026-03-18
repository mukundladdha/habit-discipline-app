/**
 * lib/local-store.js — Unified local-first persistence layer.
 *
 * ┌─ DASHBOARD CACHE ──────────────────────────────────────────────────────┐
 * │  Key: "dashboardCache"                                                 │
 * │  Shape: { [date]: { data: DashPayload, ts: number } }                 │
 * │                                                                        │
 * │  L1 = module-level Map   (60 s TTL, lives until tab close)            │
 * │  L2 = localStorage       (48 h TTL, survives tab close)               │
 * │                                                                        │
 * │  L1 writes are synchronous (instant). L2 writes are debounced 200 ms  │
 * │  then deferred to requestIdleCallback so they never block a paint.    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SYNC QUEUE ────────────────────────────────────────────────────────────┐
 * │  Key: "syncQueue"                                                       │
 * │  Shape: [{ id, habitId, date, completed, userId, ts }]                 │
 * │                                                                         │
 * │  Reads are SYNCHRONOUS — safe to call in render / useEffect init.      │
 * │                                                                         │
 * │  Cancel-out dedup: toggling the same habit+date twice nets to nothing. │
 * │  e.g. COMPLETE then UNCOMPLETE for same habitId+date → queue stays    │
 * │  empty; backend never needs to be called.                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

// ── Constants ──────────────────────────────────────────────────────────────────
const CACHE_KEY   = 'dashboardCache';
const QUEUE_KEY   = 'syncQueue';
const L1_TTL      = 60_000;               // 1 minute
const L2_TTL      = 48 * 60 * 60 * 1000; // 48 hours
const DEBOUNCE_MS = 200;

// ── L1 in-memory map ───────────────────────────────────────────────────────────
const L1 = new Map(); // date → { data, ts }
let _debounceTimer = null;

// ── Safe localStorage helpers ──────────────────────────────────────────────────
function lsGet(key, fallback) {
  try   { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full — for the cache, evict the oldest date entry and retry once
    if (key === CACHE_KEY) {
      try {
        const map   = lsGet(CACHE_KEY, {});
        const dates = Object.keys(map).sort((a, b) => (map[a].ts ?? 0) - (map[b].ts ?? 0));
        if (dates.length) {
          delete map[dates[0]];
          localStorage.setItem(CACHE_KEY, JSON.stringify(map));
        }
      } catch {}
    }
  }
}

/** Defer a function to browser idle time (or setTimeout(0) as fallback). */
function rIC(fn) {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(fn, { timeout: 2000 });
  } else {
    setTimeout(fn, 0);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// DASHBOARD CACHE
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Synchronous read — L1 first, then L2.
 * Returns null on miss or expiry. Safe on SSR.
 */
export function getCache(date) {
  // L1 hit
  const m = L1.get(date);
  if (m && Date.now() - m.ts < L1_TTL) return m.data;

  // L2 hit
  if (typeof window === 'undefined') return null;
  const all = lsGet(CACHE_KEY, {});
  const e   = all[date];
  if (!e) return null;
  if (Date.now() - e.ts > L2_TTL) return null;      // expired
  L1.set(date, { data: e.data, ts: e.ts });          // warm L1
  return e.data;
}

/**
 * Write to L1 immediately (synchronous, zero latency).
 * L2 write is debounced 200 ms then deferred to requestIdleCallback — never
 * blocks a paint or a user interaction.
 */
export function setCache(date, data) {
  const ts = Date.now();
  L1.set(date, { data, ts }); // instant

  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    rIC(() => {
      const all = lsGet(CACHE_KEY, {});
      all[date] = { data, ts };
      lsSet(CACHE_KEY, all);
    });
  }, DEBOUNCE_MS);
}

/** Bust one date — called after habit settings change. */
export function clearCache(date) {
  L1.delete(date);
  if (typeof window === 'undefined') return;
  try {
    const all = lsGet(CACHE_KEY, {});
    delete all[date];
    lsSet(CACHE_KEY, all);
  } catch {}
}

/** Convenience: today's stats for the Stats page (synchronous). */
export function getCachedStats() {
  if (typeof window === 'undefined') return null;
  return getCache(new Date().toISOString().slice(0, 10))?.stats ?? null;
}

/** Convenience: today's calendar for the Calendar page (synchronous). */
export function getCachedCalendar() {
  if (typeof window === 'undefined') return null;
  return getCache(new Date().toISOString().slice(0, 10))?.calendar ?? null;
}

// ════════════════════════════════════════════════════════════════════════════════
// SYNC QUEUE
// ════════════════════════════════════════════════════════════════════════════════

/** Read the full queue synchronously. Never throws. */
export function getQueue() {
  if (typeof window === 'undefined') return [];
  return lsGet(QUEUE_KEY, []);
}

/** All pending items for a specific date (used to overlay optimistic state). */
export function getQueueForDate(date) {
  return getQueue().filter(e => e.date === date);
}

/** How many items are waiting to sync (synchronous — no await needed). */
export function getQueueCount() {
  return getQueue().length;
}

/**
 * Enqueue with cancel-out dedup.
 *
 * Case A — nothing queued for habitId+date      → add item, return new id
 * Case B — same completed value already queued  → idempotent no-op, return existing id
 * Case C — opposite completed value queued      → cancel both out, return null
 *
 * This means rapidly toggling on→off nets to an empty queue — the backend
 * never needs to be called.
 */
export function enqueue(item) {
  const q        = getQueue();
  const existing = q.find(e => e.habitId === item.habitId && e.date === item.date);

  if (existing) {
    if (existing.completed === item.completed) {
      return existing.id; // Case B — already queued, idempotent
    }
    // Case C — opposite action cancels out
    lsSet(QUEUE_KEY, q.filter(e => e.id !== existing.id));
    _dispatchQueueUpdate();
    return null;
  }

  // Case A — new entry
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  lsSet(QUEUE_KEY, [...q, { ...item, id, ts: Date.now() }]);
  _dispatchQueueUpdate();
  return id;
}

/** Remove one item by id after it has been successfully synced. */
export function dequeue(id) {
  if (!id) return;
  lsSet(QUEUE_KEY, getQueue().filter(e => e.id !== id));
  _dispatchQueueUpdate();
}

/** Remove all items — called after a full sync sweep. */
export function clearQueue() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(QUEUE_KEY); } catch {}
  _dispatchQueueUpdate();
}

// Let NetworkBanner re-read the count after every queue mutation.
function _dispatchQueueUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('offline-item-queued'));
  }
}
