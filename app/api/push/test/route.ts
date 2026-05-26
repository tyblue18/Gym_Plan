import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { sendPushToUser }   from '@/lib/push';

export async function POST(req: Request): Promise<NextResponse> {
  void req;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  await sendPushToUser(session.user.id, {
    title: 'Que — notifications working ✓',
    body:  'You\'ll receive daily reminders and morning check-ins here.',
    url:   '/app',
  });

  return NextResponse.json({ ok: true });
}
