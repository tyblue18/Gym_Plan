/**
 * GET   /api/user  — own profile (id, name, username, status, showcase, badgeCount)
 * PATCH /api/user  — update username | status | showcaseBadges
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';
import { userPatchSchema }  from '@/lib/validators';

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const user = await prisma.appUser.findUnique({
    where:   { id: session.user.id },
    include: { badges: { orderBy: { earnedAt: 'desc' } }, workoutData: { select: { settings: true } } },
  });
  if (!user) return NextResponse.json(null, { status: 404 });

  const statusActive = !user.statusExpiresAt || user.statusExpiresAt > new Date();
  const settings = (user.workoutData?.settings ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    id:              user.id,
    name:            user.name,
    username:        user.username,
    status:          statusActive ? user.status : null,
    statusExpiresAt: statusActive ? user.statusExpiresAt?.toISOString() ?? null : null,
    showcaseBadges:  (user.showcaseBadges as string[] | null) ?? [],
    badges:          user.badges,
    badgeCount:      user.badges.length,
    profilePhoto:    (settings['queProfilePhoto'] as string | undefined) ?? null,
  });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = userPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  const update: Record<string, unknown> = {};

  // ── Username ──────────────────────────────────────────────────────────────
  if (body.username !== undefined) {
    const username = body.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return NextResponse.json({ error: '3–20 chars, letters / numbers / underscores only' }, { status: 400 });
    }
    update.username = username;
  }

  // ── Status ────────────────────────────────────────────────────────────────
  if (body.statusDuration === 'clear') {
    update.status          = null;
    update.statusExpiresAt = null;
  } else if (body.status !== undefined) {
    const text = body.status?.trim().slice(0, 60) ?? '';
    update.status = text || null;
    update.statusExpiresAt = body.statusDuration === '24h'
      ? new Date(Date.now() + 24 * 60 * 60 * 1000)
      : null;
  }

  // ── Showcase ──────────────────────────────────────────────────────────────
  if (body.showcaseBadges !== undefined) {
    const slugs = body.showcaseBadges.slice(0, 8).filter((s): s is string => typeof s === 'string');
    update.showcaseBadges = slugs;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    await prisma.appUser.update({ where: { id: session.user.id }, data: update });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // P2002 = unique constraint violation (username taken)
    const code = (e as { code?: string }).code;
    return NextResponse.json(
      { error: code === 'P2002' ? 'Username already taken' : 'Update failed' },
      { status: code === 'P2002' ? 409 : 500 },
    );
  }
}
