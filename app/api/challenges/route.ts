/**
 * GET  /api/challenges — list incoming, sent, and resolved challenges
 * POST /api/challenges — send a challenge to a friend (deducts wager immediately)
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';

async function getUser(email: string) {
  return prisma.appUser.findUnique({ where: { email } });
}

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json(null, { status: 401 });

  const me = await getUser(session.user.email);
  if (!me) return NextResponse.json({ incoming: [], sent: [], resolved: [] });

  const select = {
    id: true, wager: true, status: true, categories: true,
    winnerId: true, resolvedAt: true, createdAt: true,
    challenger: { select: { id: true, name: true, username: true } },
    challengee: { select: { id: true, name: true, username: true } },
  };

  const [sent, received] = await Promise.all([
    prisma.challenge.findMany({
      where:   { challengerId: me.id },
      select,
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.challenge.findMany({
      where:   { challengeeId: me.id },
      select,
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  const incoming = received.filter(c => c.status === 'pending');
  const sentPending = sent.filter(c => c.status === 'pending');
  const resolved = [...sent, ...received]
    .filter(c => c.status === 'resolved' || c.status === 'cancelled')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return NextResponse.json({ incoming, sent: sentPending, resolved });
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json(null, { status: 401 });

  const { friendId, wager } = await req.json() as { friendId?: string; wager?: number };
  if (!friendId) return NextResponse.json({ error: 'friendId required' }, { status: 400 });
  if (typeof wager !== 'number' || wager < 1) {
    return NextResponse.json({ error: 'Wager must be at least 1 coin' }, { status: 400 });
  }

  const me = await getUser(session.user.email);
  if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Verify friendship
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { requesterId: me.id, receiverId: friendId },
        { requesterId: friendId, receiverId: me.id },
      ],
    },
  });
  if (!friendship) return NextResponse.json({ error: 'Not friends' }, { status: 403 });

  // Check balance
  const wallet = await prisma.coinWallet.upsert({
    where:  { userId: me.id },
    create: { userId: me.id, balance: 0 },
    update: {},
  });
  if (wallet.balance < wager) {
    return NextResponse.json({ error: `Not enough coins (have ${wallet.balance})` }, { status: 400 });
  }

  // Check no existing pending challenge between them
  const existing = await prisma.challenge.findFirst({
    where: {
      status: 'pending',
      OR: [
        { challengerId: me.id, challengeeId: friendId },
        { challengerId: friendId, challengeeId: me.id },
      ],
    },
  });
  if (existing) return NextResponse.json({ error: 'A pending challenge already exists' }, { status: 409 });

  // Create challenge + deduct wager atomically.
  // Balance re-checked inside the transaction to prevent race conditions.
  let challenge;
  try {
    challenge = await prisma.$transaction(async tx => {
      const updated = await tx.coinWallet.update({
        where: { id: wallet.id },
        data:  { balance: { decrement: wager } },
      });
      if (updated.balance < 0) throw new Error('INSUFFICIENT_FUNDS');
      await tx.coinTransaction.create({
        data: { walletId: wallet.id, amount: -wager, reason: 'battle_bet' },
      });
      return tx.challenge.create({
        data: {
          challengerId: me.id,
          challengeeId: friendId,
          wager,
          categories:   ['all'],
          status:       'pending',
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'INSUFFICIENT_FUNDS') {
      return NextResponse.json({ error: 'Not enough coins' }, { status: 400 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true, challengeId: challenge.id });
}
