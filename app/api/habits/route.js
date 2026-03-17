import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId, getOrCreateUser } from '../../../lib/users';

/**
 * GET /api/habits
 *
 * Returns ALL habits for the user (active + inactive) so the settings panel
 * can display both sections.
 *
 * Returns: { habits: [{id, name, sortOrder, isActive}] }
 */
export async function GET(request) {
  const userId = extractUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });
  }

  try {
    await getOrCreateUser(userId, prisma, false);

    const habits = await prisma.habit.findMany({
      where:   { userId },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
      select:  { id: true, name: true, sortOrder: true, isActive: true },
    });

    return NextResponse.json({ habits });
  } catch (e) {
    console.error('[habits]', e);
    return NextResponse.json({ error: 'Failed to load habits' }, { status: 500 });
  }
}
