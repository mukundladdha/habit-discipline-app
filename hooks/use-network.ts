'use client';

/**
 * hooks/use-network.ts
 *
 * Tracks online/offline status and manages the offline sync lifecycle:
 *   - Detects transition from offline → online
 *   - Flushes the IDB sync queue automatically when back online
 *   - Exposes pendingCount so the UI can show "X pending" in the banner
 *   - Dispatches a custom 'sync-complete' window event after a successful flush
 *     so TodayClient can reload fresh data
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { flushSyncQueue } from '../lib/sync-queue';
import { countSyncItems } from '../lib/idb';

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
  const [isSyncing, setIsSyncing]       = useState(false);

  // Keep a ref so the online handler always sees the latest pendingCount
  const pendingRef = useRef(pendingCount);
  pendingRef.current = pendingCount;

  const refreshCount = useCallback(async () => {
    const n = await countSyncItems();
    setPendingCount(n);
  }, []);

  const syncNow = useCallback(async () => {
    const count = await countSyncItems();
    if (count === 0) return;

    setIsSyncing(true);
    try {
      const { synced } = await flushSyncQueue();
      await refreshCount();

      if (synced > 0) {
        // Signal TodayClient + CalendarClient to reload fresh server data
        window.dispatchEvent(new CustomEvent('sync-complete', { detail: { synced } }));
      }
    } finally {
      setIsSyncing(false);
    }
  }, [refreshCount]);

  useEffect(() => {
    // Hydrate count on mount
    refreshCount();

    const handleOnline = () => {
      setIsOnline(true);
      syncNow();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshCount, syncNow]);

  // Also let external code increment the count without waiting for IDB
  useEffect(() => {
    const handler = () => refreshCount();
    window.addEventListener('offline-item-queued', handler);
    return () => window.removeEventListener('offline-item-queued', handler);
  }, [refreshCount]);

  return { isOnline, pendingCount, isSyncing };
}
