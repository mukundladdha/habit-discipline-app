'use client';

/**
 * SkeletonCalendar.tsx
 *
 * Shimmer placeholder matching the Calendar page grid layout.
 * Renders the day-of-week header + 5 rows of 7 shimmering cells.
 * No blank screens on calendar page.
 */

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SkeletonCalendar() {
  return (
    <main className="min-h-screen mx-auto max-w-[420px] px-5 py-8 pb-24 bg-[#0f172a]">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div className="skel-row-sm" style={{ width: '88px', height: '28px', borderRadius: '10px' }} />
      </div>

      {/* Month nav row */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="skel-stat-card" style={{ width: '40px', height: '40px', borderRadius: '12px' }} />
        <div className="skel-row-sm" style={{ width: '130px' }} />
        <div className="skel-stat-card" style={{ width: '40px', height: '40px', borderRadius: '12px' }} />
      </div>

      {/* Calendar grid */}
      <div className="rounded-2xl bg-[#1e293b] border border-white/5 overflow-hidden p-4">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DOW.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-semibold text-[#94a3b8]/40"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Cell rows — 5 rows of 7 */}
        {Array.from({ length: 5 }).map((_, row) => (
          <div key={row} className="grid grid-cols-7 gap-1 mb-1">
            {Array.from({ length: 7 }).map((__, col) => (
              <div
                key={col}
                className="skel-cal-cell"
                style={{ animationDelay: `${(row * 7 + col) * 20}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
