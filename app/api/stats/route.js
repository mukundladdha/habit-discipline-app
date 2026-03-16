import { prisma } from '../../../lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const habits = await prisma.habit.findMany({ orderBy: { sortOrder: 'asc' } });
    const habitCount = habits.length;

    if (habitCount === 0) {
      return NextResponse.json({ highest: 0, overallRate: 0, totalTrackedDays: 0, perHabit: [] });
    }

    const completions = await prisma.completion.findMany({
      select: { habitId: true, date: true },
    });

    // Count completions per date and per habit
    const byDate = {};
    const byHabit = {};
    for (const c of completions) {
      byDate[c.date] = (byDate[c.date] || 0) + 1;
      byHabit[c.habitId] = (byHabit[c.habitId] || 0) + 1;
    }

    const allDates = Object.keys(byDate).sort();
    const totalTrackedDays = allDates.length;
    const completedDays = allDates.filter((d) => byDate[d] === habitCount).length;

    // Highest streak across all-time full days
    const fullDays = allDates.filter((d) => byDate[d] === habitCount);
    let highest = fullDays.length > 0 ? 1 : 0;
    if (fullDays.length > 1) {
      let run = 1;
      for (let i = 1; i < fullDays.length; i++) {
        const prev = new Date(fullDays[i - 1] + 'T12:00:00');
        const curr = new Date(fullDays[i] + 'T12:00:00');
        const diff = Math.round((curr - prev) / 86400000);
        if (diff === 1) {
          run++;
          if (run > highest) highest = run;
        } else {
          run = 1;
        }
      }
    }

    const overallRate =
      totalTrackedDays > 0 ? Math.round((completedDays / totalTrackedDays) * 100) : 0;

    // Apply the same display-name remap as the habits API
    const perHabit = habits.map((h) => {
      let name = h.name;
      if (name === 'Good Diet') name = 'No Sugar';
      if (name === 'Sleep Before 12') name = '7+ Hours of Sleep';
      return {
        id: h.id,
        name,
        rate:
          totalTrackedDays > 0
            ? Math.round(((byHabit[h.id] || 0) / totalTrackedDays) * 100)
            : 0,
      };
    });

    return NextResponse.json({ highest, overallRate, totalTrackedDays, perHabit });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 });
  }
}
