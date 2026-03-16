import { prisma } from '../../../lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year'), 10);
  const month = parseInt(searchParams.get('month'), 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json(
      { error: 'Invalid year or month (use year=YYYY&month=M)' },
      { status: 400 }
    );
  }
  try {
    const habitCount = await prisma.habit.count();
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const completions = await prisma.completion.findMany({
      where: {
        date: {
          gte: startStr,
          lte: endStr,
        },
      },
      select: { date: true },
    });
    const countByDate = {};
    for (const c of completions) {
      countByDate[c.date] = (countByDate[c.date] || 0) + 1;
    }
    const days = [];
    const d = new Date(start);
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
