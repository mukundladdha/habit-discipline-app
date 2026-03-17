'use client';

/**
 * TodayClient.js — Performance-optimized Today view.
 *
 * 1. INSTANT STARTUP — localStorage cache read in a one-shot useEffect fires
 *    before the first paint cycle; returning users see real data with no
 *    loading screen.
 *
 * 2. BACKGROUND REFRESH — network fetch runs silently after showing cached
 *    data; UI updates without any spinner or flash.
 *
 * 3. MEMOIZED HabitRow — React.memo + custom comparator; only the toggled
 *    row re-renders, the other N-1 rows are skipped.
 *
 * 4. STABLE toggleHabit — completedIds mirrored into a ref so the callback
 *    only recreates when selectedDate or load changes, not on every toggle.
 *
 * 5. pendingIds AS STATE (not ref) — the disabled prop on habit buttons now
 *    actually triggers a re-render, fixing the broken double-tap guard.
 *
 * 6. LoadingDashboard — animated skeleton for new users (no plain "Loading…").
 */

import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Onboarding from '../../components/Onboarding';
import LoadingDashboard from '../../components/LoadingDashboard';
import SettingsPanel from '../../components/SettingsPanel';
import { getOrCreateUserId } from '../../lib/client-user';
import { getCachedDashboard, setCachedDashboard, clearCachedDashboard } from '../../lib/dashboard-cache';
import {
  enqueueSyncItem,
  saveDashboardCache,
  getDashboardCache,
  getAllSyncItems,
} from '../../lib/idb';

// ─── date helpers ─────────────────────────────────────────────────────────────

function getTodayKey()       { return new Date().toISOString().slice(0, 10); }
function isValidDate(k)      { return typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k); }
function clamp(k, today)     { return !isValidDate(k) || k > today ? today : k; }
function shiftDate(k, delta) {
  const d = new Date(`${k}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}
function fmtLong(k) {
  return new Date(`${k}T12:00:00`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

// ─── constants ────────────────────────────────────────────────────────────────

const EMPTY_STATE = {
  habits:      [],
  completions: [],
  calendar:    null,
  stats:       { streak: 0, highest: 0, rate: 0, progress: 0 },
};

function normalizeDash(d) {
  return {
    habits:      d.habits      ?? [],
    completions: d.completions ?? [],
    calendar:    d.calendar    ?? null,
    stats:       d.stats       ?? EMPTY_STATE.stats,
  };
}

// ─── memoized habit row ───────────────────────────────────────────────────────

const HabitRow = memo(function HabitRow({ habit, done, isPending, isGlowing, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(habit.id)}
      disabled={isPending}
      className={[
        'w-full flex items-center justify-between rounded-2xl p-5 text-left',
        'shadow-card border transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-[#22c55e]/50',
        'focus:ring-offset-2 focus:ring-offset-[#0f172a]',
        'active:scale-[0.99] disabled:cursor-wait',
        done ? 'bg-[#1e293b] border-[#22c55e]/30' : 'bg-[#1e293b] border-white/5 hover:border-white/10',
        isGlowing ? 'animate-habit-glow' : '',
      ].join(' ')}
    >
      <span className={`text-[1rem] font-semibold transition-colors ${done ? 'text-[#22c55e]' : 'text-slate-100'}`}>
        {habit.name}
      </span>
      <span className={[
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2',
        'transition-all duration-200 ease-out',
        done ? 'bg-[#22c55e] border-[#22c55e] text-white' : 'border-slate-600 bg-transparent',
      ].join(' ')}>
        {done ? (
          <svg className="h-3.5 w-3.5 animate-check-pop" fill="none" stroke="currentColor"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M5 13l4 4L19 7" />
          </svg>
        ) : <span className="sr-only">Not done</span>}
      </span>
    </button>
  );
}, (p, n) =>
  p.done      === n.done      &&
  p.isPending === n.isPending &&
  p.isGlowing === n.isGlowing &&
  p.habit.id  === n.habit.id
);

// ─── component ────────────────────────────────────────────────────────────────

export default function TodayClient({ initialDate }) {
  const router   = useRouter();
  const todayKey = useMemo(() => getTodayKey(), []);
  const initDate = useMemo(() => clamp(initialDate || todayKey, todayKey), [initialDate, todayKey]);

  // Onboarding — SSR-safe (start true to match server, set via effect)
  const [onboardingDone, setOnboardingDone] = useState(true);
  useEffect(() => { setOnboardingDone(!!localStorage.getItem('onboardingComplete')); }, []);

  // Core state
  const [selectedDate, setSelectedDate]     = useState(initDate);
  const [dashboardState, setDashboardState] = useState(EMPTY_STATE);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError]                   = useState(null);
  const [greeting, setGreeting]             = useState('');
  const [glowingId, setGlowingId]           = useState(null);
  const [isOffline, setIsOffline]           = useState(false);
  const [pendingIds, setPendingIds]         = useState(new Set()); // STATE not ref
  const [showSettings, setShowSettings]     = useState(false);

  // Stable ref mirror for completedIds so toggleHabit doesn't recreate on every completion
  const completedIdsRef = useRef(new Set());

  useEffect(() => { setSelectedDate(initDate); }, [initDate]);

  useEffect(() => {
    const g = ['Howdy!', 'Hola!', "Let's win today.", 'Stay disciplined.',
      'One step at a time.', 'Make today count.', 'Show up. Every day.', 'Build the habit.'];
    setGreeting(g[Math.floor(Math.random() * g.length)]);
  }, []);

  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const on  = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Apply pending offline completions on top of any snapshot
  const applyPending = useCallback(async (snapshot, date) => {
    const forDate = (await getAllSyncItems()).filter((i) => i.date === date);
    if (!forDate.length) return snapshot;
    let completions = [...snapshot.completions];
    for (const item of forDate) {
      if (item.completed) {
        if (!completions.some((c) => c.habitId === item.habitId))
          completions.push({ id: -item.id, habitId: item.habitId, date });
      } else {
        completions = completions.filter((c) => c.habitId !== item.habitId);
      }
    }
    return { ...snapshot, completions };
  }, []);

  // Network fetch — called both for foreground (no cache) and background (have cache)
  const load = useCallback(async (date, showLoader = false) => {
    const userId = getOrCreateUserId();
    if (!userId) return;
    if (showLoader) setInitialLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/dashboard?date=${date}`, {
        headers: { 'X-User-Id': userId },
      });
      if (!res.ok) throw new Error('server');
      const data = await res.json();

      // Write to both cache layers (L1+L2 = localStorage, IDB = offline)
      setCachedDashboard(date, data);
      saveDashboardCache(date, data); // IDB — async, fire-and-forget

      const reconciled = await applyPending(normalizeDash(data), date);
      setDashboardState(reconciled);
      setInitialLoading(false);
      setIsOffline(false);

    } catch {
      // Offline fallback — try IDB
      const idb = await getDashboardCache(date);
      if (idb) {
        setDashboardState(await applyPending(normalizeDash(idb), date));
        setIsOffline(true);
      } else if (showLoader) {
        setError('No cached data. Connect to load your habits.');
      }
      setInitialLoading(false);
    }
  }, [applyPending]);

  // Phase 1: instant — read localStorage (sync <1 ms)
  // Phase 2: background — fetch fresh from server
  useEffect(() => {
    const cached = getCachedDashboard(selectedDate);
    if (cached) {
      applyPending(normalizeDash(cached), selectedDate).then(setDashboardState);
      setInitialLoading(false);
      load(selectedDate, false); // silent background refresh
    } else {
      load(selectedDate, true);  // no cache — show loading experience
    }
  }, [selectedDate, load, applyPending]);

  // Reload when offline sync completes
  useEffect(() => {
    const h = () => load(selectedDate, false);
    window.addEventListener('sync-complete', h);
    return () => window.removeEventListener('sync-complete', h);
  }, [load, selectedDate]);

  // ─── derived values ───────────────────────────────────────────────────────
  const { habits, completions, stats } = dashboardState;
  const completedIds = useMemo(() => new Set(completions.map((c) => c.habitId)), [completions]);
  completedIdsRef.current = completedIds; // keep ref in sync

  const completedCount  = completions.length;
  const totalHabits     = habits.length;
  const progressPercent = totalHabits ? (completedCount / totalHabits) * 100 : 0;

  // ─── toggleHabit — only re-creates on date/load change ───────────────────
  const toggleHabit = useCallback(async (habitId) => {
    if (pendingIds.has(habitId)) return;
    setPendingIds((s) => new Set(s).add(habitId));

    const userId       = getOrCreateUserId();
    const release      = () => setPendingIds((s) => { const n = new Set(s); n.delete(habitId); return n; });
    if (!userId) { release(); return; }

    const willComplete = !completedIdsRef.current.has(habitId);

    // Optimistic UI
    setDashboardState((prev) => {
      const newC = willComplete
        ? [...prev.completions, { id: -Date.now(), habitId, date: selectedDate }]
        : prev.completions.filter((c) => c.habitId !== habitId);
      let newCal = prev.calendar;
      if (newCal) {
        const cnt = newC.filter((c) => c.date === selectedDate).length;
        newCal = {
          ...newCal,
          days: newCal.days.map((d) =>
            d.date === selectedDate
              ? { ...d, completed: cnt, full: prev.habits.length > 0 && cnt === prev.habits.length }
              : d
          ),
        };
      }
      return { ...prev, completions: newC, calendar: newCal };
    });

    if (willComplete) { setGlowingId(habitId); setTimeout(() => setGlowingId(null), 700); }

    // Offline path
    if (!navigator.onLine) {
      await enqueueSyncItem({ habitId, date: selectedDate, completed: willComplete, userId });
      window.dispatchEvent(new Event('offline-item-queued'));
      release();
      return;
    }

    // Online path
    try {
      const res = await fetch('/api/complete', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
        body:    JSON.stringify({ habitId, date: selectedDate, completed: willComplete }),
      });
      if (!res.ok) { load(selectedDate, false); return; }
      const data = await res.json();
      setDashboardState((prev) => ({
        ...prev,
        completions: data.completions ?? prev.completions,
        stats:       data.stats       ?? prev.stats,
      }));
    } catch {
      await enqueueSyncItem({ habitId, date: selectedDate, completed: willComplete, userId });
      window.dispatchEvent(new Event('offline-item-queued'));
    } finally {
      release();
    }
  }, [selectedDate, load]); // completedIds via ref — stable

  // ─── settings / habit changes ─────────────────────────────────────────────
  // Called by SettingsPanel after any add/remove/toggle — busts cache only,
  // does NOT close the panel (user stays to make more changes).
  const handleHabitsChanged = useCallback(() => {
    clearCachedDashboard(selectedDate);
  }, [selectedDate]);

  // Called when the panel is dismissed (✕ or backdrop) — reload if needed.
  const handleSettingsClose = useCallback(() => {
    setShowSettings(false);
    load(selectedDate, false); // silent refresh so Today shows updated habits
  }, [selectedDate, load]);

  // ─── navigation ───────────────────────────────────────────────────────────
  const navigateTo = useCallback((k) => {
    setSelectedDate(k);
    if (k === todayKey) router.replace('/today');
    else router.replace(`/today?date=${k}`);
  }, [router, todayKey]);

  const goPrev = () => navigateTo(shiftDate(selectedDate, -1));
  const goNext = () => {
    if (selectedDate !== todayKey) navigateTo(clamp(shiftDate(selectedDate, 1), todayKey));
  };

  // ─── render ───────────────────────────────────────────────────────────────
  if (!onboardingDone)  return <Onboarding onComplete={() => setOnboardingDone(true)} />;
  if (initialLoading)   return <LoadingDashboard />;

  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[#0f172a] px-5 pb-20">
        <p className="text-4xl mb-4">📡</p>
        <p className="text-slate-300 font-semibold mb-2">You&apos;re offline</p>
        <p className="text-[#94a3b8] text-sm text-center mb-6">{error}</p>
        <button type="button" onClick={() => load(selectedDate, true)}
          className="rounded-xl bg-[#1e293b] text-slate-100 px-4 py-2 font-medium border border-white/10">
          Retry
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen mx-auto max-w-[420px] px-5 py-8 pb-24 bg-[#0f172a]">

      {/* Settings panel */}
      {showSettings && (
        <SettingsPanel
          onClose={handleSettingsClose}
          onHabitsChanged={handleHabitsChanged}
        />
      )}

      {/* Header */}
      <section className="relative text-center mb-8">
        {/* Gear icon — absolute top-right of header */}
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          className="absolute right-0 top-0 h-9 w-9 rounded-xl bg-[#1e293b] border border-white/8 flex items-center justify-center text-[#94a3b8] active:scale-90 transition-transform hover:text-slate-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {greeting && (
          <p className="text-[#94a3b8] text-sm font-semibold tracking-wide uppercase mb-2">
            {greeting}
          </p>
        )}
        <p className="text-3xl font-bold tracking-tight text-slate-100">
          🔥 <span className="text-[#22c55e]">{stats.streak}</span> Day Streak
        </p>
        {selectedDate === todayKey && (
          <p className="text-[#94a3b8] text-sm mt-2">
            Day {Math.min(Math.max(stats.progress, 1), 21)} / 21
            {' · '}Complete today&apos;s disciplines.
          </p>
        )}
      </section>

      {/* Date nav + progress + habits */}
      <section className="mb-8">

        <div className="flex items-center justify-between gap-3 mb-5">
          <button type="button" onClick={goPrev}
            className="h-10 w-10 rounded-2xl bg-[#1e293b] border border-white/8 text-slate-300 flex items-center justify-center active:scale-[0.96] transition-transform"
            aria-label="Previous day">
            <span className="text-xl leading-none">‹</span>
          </button>
          <div className="text-center">
            <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">
              {selectedDate === todayKey ? 'Today' : 'Past day'}
            </p>
            <h1 className="text-base font-bold text-slate-100 tracking-tight mt-0.5">
              {fmtLong(selectedDate)}
            </h1>
          </div>
          <button type="button" onClick={goNext} disabled={selectedDate === todayKey}
            className="h-10 w-10 rounded-2xl bg-[#1e293b] border border-white/8 text-slate-300 flex items-center justify-center active:scale-[0.96] transition-transform disabled:opacity-30 disabled:active:scale-100"
            aria-label="Next day">
            <span className="text-xl leading-none">›</span>
          </button>
        </div>

        <div className="rounded-2xl bg-[#1e293b] border border-white/5 shadow-card p-5 mb-4">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-[#94a3b8] text-sm font-medium">{completedCount} / {totalHabits} completed</p>
            <p className="text-[#22c55e] font-bold tabular-nums text-sm">
              {totalHabits ? Math.round(progressPercent) : 0}%
            </p>
          </div>
          <div className="h-3 w-full rounded-full bg-slate-700/60 overflow-hidden"
            role="progressbar" aria-valuenow={Math.round(progressPercent)} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill h-full rounded-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] will-change-[width]"
              style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {completedCount === totalHabits && totalHabits > 0 && (
          <div className="mb-4 rounded-2xl bg-gradient-to-br from-[#22c55e] to-[#16a34a] p-5 text-center shadow-card animate-bounce-subtle">
            <p className="text-2xl font-bold text-white mb-0.5">🎉 Perfect Day!</p>
            <p className="text-green-50 text-sm font-medium">All habits locked in</p>
          </div>
        )}

        <div className="space-y-3">
          {habits.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              done={completedIds.has(habit.id)}
              isPending={pendingIds.has(habit.id)}
              isGlowing={glowingId === habit.id}
              onToggle={toggleHabit}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
