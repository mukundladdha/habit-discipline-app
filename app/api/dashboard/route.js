import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId, getOrCreateUser, renameHabit } from '../../../lib/users';
import { computeAllStats, buildCalendar, computePerHabitDetailed, normalizeHabitDates } from '../../../lib/stats';

/**
 * GET /api/dashboard?date=YYYY-MM-DD
 *
 * Single endpoint returning everything every view needs:
 *   { habits, completions, calendar, stats }
 *
 * stats shape: { streak, progress, perHabit[] }
 *   perHabit[]:  { id, name, streak, last7Days: bool[7], completedLast21 }
 *
 * Best streak and completion % removed — Progress tab derives only what it shows.
 *
 * DB: one $transaction with THREE parallelised queries (one DB round-trip).
 *
 * NOTE: No server-side in-memory cache here.  The client has a 60s L1 +
 * 48h L2 localStorage cache that it keeps in sync after every toggle, so
 * a server cache would only serve stale data after a completion is written
 * via /api/complete (different serverless function → can't share Map state).
 *
 * Cache-Control: private, max-age=20, stale-while-revalidate=40
 */

// ── Route handler ────────────────────────────────────────────────────────────

const LOOKBACK_DAYS = 366;

export async function GET(request) {
  const userId = extractUserId(request);
  if (!userId) return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const now  = new Date();
  const date = searchParams.get('date') || now.toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date (use YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    // ── 1. Resolve user ───────────────────────────────────────────────────────
    const user   = await getOrCreateUser(userId);
    const habits = user.habits.map(renameHabit); // includes createdAt for per-day counts

    const lookbackStr = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
      .toISOString().slice(0, 10);

    // ── 2. Three reads in ONE transaction — single DB round-trip ─────────────
    const [completionsForDate, historyGroups, perHabitRecords] = await prisma.$transaction([

      // 2a. Completions for the requested date (Today view rendering)
      prisma.completion.findMany({
        where:   { userId, date, habit: { isActive: true } },
        select:  { id: true, habitId: true, date: true },
        orderBy: { habitId: 'asc' },
      }),

      // 2b. Per-day counts for streak + calendar (active habits only)
      prisma.completion.groupBy({
        by:      ['date'],
        where:   { userId, date: { gte: lookbackStr }, habit: { isActive: true } },
        _count:  { date: true },
        orderBy: { date: 'asc' },
      }),

      // 2c. Individual completion records — used to compute per-habit streak,
      //     last7Days, and 21-day count (replaces the old groupBy habitId).
      prisma.completion.findMany({
        where:  { userId, date: { gte: lookbackStr }, habit: { isActive: true } },
        select: { habitId: true, date: true },
      }),
    ]);

    // ── 3. Compute everything in memory ──────────────────────────────────────
    const today    = now.toISOString().slice(0, 10); // always real today for streaks

    // For legacy habits (createdAt = null), use the earliest known completion
    // date so days before the user ever tracked show as grey, not red.
    // historyGroups is ordered by date asc, so [0] is the earliest.
    const fallbackDate = historyGroups.length > 0
      ? new Date(historyGroups[0].date + 'T00:00:00Z')
      : now;
    const normalizedHabits = normalizeHabitDates(habits, fallbackDate);

    const baseStats = computeAllStats(historyGroups, normalizedHabits);
    const perHabit  = computePerHabitDetailed(perHabitRecords, normalizedHabits, today);

    const stats = {
      streak:   baseStats.streak,
      progress: baseStats.progress,
      perHabit,
    };

    const calendar = buildCalendar(
      historyGroups, normalizedHabits, now.getFullYear(), now.getMonth() + 1
    );

    // Filter habits/completions to those that existed on the requested date so
    // the Today view's list and X/Y count are accurate for past-date navigation.
    const habitsForDate = normalizedHabits.filter(h => {
      const hDate = h.createdAt instanceof Date
        ? h.createdAt.toISOString().slice(0, 10)
        : String(h.createdAt).slice(0, 10);
      return hDate <= date;
    });
    const habitIdsForDate     = new Set(habitsForDate.map(h => h.id));
    const completionsForDate2 = completionsForDate.filter(c => habitIdsForDate.has(c.habitId));

    const payload = { habits: habitsForDate, completions: completionsForDate2, calendar, stats };

    // no-store: browser must not cache this response.
    // The client already has a 60s L1 + 48h L2 localStorage cache that is kept
    // in sync after every toggle (setCache inside toggleHabit success handler).
    // Allowing the browser to cache here causes stale responses to overwrite that
    // good localStorage snapshot when load() fires after tab navigation.
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store' },
    });

  } catch (e) {
    console.error('[dashboard]', e);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
