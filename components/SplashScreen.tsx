'use client';

/**
 * SplashScreen.tsx
 *
 * 2.6-second launch animation:
 *   0.0s  Dark canvas with subtle CSS stars appears
 *   0.0s  Vertical path line grows upward
 *   0.0s  Glowing dot rises from bottom to top
 *   0.3–1.3s  Milestone markers light up one by one as dot passes
 *   1.5s  Reveal phase fades in: logo + "FitStreak" + tagline
 *   2.6s  Whole screen fades out; onHide() called
 *
 * Shown once per session (sessionStorage flag).
 * Uses Framer Motion (already a dependency) — no extra bundle cost.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Milestone positions (% from top of the track)
const MILESTONES = [
  { label: 'Day 1',     topPct: 82 },
  { label: 'Day 7',     topPct: 60 },
  { label: 'Day 14',    topPct: 36 },
  { label: 'Day 21 🔥', topPct: 12 },
];

// When the rising dot illuminates each milestone (ms from mount)
const MILESTONE_TIMINGS = [320, 660, 980, 1280];

// Total visible duration before fade-out
const TOTAL_MS = 2600;

interface Props {
  onHide: () => void;
}

export default function SplashScreen({ onHide }: Props) {
  const [litIndex, setLitIndex]   = useState(-1);
  const [phase, setPhase]         = useState<'rising' | 'reveal'>('rising');
  const [exiting, setExiting]     = useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(onHide, 380);
  }, [onHide]);

  useEffect(() => {
    // Light milestones sequentially
    const timers = MILESTONE_TIMINGS.map((t, i) =>
      setTimeout(() => setLitIndex(i), t)
    );

    // Switch to reveal frame
    const revealTimer = setTimeout(() => setPhase('reveal'), 1500);

    // Auto-dismiss
    const hideTimer = setTimeout(dismiss, TOTAL_MS);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(revealTimer);
      clearTimeout(hideTimer);
    };
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
          // Tapping anywhere dismisses early (good UX for impatient users)
          onClick={dismiss}
          aria-hidden="true"
        >
          {/* ── Subtle star field (pure CSS, zero assets) ────────────────── */}
          <div className="splash-stars" />

          {/* ── Rising path + milestones ──────────────────────────────────── */}
          {phase === 'rising' && (
            <div className="splash-track">
              {/* Glowing path line grows from bottom */}
              <motion.div
                className="splash-path-line"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 1.45, ease: [0.22, 1, 0.36, 1] }}
              />

              {/* Milestone dots */}
              {MILESTONES.map((m, i) => (
                <motion.div
                  key={m.label}
                  className={`splash-milestone${litIndex >= i ? ' lit' : ''}`}
                  style={{ top: `${m.topPct}%` }}
                  animate={
                    litIndex >= i
                      ? { scale: 1.3, opacity: 1 }
                      : { scale: 0.7, opacity: 0.35 }
                  }
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                >
                  <span className="splash-milestone-label">{m.label}</span>
                </motion.div>
              ))}

              {/* The rising dot (the user climbing) */}
              <motion.div
                className="splash-dot"
                initial={{ bottom: '6%' }}
                animate={{ bottom: '90%' }}
                transition={{ duration: 1.42, ease: [0.25, 0.46, 0.45, 0.94] }}
              />
            </div>
          )}

          {/* ── Reveal: logo + name + tagline ────────────────────────────── */}
          <AnimatePresence>
            {phase === 'reveal' && (
              <motion.div
                key="reveal"
                className="splash-reveal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              >
                {/* Flame logo */}
                <motion.div
                  className="splash-logo"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, type: 'spring', stiffness: 200, damping: 14 }}
                >
                  🔥
                </motion.div>

                {/* App name */}
                <motion.h1
                  className="splash-title"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12, duration: 0.38, ease: 'easeOut' }}
                >
                  FitStreak
                </motion.h1>

                {/* Tagline */}
                <motion.p
                  className="splash-tagline"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.26, duration: 0.38, ease: 'easeOut' }}
                >
                  Small steps. Big discipline.
                </motion.p>

                {/* Subtle hint */}
                <motion.p
                  className="splash-hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.55, duration: 0.4 }}
                >
                  Tap to continue
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
