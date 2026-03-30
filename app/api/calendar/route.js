import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId, getOrCreateUser } from '../../../lib/users';
import { buildCalendar } from '../../../lib/stats';

/**
 * GET /api/calendar?year=YYYY&month=M
 *
 * Returns calendar data for the requested month.
 * Queries Completion directly by userId — no habitId IN subquery.
 * Calendar structure is built in memory by buildCalendar() from lib/stats.js.
 *
 * NOTE: /api/dashboard returns the current month's calendar on initial load.
 *       This endpoint handles previous/next month navigation.
 */
export async function GET(request) {
  const userId = extractUserId(request);
  if (!userId) return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const year  = parseInt(searchParams.get('year'),  10);
  const month = parseInt(searchParams.get('month'), 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 });
  }

  try {
    const user   = await getOrCreateUser(userId);
    const habits = user.habits; // includes createdAt for per-day habit counts

    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    // last day: first day of next month minus one day
    const endDate = new Date(year, month, 0); // day 0 of next month = last day of this month
    const endStr  = endDate.toISOString().slice(0, 10);

    const groups = await prisma.completion.groupBy({
      by:      ['date'],
      where:   { userId, date: { gte: startStr, lte: endStr } },
      _count:  { date: true },
      orderBy: { date: 'asc' },
    });

    return NextResponse.json(buildCalendar(groups, habits, year, month));
  } catch (e) {
    console.error('[calendar]', e);
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 });
  }
}
