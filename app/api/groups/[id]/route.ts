/**
 * PATCH  /api/groups/[id] — rename a group (owner only).
 * DELETE /api/groups/[id] — delete a group (owner only); members cascade.
 */

import { getServerSession }  from 'next-auth/next';
import { NextResponse }      from 'next/server';
import { authOptions }       from '@/lib/auth';
import { prisma }            from '@/lib/prisma';
import { groupLimit }        from '@/lib/ratelimit';
import { groupRenameSchema } from '@/lib/validators';

async function ownedGroup(groupId: string, meId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true, ownerId: true } });
  if (!group) return { error: NextResponse.json({ error: 'Group not found' }, { status: 404 }) };
  if (group.ownerId !== meId) return { error: NextResponse.json({ error: 'Only the owner can do that' }, { status: 403 }) };
  return { group };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const meId = session.user.id;

  const { success } = await groupLimit.limit(meId);
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  const parsed = groupRenameSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const { error } = await ownedGroup(id, meId);
  if (error) return error;

  await prisma.group.update({ where: { id }, data: { name: parsed.data.name.trim() } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const meId = session.user.id;

  const { success } = await groupLimit.limit(meId);
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  const { error } = await ownedGroup(id, meId);
  if (error) return error;

  // Deleting a group cascade-deletes its TeamBattles — which would destroy any
  // escrowed coins in pending/active battles without refunding. Block until
  // those battles finish or are cancelled (which refunds the antes).
  const live = await prisma.teamBattle.count({ where: { groupId: id, status: { in: ['pending', 'active'] } } });
  if (live > 0) {
    return NextResponse.json({ error: 'Cancel or finish this group\'s battles before deleting it.' }, { status: 409 });
  }

  await prisma.group.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
