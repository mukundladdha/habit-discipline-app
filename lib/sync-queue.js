/**
 * lib/sync-queue.js — Flush offline completion queue to the server.
 *
 * Called automatically when the browser fires the 'online' event.
 * Safe to call multiple times concurrently — a module-level flag prevents
 * overlapping flush runs.
 */

import { getAllSyncItems, removeSyncItem } from './idb';
import { getOrCreateUserId } from './client-user';

let _flushing = false;

/**
 * Send every pending offline completion to /api/complete.
 * Items are processed sequentially (order matters for idempotency).
 * Each item is removed from IDB on success OR if the server returns 404
 * (habit no longer exists — safe to discard).
 *
 * @returns {{ synced: number, failed: number }}
 */
export async function flushSyncQueue() {
  if (_flushing) return { synced: 0, failed: 0 };
  _flushing = true;

  let synced = 0;
  let failed = 0;

  try {
    const userId = getOrCreateUserId();
    if (!userId) return { synced: 0, failed: 0 };

    const items = await getAllSyncItems();
    if (items.length === 0) return { synced: 0, failed: 0 };

    for (const item of items) {
      try {
        const res = await fetch('/api/complete', {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id':    userId,
          },
          body: JSON.stringify({
            habitId:   item.habitId,
            date:      item.date,
            completed: item.completed,
          }),
        });

        if (res.ok || res.status === 404) {
          // 200 = synced; 404 = habit deleted, discard safely
          await removeSyncItem(item.id);
          synced++;
        } else {
          // 4xx/5xx other than 404 — leave in queue for next attempt
          failed++;
        }
      } catch {
        // Network still down for this item; stop trying — will retry on next online event
        failed++;
        break;
      }
    }
  } finally {
    _flushing = false;
  }

  return { synced, failed };
}
