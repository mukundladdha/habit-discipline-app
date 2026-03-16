import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId, getOrCreateUser, renameHabit } from '../../../lib/users';
import { computeAllStats, buildCalendar } from '../../../lib/stats';

/**
 * GET /api/dashboard?date=YYYY-MM-DD
 *
 * Single endpoint that returns everything the Today view needs:
 *   { habits, completions, calendar, stats }
 *
 * Architecture:
 *   1. getOrCreateUser  — findUnique (indexed PK) or insert + 4 habits
 *   2. prisma.$transaction([...]) — two queries share one DB round-trip:
 *        a. findMany   — completions for the requested date   (lean payload)
 *        b. groupBy    — completion counts per day, 366-day window
 *   3. Everything else (stats, calendar) is computed in memory — zero extra
 *      DB calls.
 *
 * Why $transaction over Promise.all?
 *   Both parallelise the queries, but $transaction also gives a consistent
 *   read snapshot: the counts and the day's completions are guaranteed to
 *   reflect the same DB state, preventing subtle streak/count mismatches.
 */

// 366 days covers the current year + the previous year, enough for streak history.
const LOOKBACK_DAYS = 366;

export async function GET(request) {
  const userId = extractUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const now    = new Date();
  const date   = searchParams.get('date') || now.toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date (use YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    // ── Step 1: resolve user (creates account + default habits on first call) ──
    const user       = await getOrCreateUser(userId);
    const habitCount = user.habits.length;

    const lookbackStr = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
      .toISOString().slice(0, 10);

    // ── Step 2: batch the two DB reads in one transaction ───────────────────
    const [completionsForDate, historyGroups] = await prisma.$transaction([

      // 2a. Which habits are done on the requested date? (lean: no JOIN)
      prisma.completion.findMany({
        where:   { userId, date },
        select:  { id: true, habitId: true, date: true },
        orderBy: { habitId: 'asc' },
      }),

      // 2b. Per-day completion counts for the last 366 days.
      //     Used for streak, best streak, rate, progress-21, and calendar —
      //     all computed in memory below (one groupBy replaces multiple queries).
      prisma.completion.groupBy({
        by:      ['date'],
        where:   { userId, date: { gte: lookbackStr } },
        _count:  { date: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    // ── Step 3: compute everything in memory — O(n), no extra DB calls ──────
    const stats    = computeAllStats(historyGroups, habitCount);
    const calendar = buildCalendar(historyGroups, habitCount, now.getFullYear(), now.getMonth() + 1);

    return NextResponse.json({
      habits:      user.habits.map(renameHabit),
      completions: completionsForDate,   // [{id, habitId, date}]
      calendar,                          // {year, month, days:[{date,completed,total,full}]}
      stats,                             // {streak, highest, rate, progress}
    });

  } catch (e) {
    console.error('[dashboard]', e);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
