/**
 * Pure stat computation functions.
 * All functions are stateless and side-effect-free — easy to test.
 *
 * Input shape (from Prisma groupBy):
 *   groups: Array<{ date: string; _count: { date: number } }>
 *
 * habitCount: total number of habits for the user
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
      break; // streak broken
    }
  }
  return streak;
}

/**
 * Best (highest) streak ever in the supplied history window.
 * Walks all full-completion days in chronological order.
 */
export function computeBestStreak(groups, habitCount) {
  if (habitCount === 0) return 0;
  const counts = toCountMap(groups);

  const fullDays = Object.keys(counts)
    .filter((d) => counts[d] === habitCount)
    .sort(); // lexicographic sort works for YYYY-MM-DD

  if (fullDays.length === 0) return 0;

  let best = 1;
  let run = 1;
  for (let i = 1; i < fullDays.length; i++) {
    const prev = new Date(fullDays[i - 1] + 'T12:00:00');
    const curr = new Date(fullDays[i] + 'T12:00:00');
    const diffDays = Math.round((curr - prev) / 86_400_000);
    if (diffDays === 1) {
      run++;
      if (run > best) best = run;
    } else {
      run = 1; // gap — reset run
    }
  }
  return best;
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
 * Overall completion rate as a whole-number percentage.
 * = (days where all habits done) / (days with any activity) × 100
 */
export function computeRate(groups, habitCount) {
  if (habitCount === 0 || groups.length === 0) return 0;
  const counts = toCountMap(groups);
  const activeDays = Object.keys(counts).length;
  if (activeDays === 0) return 0;
  const fullDays = Object.values(counts).filter((c) => c === habitCount).length;
  return Math.round((fullDays / activeDays) * 100);
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
 * Compute all stats in a single pass over the groups array.
 * Called once per API response — O(n) where n = days in history window.
 */
export function computeAllStats(groups, habitCount) {
  return {
    streak:   computeCurrentStreak(groups, habitCount),
    highest:  computeBestStreak(groups, habitCount),
    rate:     computeRate(groups, habitCount),
    progress: computeProgress21(groups, habitCount), // days in last 21
  };
}

/**
 * Per-habit completion stats for the Stats page.
 *
 * @param perHabitGroups  groupBy(['habitId']) result from Prisma
 *                        shape: Array<{ habitId: number; _count: { habitId: number } }>
 * @param habits          habits list (already display-name-mapped via renameHabit)
 * @param totalTrackedDays  days with ANY completion — the denominator for rates
 */
export function computePerHabitStats(perHabitGroups, habits, totalTrackedDays) {
  const lookup = {};
  for (const g of perHabitGroups) lookup[g.habitId] = g._count.habitId;

  return habits.map((h) => {
    const completedDays = lookup[h.id] ?? 0;
    const rate = totalTrackedDays > 0
      ? Math.round((completedDays / totalTrackedDays) * 100)
      : 0;
    return { id: h.id, name: h.name, rate, completedDays };
  });
}
