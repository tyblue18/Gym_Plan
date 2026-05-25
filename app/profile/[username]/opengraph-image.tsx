import { ImageResponse } from 'next/og';
import { prisma }        from '@/lib/prisma';

export const runtime     = 'nodejs';
export const alt         = 'Que profile';
export const size        = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BASE = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

// ── Font loader ───────────────────────────────────────────────────────────────

async function loadAnton(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      'https://fonts.googleapis.com/css2?family=Anton&display=swap',
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    ).then(r => r.text());
    const url = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/)?.[1];
    return url ? fetch(url).then(r => r.arrayBuffer()) : null;
  } catch { return null; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isImagePath(icon: string) { return icon.startsWith('/'); }

function initials(name: string | null, username: string | null): string {
  const src = name ?? username ?? '?';
  return src.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function topPR(settings: Record<string, unknown>): { name: string; weight: number } | null {
  try {
    const raw = settings['queLiftPRs'];
    const prs: Record<string, number> =
      typeof raw === 'string' ? JSON.parse(raw) :
      (raw && typeof raw === 'object' ? raw as Record<string, number> : {});
    const entries = Object.entries(prs).sort(([, a], [, b]) => b - a);
    if (!entries.length) return null;
    const [name, weight] = entries[0];
    return { name, weight };
  } catch { return null; }
}

// ── Image ─────────────────────────────────────────────────────────────────────

export default async function Image(
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;

  const [user, anton] = await Promise.all([
    prisma.appUser.findUnique({
      where:   { username },
      include: {
        badges:      { orderBy: { earnedAt: 'desc' } },
        workoutData: { select: { settings: true } },
      },
    }),
    loadAnton(),
  ]);

  if (!user) {
    // Fallback — generic card
    return new ImageResponse(
      <div style={{ background: '#07080A', width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#F4F4F5', fontSize: 64, fontFamily: 'sans-serif' }}>Que</span>
      </div>,
      { ...size },
    );
  }

  const settings     = (user.workoutData?.settings ?? {}) as Record<string, unknown>;
  const showcaseSlugs = (user.showcaseBadges as string[] | null) ?? [];
  const badgeMap     = new Map(user.badges.map(b => [b.slug, b]));
  const featuredBadge =
    showcaseSlugs.map(s => badgeMap.get(s)).find(Boolean) ??
    user.badges[0] ??
    null;

  const pr          = topPR(settings);
  const badgeCount  = user.badges.length;
  const displayName = user.name ?? user.username ?? username;
  const ini         = initials(user.name, user.username);

  const badgeImgSrc = featuredBadge && isImagePath(featuredBadge.icon)
    ? `${BASE}${featuredBadge.icon}`
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          background: '#07080A',
          width: '100%', height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glows */}
        <div style={{
          position: 'absolute', top: -180, left: -180,
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(79,195,247,0.13) 0%, transparent 65%)',
        }} />
        <div style={{
          position: 'absolute', bottom: -200, right: 200,
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(79,195,247,0.06) 0%, transparent 65%)',
        }} />

        {/* ── Left column ── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: '72px 64px',
          gap: 0,
        }}>

          {/* Chip */}
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'rgba(79,195,247,0.12)',
            border: '1px solid rgba(79,195,247,0.28)',
            borderRadius: '100px', padding: '5px 16px',
            marginBottom: '28px', width: 'fit-content',
          }}>
            <span style={{
              color: '#4FC3F7', fontSize: '12px', fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              fontFamily: 'sans-serif',
            }}>
              Que · Athlete Profile
            </span>
          </div>

          {/* Avatar + name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'rgba(79,195,247,0.15)',
              border: '2px solid rgba(79,195,247,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ color: '#4FC3F7', fontSize: '26px', fontWeight: 700, fontFamily: 'sans-serif' }}>
                {ini}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{
                fontFamily: anton ? 'Anton' : 'sans-serif',
                fontSize: '52px', color: '#F4F4F5', lineHeight: 0.95,
              }}>
                {displayName}
              </span>
              <span style={{ color: '#6B6E76', fontSize: '18px', fontFamily: 'sans-serif' }}>
                @{user.username ?? username}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div style={{
            height: '1px', background: 'rgba(255,255,255,0.06)',
            margin: '24px 0',
          }} />

          {/* Stats row */}
          <div style={{ display: 'flex', gap: '40px' }}>
            {pr && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{
                  fontFamily: anton ? 'Anton' : 'sans-serif',
                  fontSize: '38px', color: '#4FC3F7', lineHeight: 1,
                }}>
                  {pr.weight} lbs
                </span>
                <span style={{ color: '#6B6E76', fontSize: '13px', fontFamily: 'sans-serif' }}>
                  {pr.name} PR
                </span>
              </div>
            )}
            {badgeCount > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{
                  fontFamily: anton ? 'Anton' : 'sans-serif',
                  fontSize: '38px', color: '#4FC3F7', lineHeight: 1,
                }}>
                  {badgeCount}
                </span>
                <span style={{ color: '#6B6E76', fontSize: '13px', fontFamily: 'sans-serif' }}>
                  badge{badgeCount !== 1 ? 's' : ''} earned
                </span>
              </div>
            )}
          </div>

        </div>

        {/* ── Right column — featured badge ── */}
        <div style={{
          width: '320px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexDirection: 'column', gap: '16px',
          padding: '40px 48px 40px 0',
        }}>
          {featuredBadge ? (
            <>
              {badgeImgSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={badgeImgSrc}
                  alt={featuredBadge.label}
                  width={180}
                  height={180}
                  style={{ objectFit: 'contain', borderRadius: '20px' }}
                />
              ) : (
                <div style={{
                  width: 180, height: 180,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '110px', lineHeight: 1,
                }}>
                  {featuredBadge.icon}
                </div>
              )}
              <span style={{
                color: '#9EA1A8', fontSize: '14px',
                fontFamily: 'sans-serif', textAlign: 'center',
              }}>
                {featuredBadge.label}
              </span>
            </>
          ) : (
            <div style={{
              width: 160, height: 160, borderRadius: '50%',
              background: 'rgba(79,195,247,0.08)',
              border: '2px solid rgba(79,195,247,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontFamily: anton ? 'Anton' : 'sans-serif',
                fontSize: '64px', color: 'rgba(79,195,247,0.4)',
              }}>Q</span>
            </div>
          )}
        </div>

        {/* Bottom-left Que branding */}
        <div style={{
          position: 'absolute', bottom: '36px', left: '72px',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '13px', fontFamily: 'sans-serif' }}>
            que.app/profile/{user.username ?? username}
          </span>
        </div>

      </div>
    ),
    {
      ...size,
      fonts: anton
        ? [{ name: 'Anton', data: anton, style: 'normal' as const, weight: 400 as const }]
        : [],
    },
  );
}
