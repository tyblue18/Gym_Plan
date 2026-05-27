/**
 * app/api/sync/route.ts
 *
 * GET  /api/sync  — pull the user's cloud snapshot
 * POST /api/sync  — push a partial or full snapshot update
 *
 * localDB is stored as individual DayRecord rows (one per YYYY-MM-DD).
 * GET falls back to WorkoutData.localDB blob for days not yet migrated.
 * Profile and settings remain in WorkoutData.
 */

import { getServerSession }        from 'next-auth/next';
import { after, NextResponse }     from 'next/server';
import { Redis }                   from '@upstash/redis';
import { authOptions }             from '@/lib/auth';
import { prisma }                  from '@/lib/prisma';
import { checkAndAwardBadges }     from '@/lib/badgeEngine';
import type { AwardedBadge }       from '@/lib/badgeEngine';
import { checkAndAwardCoins }      from '@/lib/coinEngine';
import type { CoinAward }          from '@/lib/coinEngine';
import { syncLimit }               from '@/lib/ratelimit';
import { syncPostSchema }          from '@/lib/validators';

const redis = new Redis({
  url:   process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// ─────────────────────────────────────────────────────────────────────────────
// GET — pull latest snapshot
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const userId = session.user.id;

  const dayRecordClient = (prisma as unknown as {
    dayRecord: { findMany: (args: unknown) => Promise<Array<{ date: string; data: unknown; updatedAt: Date }>> };
  }).dayRecord;

  const [wd, dayRows, pendingBadgesRaw] = await Promise.all([
    prisma.workoutData.findUnique({ where: { userId } }),
    dayRecordClient.findMany({ where: { userId }, select: { date: true, data: true, updatedAt: true } }),
    redis.getdel<AwardedBadge[]>(`pending:badges:${userId}`),
  ]);

  // Merge: legacy blob provides the base, DayRecord rows win for days already migrated.
  // Embed _syncedAt so the client can send it back and we can detect stale writes.
  const blobDB  = (wd?.localDB ?? {}) as Record<string, unknown>;
  const rowsMap = Object.fromEntries(
    dayRows.map((r: { date: string; data: unknown; updatedAt: Date }) => [
      r.date,
      { ...(r.data as object), _syncedAt: r.updatedAt.toISOString() },
    ])
  );
  const localDB   = { ...blobDB, ...rowsMap };
  const newBadges = pendingBadgesRaw ?? [];

  return NextResponse.json({
    localDB,
    profile:  wd?.profile  ?? {},
    settings: wd?.settings ?? {},
    ...(newBadges.length > 0 && { newBadges }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — push partial or full snapshot
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const userId = session.user.id;

  const { success } = await syncLimit.limit(userId);
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = syncPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  // ── Fetch pending notifications from the previous background run (in parallel
  //    with the WorkoutData read so the Redis calls add zero extra latency) ────
  const [existing, pendingBadgesRaw, pendingCoinsRaw] = await Promise.all([
    prisma.workoutData.findUnique({ where: { userId } }),
    redis.getdel<AwardedBadge[]>(`pending:badges:${userId}`),
    redis.getdel<{ newCoins: CoinAward[]; walletBalance: number }>(`pending:coins:${userId}`),
  ]);
  const newBadges: AwardedBadge[] = pendingBadgesRaw ?? [];
  const newCoins:  CoinAward[]    = pendingCoinsRaw?.newCoins  ?? [];
  const walletBalance              = pendingCoinsRaw?.walletBalance;

  // ── Profile + settings go to WorkoutData ────────────────────────────────────
  const existingSettings = (existing?.settings ?? {}) as Record<string, unknown>;
  const mergedSettings   = body.settings !== undefined
    ? { ...existingSettings, ...body.settings }
    : existingSettings;

  await prisma.workoutData.upsert({
    where:  { userId },
    create: {
      userId,
      localDB:  {} as never,   // no longer written here
      profile:  (body.profile ?? {}) as never,
      settings: mergedSettings as never,
      syncedAt: new Date(),
    },
    update: {
      ...(body.profile !== undefined && { profile: body.profile as never }),
      settings: mergedSettings as never,
      syncedAt: new Date(),
    },
  });

  // ── Each day goes to its own DayRecord row (with conflict detection) ─────────
  const conflicts: Array<{ date: string; data: unknown }> = [];

  if (body.localDB && Object.keys(body.localDB).length > 0) {
    const dates = Object.keys(body.localDB);

    // Single query to fetch all existing rows for these dates
    const existingRows = await (prisma as unknown as {
      dayRecord: {
        findMany: (args: unknown) => Promise<Array<{ date: string; updatedAt: Date; data: unknown }>>;
      };
    }).dayRecord.findMany({
      where:  { userId, date: { in: dates } },
      select: { date: true, updatedAt: true, data: true },
    });
    const existingMap = new Map(existingRows.map((r: { date: string; updatedAt: Date; data: unknown }) => [r.date, r]));

    const toUpsert: Array<{ date: string; data: unknown }> = [];
    // 60s tolerance for legitimate clock skew between client browser and server.
    const FUTURE_TOLERANCE_MS = 60_000;
    const now = Date.now();

    for (const [date, rawData] of Object.entries(body.localDB)) {
      const incoming = rawData as Record<string, unknown>;
      const syncedAt = incoming._syncedAt as string | undefined;
      const editedAt = incoming._editedAt as string | undefined;
      // Strip transport fields before storing. _syncedAt is recomputed on
      // every read; _editedAt is persisted as part of the data so multi-device
      // newer-wins comparisons survive future syncs.
      const { _syncedAt: _, ...cleanData } = incoming;

      const stored = existingMap.get(date) as { date: string; updatedAt: Date; data: unknown } | undefined;

      if (stored) {
        // Prefer edit-time chronology when the incoming write carries _editedAt.
        // This is the multi-device case: phone edits at 10:01, syncs; laptop
        // edits at 10:30 (without seeing phone's edit), syncs at 10:31. The
        // old code rejected laptop because its _syncedAt was stale, dropping
        // a newer real-world edit. Comparing _editedAt instead keeps laptop's.
        if (editedAt) {
          const editedAtMs   = new Date(editedAt).getTime();
          const storedEdited = (stored.data as { _editedAt?: string })._editedAt;
          const storedEditMs = storedEdited ? new Date(storedEdited).getTime() : 0;
          const malformed    = !Number.isFinite(editedAtMs) || editedAtMs > now + FUTURE_TOLERANCE_MS;
          if (malformed || editedAtMs < storedEditMs) {
            conflicts.push({
              date,
              data: { ...(stored.data as object), _syncedAt: stored.updatedAt.toISOString() },
            });
            continue;
          }
          // Newer or equal edit time → accept the write.
        } else if (syncedAt) {
          // Legacy client without _editedAt — fall back to stale-write check.
          const syncedAtMs = new Date(syncedAt).getTime();
          const untrustworthy =
            !Number.isFinite(syncedAtMs) ||
            syncedAtMs > now + FUTURE_TOLERANCE_MS ||
            stored.updatedAt.getTime() > syncedAtMs;
          if (untrustworthy) {
            conflicts.push({
              date,
              data: { ...(stored.data as object), _syncedAt: stored.updatedAt.toISOString() },
            });
            continue;
          }
        }
      }

      toUpsert.push({ date, data: cleanData });
    }

    const dr = (prisma as unknown as {
      dayRecord: { upsert: (args: unknown) => Promise<unknown> };
    }).dayRecord;

    await Promise.all(
      toUpsert.map(({ date, data }) =>
        dr.upsert({
          where:  { userId_date: { userId, date } },
          create: { userId, date, data },
          update: { data },
        })
      )
    );
  }

  // Badge check runs synchronously so the result is returned in THIS response,
  // giving immediate popup feedback. It runs after upserts so the DB has the
  // latest data when we scan for qualifying runs/streaks.
  // Coins run in after() since they are less time-critical.
  let earnedBadges: AwardedBadge[] = [];
  let revokedBadges: AwardedBadge[] = [];
  try {
    const badgeResult = await checkAndAwardBadges(userId, mergedSettings);
    earnedBadges  = badgeResult.awarded;
    revokedBadges = badgeResult.revoked;

    if (revokedBadges.length > 0) {
      const revokedSlugs = new Set(revokedBadges.map(b => b.slug));
      const user = await prisma.appUser.findUnique({
        where:  { id: userId },
        select: { showcaseBadges: true },
      });
      if (user) {
        const current = (user.showcaseBadges as string[] | null) ?? [];
        const cleaned = current.filter(s => !revokedSlugs.has(s));
        if (cleaned.length !== current.length) {
          await prisma.appUser.update({
            where: { id: userId },
            data:  { showcaseBadges: cleaned },
          });
        }
      }
    }
  } catch { /* non-critical — don't fail the sync */ }

  after(async () => {
    try {
      const coinResult = await checkAndAwardCoins(userId);
      if (coinResult.awarded.length > 0) {
        await redis.setex(`pending:coins:${userId}`, 3600, JSON.stringify({
          newCoins: coinResult.awarded, walletBalance: coinResult.walletBalance,
        }));
      }
    } catch { /* non-critical */ }
  });

  // Merge any badges that were queued in Redis from a prior session (backward compat)
  // with badges awarded synchronously in this request.
  const allNewBadges = [...newBadges, ...earnedBadges];

  // Return the server's own timestamp so the client can stamp _syncedAt without
  // relying on its (possibly skewed or maliciously forged) local clock. This is
  // strictly >= every upsert's actual updatedAt in this request.
  const syncedAt = new Date().toISOString();

  return NextResponse.json({
    ok: true,
    syncedAt,
    ...(conflicts.length    > 0 && { conflicts }),
    ...(allNewBadges.length > 0 && { newBadges: allNewBadges }),
    ...(revokedBadges.length > 0 && { revokedBadges }),
    ...(newCoins.length  > 0  && { newCoins, walletBalance }),
  });
}
