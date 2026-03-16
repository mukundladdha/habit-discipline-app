import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId, getOrCreateUser, computeStreak, renameHabit } from '../../../lib/users';

const LOOKBACK_DAYS = 366;

export async function GET(request) {
  const userId = extractUserId(request);
  if (!userId) return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date (use YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const user = await getOrCreateUser(userId);
    const habitIds = user.habits.map((h) => h.id);
    const habitCount = habitIds.length;

    const lookbackStr = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);

    const [completions, streakGroups] = await Promise.all([
      prisma.completion.findMany({
        where: { habitId: { in: habitIds }, date },
        include: { habit: true },
      }),
      prisma.completion.groupBy({
        by: ['date'],
        where: { habitId: { in: habitIds }, date: { gte: lookbackStr } },
        _count: { date: true },
      }),
    ]);

    const { streak, highest } = computeStreak(streakGroups, habitCount);

    return NextResponse.json({
      habits: user.habits.map(renameHabit),
      completions,
      streak,
      highest,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
