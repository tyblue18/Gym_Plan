'use client';

import { useEffect, useRef, useState } from 'react';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';
import prData from '@/public/PR_animation.json';
import runData  from '@/public/Run_animation.json';
import bikeData from '@/public/Bike_animation.json';
import swimData from '@/public/Swimming_animation.json';

type Kind = 'run' | 'bike' | 'swim';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DATA: Record<Kind, any> = { run: runData, bike: bikeData, swim: swimData };

// Inactive: inverted (white base) + near-transparent gray
// Active:   inverted (white base) — bright and clearly visible on dark bg
const FILTER_INACTIVE = 'invert(1) grayscale(1) opacity(0.18)';
const FILTER_ACTIVE   = 'invert(1)';

export function ActivityIcon({
  kind,
  active = false,
  size = 36,
}: {
  kind: Kind;
  active?: boolean;
  size?: number;
}) {
  const lottieRef = useRef<LottieRefCurrentProps>(null);

  useEffect(() => {
    const player = lottieRef.current;
    if (!player) return;
    if (active) {
      player.play();
    } else {
      player.stop();
    }
  }, [active]);

  return (
    <span
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        width:          size,
        height:         size,
        flexShrink:     0,
        filter:     active ? FILTER_ACTIVE : FILTER_INACTIVE,
        transition: 'filter 350ms ease',
      }}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={DATA[kind]}
        loop
        autoplay={false}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}

// ── PRLiveBadge ───────────────────────────────────────────────────────────────
// Plays the PR trophy animation once, then shows a compact static badge.
// Disappears entirely when `active` is false (exercise removed / no longer a PR).
// This eliminates the "frozen final frame" lingering bug.

export function PRLiveBadge({ active, size = 32 }: { active: boolean; size?: number }) {
  // 'playing' → animation running | 'done' → static badge | 'hidden' → nothing
  const [phase, setPhase] = useState<'playing' | 'done' | 'hidden'>(
    active ? 'playing' : 'hidden'
  );

  useEffect(() => {
    if (active) {
      // (Re-)trigger animation whenever active flips from false → true
      setPhase('playing');
    } else {
      setPhase('hidden');
    }
  }, [active]);

  if (phase === 'hidden') return null;

  if (phase === 'done') {
    return (
      <span
        style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', pointerEvents: 'none' }}
        title="Personal Record!"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFB547" aria-hidden>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      </span>
    );
  }

  // phase === 'playing'
  return (
    <span
      style={{ width: size, height: size, flexShrink: 0, display: 'inline-flex', pointerEvents: 'none' }}
      title="Personal Record!"
    >
      <Lottie
        animationData={prData}
        loop={false}
        autoplay={true}
        onComplete={() => setPhase('done')}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}
