import { getServerSession }                     from 'next-auth/next';
import { NextResponse }                         from 'next/server';
import { authOptions }                          from '@/lib/auth';
import { prisma }                               from '@/lib/prisma';
import { pushSubscribeSchema, pushDeleteSchema } from '@/lib/validators';

type PushSubClient = {
  upsert:      (args: unknown) => Promise<unknown>;
  deleteMany:  (args: unknown) => Promise<unknown>;
};
const ps = () => (prisma as unknown as { pushSubscription: PushSubClient }).pushSubscription;

interface SubBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const parsed = pushSubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  const body = parsed.data as SubBody;

  await ps().upsert({
    where:  { userId_endpoint: { userId: session.user.id, endpoint: body.endpoint } },
    create: { userId: session.user.id, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth },
    update: { p256dh: body.keys.p256dh, auth: body.keys.auth },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const dparsed = pushDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!dparsed.success) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
  const { endpoint } = dparsed.data;

  await ps().deleteMany({
    where: { userId: session.user.id, endpoint },
  });

  return NextResponse.json({ ok: true });
}
