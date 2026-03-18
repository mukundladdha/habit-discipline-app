'use client';

/**
 * TodayClient.js — Local-first Today view.
 *
 * LOAD FLOW
 *   1. Read localStorage cache synchronously on mount → render real UI instantly
 *   2. Fetch /api/dashboard in the background → merge + update UI silently
 *   3. If fetch fails → keep showing cached data; no error screen for returning users
 *
 * COMPLETION FLOW
 *   1. Update UI optimistically (zero wait)
 *   2. Write to localStorage queue (synchronous, survives offline)
 *   3. If online: send /api/complete immediately; dequeue on success
 *   4. If offline: item stays queued; NetworkBanner shows pending count
 *   5. On reconnect: useNetwork hook flushes queue → dispatches 'sync-complete'
 *      → TodayClient reloads fresh data silently
 *
 * PERFORMANCE
 *   • applyLocalPending is synchronous (localStorage read, not IDB)
 *   • optimisticToggle is a pure function — no async, no state diffing
 *   • HabitRow memo + custom comparator — O(1) re-renders per toggle
 *   • load() useCallback has [] deps — never recreated across renders
 *   • No IDB imports anywhere in this file
 */

import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Onboarding      from '../../components/Onboarding';
import LoadingDashboard from '../../components/LoadingDashboard';
import SettingsPanel   from '../../components/SettingsPanel';
import { getOrCreateUserId } from '../../lib/client-user';
import {
  getCache, setCache, clearCache,
  getQueueForDate, enqueue, dequeue,
} from '../../lib/local-store';

// ── Date helpers ───────────────────────────────────────────────────────────────

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

// ── Module-level pure helpers (no component closure) ──────────────────────────

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

/**
 * Overlay pending localStorage queue items on top of a dashboard snapshot.
 * Pure + synchronous — safe to call on every render path.
 */
function applyLocalPending(snapshot, date) {
  const pending = getQueueForDate(date); // sync localStorage read
  if (!pending.length) return snapshot;

  let completions = [...snapshot.completions];
  for (const item of pending) {
    if (item.completed) {
      if (!completions.some(c => c.habitId === item.habitId))
        completions.push({ id: -Date.now(), habitId: item.habitId, date });
    } else {
      completions = completions.filter(c => c.habitId !== item.habitId);
    }
  }
  return { ...snapshot, completions };
}

/**
 * Apply one optimistic toggle to a state snapshot.
 * Pure function — returns a new object, never mutates.
 */
function optimisticToggle(prev, habitId, date, willComplete) {
  const newC = willComplete
    ? [...prev.completions, { id: -Date.now(), habitId, date }]
    : prev.completions.filter(c => c.habitId !== habitId);

  let newCal = prev.calendar;
  if (newCal) {
    const cnt = newC.filter(c => c.date === date).length;
    newCal = {
      ...newCal,
      days: newCal.days.map(d =>
        d.date === date
          ? { ...d, completed: cnt, full: prev.habits.length > 0 && cnt === prev.habits.length }
          : d
      ),
    };
  }
  return { ...prev, completions: newC, calendar: newCal };
}

// ── Memoized HabitRow — only re-renders the toggled row ───────────────────────

const HabitRow = memo(function HabitRow({ habit, done, isPending, isGlowing, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(habit.id)}
      disabled={isPending}
      className={[
        'w-full flex items-center justify-between rounded-2xl p-5 text-left',
        'shadow-card border transition-[border-color,background-color] duration-150',
        'focus:outline-none focus:ring-2 focus:ring-[#22c55e]/50',
        'focus:ring-offset-2 focus:ring-offset-[#0f172a]',
        'active:scale-[0.99] disabled:cursor-wait',
        done ? 'bg-[#1e293b] border-[#22c55e]/30' : 'bg-[#1e293b] border-white/5 hover:border-white/10',
        isGlowing ? 'animate-habit-glow' : '',
      ].join(' ')}
    >
      <span className={`text-[1rem] font-semibold transition-colors duration-150 ${done ? 'text-[#22c55e]' : 'text-slate-100'}`}>
        {habit.name}
      </span>
      <span className={[
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2',
        'transition-[border-color,background-color] duration-150',
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

// ── Component ──────────────────────────────────────────────────────────────────

export default function TodayClient({ initialDate }) {
  const router   = useRouter();
  const todayKey = useMemo(() => getTodayKey(), []);
  const initDate = useMemo(() => clamp(initialDate || todayKey, todayKey), [initialDate, todayKey]);

  // Onboarding — SSR-safe (default true to match server; effect sets real value)
  const [onboardingDone, setOnboardingDone] = useState(true);
  useEffect(() => { setOnboardingDone(!!localStorage.getItem('onboardingComplete')); }, []);

  const [selectedDate, setSelectedDate]     = useState(initDate);
  const [dashboardState, setDashboardState] = useState(EMPTY_STATE);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError]                   = useState(null);
  const [greeting, setGreeting]             = useState('');
  const [glowingId, setGlowingId]           = useState(null);
  const [pendingIds, setPendingIds]         = useState(new Set());
  const [showSettings, setShowSettings]     = useState(false);

  // Stable ref so toggleHabit never closes over stale completedIds
  const completedIdsRef = useRef(new Set());

  useEffect(() => { setSelectedDate(initDate); }, [initDate]);

  useEffect(() => {
    const msgs = ['Howdy!', 'Hola!', "Let's win today.", 'Stay disciplined.',
      'One step at a time.', 'Make today count.', 'Show up. Every day.', 'Build the habit.'];
    setGreeting(msgs[Math.floor(Math.random() * msgs.length)]);
  }, []);

  // ── Load dashboard ─────────────────────────────────────────────────────────
  // Deps: [] — uses only module-level helpers, never recreated across renders.
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

      // L1 write is synchronous; L2 (localStorage) write is debounced + rIC
      setCache(date, data);
      setDashboardState(applyLocalPending(normalizeDash(data), date));
      setInitialLoading(false);

    } catch {
      // Offline or server error — fall back to whatever cache we have
      const cached = getCache(date);
      if (cached) {
        setDashboardState(applyLocalPending(normalizeDash(cached), date));
        setInitialLoading(false);
      } else if (showLoader) {
        setError('No cached data. Connect to load your habits.');
        setInitialLoading(false);
      }
    }
  }, []); // stable — module-level helpers only

  // ── Startup: instant cache render → silent background refresh ──────────────
  useEffect(() => {
    const cached = getCache(selectedDate);
    if (cached) {
      // Show real UI immediately from cache
      setDashboardState(applyLocalPending(normalizeDash(cached), selectedDate));
      setInitialLoading(false);
      load(selectedDate, false); // background refresh — updates silently
    } else {
      load(selectedDate, true);  // first visit — show animated skeleton
    }
  }, [selectedDate, load]);

  // ── Reload after offline queue flush ───────────────────────────────────────
  useEffect(() => {
    const handler = () => load(selectedDate, false);
    window.addEventListener('sync-complete', handler);
    return () => window.removeEventListener('sync-complete', handler);
  }, [selectedDate, load]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const { habits, completions, stats } = dashboardState;
  const completedIds   = useMemo(() => new Set(completions.map(c => c.habitId)), [completions]);
  completedIdsRef.current = completedIds; // keep ref in sync (stable toggle callback)

  const completedCount  = completions.length;
  const totalHabits     = habits.length;
  const progressPercent = totalHabits ? (completedCount / totalHabits) * 100 : 0;

  // ── toggleHabit ────────────────────────────────────────────────────────────
  const toggleHabit = useCallback(async (habitId) => {
    if (pendingIds.has(habitId)) return;
    setPendingIds(s => new Set(s).add(habitId));

    const userId  = getOrCreateUserId();
    const release = () => setPendingIds(s => { const n = new Set(s); n.delete(habitId); return n; });
    if (!userId) { release(); return; }

    const willComplete = !completedIdsRef.current.has(habitId);

    // ① Optimistic UI — instant, no wait
    setDashboardState(prev => optimisticToggle(prev, habitId, selectedDate, willComplete));
    if (willComplete) { setGlowingId(habitId); setTimeout(() => setGlowingId(null), 700); }

    // ② Persist to localStorage queue — synchronous, survives network failure
    const queueId = enqueue({ habitId, date: selectedDate, completed: willComplete, userId });

    // ③ Offline — queue will flush automatically when network returns
    if (!navigator.onLine) { release(); return; }

    // ④ Online — fire API immediately
    try {
      const res = await fetch('/api/complete', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
        body:    JSON.stringify({ habitId, date: selectedDate, completed: willComplete }),
      });

      if (res.ok) {
        const data = await res.json();
        dequeue(queueId); // sent — remove from queue
        // Patch only completions + stats (no full reload)
        setDashboardState(prev => ({
          ...prev,
          completions: data.completions ?? prev.completions,
          stats:       data.stats       ?? prev.stats,
        }));
      } else {
        // Server rejected — revert optimistic UI with a silent reload
        load(selectedDate, false);
      }
    } catch {
      // Network failed mid-request — item stays queued; optimistic UI stays
    } finally {
      release();
    }
  }, [selectedDate, load]);

  // ── Settings ───────────────────────────────────────────────────────────────
  const handleHabitsChanged = useCallback(() => {
    clearCache(selectedDate); // bust cache; panel stays open for more changes
  }, [selectedDate]);

  const handleSettingsClose = useCallback(() => {
    setShowSettings(false);
    load(selectedDate, false); // reload after all habit changes are done
  }, [selectedDate, load]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const navigateTo = useCallback((k) => {
    setSelectedDate(k);
    if (k === todayKey) router.replace('/today');
    else router.replace(`/today?date=${k}`);
  }, [router, todayKey]);

  const goPrev = () => navigateTo(shiftDate(selectedDate, -1));
  const goNext = () => {
    if (selectedDate !== todayKey) navigateTo(clamp(shiftDate(selectedDate, 1), todayKey));
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!onboardingDone) return <Onboarding onComplete={() => setOnboardingDone(true)} />;
  if (initialLoading)  return <LoadingDashboard />;

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

      {showSettings && (
        <SettingsPanel
          onClose={handleSettingsClose}
          onHabitsChanged={handleHabitsChanged}
        />
      )}

      {/* Header */}
      <section className="relative text-center mb-8">
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          className="absolute right-0 top-0.5 p-1 text-slate-500 hover:text-slate-300 active:scale-90 transition-[transform,color]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
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

      {/* Date nav + progress bar + habits */}
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
