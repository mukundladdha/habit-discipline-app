'use client';

/**
 * LoadingDashboard.tsx
 *
 * Shown only on a new user's very first app load (no localStorage cache yet).
 * Returning users never see this — they get instant data from the cache.
 *
 * Concept: "Climbing progress"
 *   A glowing dot rises step-by-step through milestone nodes on a vertical
 *   path while the text rotates through motivational phrases.
 *   Skeleton cards below fill the page so there's no blank white space.
 *
 * Design rules met:
 *   ✓  Pure CSS animations — no Framer Motion, no JS animation loop
 *   ✓  < 3 kB total (component + CSS)
 *   ✓  60 fps via transform/opacity only (no layout thrashing)
 *   ✓  Works on mobile PWA (no hover states required)
 */

import { useState, useEffect } from 'react';

const MESSAGES = [
  'Building discipline…',
  'One step at a time…',
  'Consistency wins.',
  'Showing up is enough.',
  'Loading your habits…',
];

const NODE_COUNT = 5;

export default function LoadingDashboard() {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setMsgIdx((i) => (i + 1) % MESSAGES.length),
      1500
    );
    return () => clearInterval(t);
  }, []);

  return (
    <main className="loading-db-root">
      {/* ── Animated climbing path ─────────────────────────────── */}
      <div className="loading-db-path-wrap" aria-hidden="true">
        {/* Vertical glowing line */}
        <div className="loading-db-line" />

        {/* Milestone nodes */}
        {Array.from({ length: NODE_COUNT }).map((_, i) => (
          <div
            key={i}
            className="loading-db-node"
            style={{
              bottom:           `${(i / (NODE_COUNT - 1)) * 100}%`,
              animationDelay:   `${i * 0.22}s`,
            }}
          />
        ))}

        {/* The rising climber dot */}
        <div className="loading-db-climber" />
      </div>

      {/* ── Rotating motivational text ─────────────────────────── */}
      <p key={msgIdx} className="loading-db-msg">
        {MESSAGES[msgIdx]}
      </p>

      {/* ── Skeleton cards — fill the page so nothing looks empty ─ */}
      <div className="loading-db-skeletons">
        {/* Progress card skeleton */}
        <div className="skel-card">
          <div className="skel-row-sm" style={{ width: '45%' }} />
          <div className="skel-bar" />
        </div>

        {/* Habit row skeletons */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="skel-habit-row"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="skel-text" style={{ width: `${48 + i * 5}%` }} />
            <div className="skel-check-box" />
          </div>
        ))}
      </div>
    </main>
  );
}
