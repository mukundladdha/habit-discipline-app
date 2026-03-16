'use client';

import { useState, useEffect } from 'react';

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(true);
        else setStats(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0f172a] pb-20">
        <p className="text-[#94a3b8] font-medium">Loading…</p>
      </main>
    );
  }

  if (error || !stats) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0f172a] pb-20">
        <p className="text-red-400 font-medium">Failed to load stats.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen mx-auto max-w-[420px] px-5 py-8 pb-24 bg-[#0f172a]">
      <h1 className="text-2xl font-bold text-slate-100 tracking-tight mb-6">Stats</h1>

      {/* Top row — best streak + overall rate */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Best streak */}
        <div className="rounded-2xl bg-[#1e293b] border border-white/5 shadow-card p-5">
          <p className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-2">
            Best Streak
          </p>
          <p className="text-4xl font-bold text-[#22c55e] leading-none">
            {stats.highest}
          </p>
          <p className="text-[#94a3b8] text-xs mt-1.5">days</p>
        </div>

        {/* Overall completion */}
        <div className="rounded-2xl bg-[#1e293b] border border-white/5 shadow-card p-5">
          <p className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-2">
            Completion
          </p>
          <p className="text-4xl font-bold text-slate-100 leading-none">
            {stats.overallRate}
            <span className="text-2xl text-[#94a3b8]">%</span>
          </p>
          <p className="text-[#94a3b8] text-xs mt-1.5">
            {stats.totalTrackedDays} days tracked
          </p>
        </div>
      </div>

      {/* Per-habit breakdown */}
      <div className="rounded-2xl bg-[#1e293b] border border-white/5 shadow-card p-5">
        <p className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-5">
          Habit Breakdown
        </p>

        {stats.totalTrackedDays === 0 ? (
          <p className="text-[#94a3b8] text-sm text-center py-4">
            No data yet. Start checking off habits!
          </p>
        ) : (
          <div className="space-y-5">
            {stats.perHabit.map((h) => (
              <div key={h.id}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-200 text-sm font-medium">{h.name}</span>
                  <span className="text-[#22c55e] text-sm font-bold tabular-nums">
                    {h.rate}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-700/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] transition-all duration-700"
                    style={{ width: `${h.rate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
