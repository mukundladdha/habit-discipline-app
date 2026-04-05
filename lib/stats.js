/**
 * Pure stat computation functions.
 * All functions are stateless and side-effect-free.
 *
 * Input shape for history functions (from Prisma groupBy):
 *   groups: Array<{ date: string; _count: { date: number } }>
 *
 * Input shape for computePerHabitDetailed (from Prisma findMany):
 *   completionRecords: Array<{ habitId: number; date: string }>
 *
 * habits: Array<{ id, name, createdAt: Date|null, ... }>
 *   createdAt null → habit existed since the beginning (legacy / pre-migration row)
 */

/** Build a date→completionCount lookup from groupBy results. O(n) */
function toCountMap(groups) {
  const map = {};
  for (const g of groups) map[g.date] = g._count.date;
  return map;
}

/**
 * Replace null createdAt on legacy habits with a fallback Date.
 * Must be called before passing habits to any stat/calendar function so that
 * days before the user ever started tracking are correctly greyed out.
 *
 * @param {Array}  habits       - habits array (may contain createdAt: null)
 * @param {Date}   fallbackDate - earliest known tracking date for this user
 */
export function normalizeHabitDates(habits, fallbackDate) {
  return habits.map(h => (h.createdAt ? h : { ...h, createdAt: fallbackDate }));
}

/**
 * How many of the given (active) habits existed on a specific date.
 * After normalizeHabitDates(), createdAt is always a Date — never null.
 */
function habitCountOnDate(habits, dateStr) {
  let count = 0;
  for (const h of habits) {
    if (!h.createdAt) { count++; continue; } // safety fallback
    const hDate = h.createdAt instanceof Date
      ? h.createdAt.toISOString().slice(0, 10)
      : String(h.createdAt).slice(0, 10);
    if (hDate <= dateStr) count++;
  }
  return count;
}

/**
 * Current streak.
 * Rules:
 *  - Today counts if ALL habits that existed today are done.
 *  - If today is incomplete, streak continues from yesterday.
 *  - A day with 0 habits (before any habit existed) ends the streak lookback.
 *  - Resets to 0 on the first day that required habits but had < required completions.
 */
export function computeCurrentStreak(groups, habits) {
  if (!habits || habits.length === 0) return 0;
  const counts = toCountMap(groups);

  const cursor = new Date();
  const todayKey = cursor.toISOString().slice(0, 10);

  // Skip today when it's not yet fully done (streak runs through yesterday)
  const todayRequired = habitCountOnDate(habits, todayKey);
  if (todayRequired === 0 || (counts[todayKey] || 0) < todayRequired) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  for (let i = 0; i < 366; i++) {
    const key      = cursor.toISOString().slice(0, 10);
    const required = habitCountOnDate(habits, key);
    if (required === 0) break; // before any habit existed — stop
    if ((counts[key] || 0) === required) {
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
 * A day only counts if habits existed on it and all were completed.
 */
export function computeProgress21(groups, habits) {
  if (!habits || habits.length === 0) return 0;
  const counts = toCountMap(groups);

  let count = 0;
  const cursor = new Date();
  for (let i = 0; i < 21; i++) {
    const key      = cursor.toISOString().slice(0, 10);
    const required = habitCountOnDate(habits, key);
    if (required > 0 && (counts[key] || 0) === required) count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

/**
 * Build calendar data for a given month.
 * Each day includes:
 *   hasHabits  — false means no habits existed yet (grey out in UI)
 *   full       — all habits for that day were completed
 *   completed  — raw completion count
 *   total      — habits that existed on that day
 */
export function buildCalendar(groups, habits, year, month) {
  const counts = toCountMap(groups);
  const days   = [];
  const d      = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    const key       = d.toISOString().slice(0, 10);
    const total     = habitCountOnDate(habits, key);
    const completed = counts[key] || 0;
    days.push({
      date:      key,
      completed,
      total,
      full:      total > 0 && completed === total,
      hasHabits: total > 0,
    });
    d.setDate(d.getDate() + 1);
  }
  return { year, month, days };
}

/**
 * Compute overall stats — streak and 21-day progress.
 */
export function computeAllStats(groups, habits) {
  return {
    streak:   computeCurrentStreak(groups, habits),
    progress: computeProgress21(groups, habits),
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

    // Completions in the last 21 days
    let completedLast21 = 0;
    for (let i = 0; i < 21; i++) {
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() - i);
      if (dates.has(d.toISOString().slice(0, 10))) completedLast21++;
    }

    // Lifetime stats: total completions and total days the habit has been live.
    // Both are capped at the 366-day data window so the fraction is internally
    // consistent (we don't have completion data older than the lookback period).
    const createdDate  = h.createdAt instanceof Date ? h.createdAt : new Date(String(h.createdAt));
    const todayDate    = new Date(today + 'T12:00:00');
    const rawDaysLive  = Math.max(1, Math.floor((todayDate - createdDate) / 86_400_000) + 1);
    const totalDaysLive    = Math.min(rawDaysLive, 366);
    const totalCompleted   = dates.size; // unique completion dates within the data window

    return {
      id:             h.id,
      name:           h.name,
      streak,
      last7Days:      last7.map((d) => dates.has(d)), // bool[7], oldest→newest
      completedLast21,
      totalDaysLive,
      totalCompleted,
    };
  });
}
