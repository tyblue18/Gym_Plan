'use client';

/**
 * GlowMount.tsx
 *
 * Thin 'use client' wrapper so that `next/dynamic` with `ssr: false` is legal.
 * (Next.js 15 forbids ssr:false in Server Components — this client shell owns
 * the dynamic import, while app/layout.tsx remains a Server Component.)
 */

import dynamic from 'next/dynamic';

const AmbientGlow = dynamic(() => import('./AmbientGlow'), { ssr: false });

export default function GlowMount() {
  return <AmbientGlow />;
}
