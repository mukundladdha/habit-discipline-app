/**
 * lib/dashboard-cache.js — Two-layer client-side dashboard cache.
 *
 * L1  Module-level Map  Survives re-renders + component unmounts.
 *                       Cleared on hard refresh (tab close).  TTL = 60s.
 * L2  localStorage      Survives tab close.  Used for instant synchronous
 *                       reads on mount so the UI renders with real data
 *                       before any network request fires.  TTL = 48h.
 *
 * Why localStorage instead of IDB for L2?
 *   localStorage reads are synchronous — we can call them inside a useState()
 *   initializer or an early useEffect and have data on the very first paint.
 *   IDB reads are always async (~5 ms) which means a blank frame.
 *   IDB (lib/idb.js) is kept as the offline fallback layer.
 *
 * Key format:  "dash:YYYY-MM-DD"
 */

const L1  = new Map();                  // key → { data, ts }
const L1_TTL = 60_000;                  // 1 minute
const L2_TTL = 48 * 60 * 60 * 1000;    // 48 hours
const LS  = 'dash:';

// ─── Write ────────────────────────────────────────────────────────────────────

/** Persist a dashboard API response for a given date to both cache layers. */
export function setCachedDashboard(date, data) {
  const ts = Date.now();
  L1.set(date, { data, ts });

  try {
    localStorage.setItem(LS + date, JSON.stringify({ data, ts }));
  } catch {
    // localStorage full — evict oldest key and retry once
    try { evictOldest(); localStorage.setItem(LS + date, JSON.stringify({ data, ts })); }
    catch { /* silently skip */ }
  }
}

function evictOldest() {
  let oldestKey = null;
  let oldestTs  = Infinity;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith(LS)) continue;
    try {
      const { ts } = JSON.parse(localStorage.getItem(k));
      if (ts < oldestTs) { oldestTs = ts; oldestKey = k; }
    } catch { localStorage.removeItem(k); }
  }
  if (oldestKey) localStorage.removeItem(oldestKey);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Read from L1 first, then L2.
 * Returns null if no entry exists or both entries are expired.
 * Safe to call on SSR (returns null when window is undefined).
 */
export function getCachedDashboard(date) {
  // L1
  const mem = L1.get(date);
  if (mem && Date.now() - mem.ts < L1_TTL) return mem.data;

  // L2
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS + date);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > L2_TTL) { localStorage.removeItem(LS + date); return null; }
    L1.set(date, { data, ts }); // warm L1 from L2
    return data;
  } catch {
    return null;
  }
}

/**
 * Convenience: read cached stats for today (used by Stats page to render
 * instantly without its own API call).
 */
export function getCachedStats() {
  if (typeof window === 'undefined') return null;
  const todayKey = new Date().toISOString().slice(0, 10);
  return getCachedDashboard(todayKey)?.stats ?? null;
}

/**
 * Convenience: read cached calendar for current month (used by Calendar
 * page to avoid a network round-trip for the most common case).
 */
export function getCachedCalendar() {
  if (typeof window === 'undefined') return null;
  const todayKey = new Date().toISOString().slice(0, 10);
  return getCachedDashboard(todayKey)?.calendar ?? null;
}
