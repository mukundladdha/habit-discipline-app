'use client';

/**
 * Onboarding.tsx
 *
 * 3-screen onboarding flow:
 *   Screen 0 — Hook animation (HabitSparkAnimation)
 *   Screen 1 — Science (21-day habit formation)
 *   Screen 2 — Habit selection (HabitSelection → calls API + sets onboardingComplete)
 *
 * Screen 2 manages its own CTA (the "Start Day 1" button lives inside
 * HabitSelection), so we hide the shared bottom button on screen 2.
 */

import { useState, useRef } from 'react';
import HabitSparkAnimation from './HabitSparkAnimation';
import HabitSelection from './HabitSelection';

const MILESTONES = [
  { label: 'Day 1',     pct: 0   },
  { label: 'Day 7',     pct: 33  },
  { label: 'Day 14',    pct: 66  },
  { label: 'Day 21 🔥', pct: 100 },
];

interface Props {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: Props) {
  const [screen, setScreen] = useState(0);
  const touchStartX         = useRef(0);

  const advance = () => {
    if (screen < 1) setScreen((s) => s + 1);
    // Screen 2 (HabitSelection) handles its own completion via onComplete prop
  };

  const buttonLabel = screen === 0 ? 'Start My 21-Day Streak' : "Let's Start";

  return (
    <div
      className="fixed inset-0 bg-[#0f172a] z-50 flex flex-col select-none"
      onTouchStart={(e)  => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e)    => { if (touchStartX.current - e.changedTouches[0].clientX > 50) advance(); }}
    >
      {/* Progress dots */}
      <div className="flex justify-center gap-2 pt-14">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-1.5 rounded-full transition-all duration-400"
            style={{
              width:           i === screen ? '24px' : '6px',
              backgroundColor: i === screen ? '#22c55e' : '#1e3a5f',
              transition:      'width 0.35s ease, background-color 0.35s ease',
            }}
          />
        ))}
      </div>

      {/* Screen content — key forces re-animation on each transition */}
      <div
        key={screen}
        className={[
          'flex-1 flex flex-col items-center px-6 text-center overflow-hidden',
          screen === 2 ? 'justify-start pt-6' : 'justify-center',
        ].join(' ')}
        style={{ animation: 'screen-enter 0.35s ease-out both' }}
      >
        {screen === 0 && <Screen1 />}
        {screen === 1 && <Screen2 />}
        {screen === 2 && <HabitSelection onComplete={onComplete} />}
      </div>

      {/* Shared CTA button — hidden on screen 2 (HabitSelection has its own) */}
      {screen < 2 && (
        <div className="px-6 pb-14 pt-4">
          <button
            type="button"
            onClick={advance}
            className="w-full py-4 rounded-2xl font-bold text-base tracking-tight active:scale-[0.97] transition-transform"
            style={{
              backgroundColor: '#22c55e',
              color:           '#0f172a',
              boxShadow:       '0 4px 24px rgba(34,197,94,0.35)',
            }}
          >
            {buttonLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Screen 1 — Hook ─────────────────────────────────────────────────────── */
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
        <br />repetition
      </h1>
      <p
        className="text-[#94a3b8] text-base mb-14"
        style={{ animation: 'fade-up 0.4s 0.1s ease-out both' }}
      >
        Do something daily for 21 days
        <br />and it becomes automatic.
      </p>

      {/* 21-day progress track */}
      <div
        className="w-full max-w-xs"
        style={{ animation: 'fade-up 0.4s 0.2s ease-out both' }}
      >
        <div className="relative h-2 rounded-full mb-5" style={{ backgroundColor: '#1e293b' }}>
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: 'linear-gradient(to right, #22c55e, #16a34a)',
              animation:  'progress-grow 1.8s 0.4s ease-out both',
            }}
          />
          {MILESTONES.map((m) => (
            <div
              key={m.pct}
              className="absolute top-1/2 w-3.5 h-3.5 rounded-full border-2"
              style={{
                borderColor:     '#22c55e',
                backgroundColor: '#0f172a',
                left:
                  m.pct === 0   ? '0px'
                  : m.pct === 100 ? 'calc(100% - 14px)'
                  :                 `calc(${m.pct}% - 7px)`,
                transform: 'translateY(-50%)',
              }}
            />
          ))}
        </div>
        <div className="flex justify-between text-xs font-semibold" style={{ color: '#94a3b8' }}>
          {MILESTONES.map((m) => <span key={m.label}>{m.label}</span>)}
        </div>
      </div>
    </>
  );
}
