/**
 * GET  /api/wallet         — return current balance (auto-creates wallet)
 * POST /api/wallet/import  — one-time seed from localStorage coins
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const wallet = await prisma.coinWallet.upsert({
    where:  { userId: session.user.id },
    create: { userId: session.user.id, balance: 0 },
    update: {},
  });

  return NextResponse.json({ balance: wallet.balance, walletId: wallet.id });
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const { balance } = await req.json() as { balance?: number };
  if (typeof balance !== 'number' || balance < 0) {
    return NextResponse.json({ error: 'Invalid balance' }, { status: 400 });
  }

  const userId = session.user.id;

  // Idempotent: only seed if wallet has never been imported (balance === 0 and no prior transactions)
  const wallet = await prisma.coinWallet.upsert({
    where:  { userId },
    create: { userId, balance: 0 },
    update: {},
    include: { transactions: { take: 1 } },
  });

  const alreadyImported = wallet.transactions.some(t => t.reason === 'import');
  if (alreadyImported || balance === 0) {
    return NextResponse.json({ balance: wallet.balance, skipped: true });
  }

  const updated = await prisma.$transaction(async tx => {
    await tx.coinTransaction.create({
      data: { walletId: wallet.id, amount: balance, reason: 'import' },
    });
    return tx.coinWallet.update({
      where: { id: wallet.id },
      data:  { balance: { increment: balance } },
    });
  });

  return NextResponse.json({ balance: updated.balance, imported: true });
}
