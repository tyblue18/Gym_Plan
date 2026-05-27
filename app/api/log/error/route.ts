/**
 * app/api/log/error/route.ts
 *
 * Sink for client-side error reports from lib/errorReporter.ts. The
 * implementation is deliberately minimal — console.error in a Vercel
 * function lands in the Vercel dashboard logs, which is enough first-pass
 * visibility. Swap in Sentry/Bugsnag later by extending this handler.
 *
 * Rate-limited per-user (or per-IP for unauthenticated callers) so a runaway
 * client loop can't spam the function.
 */

import { NextResponse }        from 'next/server';
import { getServerSession }    from 'next-auth/next';
import { authOptions }         from '@/lib/auth';
import { Ratelimit }           from '@upstash/ratelimit';
import { Redis }               from '@upstash/redis';

const redis = Redis.fromEnv();

// 20 errors / minute / identity. Generous for normal apps; tight enough to
// stop a tight loop from filling the log stream.
const errorLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(20, '1 m'),
  prefix:  'rl:err',
});

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  // Identity for rate limiting. Falls back to a forwarded IP header in case
  // the user isn't logged in yet (sign-in page errors should still log).
  const id = session?.user?.id
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'anon';

  const { success } = await errorLimit.limit(id);
  if (!success) return NextResponse.json({ ok: false }, { status: 429 });

  let payload: unknown;
  try { payload = await req.json(); }
  catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  // Single-line JSON so the log entry stays grep-friendly in the Vercel UI.
  console.error('[client-error]', JSON.stringify({
    userId: session?.user?.id ?? null,
    ...(payload as Record<string, unknown>),
  }));

  return NextResponse.json({ ok: true });
}
