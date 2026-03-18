/**
 * lib/sync-engine.js — Flush the local sync queue to the backend.
 *
 * processQueue()          — sequential flush; returns { synced, failed }
 * setupSyncListeners(cb)  — wires window 'online' event; returns cleanup fn
 *
 * The module-level _flushing flag prevents concurrent runs even if multiple
 * callers (e.g. TodayClient + NetworkBanner) both respond to 'online'.
 *
 * Cancel-out dedup lives in enqueue() (lib/local-store.js), so by the time
 * we reach processQueue() every remaining item is a genuine write that
 * hasn't been sent yet.
 */

import { getQueue, dequeue } from './local-store';
import { getOrCreateUserId } from './client-user';

let _flushing = false;

/**
 * Process every pending item in the queue, sequentially.
 * Stops on the first network error to preserve ordering.
 *
 * @returns {{ synced: number, failed: number }}
 */
export async function processQueue() {
  if (_flushing || typeof window === 'undefined') return { synced: 0, failed: 0 };
  _flushing = true;

  let synced = 0;
  let failed = 0;

  try {
    const userId = getOrCreateUserId();
    if (!userId) return { synced: 0, failed: 0 };

    const items = getQueue(); // synchronous read
    if (!items.length) return { synced: 0, failed: 0 };

    for (const item of items) {
      try {
        const res = await fetch('/api/complete', {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id':    item.userId ?? userId,
          },
          body: JSON.stringify({
            habitId:   item.habitId,
            date:      item.date,
            completed: item.completed,
          }),
        });

        if (res.ok || res.status === 404) {
          // 200 = synced; 404 = habit deleted — discard either way
          dequeue(item.id);
          synced++;
        } else {
          failed++; // 5xx or unexpected 4xx — leave in queue for next attempt
        }
      } catch {
        // Network still down — stop, leave remaining items queued
        failed++;
        break;
      }
    }
  } finally {
    _flushing = false;
  }

  return { synced, failed };
}

/**
 * Register a window 'online' listener that auto-flushes the queue.
 *
 * @param {(synced: number) => void} onSyncComplete
 *   Called after a flush that synced ≥1 item — use to reload fresh data.
 * @returns {() => void} Cleanup function (removes the event listener).
 */
export function setupSyncListeners(onSyncComplete) {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = async () => {
    const { synced } = await processQueue();
    if (synced > 0 && typeof onSyncComplete === 'function') {
      onSyncComplete(synced);
    }
  };

  window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
}
