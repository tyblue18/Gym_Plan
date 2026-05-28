/**
 * GET /api/groups/[id]/leaderboard?metric=<categorySlug>&range=<day|3day|week>
 *
 * Read-only group leaderboard: ranks every group member by a battle-category
 * metric over a trailing window ending today (UTC). Reuses the same scoring
 * functions as typed battles (lib/battle-categories) so the numbers match.
 * No wagers, no persistence — purely derived from members' DayRecords.
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';
import { isGroupMember }    from '@/lib/groupAccess';
import { getCategory, type DayRow } from '@/lib/battle-categories';
import { todayUTC }         from '@/lib/battleEngine';
import { PROFILE_PHOTO_KEY } from '@/lib/constants';

const SPAN: Record<string, number> = { day: 0, '3day': 2, week: 6 };

function addDaysUTC(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const meId = session.user.id;
  const { id } = await params;

  if (!(await isGroupMember(meId, id))) {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  }

  const url    = new URL(req.url);
  const metric = url.searchParams.get('metric') ?? 'cardio.steps';
  const range  = url.searchParams.get('range')  ?? 'week';
  const cat    = getCategory(metric);
  if (!cat)            return NextResponse.json({ error: 'Unknown metric' }, { status: 400 });
  if (!(range in SPAN)) return NextResponse.json({ error: 'Unknown range' }, { status: 400 });

  const end   = todayUTC();
  const start = addDaysUTC(end, -SPAN[range]);

  const group = await prisma.group.findUnique({
    where:  { id },
    select: {
      members: {
        select: { user: { select: { id: true, name: true, username: true, workoutData: { select: { settings: true } } } } },
      },
    },
  });
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  const members   = group.members.map(m => m.user);
  const memberIds = members.map(u => u.id);

  const rows = await (prisma as unknown as {
    dayRecord: { findMany: (a: unknown) => Promise<Array<{ userId: string; date: string; data: unknown }>> };
  }).dayRecord.findMany({
    where:  { userId: { in: memberIds }, date: { gte: start, lte: end } },
    select: { userId: true, date: true, data: true },
  });

  const byUser = new Map<string, DayRow[]>();
  for (const uid of memberIds) byUser.set(uid, []);
  for (const r of rows) {
    byUser.get(r.userId)?.push({ date: r.date, data: (r.data ?? {}) as Record<string, unknown> });
  }

  const photoOf = (settings: unknown): string | null => {
    const s = (settings ?? {}) as Record<string, unknown>;
    return typeof s[PROFILE_PHOTO_KEY] === 'string' ? (s[PROFILE_PHOTO_KEY] as string) : null;
  };

  const board = members.map(u => ({
    userId:   u.id,
    name:     u.name,
    username: u.username,
    photo:    photoOf(u.workoutData?.settings),
    value:    cat.score(byUser.get(u.id) ?? []),
  }));

  // Nulls (no data) sink to the bottom; otherwise order by the category's direction.
  board.sort((a, b) => {
    if (a.value === null && b.value === null) return 0;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return cat.direction === 'higher' ? b.value - a.value : a.value - b.value;
  });

  return NextResponse.json({
    metric:    cat.slug,
    label:     cat.label,
    unit:      cat.unit,
    direction: cat.direction,
    range,
    startDate: start,
    endDate:   end,
    you:       meId,
    rows:      board,
  });
}
