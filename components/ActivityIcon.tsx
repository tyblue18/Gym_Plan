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
// Plays the PR trophy animation once; freezes on the final trophy frame.
// Disappears when `active` is false (exercise removed / no longer a PR).
// Re-triggers the animation each time `active` flips from false → true.

export function PRLiveBadge({ active, size = 32 }: { active: boolean; size?: number }) {
  const [visible, setVisible] = useState(active);
  // Increment to force Lottie remount (replay animation) on new PR
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (active) {
      setVisible(true);
      setAnimKey(k => k + 1);
    } else {
      setVisible(false);
    }
  }, [active]);

  if (!visible) return null;

  return (
    <span
      style={{ width: size, height: size, flexShrink: 0, display: 'inline-flex', pointerEvents: 'none' }}
      title="Personal Record!"
    >
      <Lottie
        key={animKey}
        animationData={prData}
        loop={false}
        autoplay={true}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}
