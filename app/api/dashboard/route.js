import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { extractUserId, getOrCreateUser, renameHabit } from '../../../lib/users';
import { computeAllStats, buildCalendar, computePerHabitDetailed } from '../../../lib/stats';

/**
 * GET /api/dashboard?date=YYYY-MM-DD
 *
 * Single endpoint returning everything every view needs:
 *   { habits, completions, calendar, stats }
 *
 * stats shape: { streak, progress, perHabit[] }
 *   perHabit[]:  { id, name, streak, last7Days: bool[7], completedLast21 }
 *
 * Best streak and completion % removed — Progress tab derives only what it shows.
 *
 * DB: one $transaction with THREE parallelised queries (one DB round-trip).
 *
 * Server cache (module Map, 30 s TTL):
 *   Warm serverless instances reuse results — useful when the user is
 *   rapidly navigating between Today and Progress.
 *
 * Cache-Control: private, max-age=20, stale-while-revalidate=40
 */

// ── Server-side in-memory cache (warm lambda) ────────────────────────────────
const SERVER_CACHE     = new Map();
const SERVER_CACHE_TTL = 30_000; // 30 s
const SERVER_CACHE_MAX = 500;

function sGet(key) {
  const e = SERVER_CACHE.get(key);
  return e && Date.now() - e.ts < SERVER_CACHE_TTL ? e.payload : null;
}
function sSet(key, payload) {
  SERVER_CACHE.set(key, { payload, ts: Date.now() });
  if (SERVER_CACHE.size > SERVER_CACHE_MAX) {
    SERVER_CACHE.delete(SERVER_CACHE.keys().next().value);
  }
}

// ── Route handler ────────────────────────────────────────────────────────────

const LOOKBACK_DAYS = 366;

export async function GET(request) {
  const userId = extractUserId(request);
  if (!userId) return NextResponse.json({ error: 'Missing X-User-Id header' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const now  = new Date();
  const date = searchParams.get('date') || now.toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date (use YYYY-MM-DD)' }, { status: 400 });
  }

  // ── Server cache hit ──────────────────────────────────────────────────────
  const cacheKey = `${userId}:${date}`;
  const hit      = sGet(cacheKey);
  if (hit) {
    return NextResponse.json(hit, {
      headers: { 'Cache-Control': 'private, max-age=20, stale-while-revalidate=40' },
    });
  }

  try {
    // ── 1. Resolve user ───────────────────────────────────────────────────────
    const user   = await getOrCreateUser(userId);
    const habits = user.habits.map(renameHabit); // includes createdAt for per-day counts

    const lookbackStr = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
      .toISOString().slice(0, 10);

    // ── 2. Three reads in ONE transaction — single DB round-trip ─────────────
    const [completionsForDate, historyGroups, perHabitRecords] = await prisma.$transaction([

      // 2a. Completions for the requested date (Today view rendering)
      prisma.completion.findMany({
        where:   { userId, date, habit: { isActive: true } },
        select:  { id: true, habitId: true, date: true },
        orderBy: { habitId: 'asc' },
      }),

      // 2b. Per-day counts for streak + calendar (active habits only)
      prisma.completion.groupBy({
        by:      ['date'],
        where:   { userId, date: { gte: lookbackStr }, habit: { isActive: true } },
        _count:  { date: true },
        orderBy: { date: 'asc' },
      }),

      // 2c. Individual completion records — used to compute per-habit streak,
      //     last7Days, and 21-day count (replaces the old groupBy habitId).
      prisma.completion.findMany({
        where:  { userId, date: { gte: lookbackStr }, habit: { isActive: true } },
        select: { habitId: true, date: true },
      }),
    ]);

    // ── 3. Compute everything in memory ──────────────────────────────────────
    const today    = now.toISOString().slice(0, 10); // always real today for streaks
    const baseStats = computeAllStats(historyGroups, habits);
    const perHabit  = computePerHabitDetailed(perHabitRecords, habits, today);

    const stats = {
      streak:   baseStats.streak,
      progress: baseStats.progress,
      perHabit,
    };

    const calendar = buildCalendar(
      historyGroups, habits, now.getFullYear(), now.getMonth() + 1
    );

    const payload = { habits, completions: completionsForDate, calendar, stats };

    // ── 4. Cache + respond ────────────────────────────────────────────────────
    sSet(cacheKey, payload);

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=20, stale-while-revalidate=40' },
    });

  } catch (e) {
    console.error('[dashboard]', e);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
