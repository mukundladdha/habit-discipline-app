'use client';

/**
 * LoadingDashboard.tsx
 *
 * Shown only on a new user's very first app load (no localStorage cache yet).
 * Returning users never see this — they get instant data from the cache.
 *
 * Design: shimmering skeleton cards + rotating inspiring quote.
 * Pure CSS shimmer — no Framer Motion, no JS animation loop.
 */

import { useState, useEffect } from 'react';

const QUOTES = [
  'Building discipline…',
  'Small steps. Big results.',
  'Consistency is the key.',
  'Showing up is enough.',
  'One habit at a time.',
  'You\'re already ahead.',
];

export default function LoadingDashboard() {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setMsgIdx((i) => (i + 1) % QUOTES.length),
      1600
    );
    return () => clearInterval(t);
  }, []);

  return (
    <main className="loading-db-root">
      {/* Rotating inspiring quote */}
      <p key={msgIdx} className="loading-db-msg">
        {QUOTES[msgIdx]}
      </p>

      {/* Skeleton cards with shimmer */}
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
