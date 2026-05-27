/**
 * POST /monitoring — Sentry tunnel.
 *
 * The browser SDK is configured with `tunnel: '/monitoring'`, so it POSTs error
 * envelopes here (same-origin) instead of directly to *.ingest.sentry.io. Ad/
 * privacy blockers key off the sentry.io domain, so they drop those direct
 * requests (net::ERR_BLOCKED_BY_CLIENT); a request to our own domain sails
 * through, and we relay it to Sentry server-side (never blocked).
 *
 * This is NOT an open proxy: every envelope is validated to target OUR project
 * (parsed from the configured DSN) and the endpoint is IP rate-limited so it
 * can't be used to flood the Sentry quota.
 */
import { NextResponse }     from 'next/server';
import { monitoringLimit }  from '@/lib/ratelimit';

/** Allowed ingest target, parsed from the configured DSN. */
function allowedTarget(): { host: string; projectId: string } | null {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, '');
    return u.host && projectId ? { host: u.host, projectId } : null;
  } catch { return null; }
}

export async function POST(req: Request): Promise<Response> {
  const target = allowedTarget();
  if (!target) return new NextResponse(null, { status: 204 }); // tunnel disabled — no DSN configured

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
  const { success } = await monitoringLimit.limit(ip);
  if (!success) return new NextResponse(null, { status: 429 });

  const envelope = await req.text();
  // The envelope's first newline-delimited line is its header JSON, which (when
  // tunneling) carries the destination DSN.
  const nl   = envelope.indexOf('\n');
  const head = nl === -1 ? envelope : envelope.slice(0, nl);

  let dsn: string | undefined;
  try { dsn = JSON.parse(head).dsn; } catch { return new NextResponse(null, { status: 400 }); }
  if (!dsn) return new NextResponse(null, { status: 400 });

  let host: string, projectId: string;
  try {
    const u = new URL(dsn);
    host      = u.host;
    projectId = u.pathname.replace(/^\/+/, '');
  } catch { return new NextResponse(null, { status: 400 }); }

  // Only relay envelopes addressed to our own project/host.
  if (host !== target.host || projectId !== target.projectId) {
    return new NextResponse(null, { status: 403 });
  }

  const upstream = await fetch(`https://${host}/api/${projectId}/envelope/`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
    body:    envelope,
  });

  return new NextResponse(upstream.body, { status: upstream.status });
}
