import { prisma } from '../../../lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const habits = await prisma.habit.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    const renamed = habits.map((h) => {
      if (h.name === 'Good Diet') return { ...h, name: 'No Sugar' };
      if (h.name === 'Sleep Before 12') return { ...h, name: '7+ Hours of Sleep' };
      return h;
    });
    return NextResponse.json(renamed);
  } catch (e) {
    console.error(e);
    const message = process.env.NODE_ENV === 'development' ? e.message : 'Failed to fetch habits';
    return NextResponse.json({ error: 'Failed to fetch habits', details: message }, { status: 500 });
  }
}
