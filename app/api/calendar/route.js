import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId, getOrCreateUser } from '../../../lib/users';

export async function GET(request) {
  const userId = extractUserId(request);
  if (!userId) return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year'), 10);
  const month = parseInt(searchParams.get('month'), 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 });
  }

  try {
    const user = await getOrCreateUser(userId);
    const habitIds = user.habits.map((h) => h.id);
    const habitCount = habitIds.length;

    const startStr = new Date(year, month - 1, 1).toISOString().slice(0, 10);
    const endStr = new Date(year, month, 0).toISOString().slice(0, 10);

    const groups = await prisma.completion.groupBy({
      by: ['date'],
      where: { habitId: { in: habitIds }, date: { gte: startStr, lte: endStr } },
      _count: { date: true },
    });

    const countByDate = {};
    for (const g of groups) countByDate[g.date] = g._count.date;

    const days = [];
    const d = new Date(year, month - 1, 1);
    while (d.getMonth() === month - 1) {
      const key = d.toISOString().slice(0, 10);
      days.push({
        date: key,
        completed: countByDate[key] || 0,
        total: habitCount,
        full: (countByDate[key] || 0) === habitCount,
      });
      d.setDate(d.getDate() + 1);
    }

    return NextResponse.json({ year, month, days });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 });
  }
}
