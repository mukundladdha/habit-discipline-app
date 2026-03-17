import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { extractUserId, getOrCreateUser } from '../../../../lib/users';

/**
 * POST /api/habits/update
 * Body (one of):
 *   { action: 'add',    name: string }
 *   { action: 'remove', habitId: number }
 *   { action: 'toggle', habitId: number }   ← toggles isActive
 *
 * Returns: { habits: [{id, name, sortOrder, isActive}], success: true }
 */
export async function POST(request) {
  const userId = extractUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { action, habitId, name } = body;

  if (!['add', 'remove', 'toggle'].includes(action)) {
    return NextResponse.json({ error: 'action must be add | remove | toggle' }, { status: 400 });
  }

  try {
    // Ensure user exists
    await getOrCreateUser(userId, prisma, false);

    if (action === 'add') {
      if (typeof name !== 'string' || !name.trim() || name.length > 60) {
        return NextResponse.json({ error: 'name required (max 60 chars)' }, { status: 400 });
      }
      // Count active habits — cap at 10
      const activeCount = await prisma.habit.count({ where: { userId, isActive: true } });
      if (activeCount >= 10) {
        return NextResponse.json({ error: 'Maximum 10 active habits' }, { status: 400 });
      }
      const maxOrder = await prisma.habit.aggregate({
        where: { userId },
        _max:  { sortOrder: true },
      });
      await prisma.habit.create({
        data: {
          userId,
          name:      name.trim(),
          sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
          isActive:  true,
        },
      });
    }

    if (action === 'remove') {
      if (typeof habitId !== 'number') {
        return NextResponse.json({ error: 'habitId required' }, { status: 400 });
      }
      // Verify ownership
      const habit = await prisma.habit.findFirst({ where: { id: habitId, userId } });
      if (!habit) return NextResponse.json({ error: 'Habit not found' }, { status: 404 });

      // Soft-delete: deactivate (preserves completion history)
      await prisma.habit.update({
        where: { id: habitId },
        data:  { isActive: false },
      });
    }

    if (action === 'toggle') {
      if (typeof habitId !== 'number') {
        return NextResponse.json({ error: 'habitId required' }, { status: 400 });
      }
      const habit = await prisma.habit.findFirst({ where: { id: habitId, userId } });
      if (!habit) return NextResponse.json({ error: 'Habit not found' }, { status: 404 });

      // If re-activating, check cap
      if (!habit.isActive) {
        const activeCount = await prisma.habit.count({ where: { userId, isActive: true } });
        if (activeCount >= 10) {
          return NextResponse.json({ error: 'Maximum 10 active habits' }, { status: 400 });
        }
      }

      await prisma.habit.update({
        where: { id: habitId },
        data:  { isActive: !habit.isActive },
      });
    }

    // Return ALL habits (active + inactive) so SettingsPanel can show both sections
    const habits = await prisma.habit.findMany({
      where:   { userId },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
      select:  { id: true, name: true, sortOrder: true, isActive: true },
    });

    return NextResponse.json({ habits, success: true });

  } catch (e) {
    console.error('[habits/update]', e);
    return NextResponse.json({ error: 'Failed to update habit' }, { status: 500 });
  }
}
