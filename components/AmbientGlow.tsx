'use client';

import { useMemo }                  from 'react';
import { AnimatePresence, motion }  from 'framer-motion';
import { useApp }                   from '@/lib/AppContext';

type GlowState = 'neutral' | 'workout' | 'budget' | 'perfect' | 'over';

interface GlowCfg { colA: string; colB: string; colC: string; }

const CFG: Record<GlowState, GlowCfg> = {
  // No content yet — minimal cool charcoal wash
  neutral: {
    colA: 'rgba(40,46,56,0.22)',
    colB: 'rgba(28,32,40,0.14)',
    colC: 'rgba(20,24,30,0.10)',
  },
  // Workout logged — ice blue accent, faint
  workout: {
    colA: 'rgba(79,195,247,0.10)',
    colB: 'rgba(79,180,247,0.07)',
    colC: 'rgba(79,140,247,0.05)',
  },
  // On budget (calorie only) — cool electric blue-green
  budget: {
    colA: 'rgba(80,200,180,0.10)',
    colB: 'rgba(60,170,150,0.07)',
    colC: 'rgba(40,130,120,0.05)',
  },
  // Perfect day — workout + budget hit — bright ice blue
  perfect: {
    colA: 'rgba(79,195,247,0.16)',
    colB: 'rgba(127,212,249,0.11)',
    colC: 'rgba(79,195,247,0.07)',
  },
  // Over budget — danger red
  over: {
    colA: 'rgba(255,77,94,0.10)',
    colB: 'rgba(200,60,80,0.07)',
    colC: 'rgba(160,40,60,0.05)',
  },
};

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

interface BlobProps {
  gradient:  string;
  style:     React.CSSProperties;
  animation: 'glowPulseA' | 'glowPulseB' | 'glowPulseC';
  duration:  string;
  delay:     string;
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
      <Blob
        gradient={`radial-gradient(circle at 35% 35%, ${cfg.colA} 0%, transparent 65%)`}
        style={{ top: '-15%', left: '-8%', width: '55vmax', height: '55vmax' }}
        animation="glowPulseA"
        duration="6s"
        delay="0s"
      />
      <Blob
        gradient={`radial-gradient(circle at 60% 60%, ${cfg.colB} 0%, transparent 65%)`}
        style={{ bottom: '-12%', right: '-6%', width: '42vmax', height: '42vmax' }}
        animation="glowPulseB"
        duration="7.5s"
        delay="1.8s"
      />
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
