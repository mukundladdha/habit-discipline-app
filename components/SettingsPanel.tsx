'use client';

/**
 * SettingsPanel.tsx
 *
 * Bottom-sheet panel accessible via the gear icon on the Today tab.
 * Lets the user view, add, toggle (re-activate), and remove habits.
 *
 * - Fetches all habits (active + inactive) from GET /api/habits
 * - Add new habit via CustomHabitModal → POST /api/habits/update { action:'add' }
 * - Toggle active/inactive         → POST /api/habits/update { action:'toggle' }
 * - Remove (soft-delete)           → POST /api/habits/update { action:'remove' }
 * - On any change: calls onHabitsChanged() so TodayClient can clear cache + reload
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { getOrCreateUserId } from '../lib/client-user';
import CustomHabitModal from './CustomHabitModal';

interface Habit {
  id:       number;
  name:     string;
  isActive: boolean;
}

interface Props {
  onClose:          () => void;
  onHabitsChanged:  () => void;
}

export default function SettingsPanel({ onClose, onHabitsChanged }: Props) {
  const [habits, setHabits]         = useState<Habit[]>([]);
  const [loadingHabits, setLoading] = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [busy, setBusy]             = useState<number | null>(null);  // habitId being mutated
  const [error, setError]           = useState('');
  const panelRef                    = useRef<HTMLDivElement>(null);
  // Track whether any habit was changed so we only signal parent on close
  const dirtyRef                    = useRef(false);

  const userId = useMemo(() => getOrCreateUserId(), []);

  const fetchHabits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/habits', { headers: { 'X-User-Id': userId } });
      if (!res.ok) throw new Error('fetch');
      const data = await res.json();
      setHabits(data.habits ?? []);
    } catch {
      setError('Failed to load habits.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchHabits(); }, [fetchHabits]);

  // Close on backdrop click or X button — onClose already handles reload
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const mutate = async (body: object) => {
    setError('');
    try {
      const res = await fetch('/api/habits/update', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error'); return false; }
      setHabits(data.habits ?? []);
      // Mark dirty — parent will be notified when panel is dismissed, not right now.
      // This prevents the panel from closing mid-interaction.
      dirtyRef.current = true;
      onHabitsChanged(); // just busts cache; does NOT close the panel
      return true;
    } catch {
      setError('Network error. Try again.');
      return false;
    }
  };

  const handleToggle = async (h: Habit) => {
    setBusy(h.id);
    await mutate({ action: 'toggle', habitId: h.id });
    setBusy(null);
  };

  const handleRemove = async (h: Habit) => {
    setBusy(h.id);
    await mutate({ action: 'remove', habitId: h.id });
    setBusy(null);
  };

  const handleAdd = async (name: string) => {
    await mutate({ action: 'add', name });
  };

  const active   = habits.filter((h) => h.isActive);
  const inactive = habits.filter((h) => !h.isActive);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-[2px]"
      style={{ animation: 'fade-in 0.18s ease-out both' }}
      onClick={handleBackdrop}
    >
      <div
        ref={panelRef}
        className="w-full max-w-[420px] rounded-t-3xl bg-[#1e293b] border-t border-white/10 flex flex-col"
        style={{
          maxHeight:  '80vh',
          animation:  'sheet-up 0.3s cubic-bezier(0.34,1.2,0.64,1) both',
        }}
      >
        {/* Handle + header */}
        <div className="flex-shrink-0 px-5 pt-4 pb-3">
          <div className="w-10 h-1 rounded-full bg-slate-600 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-100">Manage Habits</h2>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-slate-700/60 flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {loadingHabits ? (
            <div className="py-8 text-center text-[#94a3b8] text-sm">Loading habits…</div>
          ) : (
            <>
              {error && (
                <p className="text-red-400 text-xs text-center mb-3">{error}</p>
              )}

              {/* Active habits */}
              {active.length > 0 && (
                <div className="mb-4">
                  <p className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-2">
                    Active · {active.length}
                  </p>
                  <div className="space-y-2">
                    {active.map((h) => (
                      <HabitRow
                        key={h.id}
                        habit={h}
                        busy={busy === h.id}
                        onToggle={handleToggle}
                        onRemove={handleRemove}
                      />
                    ))}
                  </div>
                </div>
              )}

              {active.length === 0 && !loadingHabits && (
                <p className="text-[#94a3b8] text-sm text-center py-4">
                  No active habits. Add one below!
                </p>
              )}

              {/* Inactive habits */}
              {inactive.length > 0 && (
                <div className="mb-4">
                  <p className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-2 mt-4">
                    Paused · {inactive.length}
                  </p>
                  <div className="space-y-2">
                    {inactive.map((h) => (
                      <HabitRow
                        key={h.id}
                        habit={h}
                        busy={busy === h.id}
                        onToggle={handleToggle}
                        onRemove={handleRemove}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Add habit button */}
              <button
                type="button"
                onClick={() => setShowModal(true)}
                disabled={active.length >= 10}
                className={[
                  'w-full mt-2 py-3.5 rounded-xl border-2 border-dashed',
                  'text-sm font-semibold transition-all active:scale-[0.98]',
                  active.length >= 10
                    ? 'border-slate-700 text-slate-600 cursor-not-allowed'
                    : 'border-[#22c55e]/40 text-[#22c55e] hover:border-[#22c55e]/70',
                ].join(' ')}
              >
                + Add new habit
                {active.length >= 10 && <span className="text-xs ml-1">(max 10)</span>}
              </button>
            </>
          )}
        </div>
      </div>

      {showModal && (
        <CustomHabitModal
          onAdd={handleAdd}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ─── Internal row component ────────────────────────────────────────────────────

interface RowProps {
  habit:    Habit;
  busy:     boolean;
  onToggle: (h: Habit) => void;
  onRemove: (h: Habit) => void;
}

function HabitRow({ habit, busy, onToggle, onRemove }: RowProps) {
  return (
    <div className={[
      'flex items-center justify-between rounded-xl px-4 py-3.5',
      'bg-[#0f172a] border border-white/5',
      habit.isActive ? '' : 'opacity-60',
    ].join(' ')}>
      <span className={`text-sm font-medium ${habit.isActive ? 'text-slate-200' : 'text-slate-400 line-through'}`}>
        {habit.name}
      </span>
      <div className="flex items-center gap-2">
        {/* Toggle active/pause */}
        <button
          type="button"
          onClick={() => onToggle(habit)}
          disabled={busy}
          title={habit.isActive ? 'Pause habit' : 'Resume habit'}
          className="h-7 w-7 rounded-lg flex items-center justify-center transition-all active:scale-90 disabled:opacity-40"
          style={{ backgroundColor: habit.isActive ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.15)' }}
        >
          {busy ? (
            <span className="text-xs text-slate-400">…</span>
          ) : habit.isActive ? (
            <span className="text-xs text-[#22c55e]">⏸</span>
          ) : (
            <span className="text-xs text-[#94a3b8]">▶</span>
          )}
        </button>
        {/* Remove */}
        <button
          type="button"
          onClick={() => onRemove(habit)}
          disabled={busy}
          title="Remove habit"
          className="h-7 w-7 rounded-lg flex items-center justify-center bg-red-500/10 transition-all active:scale-90 disabled:opacity-40"
        >
          <span className="text-xs text-red-400">✕</span>
        </button>
      </div>
    </div>
  );
}
