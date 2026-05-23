/**
 * POST /api/challenges/[id]
 * Body: { action: 'accept' | 'decline' }
 *
 * accept:  challengee pays wager, badge counts compared, winner gets 2× wager.
 *          Tie → both refunded.
 * decline: challenge cancelled, challenger refunded.
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const { action } = await req.json() as { action?: 'accept' | 'decline' };
  if (action !== 'accept' && action !== 'decline') {
    return NextResponse.json({ error: 'action must be accept or decline' }, { status: 400 });
  }

  const me = { id: session.user.id };

  const challenge = await prisma.challenge.findUnique({ where: { id } });
  if (!challenge || challenge.status !== 'pending') {
    return NextResponse.json({ error: 'Challenge not found or already resolved' }, { status: 404 });
  }
  if (challenge.challengeeId !== me.id) {
    return NextResponse.json({ error: 'Not your challenge to respond to' }, { status: 403 });
  }

  // ── Decline — refund challenger ───────────────────────────────────────────
  if (action === 'decline') {
    const challengerWallet = await prisma.coinWallet.upsert({
      where:  { userId: challenge.challengerId },
      create: { userId: challenge.challengerId, balance: 0 },
      update: {},
    });

    await prisma.$transaction([
      prisma.coinWallet.update({
        where: { id: challengerWallet.id },
        data:  { balance: { increment: challenge.wager } },
      }),
      prisma.coinTransaction.create({
        data: { walletId: challengerWallet.id, amount: challenge.wager, reason: 'refund', refId: challenge.id },
      }),
      prisma.challenge.update({
        where: { id: challenge.id },
        data:  { status: 'cancelled', resolvedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ ok: true, result: 'declined' });
  }

  // ── Accept — deduct from challengee, resolve, award winner ───────────────
  const challengeeWallet = await prisma.coinWallet.upsert({
    where:  { userId: me.id },
    create: { userId: me.id, balance: 0 },
    update: {},
  });
  if (challengeeWallet.balance < challenge.wager) {
    return NextResponse.json(
      { error: `Not enough coins (have ${challengeeWallet.balance}, need ${challenge.wager})` },
      { status: 400 },
    );
  }

  const challengerWallet = await prisma.coinWallet.upsert({
    where:  { userId: challenge.challengerId },
    create: { userId: challenge.challengerId, balance: 0 },
    update: {},
  });

  // Compare total badge counts
  const [challengerCount, challengeeCount] = await Promise.all([
    prisma.badge.count({ where: { userId: challenge.challengerId } }),
    prisma.badge.count({ where: { userId: me.id } }),
  ]);

  const winnerId: string | null =
    challengerCount > challengeeCount ? challenge.challengerId :
    challengeeCount > challengerCount ? me.id :
    null; // tie

  const pot = challenge.wager * 2;

  try {
  await prisma.$transaction(async tx => {
    // Deduct wager from challengee — re-check balance atomically
    const afterDeduct = await tx.coinWallet.update({ where: { id: challengeeWallet.id }, data: { balance: { decrement: challenge.wager } } });
    if (afterDeduct.balance < 0) throw new Error('INSUFFICIENT_FUNDS');
    await tx.coinTransaction.create({ data: { walletId: challengeeWallet.id, amount: -challenge.wager, reason: 'battle_bet', refId: challenge.id } });

    if (winnerId) {
      // Award pot to winner
      const winnerWalletId = winnerId === challenge.challengerId ? challengerWallet.id : challengeeWallet.id;
      await tx.coinWallet.update({ where: { id: winnerWalletId }, data: { balance: { increment: pot } } });
      await tx.coinTransaction.create({ data: { walletId: winnerWalletId, amount: pot, reason: 'battle_win', refId: challenge.id } });
    } else {
      // Tie: refund both
      for (const wId of [challengerWallet.id, challengeeWallet.id]) {
        await tx.coinWallet.update({ where: { id: wId }, data: { balance: { increment: challenge.wager } } });
        await tx.coinTransaction.create({ data: { walletId: wId, amount: challenge.wager, reason: 'refund', refId: challenge.id } });
      }
    }

    await tx.challenge.update({
      where: { id: challenge.id },
      data:  { status: 'resolved', winnerId, resolvedAt: new Date() },
    });
  });
  } catch (e) {
    if (e instanceof Error && e.message === 'INSUFFICIENT_FUNDS') {
      return NextResponse.json({ error: 'Not enough coins to accept this challenge' }, { status: 400 });
    }
    throw e;
  }

  return NextResponse.json({
    ok: true,
    result: winnerId === me.id ? 'win' : winnerId === null ? 'tie' : 'loss',
    winnerId,
    challengerCount,
    challengeeCount,
  });
}
