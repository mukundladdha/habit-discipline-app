import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId, getOrCreateUser } from '../../../lib/users';
import { computeCurrentStreak, computeBestStreak } from '../../../lib/stats';

/**
 * GET /api/streak
 *
 * Returns { streak, highest } for the requesting user.
 * Queries Completion directly by userId — no habitId IN subquery.
 */

const LOOKBACK_DAYS = 366;

export async function GET(request) {
  const userId = extractUserId(request);
  if (!userId) return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });

  try {
    const user = await getOrCreateUser(userId);
    const habitCount = user.habits.length;
    if (habitCount === 0) return NextResponse.json({ streak: 0, highest: 0 });

    const lookbackStr = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
      .toISOString().slice(0, 10);

    const groups = await prisma.completion.groupBy({
      by:      ['date'],
      where:   { userId, date: { gte: lookbackStr } },
      _count:  { date: true },
      orderBy: { date: 'asc' },
    });

    return NextResponse.json({
      streak:  computeCurrentStreak(groups, habitCount),
      highest: computeBestStreak(groups, habitCount),
    });
  } catch (e) {
    console.error('[streak]', e);
    return NextResponse.json({ error: 'Failed to compute streak' }, { status: 500 });
  }
}
