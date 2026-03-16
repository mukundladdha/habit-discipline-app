'use client';

/**
 * NetworkBanner.tsx
 *
 * A slim banner that slides down from the top whenever the device goes offline
 * or while syncing queued completions back to the server.
 *
 * States:
 *   offline  → "Offline mode — changes saved locally"
 *   syncing  → "Syncing N change(s)…"
 *   (online + nothing pending → invisible)
 *
 * Mounted once in layout.tsx so it works across all pages without re-mounting.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useNetwork } from '../hooks/use-network';

export default function NetworkBanner() {
  const { isOnline, pendingCount, isSyncing } = useNetwork();

  // Visible when offline OR actively syncing queued items
  const visible = !isOnline || isSyncing;

  const message = isSyncing
    ? `Syncing ${pendingCount} change${pendingCount !== 1 ? 's' : ''}…`
    : `Offline mode${pendingCount > 0 ? ` · ${pendingCount} pending` : ' · changes saved locally'}`;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="network-banner"
          role="status"
          aria-live="polite"
          className="network-banner"
          initial={{ y: -44, opacity: 0 }}
          animate={{ y: 0,   opacity: 1 }}
          exit={{    y: -44, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className={`network-banner-dot ${isSyncing ? 'syncing' : 'offline'}`} />
          <span className="network-banner-text">{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
