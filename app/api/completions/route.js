import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId } from '../../../lib/users';

/**
 * GET /api/completions?date=YYYY-MM-DD
 *
 * Returns completions for a specific date belonging to the requesting user.
 * Queries Completion directly by userId — no JOIN through Habit needed.
 *
 * NOTE: Writes now go through /api/complete (upsert + stats in one round-trip).
 *       This endpoint is retained for any legacy or standalone read use.
 */
export async function GET(request) {
  const userId = extractUserId(request);
  if (!userId) return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date (use YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const completions = await prisma.completion.findMany({
      where:   { userId, date },
      select:  { id: true, habitId: true, date: true },
      orderBy: { habitId: 'asc' },
    });
    return NextResponse.json(completions);
  } catch (e) {
    console.error('[completions]', e);
    return NextResponse.json({ error: 'Failed to fetch completions' }, { status: 500 });
  }
}
