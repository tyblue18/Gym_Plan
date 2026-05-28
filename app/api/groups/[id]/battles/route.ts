/**
 * GET /api/groups/[id]/battles — the group's active + pending team battles,
 * with participants and (for active ones) live standings. Member-gated.
 *
 * Powers the "Active · N" strip on the group page. Standings are computed
 * read-only via computeStandings (no coins move, nothing resolves here).
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';
import { isGroupMember }    from '@/lib/groupAccess';
import { computeStandings } from '@/lib/battleEngine';
import { PROFILE_PHOTO_KEY } from '@/lib/constants';

function photoFrom(settings: unknown): string | null {
  const s = (settings ?? {}) as Record<string, unknown>;
  return typeof s[PROFILE_PHOTO_KEY] === 'string' ? (s[PROFILE_PHOTO_KEY] as string) : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const meId = session.user.id;
  const { id } = await params;

  if (!(await isGroupMember(meId, id))) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const battles = await prisma.teamBattle.findMany({
    where:   { groupId: id, status: { in: ['active', 'pending'] } },
    orderBy: { createdAt: 'desc' },
    include: {
      participants: {
        select: {
          userId: true, team: true, accepted: true,
          user: { select: { id: true, name: true, username: true, workoutData: { select: { settings: true } } } },
        },
      },
    },
  });

  // Active battles get live standings; pending ones haven't started.
  const shaped = await Promise.all(battles.map(async b => ({
    id: b.id, mode: b.mode, wager: b.wager, bestOf: b.bestOf, windowKind: b.windowKind,
    startDate: b.startDate, endDate: b.endDate, categories: (b.categories ?? []) as string[],
    status: b.status,
    participants: b.participants.map(p => ({
      id: p.userId, team: p.team, accepted: p.accepted,
      name: p.user.name, username: p.user.username, photo: photoFrom(p.user.workoutData?.settings),
    })),
    standings: b.status === 'active' ? await computeStandings(b.id) : null,
    mine: b.participants.some(p => p.userId === meId),
  })));

  return NextResponse.json({ battles: shaped });
}
