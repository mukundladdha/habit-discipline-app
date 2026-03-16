'use client';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Onboarding from '../../components/Onboarding';
import { getOrCreateUserId } from '../../lib/client-user';
import {
  enqueueSyncItem,
  saveDashboardCache,
  getDashboardCache,
  getAllSyncItems,
} from '../../lib/idb';

// ─── date helpers ────────────────────────────────────────────────────────────

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}
function isValidDateKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key);
}
function clampToToday(key, todayKey) {
  if (!isValidDateKey(key)) return todayKey;
  return key > todayKey ? todayKey : key;
}
function shiftDateKey(key, daysDelta) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + daysDelta);
  return d.toISOString().slice(0, 10);
}
function formatLongDate(key) {
  const d = new Date(`${key}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── initial state ────────────────────────────────────────────────────────────

const EMPTY_STATE = {
  habits:      [],
  completions: [],
  calendar:    null,
  stats:       { streak: 0, highest: 0, rate: 0, progress: 0 },
};

// ─── component ───────────────────────────────────────────────────────────────

export default function TodayClient({ initialDate }) {
  const router   = useRouter();
  const todayKey = getTodayKey();

  const normalizedInitialDate = useMemo(
    () => clampToToday(initialDate || todayKey, todayKey),
    [initialDate, todayKey]
  );

  // ── onboarding (SSR-safe) ──────────────────────────────────────────────────
  const [onboardingDone, setOnboardingDone] = useState(true);
  useEffect(() => {
    setOnboardingDone(!!localStorage.getItem('onboardingComplete'));
  }, []);

  // ── core state ─────────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate]     = useState(normalizedInitialDate);
  const [dashboardState, setDashboardState] = useState(EMPTY_STATE);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [greeting, setGreeting]             = useState('');
  const [glowingId, setGlowingId]           = useState(null);
  const [isOffline, setIsOffline]           = useState(false);

  // Double-tap guard
  const pendingHabits = useRef(new Set());

  // ── date sync ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setSelectedDate(normalizedInitialDate);
  }, [normalizedInitialDate]);

  // ── greeting ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const greetings = [
      'Howdy!', 'Hola!', "Let's win today.", 'Stay disciplined.',
      'One step at a time.', 'Make today count.', 'Show up. Every day.', 'Build the habit.',
    ];
    setGreeting(greetings[Math.floor(Math.random() * greetings.length)]);
  }, []);

  // ── network status ─────────────────────────────────────────────────────────
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const handleOnline  = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Apply any pending offline completions on top of a dashboard snapshot.
  // Called after both online loads and IDB cache reads so the UI always
  // reflects locally queued items even before they reach the server.
  // ─────────────────────────────────────────────────────────────────────────
  const applyPendingItems = useCallback(async (snapshot, date) => {
    const pending = await getAllSyncItems();
    const forDate = pending.filter((item) => item.date === date);
    if (forDate.length === 0) return snapshot;

    let completions = [...snapshot.completions];
    for (const item of forDate) {
      if (item.completed) {
        const alreadyIn = completions.some((c) => c.habitId === item.habitId);
        if (!alreadyIn) {
          completions.push({ id: -item.id, habitId: item.habitId, date });
        }
      } else {
        completions = completions.filter((c) => c.habitId !== item.habitId);
      }
    }
    return { ...snapshot, completions };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Load dashboard — tries network first, falls back to IDB cache.
  // ─────────────────────────────────────────────────────────────────────────
  const load = useCallback(async (date) => {
    const userId = getOrCreateUserId();
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/dashboard?date=${date}`, {
        headers: { 'X-User-Id': userId },
      });

      if (!res.ok) throw new Error('Server error');

      const data = await res.json();

      // Persist to IDB so we have it when offline
      await saveDashboardCache(date, data);

      // Reconcile with any offline items queued while fetching
      const reconciled = await applyPendingItems(
        {
          habits:      data.habits      ?? [],
          completions: data.completions ?? [],
          calendar:    data.calendar    ?? null,
          stats:       data.stats       ?? EMPTY_STATE.stats,
        },
        date
      );
      setDashboardState(reconciled);
      setIsOffline(false);
    } catch {
      // ── Offline fallback: try IDB cache ──────────────────────────────────
      const cached = await getDashboardCache(date);
      if (cached) {
        const reconciled = await applyPendingItems(
          {
            habits:      cached.habits      ?? [],
            completions: cached.completions ?? [],
            calendar:    cached.calendar    ?? null,
            stats:       cached.stats       ?? EMPTY_STATE.stats,
          },
          date
        );
        setDashboardState(reconciled);
        setIsOffline(true);
      } else {
        // No cache either — show error
        setError('No cached data available. Connect to load your habits.');
        setIsOffline(true);
      }
    } finally {
      setLoading(false);
    }
  }, [applyPendingItems]);

  useEffect(() => {
    load(selectedDate);
  }, [load, selectedDate]);

  // ── Reload when sync completes (online event in NetworkBanner) ─────────────
  useEffect(() => {
    const handleSyncComplete = () => load(selectedDate);
    window.addEventListener('sync-complete', handleSyncComplete);
    return () => window.removeEventListener('sync-complete', handleSyncComplete);
  }, [load, selectedDate]);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived values
  // ─────────────────────────────────────────────────────────────────────────
  const { habits, completions, stats } = dashboardState;
  const completedIds    = new Set(completions.map((c) => c.habitId));
  const completedCount  = completions.length;
  const totalHabits     = habits.length;
  const progressPercent = totalHabits ? (completedCount / totalHabits) * 100 : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Toggle a habit — works online and offline
  // ─────────────────────────────────────────────────────────────────────────
  const toggleHabit = useCallback(
    async (habitId) => {
      if (pendingHabits.current.has(habitId)) return; // double-tap guard
      pendingHabits.current.add(habitId);

      const userId = getOrCreateUserId();
      if (!userId) { pendingHabits.current.delete(habitId); return; }

      const willComplete = !completedIds.has(habitId);

      // ── Optimistic UI + calendar patch ────────────────────────────────
      setDashboardState((prev) => {
        const newCompletions = willComplete
          ? [...prev.completions, { id: -Date.now(), habitId, date: selectedDate }]
          : prev.completions.filter((c) => c.habitId !== habitId);

        let newCalendar = prev.calendar;
        if (prev.calendar) {
          const count = newCompletions.filter((c) => c.date === selectedDate).length;
          newCalendar = {
            ...prev.calendar,
            days: prev.calendar.days.map((day) =>
              day.date === selectedDate
                ? { ...day, completed: count, full: prev.habits.length > 0 && count === prev.habits.length }
                : day
            ),
          };
        }
        return { ...prev, completions: newCompletions, calendar: newCalendar };
      });

      if (willComplete) {
        setGlowingId(habitId);
        setTimeout(() => setGlowingId(null), 700);
      }

      // ── If offline: save to IDB queue, done ───────────────────────────
      if (!navigator.onLine) {
        await enqueueSyncItem({ habitId, date: selectedDate, completed: willComplete, userId });
        // Signal NetworkBanner to refresh its count
        window.dispatchEvent(new Event('offline-item-queued'));
        pendingHabits.current.delete(habitId);
        return;
      }

      // ── Online: POST to server ────────────────────────────────────────
      try {
        const res = await fetch('/api/complete', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
          body:    JSON.stringify({ habitId, date: selectedDate, completed: willComplete }),
        });

        if (!res.ok) { load(selectedDate); return; }

        const data = await res.json();
        setDashboardState((prev) => ({
          ...prev,
          completions: data.completions ?? prev.completions,
          stats:       data.stats       ?? prev.stats,
        }));
      } catch {
        // Network dropped between the check and the fetch — queue it
        await enqueueSyncItem({ habitId, date: selectedDate, completed: willComplete, userId });
        window.dispatchEvent(new Event('offline-item-queued'));
      } finally {
        pendingHabits.current.delete(habitId);
      }
    },
    [selectedDate, completedIds, load]
  );

  // ─── date navigation ──────────────────────────────────────────────────────
  const navigateToDate = useCallback((dateKey) => {
    setSelectedDate(dateKey);
    if (dateKey === todayKey) router.replace('/today');
    else router.replace(`/today?date=${dateKey}`);
  }, [router, todayKey]);

  const goPrevDay = () => navigateToDate(shiftDateKey(selectedDate, -1));
  const goNextDay = () => {
    if (selectedDate === todayKey) return;
    navigateToDate(clampToToday(shiftDateKey(selectedDate, 1), todayKey));
  };

  // ─── early returns ────────────────────────────────────────────────────────
  if (!onboardingDone) {
    return <Onboarding onComplete={() => setOnboardingDone(true)} />;
  }

  if (loading && habits.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0f172a] pb-20">
        <p className="text-[#94a3b8] font-medium">Loading…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[#0f172a] px-5 pb-20">
        <p className="text-4xl mb-4">📡</p>
        <p className="text-slate-300 font-semibold mb-2">You're offline</p>
        <p className="text-[#94a3b8] text-sm text-center mb-6">{error}</p>
        <button
          type="button"
          onClick={() => load(selectedDate)}
          className="rounded-xl bg-[#1e293b] text-slate-100 px-4 py-2 font-medium border border-white/10"
        >
          Retry
        </button>
      </main>
    );
  }

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen mx-auto max-w-[420px] px-5 py-8 pb-24 bg-[#0f172a]">

      {/* ── Header: greeting + streak ── */}
      <section className="text-center mb-8">
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
            Day {Math.min(Math.max(stats.progress, 1), 21)} / 21 &middot; Complete today&apos;s disciplines.
          </p>
        )}
      </section>

      {/* ── Date navigator + progress + habit list ── */}
      <section className="mb-8">

        {/* Date row */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <button
            type="button"
            onClick={goPrevDay}
            className="h-10 w-10 rounded-2xl bg-[#1e293b] border border-white/8 text-slate-300 flex items-center justify-center active:scale-[0.96] transition-transform"
            aria-label="Previous day"
          >
            <span className="text-xl leading-none">‹</span>
          </button>
          <div className="text-center">
            <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">
              {selectedDate === todayKey ? 'Today' : 'Past day'}
            </p>
            <h1 className="text-base font-bold text-slate-100 tracking-tight mt-0.5">
              {formatLongDate(selectedDate)}
            </h1>
          </div>
          <button
            type="button"
            onClick={goNextDay}
            disabled={selectedDate === todayKey}
            className="h-10 w-10 rounded-2xl bg-[#1e293b] border border-white/8 text-slate-300 flex items-center justify-center active:scale-[0.96] transition-transform disabled:opacity-30 disabled:active:scale-100"
            aria-label="Next day"
          >
            <span className="text-xl leading-none">›</span>
          </button>
        </div>

        {/* Progress bar */}
        <div className="rounded-2xl bg-[#1e293b] border border-white/5 shadow-card p-5 mb-4">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-[#94a3b8] text-sm font-medium">
              {completedCount} / {totalHabits} completed
            </p>
            <p className="text-[#22c55e] font-bold tabular-nums text-sm">
              {totalHabits ? Math.round(progressPercent) : 0}%
            </p>
          </div>
          <div
            className="h-3 w-full rounded-full bg-slate-700/60 overflow-hidden"
            role="progressbar"
            aria-valuenow={totalHabits ? Math.round(progressPercent) : 0}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="progress-fill h-full rounded-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] will-change-[width]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Perfect day banner */}
        {completedCount === totalHabits && totalHabits > 0 && (
          <div className="mb-4 rounded-2xl bg-gradient-to-br from-[#22c55e] to-[#16a34a] p-5 text-center shadow-card animate-bounce-subtle">
            <p className="text-2xl font-bold text-white mb-0.5">🎉 Perfect Day!</p>
            <p className="text-green-50 text-sm font-medium">All habits locked in</p>
          </div>
        )}

        {/* Habit list */}
        <div className="space-y-3">
          {habits.map((habit) => {
            const done    = completedIds.has(habit.id);
            const pending = pendingHabits.current.has(habit.id);
            return (
              <button
                key={habit.id}
                type="button"
                onClick={() => toggleHabit(habit.id)}
                disabled={pending}
                className={`w-full flex items-center justify-between rounded-2xl p-5 text-left shadow-card border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#22c55e]/50 focus:ring-offset-2 focus:ring-offset-[#0f172a] active:scale-[0.99] disabled:cursor-wait ${
                  done ? 'bg-[#1e293b] border-[#22c55e]/30' : 'bg-[#1e293b] border-white/5 hover:border-white/10'
                } ${glowingId === habit.id ? 'animate-habit-glow' : ''}`}
              >
                <span className={`text-[1rem] font-semibold transition-colors ${done ? 'text-[#22c55e]' : 'text-slate-100'}`}>
                  {habit.name}
                </span>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200 ease-out ${done ? 'bg-[#22c55e] border-[#22c55e] text-white' : 'border-slate-600 bg-transparent'}`}>
                  {done ? (
                    <svg className="h-3.5 w-3.5 animate-check-pop" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="sr-only">Not done</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
