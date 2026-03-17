'use client';

/**
 * Calendar page — performance-optimized.
 *
 * Instant render for current month:
 *   The dashboard cache already contains the current month's calendar.
 *   We read it synchronously on mount — no spinner for the common case.
 *
 * Skeleton loading for month navigation:
 *   When the user browses to a past/future month that isn't cached,
 *   SkeletonCalendar fills the space while the API call runs.
 */

import Link from 'next/link';
import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { getOrCreateUserId } from '../../lib/client-user';
import { getCachedCalendar } from '../../lib/dashboard-cache';
import SkeletonCalendar from '../../components/SkeletonCalendar';

// ─── helpers ──────────────────────────────────────────────────────────────────

function getTodayKey()           { return new Date().toISOString().slice(0, 10); }
function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function addMonths(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// ─── memoized day cell ────────────────────────────────────────────────────────

const DayCell = memo(function DayCell({ day, todayKey }) {
  const isToday = day.date === todayKey;
  const href    = day.date === todayKey ? '/today' : `/today?date=${day.date}`;
  const dayNum  = new Date(day.date + 'T12:00:00').getDate();

  return (
    <Link
      href={href}
      className={[
        'aspect-square rounded-xl flex items-center justify-center',
        'text-xs font-semibold transition-all active:scale-[0.95]',
        isToday
          ? 'ring-2 ring-[#22c55e] ring-offset-2 ring-offset-[#1e293b] bg-[#22c55e]/10 text-[#22c55e]'
          : day.full
            ? 'bg-[#22c55e] text-white'
            : day.completed > 0
              ? 'bg-[#22c55e]/20 text-[#22c55e]'
              : 'bg-slate-700/40 text-[#94a3b8]',
      ].join(' ')}
      title={`${day.date}: ${day.completed}/${day.total}`}
    >
      {dayNum}
    </Link>
  );
});

// ─── main component ───────────────────────────────────────────────────────────

export default function CalendarPage() {
  const todayKey = useMemo(() => getTodayKey(), []);
  const now      = useMemo(() => new Date(), []);

  const [view, setView] = useState(() => ({
    year:  now.getFullYear(),
    month: now.getMonth() + 1,
  }));

  const isCurrentMonth = view.year === now.getFullYear() && view.month === now.getMonth() + 1;

  // Phase 1: instant — read dashboard cache (current month only)
  const [calendar, setCalendar] = useState(() =>
    isCurrentMonth ? (getCachedCalendar() ?? null) : null
  );
  const [loadingCalendar, setLoadingCalendar] = useState(!isCurrentMonth);

  const fetchCalendar = useCallback(async (year, month) => {
    const userId = getOrCreateUserId();
    if (!userId) return;
    setLoadingCalendar(true);
    try {
      const res = await fetch(`/api/calendar?year=${year}&month=${month}`, {
        headers: { 'X-User-Id': userId },
      });
      if (!res.ok) return;
      setCalendar(await res.json());
    } finally {
      setLoadingCalendar(false);
    }
  }, []);

  // On mount: background-refresh current month; fetch immediately for others
  useEffect(() => {
    if (isCurrentMonth) {
      const cached = getCachedCalendar();
      if (cached) {
        setCalendar(cached);
        setLoadingCalendar(false);
        // Background refresh
        fetchCalendar(view.year, view.month);
      } else {
        fetchCalendar(view.year, view.month);
      }
    } else {
      fetchCalendar(view.year, view.month);
    }
  }, [view.year, view.month]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevMonth = () => setView((v) => addMonths(v.year, v.month, -1));
  const nextMonth = () => setView((v) => addMonths(v.year, v.month, 1));

  // Show skeleton while loading non-cached months
  if (loadingCalendar && !calendar) return <SkeletonCalendar />;

  const days = calendar?.days ?? [];

  return (
    <main className="min-h-screen mx-auto max-w-[420px] px-5 py-8 pb-24 bg-[#0f172a]">

      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Calendar</h1>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <button type="button" onClick={prevMonth}
          className="h-10 w-10 rounded-2xl bg-[#1e293b] border border-white/8 text-slate-300 flex items-center justify-center active:scale-[0.96] transition-transform"
          aria-label="Previous month">
          <span className="text-xl leading-none">‹</span>
        </button>
        <h2 className="text-base font-bold text-slate-100 tracking-tight">
          {monthLabel(view.year, view.month)}
        </h2>
        <button type="button" onClick={nextMonth} disabled={isCurrentMonth}
          className="h-10 w-10 rounded-2xl bg-[#1e293b] border border-white/8 text-slate-300 flex items-center justify-center active:scale-[0.96] transition-transform disabled:opacity-30 disabled:active:scale-100"
          aria-label="Next month">
          <span className="text-xl leading-none">›</span>
        </button>
      </div>

      {/* Subtle refresh indicator (background fetch) */}
      {loadingCalendar && calendar && (
        <div className="h-0.5 w-full rounded-full bg-[#22c55e]/30 mb-3 overflow-hidden">
          <div className="h-full bg-[#22c55e] animate-[progress-grow_1.5s_ease-in-out_infinite]" />
        </div>
      )}

      <div className="rounded-2xl bg-[#1e293b] shadow-card border border-white/5 overflow-hidden p-4">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[#94a3b8] mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {days.length > 0 && (() => {
            const first = new Date(days[0].date + 'T12:00:00');
            const pads  = Array.from({ length: first.getDay() }, (_, i) => (
              <div key={`pad-${i}`} className="aspect-square" />
            ));
            return pads.concat(
              days.map((day) => (
                <DayCell key={day.date} day={day} todayKey={todayKey} />
              ))
            );
          })()}
        </div>
      </div>
    </main>
  );
}
