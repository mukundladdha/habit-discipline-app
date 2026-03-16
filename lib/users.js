import { prisma } from './prisma';

const DEFAULT_HABITS = [
  { name: 'Workout', sortOrder: 0 },
  { name: 'No Sugar', sortOrder: 1 },
  { name: '10k Steps', sortOrder: 2 },
  { name: '7+ Hours of Sleep', sortOrder: 3 },
];

export function extractUserId(request) {
  const id = request.headers.get('x-user-id');
  if (!id || typeof id !== 'string' || id.length < 8 || id.length > 128) return null;
  return id;
}

export async function getOrCreateUser(userId) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: { habits: { orderBy: { sortOrder: 'asc' } } },
  });
  if (existing) return existing;

  return prisma.user.create({
    data: { id: userId, habits: { create: DEFAULT_HABITS } },
    include: { habits: { orderBy: { sortOrder: 'asc' } } },
  });
}

export function renameHabit(h) {
  if (h.name === 'Good Diet') return { ...h, name: 'No Sugar' };
  if (h.name === 'Sleep Before 12') return { ...h, name: '7+ Hours of Sleep' };
  return h;
}

export function computeStreak(groups, habitCount) {
  if (habitCount === 0) return { streak: 0, highest: 0 };

  const countByDate = {};
  for (const g of groups) {
    countByDate[g.date] = g._count.date;
  }

  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 366; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if ((countByDate[key] || 0) === habitCount) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  const fullDays = Object.keys(countByDate)
    .filter((d) => countByDate[d] === habitCount)
    .sort();

  let highest = streak;
  if (fullDays.length > 1) {
    let run = 1;
    for (let i = 1; i < fullDays.length; i++) {
      const diff = Math.round(
        (new Date(fullDays[i] + 'T12:00:00') - new Date(fullDays[i - 1] + 'T12:00:00')) / 86400000
      );
      if (diff === 1) { run++; if (run > highest) highest = run; }
      else run = 1;
    }
  }

  return { streak, highest };
}
