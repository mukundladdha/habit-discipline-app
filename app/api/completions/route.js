import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId, getOrCreateUser, computeStreak } from '../../../lib/users';

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
    const completions = await prisma.completion.findMany({
      where: { habitId: { in: habitIds }, date },
      include: { habit: true },
    });
    return NextResponse.json(completions);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch completions' }, { status: 500 });
  }
}

export async function POST(request) {
  const userId = extractUserId(request);
  if (!userId) return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { habitId, date, completed } = body;
  if (typeof habitId !== 'number' || typeof date !== 'string' || typeof completed !== 'boolean') {
    return NextResponse.json({ error: 'Required: habitId (number), date (YYYY-MM-DD), completed (boolean)' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  try {
    const user = await getOrCreateUser(userId);
    const habitIds = user.habits.map((h) => h.id);
    if (!habitIds.includes(habitId)) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    if (completed) {
      await prisma.completion.upsert({
        where: { habitId_date: { habitId, date } },
        create: { habitId, date },
        update: {},
      });
    } else {
      await prisma.completion.deleteMany({ where: { habitId, date } });
    }

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

    const { streak, highest } = computeStreak(streakGroups, user.habits.length);

    return NextResponse.json({ completions, streak, highest });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update completion' }, { status: 500 });
  }
}
