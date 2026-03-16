'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect, useCallback } from 'react';

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function addMonths(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function CalendarPage() {
  const [calendar, setCalendar] = useState({ days: [] });
  const [loading, setLoading] = useState(true);
  const todayKey = getTodayKey();

  const now = useMemo(() => new Date(), []);
  const [view, setView] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() + 1 }));

  const isCurrentMonth = view.year === now.getFullYear() && view.month === now.getMonth() + 1;

  const fetchCalendar = useCallback(async () => {
    const res = await fetch(`/api/calendar?year=${view.year}&month=${view.month}`);
    if (!res.ok) return;
    const data = await res.json();
    setCalendar(data);
  }, [view.year, view.month]);

  useEffect(() => {
    setLoading(true);
    fetchCalendar().finally(() => setLoading(false));
  }, [fetchCalendar]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0f172a] pb-20">
        <p className="text-[#94a3b8] font-medium">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen mx-auto max-w-[420px] px-5 py-8 pb-24 bg-[#0f172a]">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Calendar</h1>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <button
          type="button"
          onClick={() => setView((v) => addMonths(v.year, v.month, -1))}
          className="h-10 w-10 rounded-2xl bg-[#1e293b] border border-white/8 text-slate-300 flex items-center justify-center active:scale-[0.96] transition-transform"
          aria-label="Previous month"
        >
          <span className="text-xl leading-none">‹</span>
        </button>

        <h2 className="text-base font-bold text-slate-100 tracking-tight">{monthLabel(view.year, view.month)}</h2>

        <button
          type="button"
          onClick={() => setView((v) => addMonths(v.year, v.month, 1))}
          disabled={isCurrentMonth}
          className="h-10 w-10 rounded-2xl bg-[#1e293b] border border-white/8 text-slate-300 flex items-center justify-center active:scale-[0.96] transition-transform disabled:opacity-30 disabled:active:scale-100"
          aria-label="Next month"
        >
          <span className="text-xl leading-none">›</span>
        </button>
      </div>

      <div className="rounded-2xl bg-[#1e293b] shadow-card border border-white/5 overflow-hidden p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[#94a3b8] mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendar.days.length > 0 &&
            (() => {
              const first = new Date(calendar.days[0].date + 'T12:00:00');
              const pad = first.getDay();
              const pads = Array.from({ length: pad }, (_, i) => (
                <div key={`pad-${i}`} className="aspect-square" />
              ));
              return pads.concat(
                calendar.days.map((day) => {
                  const isToday = day.date === todayKey;
                  const isFull = day.full;
                  const hasSome = day.completed > 0;
                  const href = day.date === todayKey ? '/today' : `/today?date=${day.date}`;
                  return (
                    <Link
                      key={day.date}
                      className={`aspect-square rounded-xl flex items-center justify-center text-xs font-semibold transition-all active:scale-[0.95] ${
                        isToday
                          ? 'ring-2 ring-[#22c55e] ring-offset-2 ring-offset-[#1e293b] bg-[#22c55e]/10 text-[#22c55e]'
                          : isFull
                            ? 'bg-[#22c55e] text-white'
                            : hasSome
                              ? 'bg-[#22c55e]/20 text-[#22c55e]'
                              : 'bg-slate-700/40 text-[#94a3b8]'
                      }`}
                      title={`${day.date}: ${day.completed}/${day.total}`}
                      href={href}
                    >
                      {new Date(day.date + 'T12:00:00').getDate()}
                    </Link>
                  );
                })
              );
            })()}
        </div>
      </div>
    </main>
  );
}
