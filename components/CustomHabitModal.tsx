'use client';

/**
 * CustomHabitModal.tsx
 *
 * Spring-animated bottom-sheet modal for adding a custom habit name.
 * Used by both HabitSelection (onboarding) and SettingsPanel.
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  onAdd:   (name: string) => void;
  onClose: () => void;
}

export default function CustomHabitModal({ onAdd, onClose }: Props) {
  const [value, setValue]   = useState('');
  const [shake, setShake]   = useState(false);
  const inputRef            = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Slight delay so the sheet animation completes before autofocus
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  // Close on backdrop tap
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleAdd = () => {
    const trimmed = value.trim();
    if (!trimmed) { setShake(true); setTimeout(() => setShake(false), 400); return; }
    onAdd(trimmed);
    onClose();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter')  handleAdd();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-[2px]"
      style={{ animation: 'fade-in 0.18s ease-out both' }}
      onClick={handleBackdrop}
    >
      <div
        className="w-full max-w-[420px] rounded-t-3xl bg-[#1e293b] border-t border-white/10 p-6 pb-10"
        style={{ animation: 'sheet-up 0.28s cubic-bezier(0.34,1.4,0.64,1) both' }}
      >
        <div className="w-10 h-1 rounded-full bg-slate-600 mx-auto mb-6" />

        <h2 className="text-lg font-bold text-slate-100 mb-4">Add your habit</h2>

        <input
          ref={inputRef}
          type="text"
          maxLength={40}
          placeholder="e.g. Read 30 minutes"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          className={[
            'w-full rounded-xl bg-[#0f172a] border px-4 py-3 text-slate-100',
            'placeholder-slate-500 outline-none',
            'focus:border-[#22c55e] border-white/10 transition-colors text-sm',
            shake ? 'animate-shake' : '',
          ].join(' ')}
        />
        <p className="text-right text-[10px] text-slate-500 mt-1">{value.length}/40</p>

        <div className="flex gap-3 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl py-3 bg-slate-700/50 text-slate-300 font-semibold text-sm active:scale-[0.97] transition-transform"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!value.trim()}
            className="flex-1 rounded-xl py-3 font-bold text-sm text-[#0f172a] active:scale-[0.97] transition-transform disabled:opacity-40"
            style={{ backgroundColor: '#22c55e' }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
