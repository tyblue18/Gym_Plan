/**
 * POST   /api/groups/[id]/members — add a friend to the group (owner only).
 * DELETE /api/groups/[id]/members — remove a member (owner removes anyone;
 *                                   a member can remove themselves = leave).
 *                                   The owner can't leave — they delete the group.
 */

import { getServerSession }  from 'next-auth/next';
import { NextResponse }      from 'next/server';
import { authOptions }       from '@/lib/auth';
import { prisma }            from '@/lib/prisma';
import { groupLimit }        from '@/lib/ratelimit';
import { groupMemberSchema } from '@/lib/validators';

const MAX_GROUP_SIZE = 12;

async function areFriends(a: string, b: string): Promise<boolean> {
  const f = await prisma.friendship.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { requesterId: a, receiverId: b },
        { requesterId: b, receiverId: a },
      ],
    },
    select: { id: true },
  });
  return !!f;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const meId = session.user.id;

  const { success } = await groupLimit.limit(meId);
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  const parsed = groupMemberSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  const { userId } = parsed.data;

  const group = await prisma.group.findUnique({
    where: { id }, select: { ownerId: true, _count: { select: { members: true } } },
  });
  if (!group)               return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  if (group.ownerId !== meId) return NextResponse.json({ error: 'Only the owner can add members' }, { status: 403 });
  if (group._count.members >= MAX_GROUP_SIZE) {
    return NextResponse.json({ error: `Groups are capped at ${MAX_GROUP_SIZE} members` }, { status: 400 });
  }
  if (!(await areFriends(meId, userId))) {
    return NextResponse.json({ error: 'You can only add your friends' }, { status: 403 });
  }

  try {
    await prisma.groupMember.create({ data: { groupId: id, userId } });
  } catch {
    return NextResponse.json({ error: 'Already in the group' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const meId = session.user.id;

  const { success } = await groupLimit.limit(meId);
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  const parsed = groupMemberSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  const { userId } = parsed.data;

  const group = await prisma.group.findUnique({ where: { id }, select: { ownerId: true } });
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  const isOwner    = group.ownerId === meId;
  const removingSelf = userId === meId;

  // Owner can remove anyone except themselves; a member can only remove themselves.
  if (!isOwner && !removingSelf) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  if (userId === group.ownerId) {
    return NextResponse.json({ error: 'The owner can\'t leave — delete the group instead' }, { status: 400 });
  }

  await prisma.groupMember.deleteMany({ where: { groupId: id, userId } });
  return NextResponse.json({ ok: true });
}
