import { prisma } from './prisma';

const DEFAULT_HABITS = [
  { name: 'Workout',           sortOrder: 0 },
  { name: 'No Sugar',          sortOrder: 1 },
  { name: '10k Steps',         sortOrder: 2 },
  { name: '7+ Hours of Sleep', sortOrder: 3 },
];

/**
 * Extract and validate the X-User-Id request header.
 * Returns null if missing or clearly invalid.
 */
export function extractUserId(request) {
  const id = request.headers.get('x-user-id');
  if (!id || typeof id !== 'string' || id.length < 8 || id.length > 128) return null;
  return id;
}

/**
 * Get an existing user (with their habits), or create them with default habits
 * on their very first request.
 *
 * @param {string}  userId  - The client-generated UUID stored in localStorage.
 * @param {object}  db      - Prisma client or $transaction client (default: global prisma).
 *
 * Race-condition safe: if two simultaneous first-time requests both try to
 * create the same user, we catch the unique-constraint violation (P2002) and
 * re-fetch rather than crashing.
 */
export async function getOrCreateUser(userId, db = prisma) {
  const existing = await db.user.findUnique({
    where: { id: userId },
    include: { habits: { orderBy: { sortOrder: 'asc' } } },
  });
  if (existing) return existing;

  try {
    return await db.user.create({
      data: { id: userId, habits: { create: DEFAULT_HABITS } },
      include: { habits: { orderBy: { sortOrder: 'asc' } } },
    });
  } catch (e) {
    // Another concurrent request already created this user — just fetch it.
    if (e?.code === 'P2002') {
      return db.user.findUnique({
        where: { id: userId },
        include: { habits: { orderBy: { sortOrder: 'asc' } } },
      });
    }
    throw e;
  }
}

/** Display-name overrides (DB stores canonical names; UI shows friendly ones). */
export function renameHabit(h) {
  if (h.name === 'Good Diet')       return { ...h, name: 'No Sugar' };
  if (h.name === 'Sleep Before 12') return { ...h, name: '7+ Hours of Sleep' };
  return h;
}
