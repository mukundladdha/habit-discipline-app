/**
 * Pure stat computation functions.
 * All functions are stateless and side-effect-free.
 *
 * Input shape for history functions (from Prisma groupBy):
 *   groups: Array<{ date: string; _count: { date: number } }>
 *
 * Input shape for computePerHabitDetailed (from Prisma findMany):
 *   completionRecords: Array<{ habitId: number; date: string }>
 */

/** Build a date→completionCount lookup from groupBy results. O(n) */
function toCountMap(groups) {
  const map = {};
  for (const g of groups) map[g.date] = g._count.date;
  return map;
}

/**
 * Current streak.
 * Rules:
 *  - Today counts if ALL habits are done.
 *  - If today is incomplete, streak continues from yesterday (don't penalise
 *    mid-day use).
 *  - Resets to 0 if any day in the run has fewer than habitCount completions.
 */
export function computeCurrentStreak(groups, habitCount) {
  if (habitCount === 0) return 0;
  const counts = toCountMap(groups);

  const cursor = new Date();
  const todayKey = cursor.toISOString().slice(0, 10);

  // Skip today when it's not yet fully done (streak runs through yesterday)
  if ((counts[todayKey] || 0) < habitCount) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  for (let i = 0; i < 366; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if ((counts[key] || 0) === habitCount) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Number of fully-completed days in the last 21 calendar days (including today).
 * Used for the "Day X / 21" progress indicator.
 */
export function computeProgress21(groups, habitCount) {
  if (habitCount === 0) return 0;
  const counts = toCountMap(groups);

  let count = 0;
  const cursor = new Date();
  for (let i = 0; i < 21; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if ((counts[key] || 0) === habitCount) count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

/**
 * Build calendar data for a given month, in memory from the groupBy results.
 * No extra DB call needed.
 */
export function buildCalendar(groups, habitCount, year, month) {
  const counts = toCountMap(groups);
  const days = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    const key = d.toISOString().slice(0, 10);
    const completed = counts[key] || 0;
    days.push({
      date: key,
      completed,
      total: habitCount,
      full: habitCount > 0 && completed === habitCount,
    });
    d.setDate(d.getDate() + 1);
  }
  return { year, month, days };
}

/**
 * Compute overall stats — streak and 21-day progress.
 * (Best streak and completion % removed — no longer displayed.)
 */
export function computeAllStats(groups, habitCount) {
  return {
    streak:   computeCurrentStreak(groups, habitCount),
    progress: computeProgress21(groups, habitCount),
  };
}

/**
 * Per-habit detailed stats for the Progress tab.
 *
 * @param completionRecords  findMany result: Array<{ habitId: number; date: string }>
 * @param habits             active habits list (display-name mapped via renameHabit)
 * @param today              today's date string "YYYY-MM-DD" (server-side now)
 */
export function computePerHabitDetailed(completionRecords, habits, today) {
  // Build habitId → Set<date> for O(1) lookups
  const habitDates = new Map();
  for (const r of completionRecords) {
    if (!habitDates.has(r.habitId)) habitDates.set(r.habitId, new Set());
    habitDates.get(r.habitId).add(r.date);
  }

  // Last 7 day keys, oldest → newest  (e.g. [6 days ago … today])
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - i);
    last7.push(d.toISOString().slice(0, 10));
  }

  return habits.map((h) => {
    const dates = habitDates.get(h.id) ?? new Set();

    // Per-habit current streak (same logic as overall streak)
    let streak = 0;
    const cursor = new Date(today + 'T12:00:00');
    if (!dates.has(today)) cursor.setDate(cursor.getDate() - 1);
    for (let i = 0; i < 366; i++) {
      const key = cursor.toISOString().slice(0, 10);
      if (dates.has(key)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    // Completions in the last 21 days (matches the app's 21-day challenge theme)
    let completedLast21 = 0;
    for (let i = 0; i < 21; i++) {
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() - i);
      if (dates.has(d.toISOString().slice(0, 10))) completedLast21++;
    }

    return {
      id:             h.id,
      name:           h.name,
      streak,
      last7Days:      last7.map((d) => dates.has(d)), // bool[7], oldest→newest
      completedLast21,                                 // for "X / 21 days"
    };
  });
}
