import { NextResponse } from 'next/server';
import { extractUserId, getOrCreateUser, renameHabit } from '../../../lib/users';

export async function GET(request) {
  const userId = extractUserId(request);
  if (!userId) return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });
  try {
    const user = await getOrCreateUser(userId);
    return NextResponse.json(user.habits.map(renameHabit));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch habits' }, { status: 500 });
  }
}
