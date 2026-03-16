import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId, getOrCreateUser } from '../../../lib/users';
import { computeAllStats } from '../../../lib/stats';

/**
 * GET /api/stats
 *
 * Returns { streak, highest, rate, progress } for the requesting user.
 * A single groupBy covers all four stats — computed in memory by lib/stats.js.
 *
 * NOTE: /api/dashboard returns these same stats in the initial page load.
 *       This endpoint exists for isolated stat refreshes if needed.
 */

const LOOKBACK_DAYS = 366;

export async function GET(request) {
  const userId = extractUserId(request);
  if (!userId) return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });

  try {
    const user = await getOrCreateUser(userId);
    const habitCount = user.habits.length;

    if (habitCount === 0) {
      return NextResponse.json({ streak: 0, highest: 0, rate: 0, progress: 0 });
    }

    const lookbackStr = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
      .toISOString().slice(0, 10);

    const groups = await prisma.completion.groupBy({
      by:      ['date'],
      where:   { userId, date: { gte: lookbackStr } },
      _count:  { date: true },
      orderBy: { date: 'asc' },
    });

    return NextResponse.json(computeAllStats(groups, habitCount));
  } catch (e) {
    console.error('[stats]', e);
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 });
  }
}
