'use client';

/**
 * HabitSelection.tsx
 *
 * Onboarding screen 3 — "What do you want to become in the next 21 days?"
 *
 * - 2-column grid of preset habit cards (max 5 selectable)
 * - "10k Steps" pre-selected by default
 * - "Add your habit" opens CustomHabitModal
 * - On confirm: POST /api/habits/bulk-create → calls onComplete()
 */

import { useState } from 'react';
import { getOrCreateUserId } from '../lib/client-user';
import CustomHabitModal from './CustomHabitModal';

interface PresetHabit {
  name:       string;
  icon:       string;
  preselected?: boolean;
}

const PRESETS: PresetHabit[] = [
  { name: 'Workout everyday', icon: '🏋️' },
  { name: '10k Steps',        icon: '👟', preselected: true },
  { name: 'No sugar',         icon: '🚫' },
  { name: '7+ hours of sleep',icon: '🌙' },
  { name: 'No junk food',     icon: '🥗' },
  { name: 'Daily runs',       icon: '🏃' },
  { name: 'Daily meditation', icon: '🧘' },
];

const MAX = 5;

interface Props {
  onComplete: () => void;
}

export default function HabitSelection({ onComplete }: Props) {
  const [selected, setSelected] = useState<string[]>(() =>
    PRESETS.filter((p) => p.preselected).map((p) => p.name)
  );
  const [customs, setCustoms]       = useState<string[]>([]);
  const [showModal, setShowModal]   = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const allOptions = [
    ...PRESETS.map((p) => ({ name: p.name, icon: p.icon })),
    ...customs.map((n)  => ({ name: n, icon: '✨' })),
  ];

  const toggle = (name: string) => {
    setSelected((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= MAX)  return prev; // silently cap — button dims
      return [...prev, name];
    });
  };

  const handleAddCustom = (name: string) => {
    if (customs.includes(name) || PRESETS.some((p) => p.name === name)) return;
    setCustoms((c) => [...c, name]);
    setSelected((s) => s.length < MAX ? [...s, name] : s);
  };

  const handleConfirm = async () => {
    if (selected.length === 0) { setError('Pick at least one habit.'); return; }
    setError('');
    setLoading(true);

    const userId = getOrCreateUserId();
    const payload = selected.map((name, i) => ({ name, sortOrder: i }));

    try {
      const res = await fetch('/api/habits/bulk-create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
        body:    JSON.stringify({ habits: payload }),
      });
      if (!res.ok) throw new Error('server');
      localStorage.setItem('onboardingComplete', '1');
      window.dispatchEvent(new Event('onboardingComplete'));
      onComplete();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full">
      <h1
        className="text-[1.55rem] font-bold text-slate-100 leading-snug mb-2 text-center"
        style={{ animation: 'fade-up 0.4s ease-out both' }}
      >
        What do you want to
        <br />become in 21 days?
      </h1>
      <p
        className="text-[#94a3b8] text-sm text-center mb-5"
        style={{ animation: 'fade-up 0.4s 0.08s ease-out both' }}
      >
        Pick up to {MAX} habits
      </p>

      {/* Habit grid */}
      <div
        className="grid grid-cols-2 gap-2.5 w-full overflow-y-auto pb-2"
        style={{ animation: 'fade-up 0.4s 0.14s ease-out both' }}
      >
        {allOptions.map((opt, i) => {
          const isSelected = selected.includes(opt.name);
          const atMax      = !isSelected && selected.length >= MAX;
          return (
            <button
              key={opt.name}
              type="button"
              onClick={() => toggle(opt.name)}
              disabled={atMax}
              style={{ animationDelay: `${i * 50}ms` }}
              className={[
                'rounded-2xl p-4 flex flex-col items-center gap-2 border-2 transition-all duration-200',
                'active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed',
                isSelected
                  ? 'bg-[#22c55e]/10 border-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.2)]'
                  : 'bg-[#1e293b] border-white/5',
              ].join(' ')}
            >
              <span className="text-2xl">{opt.icon}</span>
              <span className={`text-xs font-semibold text-center leading-tight ${isSelected ? 'text-[#22c55e]' : 'text-slate-200'}`}>
                {opt.name}
              </span>
              {isSelected && (
                <span className="text-[#22c55e] text-xs font-bold">✓</span>
              )}
            </button>
          );
        })}

        {/* Add custom habit card */}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          disabled={selected.length >= MAX}
          className={[
            'rounded-2xl p-4 flex flex-col items-center gap-2 border-2 border-dashed',
            'transition-all duration-200 active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed',
            'border-slate-600 bg-transparent',
          ].join(' ')}
        >
          <span className="text-2xl">➕</span>
          <span className="text-xs font-semibold text-slate-400 text-center">Add your habit</span>
        </button>
      </div>

      {/* Selection counter */}
      <p className="text-center text-xs text-[#94a3b8] mt-3">
        {selected.length} / {MAX} selected
      </p>

      {error && (
        <p className="text-center text-red-400 text-xs mt-2">{error}</p>
      )}

      {/* Confirm button */}
      <div className="mt-4 px-0">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading || selected.length === 0}
          className="w-full py-4 rounded-2xl font-bold text-base tracking-tight active:scale-[0.97] transition-all disabled:opacity-50"
          style={{
            backgroundColor: '#22c55e',
            color: '#0f172a',
            boxShadow: '0 4px 24px rgba(34,197,94,0.35)',
          }}
        >
          {loading ? 'Starting…' : `Start Day 1 →`}
        </button>
      </div>

      {showModal && (
        <CustomHabitModal
          onAdd={handleAddCustom}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
