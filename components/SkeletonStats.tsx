'use client';

/**
 * SkeletonStats.tsx
 *
 * Shimmer placeholder that matches the exact layout of the Stats page.
 * Shown while the real stats are being fetched (or before cache hydrates).
 * Pure CSS shimmer — no JS, no heavy deps.
 */

export default function SkeletonStats() {
  return (
    <main className="min-h-screen mx-auto max-w-[420px] px-5 py-8 pb-24 bg-[#0f172a]">
      {/* Title */}
      <div className="skel-row-sm mb-7" style={{ width: '80px', height: '28px', borderRadius: '10px' }} />

      {/* Two stat cards side-by-side */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="skel-stat-card" />
        <div className="skel-stat-card" />
      </div>

      {/* Habit breakdown card */}
      <div className="skel-card" style={{ padding: '20px' }}>
        <div className="skel-row-sm mb-5" style={{ width: '120px' }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="mb-5">
            <div className="flex justify-between mb-2">
              <div className="skel-text" style={{ width: `${45 + i * 6}%` }} />
              <div className="skel-text" style={{ width: '32px' }} />
            </div>
            <div className="skel-bar" style={{ animationDelay: `${i * 100}ms` }} />
          </div>
        ))}
      </div>
    </main>
  );
}
