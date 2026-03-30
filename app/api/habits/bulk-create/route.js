import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { extractUserId } from '../../../../lib/users';

/**
 * POST /api/habits/bulk-create
 * Body: { habits: [{ name: string, sortOrder?: number }] }
 *
 * Called once at the end of onboarding.  Creates the user row (if new)
 * and inserts all selected habits in one transaction.
 *
 * Returns: { habits: [{id, name, sortOrder, isActive}] }
 */
export async function POST(request) {
  const userId = extractUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { habits } = body;
  if (!Array.isArray(habits) || habits.length === 0 || habits.length > 10) {
    return NextResponse.json({ error: 'habits must be an array of 1–10 items' }, { status: 400 });
  }
  for (const h of habits) {
    if (typeof h.name !== 'string' || !h.name.trim() || h.name.length > 60) {
      return NextResponse.json({ error: 'Each habit must have a name (max 60 chars)' }, { status: 400 });
    }
  }

  try {
    // Upsert user (create bare row if new, no-op if existing)
    await prisma.user.upsert({
      where:  { id: userId },
      create: { id: userId },
      update: {},
    });

    // Deactivate any habits the user already had (idempotent re-onboarding)
    await prisma.habit.updateMany({
      where:  { userId },
      data:   { isActive: false },
    });

    // Create the selected habits — stamp createdAt so future calendar is date-aware
    const now = new Date();
    await prisma.habit.createMany({
      data: habits.map((h, i) => ({
        userId,
        name:      h.name.trim(),
        sortOrder: typeof h.sortOrder === 'number' ? h.sortOrder : i,
        isActive:  true,
        createdAt: now,
      })),
    });

    const created = await prisma.habit.findMany({
      where:   { userId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select:  { id: true, name: true, sortOrder: true, isActive: true },
    });

    return NextResponse.json({ habits: created });

  } catch (e) {
    console.error('[habits/bulk-create]', e);
    return NextResponse.json({ error: 'Failed to create habits' }, { status: 500 });
  }
}
