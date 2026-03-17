'use client';

/**
 * Stats page — performance-optimized.
 *
 * Instant render:
 *   getCachedStats() reads the dashboard's localStorage cache synchronously.
 *   As long as the user visited the Today page first (always true for
 *   returning users), stats render with zero API calls.
 *
 * Full stats payload:
 *   Both /api/dashboard and /api/stats now return the complete object:
 *     { streak, highest, rate, progress,
 *       overallRate, totalTrackedDays,
 *       perHabit: [{ id, name, rate, completedDays }] }
 *   The stats page was previously broken because those fields didn't exist.
 *
 * Skeleton loading:
 *   SkeletonStats fills the screen while the API call runs (new users only).
 */

import { useState, useEffect, useCallback } from 'react';
import { getOrCreateUserId } from '../../lib/client-user';
import { getCachedStats } from '../../lib/dashboard-cache';
import SkeletonStats from '../../components/SkeletonStats';

export default function StatsPage() {
  // Phase 1: instant — read from dashboard cache (sync)
  const [stats, setStats]         = useState(() => getCachedStats());
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(false);

  const fetchStats = useCallback(async () => {
    const userId = getOrCreateUserId();
    if (!userId) return;
    if (!stats) setLoading(true); // show skeleton only if we have nothing
    setError(false);
    try {
      const res = await fetch('/api/stats', { headers: { 'X-User-Id': userId } });
      if (!res.ok) throw new Error('fetch');
      const data = await res.json();
      if (data.error) throw new Error('api');
      setStats(data);
    } catch {
      if (!stats) setError(true); // only show error if we have nothing to show
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 2: background refresh (or foreground for new users)
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Show skeleton for new users with no cache
  if (loading && !stats) return <SkeletonStats />;

  if (error && !stats) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0f172a] pb-20">
        <div className="text-center px-6">
          <p className="text-4xl mb-4">📉</p>
          <p className="text-red-400 font-medium mb-4">Failed to load stats.</p>
          <button type="button" onClick={fetchStats}
            className="rounded-xl bg-[#1e293b] text-slate-100 px-4 py-2 font-medium border border-white/10">
            Retry
          </button>
        </div>
      </main>
    );
  }

  // Safety: if stats is still null somehow, render empty state
  const s = stats ?? { streak: 0, highest: 0, overallRate: 0, totalTrackedDays: 0, perHabit: [] };

  return (
    <main className="min-h-screen mx-auto max-w-[420px] px-5 py-8 pb-24 bg-[#0f172a]">
      <h1 className="text-2xl font-bold text-slate-100 tracking-tight mb-6">Stats</h1>

      {/* Top two stat cards */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-2xl bg-[#1e293b] border border-white/5 shadow-card p-5">
          <p className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-2">
            Best Streak
          </p>
          <p className="text-4xl font-bold text-[#22c55e] leading-none">{s.highest}</p>
          <p className="text-[#94a3b8] text-xs mt-1.5">days</p>
        </div>

        <div className="rounded-2xl bg-[#1e293b] border border-white/5 shadow-card p-5">
          <p className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-2">
            Completion
          </p>
          <p className="text-4xl font-bold text-slate-100 leading-none">
            {s.overallRate}<span className="text-2xl text-[#94a3b8]">%</span>
          </p>
          <p className="text-[#94a3b8] text-xs mt-1.5">{s.totalTrackedDays} days tracked</p>
        </div>
      </div>

      {/* Per-habit breakdown */}
      <div className="rounded-2xl bg-[#1e293b] border border-white/5 shadow-card p-5">
        <p className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-5">
          Habit Breakdown
        </p>

        {!s.totalTrackedDays ? (
          <p className="text-[#94a3b8] text-sm text-center py-4">
            No data yet. Start checking off habits!
          </p>
        ) : (
          <div className="space-y-5">
            {(s.perHabit ?? []).map((h) => (
              <div key={h.id}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-200 text-sm font-medium">{h.name}</span>
                  <span className="text-[#22c55e] text-sm font-bold tabular-nums">{h.rate}%</span>
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

      {/* Subtle refresh indicator while background fetch runs */}
      {loading && stats && (
        <p className="text-center text-[#94a3b8]/40 text-xs mt-4 tracking-wide">Refreshing…</p>
      )}
    </main>
  );
}
