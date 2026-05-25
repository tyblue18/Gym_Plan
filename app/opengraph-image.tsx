import { ImageResponse } from 'next/og';

export const runtime     = 'edge';
export const alt         = 'Que — Training & Calorie Log';
export const size        = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  // Fetch Anton from Google Fonts CSS then extract the woff2 URL
  const css = await fetch(
    'https://fonts.googleapis.com/css2?family=Anton&display=swap',
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
  ).then(r => r.text());

  const fontUrl = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/)?.[1];
  const antonData = fontUrl
    ? await fetch(fontUrl).then(r => r.arrayBuffer())
    : null;

  const features = ['Workout Log', 'Calorie Tracking', 'Metrics', 'Challenges'];

  return new ImageResponse(
    (
      <div
        style={{
          background: '#07080A',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Ambient glow */}
        <div
          style={{
            position: 'absolute',
            top: -160,
            left: -160,
            width: 700,
            height: 700,
            background: 'radial-gradient(circle, rgba(79,195,247,0.14) 0%, transparent 65%)',
            borderRadius: '50%',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -200,
            right: -100,
            width: 500,
            height: 500,
            background: 'radial-gradient(circle, rgba(79,195,247,0.06) 0%, transparent 65%)',
            borderRadius: '50%',
          }}
        />

        {/* Athlete OS badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(79,195,247,0.12)',
            border: '1px solid rgba(79,195,247,0.28)',
            borderRadius: '100px',
            padding: '6px 18px',
            marginBottom: '28px',
          }}
        >
          <span
            style={{
              color: '#4FC3F7',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontFamily: 'sans-serif',
            }}
          >
            Athlete OS
          </span>
        </div>

        {/* Logo + title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '20px' }}>
          <span
            style={{
              fontFamily: antonData ? 'Anton' : 'sans-serif',
              fontSize: '120px',
              color: '#F4F4F5',
              lineHeight: 0.9,
              letterSpacing: '-0.01em',
            }}
          >
            Que
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '26px',
            color: '#9EA1A8',
            fontFamily: 'sans-serif',
            marginBottom: '52px',
            lineHeight: 1.4,
          }}
        >
          Training log &amp; calorie tracker for athletes.
        </div>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {features.map(f => (
            <div
              key={f}
              style={{
                background: '#0E0F12',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                padding: '9px 18px',
                color: '#9EA1A8',
                fontSize: '15px',
                fontFamily: 'sans-serif',
              }}
            >
              {f}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: antonData
        ? [{ name: 'Anton', data: antonData, style: 'normal', weight: 400 }]
        : [],
    },
  );
}
