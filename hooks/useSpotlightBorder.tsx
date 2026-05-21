'use client';

/**
 * hooks/useSpotlightBorder.tsx
 *
 * Tracks cursor (desktop) or touch centre (mobile) relative to a card
 * and renders a crisp radial gradient that illuminates only the 1 px border
 * strip exactly where the pointer is — leaving the rest dim and sleek.
 *
 * Technique:
 *  • An absolutely-positioned overlay div sits flush inside the card.
 *  • Its background is a radial gradient centred on the pointer coordinates.
 *  • CSS mask with `exclude` composite punches a hole through the content box,
 *    so only the thin border ring is visible — the card interior is untouched.
 *  • Opacity transitions: 0 → 1 instantly on enter (no delay), 1 → 0 over
 *    0.45 s on leave using the *last known position* so the glow fades in
 *    place rather than snapping away.
 *
 * Usage:
 *   const spotlight = useSpotlightBorder();
 *
 *   <div
 *     ref={spotlight.ref}
 *     onMouseMove={spotlight.onMouseMove}
 *     onMouseLeave={spotlight.onMouseLeave}
 *     onTouchMove={spotlight.onTouchMove}
 *     onTouchEnd={spotlight.onTouchEnd}
 *     className="relative rounded-2xl ..."   // ← must be position:relative
 *   >
 *     {spotlight.Overlay}
 *     ... card content ...
 *   </div>
 *
 * Or use the ready-made <SpotlightCard> wrapper (drop-in replacement for
 * any card <div>):
 *   <SpotlightCard className="rounded-2xl p-5 ...">
 *     ... content ...
 *   </SpotlightCard>
 */

import React, { useCallback, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SpotlightOptions {
  /**
   * RGB triple for the gradient colour, e.g. "200,210,255".
   * Defaults to a cool indigo-white that matches the app's border palette.
   */
  color?: string;
  /**
   * Radius of the spotlight circle in pixels.
   * Larger = softer and wider spread.  Default 240.
   */
  size?: number;
  /**
   * Peak opacity of the gradient at the pointer centre (0–1).
   * Default 0.65 — crisp but not glaring on a dark card.
   */
  opacity?: number;
  /**
   * Border thickness in pixels.  Must match the card's actual border width.
   * Default 1.
   */
  borderWidth?: number;
}

export interface SpotlightResult {
  ref:          React.RefObject<HTMLDivElement | null>;
  onMouseMove:  (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
  onTouchMove:  (e: React.TouchEvent) => void;
  onTouchEnd:   () => void;
  /** Render this as the FIRST child of your card container. */
  Overlay:      React.ReactElement;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

export function useSpotlightBorder(options?: SpotlightOptions): SpotlightResult {
  const {
    color       = '180,190,255',
    size        = 240,
    opacity     = 0.65,
    borderWidth = 1,
  } = options ?? {};

  const containerRef = useRef<HTMLDivElement>(null);

  // `active` drives opacity; `lastPos` holds the last known coordinates so
  // the gradient stays in place during the fade-out instead of snapping to 0,0.
  const [active, setActive] = useState(false);
  const lastPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pos,    setPos]    = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const updateFromClient = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = { x: clientX - rect.left, y: clientY - rect.top };
    lastPos.current = p;
    setPos(p);
    setActive(true);
  }, []);

  const onMouseMove  = useCallback((e: React.MouseEvent) => updateFromClient(e.clientX, e.clientY), [updateFromClient]);
  const onMouseLeave = useCallback(() => setActive(false), []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) updateFromClient(t.clientX, t.clientY);
  }, [updateFromClient]);
  const onTouchEnd = useCallback(() => setActive(false), []);

  // The overlay covers the card's full bounding box.
  // CSS mask punches out the content area, leaving only the border strip.
  const overlayStyle: React.CSSProperties & Record<string, unknown> = {
    position:    'absolute',
    inset:       0,
    borderRadius:'inherit',
    pointerEvents:'none',
    zIndex:      1,            // sits above the card background, below content
    padding:     borderWidth,  // defines how thick the visible border strip is
    // Gradient centred at last-known position — stays there during fade-out
    background: `radial-gradient(
      ${size}px circle at ${pos.x}px ${pos.y}px,
      rgba(${color},${opacity}) 0%,
      rgba(${color},${opacity * 0.3}) 40%,
      transparent 80%
    )`,
    // Punch a hole through the content-box area:
    // Only the `padding` ring (= border strip) remains visible.
    WebkitMask:          'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
    WebkitMaskComposite: 'xor',
    mask:                'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
    maskComposite:       'exclude',
    // Instant appear, slow fade-out
    opacity:    active ? 1 : 0,
    transition: active ? 'opacity 0s' : 'opacity 0.45s ease',
  };

  const Overlay = <div aria-hidden="true" style={overlayStyle} />;

  return {
    ref:          containerRef,
    onMouseMove,
    onMouseLeave,
    onTouchMove,
    onTouchEnd,
    Overlay,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE WRAPPER — drop-in replacement for any card <div>
// ─────────────────────────────────────────────────────────────────────────────

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  spotlightOptions?: SpotlightOptions;
  children: React.ReactNode;
}

export function SpotlightCard({
  spotlightOptions,
  children,
  className = '',
  style,
  ...rest
}: SpotlightCardProps) {
  const spotlight = useSpotlightBorder(spotlightOptions);

  return (
    <div
      ref={spotlight.ref}
      className={`relative ${className}`}
      style={style}
      onMouseMove={spotlight.onMouseMove}
      onMouseLeave={spotlight.onMouseLeave}
      onTouchMove={spotlight.onTouchMove}
      onTouchEnd={spotlight.onTouchEnd}
      {...rest}
    >
      {spotlight.Overlay}
      {children}
    </div>
  );
}
