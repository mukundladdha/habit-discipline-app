'use client';

/**
 * SplashScreen.tsx
 *
 * 2.6-second launch animation:
 *   0.0s  Dark canvas with shimmer gradient sweeps behind the logo
 *   0.3s  Flame logo fades + springs in
 *   0.6s  "FitStreak" title fades up
 *   0.9s  Inspiring quote fades up (randomly picked each session)
 *   2.6s  Whole screen fades out; onHide() called
 *
 * Shown once per session (sessionStorage flag).
 * Uses Framer Motion (already a dependency) — no extra bundle cost.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const QUOTES = [
  '"We are what we repeatedly do."',
  '"Small daily improvements lead to stunning results."',
  '"Discipline is choosing between what you want now and what you want most."',
  '"Success is the sum of small efforts, repeated."',
  '"Show up. Every. Single. Day."',
  '"You don\'t rise to the level of your goals — you fall to your habits."',
  '"The secret of getting ahead is getting started."',
  '"One day or day one. You decide."',
];

const TOTAL_MS = 2600;

interface Props {
  onHide: () => void;
}

export default function SplashScreen({ onHide }: Props) {
  const [exiting, setExiting] = useState(false);
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(onHide, 380);
  }, [onHide]);

  useEffect(() => {
    const hideTimer = setTimeout(dismiss, TOTAL_MS);
    return () => clearTimeout(hideTimer);
  }, [dismiss]);

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="splash"
          className="splash-root"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.38, ease: 'easeOut' }}
          onClick={dismiss}
          aria-hidden="true"
        >
          {/* Shimmer sweep behind content */}
          <div className="splash-shimmer" />

          {/* Centered content */}
          <div className="splash-reveal">
            {/* Flame logo */}
            <motion.div
              className="splash-logo"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5, type: 'spring', stiffness: 200, damping: 14 }}
            >
              🔥
            </motion.div>

            {/* App name */}
            <motion.h1
              className="splash-title"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.38, ease: 'easeOut' }}
            >
              FitStreak
            </motion.h1>

            {/* Inspiring quote */}
            <motion.p
              className="splash-quote"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.82, duration: 0.45, ease: 'easeOut' }}
            >
              {quote}
            </motion.p>

            {/* Subtle hint */}
            <motion.p
              className="splash-hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.3, duration: 0.4 }}
            >
              Tap to continue
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
