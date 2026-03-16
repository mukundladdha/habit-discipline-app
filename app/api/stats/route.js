import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId, getOrCreateUser, computeStreak, renameHabit } from '../../../lib/users';

export async function GET(request) {
  const userId = extractUserId(request);
  if (!userId) return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });
  try {
    const user = await getOrCreateUser(userId);
    const habits = user.habits;
    const habitIds = habits.map((h) => h.id);
    const habitCount = habits.length;

    if (habitCount === 0) {
      return NextResponse.json({ highest: 0, overallRate: 0, totalTrackedDays: 0, perHabit: [] });
    }

    const [byDateGroups, byHabitGroups] = await Promise.all([
      prisma.completion.groupBy({
        by: ['date'],
        where: { habitId: { in: habitIds } },
        _count: { date: true },
      }),
      prisma.completion.groupBy({
        by: ['habitId'],
        where: { habitId: { in: habitIds } },
        _count: { habitId: true },
      }),
    ]);

    const totalTrackedDays = byDateGroups.length;
    const completedDays = byDateGroups.filter((g) => g._count.date === habitCount).length;
    const overallRate = totalTrackedDays > 0 ? Math.round((completedDays / totalTrackedDays) * 100) : 0;
    const { highest } = computeStreak(byDateGroups, habitCount);

    const byHabitMap = {};
    for (const g of byHabitGroups) byHabitMap[g.habitId] = g._count.habitId;

    const perHabit = habits.map((h) => ({
      id: h.id,
      name: renameHabit(h).name,
      rate: totalTrackedDays > 0 ? Math.round(((byHabitMap[h.id] || 0) / totalTrackedDays) * 100) : 0,
    }));

    return NextResponse.json({ highest, overallRate, totalTrackedDays, perHabit });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 });
  }
}
