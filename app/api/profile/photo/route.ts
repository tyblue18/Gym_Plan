import { put }              from '@vercel/blob';
import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json(null, { status: 401 });

  const form = await req.formData();
  const file = form.get('photo') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (file.size > 500_000) return NextResponse.json({ error: 'Too large' }, { status: 413 });

  const safe = session.user.email.replace(/[^a-z0-9]/gi, '_');
  const blob = await put(`photos/${safe}.jpg`, file, { access: 'public', addRandomSuffix: false });

  return NextResponse.json({ url: blob.url });
}
