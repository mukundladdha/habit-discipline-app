import { prisma } from './prisma';

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
 * Get an existing user (with their ACTIVE habits), or create a bare user record
 * on their very first request.  Habit creation now happens in onboarding via
 * /api/habits/bulk-create — we no longer auto-seed default habits here.
 *
 * @param {string}  userId     - The client-generated UUID stored in localStorage.
 * @param {object}  db         - Prisma client or $transaction client (default: global prisma).
 * @param {boolean} activeOnly - When true (default) only return isActive habits.
 *
 * Race-condition safe: P2002 caught and re-fetched.
 */
export async function getOrCreateUser(userId, db = prisma, activeOnly = true) {
  const habitWhere = activeOnly ? { where: { isActive: true } } : {};
  const existing = await db.user.findUnique({
    where: { id: userId },
    include: { habits: { ...habitWhere, orderBy: { sortOrder: 'asc' } } },
  });
  if (existing) return existing;

  try {
    return await db.user.create({
      data: { id: userId },
      include: { habits: { ...habitWhere, orderBy: { sortOrder: 'asc' } } },
    });
  } catch (e) {
    // Another concurrent request already created this user — just fetch it.
    if (e?.code === 'P2002') {
      return db.user.findUnique({
        where: { id: userId },
        include: { habits: { ...habitWhere, orderBy: { sortOrder: 'asc' } } },
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
