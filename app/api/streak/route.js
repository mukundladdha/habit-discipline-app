import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId, getOrCreateUser, computeStreak } from '../../../lib/users';

const LOOKBACK_DAYS = 366;

export async function GET(request) {
  const userId = extractUserId(request);
  if (!userId) return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });
  try {
    const user = await getOrCreateUser(userId);
    const habitIds = user.habits.map((h) => h.id);
    if (habitIds.length === 0) return NextResponse.json({ streak: 0, highest: 0 });

    const lookbackStr = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);

    const groups = await prisma.completion.groupBy({
      by: ['date'],
      where: { habitId: { in: habitIds }, date: { gte: lookbackStr } },
      _count: { date: true },
    });

    return NextResponse.json(computeStreak(groups, user.habits.length));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to compute streak' }, { status: 500 });
  }
}
