'use client';

/**
 * Progress page — Calendar + Habit Breakdown in one view.
 *
 * LOAD FLOW
 *   1. Read dashboard cache synchronously on mount — instant render, no spinner
 *      for returning users.
 *   2. Fetch /api/dashboard in background → update calendar + perHabit silently.
 *   3. Month navigation → fetch /api/calendar for non-current months.
 *
 * PERFORMANCE
 *   • DayCell and HabitCard are memoized — only re-render when their own props change.
 *   • perHabit derived data (streak, last7Days, completedLast21) is computed
 *     server-side and cached — no client-side recalculation.
 *   • Calendar and habit sections update independently.
 */

import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { getOrCreateUserId } from '../../lib/client-user';
import { getCache, setCache } from '../../lib/local-store';
import SkeletonCalendar from '../../components/SkeletonCalendar';

// ── Date helpers ───────────────────────────────────────────────────────────────

function getTodayKey() { return new Date().toISOString().slice(0, 10); }
function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function addMonths(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
function fmtDayLong(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

// ── Calendar: memoized day cell ────────────────────────────────────────────────

const DayCell = memo(function DayCell({ day, todayKey, isSelected, onSelect }) {
  const isToday  = day.date === todayKey;
  const isPast   = day.date < todayKey;
  const dayNum   = new Date(day.date + 'T12:00:00').getDate();

  // Colour logic (evaluated top-to-bottom, first match wins):
  //   today          → green ring (handled separately for selected/unselected)
  //   no habits yet  → greyed out (before habit tracking started)
  //   all done       → solid green
  //   some done      → soft green
  //   missed past    → light red (habits existed but 0 completed)
  //   future/today 0 → neutral slate
  let bgClass;
  if (isToday) {
    bgClass = isSelected
      ? 'ring-2 ring-[#22c55e] ring-offset-2 ring-offset-[#1e293b] bg-[#22c55e] text-white'
      : 'ring-2 ring-[#22c55e] ring-offset-2 ring-offset-[#1e293b] bg-[#22c55e]/10 text-[#22c55e]';
  } else if (!day.hasHabits) {
    bgClass = 'bg-slate-800/20 text-slate-600/50 cursor-default';
  } else if (day.full) {
    bgClass = 'bg-[#22c55e] text-white';
  } else if (day.completed > 0) {
    bgClass = 'bg-[#22c55e]/20 text-[#22c55e]';
  } else if (isPast) {
    bgClass = 'bg-red-500/15 text-red-400/70';
  } else {
    bgClass = 'bg-slate-700/40 text-[#94a3b8]';
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      className={[
        'aspect-square rounded-xl flex items-center justify-center',
        'text-xs font-semibold transition-all active:scale-[0.92]',
        isSelected && !isToday
          ? 'ring-2 ring-white/40 ring-offset-1 ring-offset-[#1e293b]'
          : '',
        bgClass,
      ].join(' ')}
    >
      {dayNum}
    </button>
  );
}, (p, n) =>
  p.day.date      === n.day.date      &&
  p.day.completed === n.day.completed &&
  p.day.full      === n.day.full      &&
  p.day.hasHabits === n.day.hasHabits &&
  p.isSelected    === n.isSelected    &&
  p.todayKey      === n.todayKey
);

// ── Habit breakdown: single habit card ────────────────────────────────────────

const HabitCard = memo(function HabitCard({ habit, index }) {
  const { name, streak, last7Days } = habit;
  const completedLast7 = last7Days.filter(Boolean).length;

  return (
    <div
      className="rounded-2xl bg-[#1e293b] border border-white/5 shadow-card p-4"
      style={{
        animation: 'fade-up 0.35s ease-out both',
        animationDelay: `${index * 55}ms`,
      }}
    >
      {/* Row 1: name + streak badge */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-slate-100 text-[0.92rem] font-semibold leading-snug truncate">
          {name}
        </span>
        <span className={[
          'shrink-0 flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full',
          streak > 0
            ? 'bg-[#22c55e]/15 text-[#22c55e]'
            : 'bg-slate-700/60 text-slate-500',
        ].join(' ')}>
          🔥 {streak}
        </span>
      </div>

      {/* Row 2: last 7 days dots */}
      <div className="flex items-center gap-[5px] mb-3" aria-label="Last 7 days">
        {last7Days.map((done, i) => {
          const isToday = i === 6;
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              <div className={[
                'rounded-full transition-colors',
                isToday ? 'h-3 w-3' : 'h-2.5 w-2.5',
                done
                  ? isToday
                    ? 'bg-[#22c55e] shadow-[0_0_6px_2px_rgba(34,197,94,0.4)]'
                    : 'bg-[#22c55e]'
                  : isToday
                    ? 'bg-slate-600 ring-1 ring-slate-500'
                    : 'bg-slate-700',
              ].join(' ')} />
            </div>
          );
        })}
      </div>

      {/* Row 3: 7-day progress bar + count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div className="h-1.5 flex-1 rounded-full bg-slate-700/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#22c55e] to-[#16a34a]"
              style={{
                width: `${Math.round((completedLast7 / 7) * 100)}%`,
                transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
              }}
            />
          </div>
        </div>
        <span className="shrink-0 ml-3 text-xs tabular-nums text-[#94a3b8] font-medium">
          {completedLast7}<span className="text-slate-600">/7</span>
        </span>
      </div>
    </div>
  );
}, (p, n) =>
  p.habit.streak    === n.habit.streak    &&
  p.habit.last7Days === n.habit.last7Days &&
  p.habit.name      === n.habit.name      &&
  p.index           === n.index
);

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const todayKey = useMemo(() => getTodayKey(), []);
  const now      = useMemo(() => new Date(), []);

  const [view, setView] = useState(() => ({
    year:  now.getFullYear(),
    month: now.getMonth() + 1,
  }));
  const isCurrentMonth = view.year === now.getFullYear() && view.month === now.getMonth() + 1;

  // ── Data state — SSR-safe init; cache read client-side in useEffect ───────
  const [calendar, setCalendar] = useState(null);
  const [perHabit, setPerHabit] = useState([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [selectedDay, setSelectedDay]         = useState(null); // {date, completed, total, full}

  // Read cache client-side only (prevents SSR/client hydration mismatch)
  useEffect(() => {
    const d = getCache(getTodayKey());
    if (d?.calendar)             setCalendar(d.calendar);
    if (d?.stats?.perHabit?.length) setPerHabit(d.stats.perHabit);
  }, []);

  // ── Fetch helpers ─────────────────────────────────────────────────────────

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

  // Background-refresh dashboard to keep perHabit + calendar current
  const refreshDashboard = useCallback(async () => {
    const userId = getOrCreateUserId();
    if (!userId) return;
    try {
      const res = await fetch(`/api/dashboard?date=${todayKey}`, {
        headers: { 'X-User-Id': userId },
      });
      if (!res.ok) return;
      const data = await res.json();
      setCache(todayKey, data);
      if (isCurrentMonth) setCalendar(data.calendar);
      setPerHabit(data.stats?.perHabit ?? []);
    } catch { /* silently ignore */ }
  }, [todayKey, isCurrentMonth]);

  // On mount + month change: load calendar; on mount also refresh perHabit
  useEffect(() => {
    if (isCurrentMonth) {
      if (!calendar) {
        fetchCalendar(view.year, view.month);
      } else {
        // Already have calendar from cache; background-refresh both
        fetchCalendar(view.year, view.month);
      }
      refreshDashboard();
    } else {
      fetchCalendar(view.year, view.month);
      setSelectedDay(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.year, view.month]);

  const prevMonth = () => {
    setSelectedDay(null);
    setView((v) => addMonths(v.year, v.month, -1));
  };
  const nextMonth = () => {
    if (!isCurrentMonth) return;
    setSelectedDay(null);
    setView((v) => addMonths(v.year, v.month, 1));
  };

  const handleDaySelect = useCallback((day) => {
    setSelectedDay((prev) => prev?.date === day.date ? null : day);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const days = calendar?.days ?? [];

  return (
    <main className="min-h-screen mx-auto max-w-[420px] px-5 py-8 pb-28 bg-[#0f172a]">

      <h1 className="text-2xl font-bold text-slate-100 tracking-tight mb-6">Progress</h1>

      {/* ── Calendar section ──────────────────────────────────────────────── */}
      <section className="mb-6">

        {/* Month navigation */}
        <div className="flex items-center justify-between gap-3 mb-3">
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

        {/* Subtle progress bar during background fetch */}
        {loadingCalendar && calendar && (
          <div className="h-0.5 w-full rounded-full bg-[#22c55e]/20 mb-3 overflow-hidden">
            <div className="h-full bg-[#22c55e]/60 animate-[progress-grow_1.5s_ease-in-out_infinite]" />
          </div>
        )}

        {/* Calendar grid */}
        {loadingCalendar && !calendar ? (
          <SkeletonCalendar />
        ) : (
          <div className="rounded-2xl bg-[#1e293b] shadow-card border border-white/5 overflow-hidden p-4">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[#94a3b8] mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.length > 0 && (() => {
                const first = new Date(days[0].date + 'T12:00:00');
                const pads  = Array.from({ length: first.getDay() }, (_, i) => (
                  <div key={`pad-${i}`} className="aspect-square" />
                ));
                return pads.concat(
                  days.map((day) => (
                    <DayCell
                      key={day.date}
                      day={day}
                      todayKey={todayKey}
                      isSelected={selectedDay?.date === day.date}
                      onSelect={handleDaySelect}
                    />
                  ))
                );
              })()}
            </div>
          </div>
        )}

        {/* Day detail strip — appears when a day is tapped */}
        {selectedDay && (
          <div className="mt-2 rounded-2xl bg-[#1e293b] border border-white/8 px-4 py-3 flex items-center justify-between"
            style={{ animation: 'fade-up 0.2s ease-out both' }}>
            <div>
              <p className="text-slate-100 text-sm font-semibold">{fmtDayLong(selectedDay.date)}</p>
              <p className="text-[#94a3b8] text-xs mt-0.5">
                {selectedDay.completed === 0
                  ? 'No habits completed'
                  : selectedDay.full
                    ? 'All habits completed 🎉'
                    : `${selectedDay.completed} of ${selectedDay.total} habits`}
              </p>
            </div>
            {selectedDay.total > 0 && (
              <div className="flex gap-1 shrink-0">
                {Array.from({ length: selectedDay.total }).map((_, i) => (
                  <div key={i} className={[
                    'h-2 w-2 rounded-full',
                    i < selectedDay.completed ? 'bg-[#22c55e]' : 'bg-slate-700',
                  ].join(' ')} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Habit breakdown section ───────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-base font-bold text-slate-100 tracking-tight">Habit Breakdown</h2>
          <span className="text-xs text-[#94a3b8] font-medium">Last 7 days</span>
        </div>

        {perHabit.length === 0 ? (
          <div className="rounded-2xl bg-[#1e293b] border border-white/5 p-6 text-center">
            <p className="text-[#94a3b8] text-sm">No habits yet. Add some from Settings!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {perHabit.map((habit, i) => (
              <HabitCard key={habit.id} habit={habit} index={i} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
