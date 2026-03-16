'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Onboarding from '../../components/Onboarding';
import { getOrCreateUserId } from '../../lib/client-user';

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

export default function TodayClient({ initialDate }) {
  const router = useRouter();
  const todayKey = getTodayKey();

  const normalizedInitialDate = useMemo(
    () => clampToToday(initialDate || todayKey, todayKey),
    [initialDate, todayKey]
  );

  const [onboardingDone, setOnboardingDone] = useState(true);
  useEffect(() => {
    setOnboardingDone(!!localStorage.getItem('onboardingComplete'));
  }, []);

  const [selectedDate, setSelectedDate] = useState(normalizedInitialDate);
  const [habits, setHabits] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [greeting, setGreeting] = useState('');
  const [glowingId, setGlowingId] = useState(null);

  useEffect(() => {
    setSelectedDate(normalizedInitialDate);
  }, [normalizedInitialDate]);

  const completedIds = new Set(completions.map((c) => c.habitId));
  const completedCount = completions.length;
  const totalHabits = habits.length;
  const progressPercent = totalHabits ? (completedCount / totalHabits) * 100 : 0;

  const load = useCallback(async (date) => {
    const userId = getOrCreateUserId();
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard?date=${date}`, {
        headers: { 'X-User-Id': userId },
      });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setHabits(data.habits ?? []);
      setCompletions(data.completions ?? []);
      setStreak(data.streak ?? 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(selectedDate);
  }, [load, selectedDate]);

  useEffect(() => {
    const greetings = [
      'Howdy!', 'Hola!', "Let's win today.", 'Stay disciplined.',
      'One step at a time.', 'Make today count.', 'Show up. Every day.', 'Build the habit.',
    ];
    setGreeting(greetings[Math.floor(Math.random() * greetings.length)]);
  }, []);

  const toggleHabit = useCallback(
    async (habitId) => {
      const userId = getOrCreateUserId();
      if (!userId) return;

      const willComplete = !completedIds.has(habitId);

      // Optimistic update
      setCompletions((prev) =>
        willComplete
          ? [...prev, { habitId, id: -1, date: selectedDate }]
          : prev.filter((c) => c.habitId !== habitId)
      );
      if (willComplete) {
        setGlowingId(habitId);
        setTimeout(() => setGlowingId(null), 700);
      }

      try {
        const res = await fetch('/api/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
          body: JSON.stringify({ habitId, date: selectedDate, completed: willComplete }),
        });
        if (!res.ok) { load(selectedDate); return; }
        const data = await res.json();
        setCompletions(data.completions ?? []);
        setStreak(data.streak ?? 0);
      } catch {
        load(selectedDate);
      }
    },
    [selectedDate, completedIds, load]
  );

  const navigateToDate = (dateKey) => {
    setSelectedDate(dateKey);
    if (dateKey === todayKey) router.replace('/today');
    else router.replace(`/today?date=${dateKey}`);
  };

  const goPrevDay = () => navigateToDate(shiftDateKey(selectedDate, -1));
  const goNextDay = () => {
    if (selectedDate === todayKey) return;
    navigateToDate(clampToToday(shiftDateKey(selectedDate, 1), todayKey));
  };

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
        <p className="text-red-400 font-medium mb-4">{error}</p>
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

  return (
    <main className="min-h-screen mx-auto max-w-[420px] px-5 py-8 pb-24 bg-[#0f172a]">
      <section className="text-center mb-8">
        {greeting && (
          <p className="text-[#94a3b8] text-sm font-semibold tracking-wide uppercase mb-2">
            {greeting}
          </p>
        )}
        <p className="text-3xl font-bold tracking-tight text-slate-100">
          🔥 <span className="text-[#22c55e]">{streak}</span> Day Streak
        </p>
        {selectedDate === todayKey && (
          <p className="text-[#94a3b8] text-sm mt-2">
            Day {Math.min(Math.max(streak, 1), 21)} / 21 &middot; Complete today&apos;s disciplines.
          </p>
        )}
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-5">
          <button type="button" onClick={goPrevDay} className="h-10 w-10 rounded-2xl bg-[#1e293b] border border-white/8 text-slate-300 flex items-center justify-center active:scale-[0.96] transition-transform" aria-label="Previous day">
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
          <button type="button" onClick={goNextDay} disabled={selectedDate === todayKey} className="h-10 w-10 rounded-2xl bg-[#1e293b] border border-white/8 text-slate-300 flex items-center justify-center active:scale-[0.96] transition-transform disabled:opacity-30 disabled:active:scale-100" aria-label="Next day">
            <span className="text-xl leading-none">›</span>
          </button>
        </div>

        <div className="rounded-2xl bg-[#1e293b] border border-white/5 shadow-card p-5 mb-4">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-[#94a3b8] text-sm font-medium">{completedCount} / {totalHabits} completed</p>
            <p className="text-[#22c55e] font-bold tabular-nums text-sm">{totalHabits ? Math.round(progressPercent) : 0}%</p>
          </div>
          <div className="h-3 w-full rounded-full bg-slate-700/60 overflow-hidden" role="progressbar" aria-valuenow={totalHabits ? Math.round(progressPercent) : 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill h-full rounded-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] will-change-[width]" style={{ width: `${progressPercent}%` }} />
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
            <button
              key={habit.id}
              type="button"
              onClick={() => toggleHabit(habit.id)}
              className={`w-full flex items-center justify-between rounded-2xl p-5 text-left shadow-card border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#22c55e]/50 focus:ring-offset-2 focus:ring-offset-[#0f172a] active:scale-[0.99] ${
                completedIds.has(habit.id) ? 'bg-[#1e293b] border-[#22c55e]/30' : 'bg-[#1e293b] border-white/5 hover:border-white/10'
              } ${glowingId === habit.id ? 'animate-habit-glow' : ''}`}
            >
              <span className={`text-[1rem] font-semibold transition-colors ${completedIds.has(habit.id) ? 'text-[#22c55e]' : 'text-slate-100'}`}>
                {habit.name}
              </span>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200 ease-out ${completedIds.has(habit.id) ? 'bg-[#22c55e] border-[#22c55e] text-white' : 'border-slate-600 bg-transparent'}`}>
                {completedIds.has(habit.id) ? (
                  <svg className="h-3.5 w-3.5 animate-check-pop" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : <span className="sr-only">Not done</span>}
              </span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
