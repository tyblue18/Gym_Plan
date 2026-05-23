import { put }              from '@vercel/blob';
import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const form = await req.formData();
  const file = form.get('photo') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (file.size > 500_000) return NextResponse.json({ error: 'Too large' }, { status: 413 });

  const blob = await put(`photos/${session.user.id}.jpg`, file, { access: 'public', addRandomSuffix: false });

  return NextResponse.json({ url: blob.url });
}
