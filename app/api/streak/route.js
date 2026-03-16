import { prisma } from '../../../lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const habitCount = await prisma.habit.count();
    if (habitCount === 0) {
      return NextResponse.json({ streak: 0, highest: 0 });
    }
    const completions = await prisma.completion.findMany({
      select: { date: true },
    });
    const countByDate = {};
    for (const c of completions) {
      countByDate[c.date] = (countByDate[c.date] || 0) + 1;
    }

    // Current streak — walk backwards from today
    let streak = 0;
    const cursor = new Date();
    for (let i = 0; i < 365; i++) {
      const key = cursor.toISOString().slice(0, 10);
      if ((countByDate[key] || 0) === habitCount) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    // Highest streak — find longest consecutive run of full days
    const fullDays = Object.keys(countByDate)
      .filter((d) => countByDate[d] === habitCount)
      .sort();

    let highest = streak; // at least as high as current
    if (fullDays.length > 0) {
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

    return NextResponse.json({ streak, highest });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to compute streak' }, { status: 500 });
  }
}
