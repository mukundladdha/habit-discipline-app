import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId, getOrCreateUser, renameHabit } from '../../../lib/users';
import { computeAllStats, computePerHabitStats } from '../../../lib/stats';

/**
 * GET /api/stats
 *
 * Returns the full stats payload used by the Stats page:
 *   { streak, highest, rate, progress,
 *     overallRate, totalTrackedDays,
 *     perHabit: [{ id, name, rate, completedDays }] }
 *
 * NOTE: /api/dashboard now returns this same payload on every initial load,
 *       so the Stats page can read from the client-side dashboard cache and
 *       call this endpoint only as a background refresh.
 *
 * DB: one $transaction with two parallelised groupBy queries.
 */

const LOOKBACK_DAYS = 366;

export async function GET(request) {
  const userId = extractUserId(request);
  if (!userId) return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });

  try {
    const user       = await getOrCreateUser(userId);
    const habits     = user.habits.map(renameHabit);
    const habitCount = habits.length;

    if (habitCount === 0) {
      return NextResponse.json({
        streak: 0, highest: 0, rate: 0, progress: 0,
        overallRate: 0, totalTrackedDays: 0, perHabit: [],
      });
    }

    const lookbackStr = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
      .toISOString().slice(0, 10);

    // Two groupBy queries in one round-trip
    const [historyGroups, perHabitGroups] = await prisma.$transaction([
      prisma.completion.groupBy({
        by:      ['date'],
        where:   { userId, date: { gte: lookbackStr } },
        _count:  { date: true },
        orderBy: { date: 'asc' },
      }),
      prisma.completion.groupBy({
        by:     ['habitId'],
        where:  { userId, date: { gte: lookbackStr } },
        _count: { habitId: true },
      }),
    ]);

    const baseStats        = computeAllStats(historyGroups, habitCount);
    const totalTrackedDays = historyGroups.length;
    const perHabit         = computePerHabitStats(perHabitGroups, habits, totalTrackedDays);

    return NextResponse.json({
      ...baseStats,
      overallRate: baseStats.rate,
      totalTrackedDays,
      perHabit,
    }, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    });

  } catch (e) {
    console.error('[stats]', e);
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 });
  }
}
