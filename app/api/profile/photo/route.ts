import { put }              from '@vercel/blob';
import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const form = await req.formData();
  const file = form.get('photo') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (file.size > 500_000) return NextResponse.json({ error: 'Too large' }, { status: 413 });

  const blob = await put(`photos/${session.user.id}.jpg`, file, { access: 'public', addRandomSuffix: false });

  // Persist the blob URL directly into workoutData.settings so the photo is
  // immediately available via /api/user and /api/friends without waiting for
  // the client-side sync push to complete.
  const existing = await prisma.workoutData.findUnique({ where: { userId: session.user.id } });
  const merged   = { ...((existing?.settings ?? {}) as Record<string, unknown>), queProfilePhoto: blob.url };
  await prisma.workoutData.upsert({
    where:  { userId: session.user.id },
    create: { userId: session.user.id, localDB: {} as never, profile: {} as never, settings: merged as never },
    update: { settings: merged as never },
  });

  return NextResponse.json({ url: blob.url });
}
