'use client';

import { useState, useRef } from 'react';
import HabitSparkAnimation from './HabitSparkAnimation';

const MILESTONES = [
  { label: 'Day 1', pct: 0 },
  { label: 'Day 7', pct: 33 },
  { label: 'Day 14', pct: 66 },
  { label: 'Day 21 🔥', pct: 100 },
];

const HABITS = [
  { icon: '🏋️', label: 'Workout' },
  { icon: '👟', label: 'Steps' },
  { icon: '🚫', label: 'No Sugar' },
  { icon: '🌙', label: 'Sleep' },
];

interface Props {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: Props) {
  const [screen, setScreen] = useState(0);
  const touchStartX = useRef(0);

  const advance = () => {
    if (screen < 2) {
      setScreen((s) => s + 1);
    } else {
      localStorage.setItem('onboardingComplete', '1');
      window.dispatchEvent(new Event('onboardingComplete'));
      onComplete();
    }
  };

  const buttonLabel =
    screen === 0
      ? 'Start My 21-Day Streak'
      : screen === 1
        ? "Let's Start"
        : 'Start Day 1';

  return (
    <div
      className="fixed inset-0 bg-[#0f172a] z-50 flex flex-col select-none"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const diff = touchStartX.current - e.changedTouches[0].clientX;
        if (diff > 50) advance();
      }}
    >
      {/* Progress dots */}
      <div className="flex justify-center gap-2 pt-14">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-1.5 rounded-full transition-all duration-400"
            style={{
              width: i === screen ? '24px' : '6px',
              backgroundColor: i === screen ? '#22c55e' : '#1e3a5f',
              transition: 'width 0.35s ease, background-color 0.35s ease',
            }}
          />
        ))}
      </div>

      {/* Screen content — key forces re-animation on each transition */}
      <div
        key={screen}
        className="flex-1 flex flex-col items-center justify-center px-8 text-center"
        style={{ animation: 'screen-enter 0.35s ease-out both' }}
      >
        {screen === 0 && <Screen1 />}
        {screen === 1 && <Screen2 />}
        {screen === 2 && <Screen3 />}
      </div>

      {/* CTA button */}
      <div className="px-6 pb-14 pt-4">
        <button
          type="button"
          onClick={advance}
          className="w-full py-4 rounded-2xl font-bold text-base tracking-tight active:scale-[0.97] transition-transform"
          style={{
            backgroundColor: '#22c55e',
            color: '#0f172a',
            boxShadow: '0 4px 24px rgba(34,197,94,0.35)',
          }}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

/* ─── Screen 1 — Hook (Framer Motion animation) ───────────────────────────── */
function Screen1() {
  return <HabitSparkAnimation />;
}

/* ─── Screen 2 — Habit science ────────────────────────────────────────────── */
function Screen2() {
  return (
    <>
      <h1
        className="text-[1.65rem] font-bold text-slate-100 leading-snug mb-4"
        style={{ animation: 'fade-up 0.4s ease-out both' }}
      >
        Habits form through
        <br />
        repetition
      </h1>
      <p
        className="text-[#94a3b8] text-base mb-14"
        style={{ animation: 'fade-up 0.4s 0.1s ease-out both' }}
      >
        Do something daily for 21 days
        <br />
        and it becomes automatic.
      </p>

      {/* 21-day progress track */}
      <div
        className="w-full max-w-xs"
        style={{ animation: 'fade-up 0.4s 0.2s ease-out both' }}
      >
        <div className="relative h-2 rounded-full mb-5" style={{ backgroundColor: '#1e293b' }}>
          {/* Animated fill bar */}
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: 'linear-gradient(to right, #22c55e, #16a34a)',
              animation: 'progress-grow 1.8s 0.4s ease-out both',
            }}
          />
          {/* Milestone dots */}
          {MILESTONES.map((m) => (
            <div
              key={m.pct}
              className="absolute top-1/2 w-3.5 h-3.5 rounded-full border-2"
              style={{
                borderColor: '#22c55e',
                backgroundColor: '#0f172a',
                left:
                  m.pct === 0
                    ? '0px'
                    : m.pct === 100
                      ? 'calc(100% - 14px)'
                      : `calc(${m.pct}% - 7px)`,
                transform: 'translateY(-50%)',
              }}
            />
          ))}
        </div>
        <div className="flex justify-between text-xs font-semibold" style={{ color: '#94a3b8' }}>
          {MILESTONES.map((m) => (
            <span key={m.label}>{m.label}</span>
          ))}
        </div>
      </div>
    </>
  );
}

/* ─── Screen 3 — App concept ──────────────────────────────────────────────── */
function Screen3() {
  return (
    <>
      <h1
        className="text-[1.65rem] font-bold text-slate-100 leading-snug mb-8"
        style={{ animation: 'fade-up 0.4s ease-out both' }}
      >
        Win your day with
        <br />4 disciplines
      </h1>

      <div className="grid grid-cols-2 gap-3 w-full max-w-xs mb-8">
        {HABITS.map((h, i) => (
          <div
            key={h.label}
            className="rounded-2xl p-5 flex flex-col items-center gap-2"
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid rgba(255,255,255,0.05)',
              animation: `fade-up 0.4s ${i * 0.08}s ease-out both`,
            }}
          >
            <span className="text-3xl">{h.icon}</span>
            <span className="text-sm font-semibold text-slate-200">{h.label}</span>
          </div>
        ))}
      </div>

      <p
        className="text-sm"
        style={{
          color: '#94a3b8',
          animation: 'fade-up 0.4s 0.35s ease-out both',
        }}
      >
        Complete these daily.
        <br />
        Don't break the chain.
      </p>
    </>
  );
}
