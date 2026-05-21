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

    type Star = { x:number; y:number; r:number; a:number; s:number; p:number };
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

/* ── Page ───────────────────────────────────────────────────────────── */
export default function SignInPage() {
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    await signIn('github', { callbackUrl: '/' });
  }

  return (
    <div className="si-shell">
      {/* Twinkling starfield */}
      <Starfield />

      {/* Nebula glow layers */}
      <div className="si-glow" aria-hidden="true" />

      {/* Floating orbit ring behind the card */}
      <div className="si-orbit-ring" aria-hidden="true" />

      {/* Content card */}
      <div className="si-card" role="main">

        {/* Logo */}
        <div className="si-logo-wrap" aria-hidden="true">
          <Image
            src={queLogo}
            alt=""
            width={110}
            height={110}
            className="si-logo-img"
            priority
          />
        </div>

        {/* App name */}
        <h1 className="si-title">Que</h1>
        <p className="si-eyebrow">Training &amp; Calorie Log</p>

        {/* Divider */}
        <div className="si-divider" aria-hidden="true" />

        {/* CTA */}
        <button
          type="button"
          onClick={handleSignIn}
          disabled={loading}
          className="si-btn"
          aria-label="Sign in with your GitHub account"
        >
          {loading ? <span className="si-btn-spinner" aria-hidden="true" /> : <GitHubMark size={17} />}
          {loading ? 'Redirecting to GitHub…' : 'Sign in with GitHub'}
        </button>

        {/* Note */}
        <p className="si-note">
          Your training data is stored locally in your browser.
          <br />
          The app works offline — sign-in adds your identity layer.
        </p>

      </div>
    </div>
  );
}
