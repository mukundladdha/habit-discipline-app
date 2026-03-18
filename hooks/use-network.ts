'use client';

/**
 * hooks/use-network.ts
 *
 * Tracks online/offline status and drives the NetworkBanner.
 *
 * Queue reads are now SYNCHRONOUS (localStorage via local-store.js) so
 * pendingCount updates without any async round-trip — instant badge update.
 *
 * processQueue() comes from sync-engine.js; the module-level _flushing flag
 * prevents double-flush even if both this hook and TodayClient respond to
 * the same 'online' event.
 */

import { useState, useEffect, useCallback } from 'react';
import { processQueue }  from '../lib/sync-engine';
import { getQueueCount } from '../lib/local-store';

export interface NetworkState {
  isOnline:     boolean;
  pendingCount: number;
  isSyncing:    boolean;
}

export function useNetwork(): NetworkState {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing,    setIsSyncing]    = useState(false);

  // Synchronous — no await, no flash
  const refreshCount = useCallback(() => {
    setPendingCount(getQueueCount());
  }, []);

  const syncNow = useCallback(async () => {
    if (getQueueCount() === 0) return;
    setIsSyncing(true);
    try {
      const { synced } = await processQueue();
      refreshCount();
      if (synced > 0) {
        // Signal any listening client (e.g. TodayClient) to reload fresh data
        window.dispatchEvent(new CustomEvent('sync-complete', { detail: { synced } }));
      }
    } finally {
      setIsSyncing(false);
    }
  }, [refreshCount]);

  useEffect(() => {
    refreshCount(); // hydrate count synchronously on mount

    const handleOnline  = () => { setIsOnline(true);  syncNow(); };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshCount, syncNow]);

  // Re-read count whenever the queue changes (enqueue/dequeue dispatches this)
  useEffect(() => {
    const handler = () => refreshCount();
    window.addEventListener('offline-item-queued', handler);
    return () => window.removeEventListener('offline-item-queued', handler);
  }, [refreshCount]);

  return { isOnline, pendingCount, isSyncing };
}
