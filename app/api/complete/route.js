import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId, getOrCreateUser } from '../../../lib/users';
import { computeAllStats } from '../../../lib/stats';

/**
 * POST /api/complete
 * Body: { habitId: number, date: "YYYY-MM-DD", completed: boolean }
 *
 * Marks or unmarks a habit completion and returns the minimal data the
 * frontend needs to patch its local dashboardState — no full page reload.
 *
 * Returns: { completions: [{id, habitId, date}], stats: {streak,highest,rate,progress} }
 *
 * Design notes:
 *  - userId comes from the X-User-Id header (never trusted from the body).
 *  - We verify the habitId belongs to this user before writing — prevents
 *    cross-user data pollution.
 *  - upsert is idempotent: tapping the same habit twice is safe.
 *  - The write and both reads share one DB round-trip via $transaction.
 */

const LOOKBACK_DAYS = 366;

export async function POST(request) {
  const userId = extractUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { habitId, date, completed } = body;

  if (typeof habitId !== 'number' || typeof date !== 'string' || typeof completed !== 'boolean') {
    return NextResponse.json(
      { error: 'Required: habitId (number), date (YYYY-MM-DD string), completed (boolean)' },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  try {
    // ── Step 1: authorise — habit must belong to this user ───────────────────
    const user = await getOrCreateUser(userId);
    if (!user.habits.some((h) => h.id === habitId)) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }
    const habitCount = user.habits.length;

    // ── Step 2: write the completion (upsert keeps it idempotent) ────────────
    if (completed) {
      // upsert: safe to call multiple times — duplicate entries are prevented
      // by the @@unique([habitId, date]) constraint.
      await prisma.completion.upsert({
        where:  { habitId_date: { habitId, date } },
        create: { habitId, userId, date },
        update: {}, // already exists — nothing to change
      });
    } else {
      await prisma.completion.deleteMany({ where: { habitId, userId, date } });
    }

    const lookbackStr = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
      .toISOString().slice(0, 10);

    // ── Step 3: fetch updated state in one transaction ───────────────────────
    const [completions, historyGroups] = await prisma.$transaction([

      // Updated completions for this date (what the UI renders)
      prisma.completion.findMany({
        where:   { userId, date },
        select:  { id: true, habitId: true, date: true },
        orderBy: { habitId: 'asc' },
      }),

      // Full history for recomputing streak / stats
      prisma.completion.groupBy({
        by:      ['date'],
        where:   { userId, date: { gte: lookbackStr } },
        _count:  { date: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    const stats = computeAllStats(historyGroups, habitCount);

    return NextResponse.json({ completions, stats });

  } catch (e) {
    console.error('[complete]', e);
    return NextResponse.json({ error: 'Failed to update completion' }, { status: 500 });
  }
}
