'use client';

/**
 * components/AmbientGlow.tsx
 *
 * Status-reactive ambient background glow.
 *
 * Performance contract:
 *  • NO filter:blur — replaced by multi-stop radial-gradient soft falloff.
 *    blur() on large elements is one of the most expensive GPU operations;
 *    a gradient from opaque-centre → transparent-edge is visually identical
 *    and costs nothing extra to composite.
 *  • CSS @keyframes for the pulse (glowPulseA/B/C in globals.css) — the
 *    browser moves the animation to the compositor thread automatically for
 *    transform + opacity, so there is zero JavaScript loop overhead.
 *  • framer-motion is used ONLY for the 1.4 s opacity cross-fade between
 *    colour states (workout logged, budget hit, etc.) — a single one-shot
 *    transition per status change.
 *  • will-change is intentionally absent; it is unnecessary when only
 *    transform and opacity are animated.
 */

import { useMemo }                  from 'react';
import { AnimatePresence, motion }  from 'framer-motion';
import { useApp }                   from '@/lib/AppContext';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type GlowState = 'neutral' | 'workout' | 'budget' | 'perfect' | 'over';

interface GlowCfg {
  /** CSS colour for blob A centre stop */
  colA: string;
  /** CSS colour for blob B centre stop */
  colB: string;
  /** CSS colour for blob C (small accent) centre stop */
  colC: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COLOUR CONFIGS
// ─────────────────────────────────────────────────────────────────────────────

const CFG: Record<GlowState, GlowCfg> = {
  neutral: {
    colA: 'rgba(80,40,200,0.14)',
    colB: 'rgba(30,60,180,0.10)',
    colC: 'rgba(60,30,160,0.07)',
  },
  workout: {
    colA: 'rgba(100,120,255,0.17)',
    colB: 'rgba(130,80,255,0.13)',
    colC: 'rgba(80,60,220,0.09)',
  },
  budget: {
    colA: 'rgba(245,158,11,0.15)',
    colB: 'rgba(200,110,30,0.11)',
    colC: 'rgba(180,90,20,0.07)',
  },
  perfect: {
    colA: 'rgba(80,185,140,0.16)',
    colB: 'rgba(60,130,220,0.12)',
    colC: 'rgba(50,160,120,0.08)',
  },
  over: {
    colA: 'rgba(200,80,80,0.12)',
    colB: 'rgba(150,50,80,0.09)',
    colC: 'rgba(160,60,60,0.06)',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STATUS HOOK
// ─────────────────────────────────────────────────────────────────────────────

function parseKinds(raw: string): string[] {
  if (!raw) return [];
  try   { const p = JSON.parse(raw); return Array.isArray(p) ? p.map((e: {k:string}) => e.k) : []; }
  catch { return ['text']; }
}

function useGlowState(): GlowState {
  const { localDB, todayStr } = useApp();
  return useMemo<GlowState>(() => {
    const rec        = localDB[todayStr] ?? {};
    const kinds      = parseKinds(rec.exercises ?? '');
    const hasLifts   = kinds.includes('lift');
    const calsEaten  = parseFloat(String(rec.calsEaten ?? '0')) || 0;
    const budget     = parseFloat(String(rec.budget    ?? '0')) || 0;
    const dataLogged = calsEaten > 0 && budget > 0;
    const onBudget   = dataLogged && calsEaten <= budget;
    const overBudget = dataLogged && calsEaten >  budget;

    if (hasLifts && onBudget) return 'perfect';
    if (hasLifts)             return 'workout';
    if (onBudget)             return 'budget';
    if (overBudget)           return 'over';
    return 'neutral';
  }, [localDB, todayStr]);
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOB — pure CSS animation, framer-motion fade-in only on mount
// ─────────────────────────────────────────────────────────────────────────────

interface BlobProps {
  /** CSS radial-gradient() string */
  gradient:  string;
  /** Tailwind / inline positioning */
  style:     React.CSSProperties;
  /** One of the three CSS animation names from globals.css */
  animation: 'glowPulseA' | 'glowPulseB' | 'glowPulseC';
  duration:  string;   // e.g. "6s"
  delay:     string;   // e.g. "1.8s"
}

function Blob({ gradient, style, animation, duration, delay }: BlobProps) {
  return (
    <div
      style={{
        position:     'absolute',
        borderRadius: '50%',
        background:   gradient,
        animation:    `${animation} ${duration} ${delay} ease-in-out infinite`,
        ...style,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOB GROUP — wrapped in framer-motion for 1.4 s colour cross-fade
// ─────────────────────────────────────────────────────────────────────────────

function BlobGroup({ cfg, stateKey }: { cfg: GlowCfg; stateKey: GlowState }) {
  return (
    <motion.div
      key={stateKey}
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.4, ease: 'easeInOut' }}
    >
      {/* Blob A — large, top-left, primary */}
      <Blob
        gradient={`radial-gradient(circle at 35% 35%, ${cfg.colA} 0%, transparent 65%)`}
        style={{ top: '-15%', left: '-8%', width: '55vmax', height: '55vmax' }}
        animation="glowPulseA"
        duration="6s"
        delay="0s"
      />

      {/* Blob B — medium, bottom-right, secondary */}
      <Blob
        gradient={`radial-gradient(circle at 60% 60%, ${cfg.colB} 0%, transparent 65%)`}
        style={{ bottom: '-12%', right: '-6%', width: '42vmax', height: '42vmax' }}
        animation="glowPulseB"
        duration="7.5s"
        delay="1.8s"
      />

      {/* Blob C — small accent, centre-screen */}
      <Blob
        gradient={`radial-gradient(circle at 50% 50%, ${cfg.colC} 0%, transparent 65%)`}
        style={{ top: '28%', left: '18%', width: '30vmax', height: '30vmax' }}
        animation="glowPulseC"
        duration="9s"
        delay="3.5s"
      />
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function AmbientGlow() {
  const state = useGlowState();
  const cfg   = CFG[state];

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0, mixBlendMode: 'screen' }}
    >
      <AnimatePresence mode="sync">
        <BlobGroup key={state} cfg={cfg} stateKey={state} />
      </AnimatePresence>
    </div>
  );
}
