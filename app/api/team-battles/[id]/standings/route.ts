/**
 * GET /api/team-battles/[id]/standings — live mid-battle leaderboard.
 *
 * Read-only: scores the elapsed part of the window so participants can see who's
 * ahead and try to catch up. No coins move and nothing is resolved here.
 * Restricted to battle participants.
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';
import { computeStandings } from '@/lib/battleEngine';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const { id } = await params;

  const me = await prisma.teamBattleParticipant.findFirst({
    where:  { battleId: id, userId: session.user.id },
    select: { id: true },
  });
  if (!me) return NextResponse.json({ error: 'Not in this battle' }, { status: 403 });

  const standings = await computeStandings(id);
  if (!standings) return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
  return NextResponse.json(standings);
}
