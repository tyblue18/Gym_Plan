/**
 * POST /api/posts — share a logged workout snapshot to one or more of your
 * groups. The payload is a client-built snapshot of the day's activity (stored
 * as-is so the post survives later edits to the source day). Membership is
 * verified per group; unknown/non-member groups are silently dropped.
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';
import { feedLimit }        from '@/lib/ratelimit';
import { postCreateSchema } from '@/lib/validators';

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const meId = session.user.id;

  const { success } = await feedLimit.limit(meId);
  if (!success) return NextResponse.json({ error: 'Too many posts — slow down' }, { status: 429 });

  const parsed = postCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid post' }, { status: 400 });
  const { groupIds, date, payload, note } = parsed.data;

  const memberships = await prisma.groupMember.findMany({
    where:  { userId: meId, groupId: { in: groupIds } },
    select: { groupId: true },
  });
  const valid = memberships.map(m => m.groupId);
  if (valid.length === 0) return NextResponse.json({ error: 'Not a member of those groups' }, { status: 403 });

  await prisma.groupPost.createMany({
    data: valid.map(groupId => ({
      groupId, userId: meId, date,
      payload: payload as object,
      note: note?.trim() || null,
    })),
  });

  return NextResponse.json({ ok: true, shared: valid.length });
}
