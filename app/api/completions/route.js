import { prisma } from '../../../lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date (use YYYY-MM-DD)' }, { status: 400 });
  }
  try {
    const completions = await prisma.completion.findMany({
      where: { date },
      include: { habit: true },
    });
    return NextResponse.json(completions);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch completions' }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { habitId, date, completed } = body;
  if (typeof habitId !== 'number' || typeof date !== 'string' || typeof completed !== 'boolean') {
    return NextResponse.json(
      { error: 'Required: habitId (number), date (YYYY-MM-DD), completed (boolean)' },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }
  try {
    if (completed) {
      await prisma.completion.upsert({
        where: {
          habitId_date: { habitId, date },
        },
        create: { habitId, date },
        update: {},
      });
    } else {
      await prisma.completion.deleteMany({
        where: { habitId, date },
      });
    }
    const completions = await prisma.completion.findMany({
      where: { date },
      include: { habit: true },
    });
    return NextResponse.json(completions);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update completion' }, { status: 500 });
  }
}
