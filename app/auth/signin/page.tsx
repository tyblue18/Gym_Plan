'use client';

import { signIn } from 'next-auth/react';
import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import queLogo from '../../../public/Que_logo.png';

/* ── Animated starfield canvas ─────────────────────────────────────── */
function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;

    let w = (c.width  = window.innerWidth);
    let h = (c.height = window.innerHeight);

    type Star = { x: number; y: number; r: number; a: number; s: number; p: number };
    const make = (): Star => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.4 + 0.2,
      a: Math.random() * 0.8 + 0.1,
      s: Math.random() * 0.006 + 0.002,
      p: Math.random() * Math.PI * 2,
    });
    const stars: Star[] = Array.from({ length: 220 }, make);

    let t = 0;
    let id: number;
    function draw() {
      ctx.clearRect(0, 0, w, h);
      t += 0.016;
      for (const s of stars) {
        const op = s.a * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.s * 50 + s.p)));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${op.toFixed(2)})`;
        ctx.fill();
      }
      id = requestAnimationFrame(draw);
    }
    draw();

    const resize = () => {
      w = c.width  = window.innerWidth;
      h = c.height = window.innerHeight;
      stars.forEach(s => { s.x = Math.random() * w; s.y = Math.random() * h; });
    };
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={ref} className="si-starfield" aria-hidden="true" />;
}

/* ── GitHub mark ────────────────────────────────────────────────────── */
function GitHubMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

/* ── Google mark ─────────────────────────────────────────────────────── */
function GoogleMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

/* NextAuth appends ?error=<code> to the signIn page when a round-trip fails.
 * Most "had to sign in twice" reports are a first attempt bouncing back here
 * with OAuthCallback/Callback (a state/PKCE cookie check that failed) — which
 * looked identical to a fresh page until we surfaced it. */
const ERROR_COPY: Record<string, string> = {
  OAuthCallback:       'Sign-in didn’t complete — please try once more.',
  Callback:            'Sign-in didn’t complete — please try once more.',
  OAuthSignin:         'Could not start sign-in. Try again.',
  OAuthAccountNotLinked: 'That email is already linked to a different sign-in method.',
  AccessDenied:        'Access was denied.',
  Configuration:       'Sign-in is misconfigured — we’re on it.',
  Default:             'Something went wrong signing in. Try again.',
};

/* ── Page ───────────────────────────────────────────────────────────── */
export default function SignInPage() {
  const [loading, setLoading] = useState<'github' | 'google' | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Read ?error= via window (avoids the App Router useSearchParams Suspense
  // requirement). Keep the raw code visible in small text so an intermittent
  // failure can be reported back precisely.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error');
    if (code) setAuthError(code);
  }, []);

  async function handleSignIn(provider: 'github' | 'google') {
    setLoading(provider);
    await signIn(provider, { callbackUrl: '/app' });
  }

  return (
    <div className="si-shell">
      <Starfield />
      <div className="si-glow" aria-hidden="true" />
      <div className="si-orbit-ring" aria-hidden="true" />

      <div className="si-card" role="main">

        <div className="si-logo-wrap" aria-hidden="true">
          <Image src={queLogo} alt="" width={110} height={110} className="si-logo-img" priority />
        </div>

        <h1 className="si-title">Que</h1>
        <p className="si-eyebrow">Training &amp; Calorie Log</p>

        <div className="si-divider" aria-hidden="true" />

        {authError && (
          <div
            role="alert"
            style={{
              width: '100%', marginBottom: 14, padding: '10px 12px', borderRadius: 10,
              border: '1px solid rgba(255,90,90,0.35)', background: 'rgba(255,90,90,0.08)',
              fontSize: 12, lineHeight: 1.4, color: 'rgba(255,180,180,0.95)', textAlign: 'left',
            }}
          >
            {ERROR_COPY[authError] ?? ERROR_COPY.Default}
            <span style={{ display: 'block', marginTop: 4, fontSize: 10, opacity: 0.6, fontFamily: 'var(--font-mono, monospace)' }}>
              code: {authError}
            </span>
          </div>
        )}

        {/* Google first */}
        <button
          type="button"
          onClick={() => handleSignIn('google')}
          disabled={loading !== null}
          className="si-btn si-btn-google"
          aria-label="Sign in with Google"
        >
          {loading === 'google' ? <span className="si-btn-spinner" aria-hidden="true" /> : <GoogleMark size={17} />}
          {loading === 'google' ? 'Redirecting…' : 'Sign in with Google'}
        </button>

        {/* GitHub second */}
        <button
          type="button"
          onClick={() => handleSignIn('github')}
          disabled={loading !== null}
          className="si-btn"
          aria-label="Sign in with GitHub"
        >
          {loading === 'github' ? <span className="si-btn-spinner" aria-hidden="true" /> : <GitHubMark size={17} />}
          {loading === 'github' ? 'Redirecting…' : 'Sign in with GitHub'}
        </button>

      </div>
    </div>
  );
}
