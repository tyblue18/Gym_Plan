'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Flood-fills from all 4 corners to remove background pixels (white, grey, or
 * checkerboard patterns where R,G,B > 185), tight-crops the remaining art,
 * and renders it as a transparent-background data-URL <img>.
 *
 * Performance:
 *  - Cropped results are cached in localStorage (`queBadgeCropCache`) keyed
 *    by src URL. Subsequent loads of the same badge are O(1) — no canvas,
 *    no flood-fill. With 50+ badges on the showcase, this turns a noticeable
 *    pause on mount into instant render.
 *  - IntersectionObserver defers the canvas job until the badge actually
 *    scrolls into view. Off-screen badges in a long grid don't burn CPU.
 *  - In-memory module cache eliminates dupes within a single page load even
 *    before localStorage hydrates.
 *
 * Cache bounds: localStorage entries cap out at ~5 MB. Each cached cropped
 * 256×256 PNG is ~10–20 KB. We cap the cache at 100 entries (LRU) to stay
 * well under quota even with a packed showcase.
 */

const CACHE_KEY      = 'queBadgeCropCache';
const CACHE_MAX      = 100;
const memoryCache    = new Map<string, string>(); // src → dataUrl
let   diskHydrated   = false;
let   diskCache: Record<string, { dataUrl: string; t: number }> = {};

function hydrateDiskCache(): void {
  if (diskHydrated || typeof window === 'undefined') return;
  diskHydrated = true;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) diskCache = JSON.parse(raw);
    for (const [src, entry] of Object.entries(diskCache)) {
      memoryCache.set(src, entry.dataUrl);
    }
  } catch { diskCache = {}; }
}

function persistDiskCache(src: string, dataUrl: string): void {
  if (typeof window === 'undefined') return;
  diskCache[src] = { dataUrl, t: Date.now() };
  // LRU evict oldest if over cap. Cheap because we do it only on miss-and-add.
  const entries = Object.entries(diskCache);
  if (entries.length > CACHE_MAX) {
    entries.sort((a, b) => b[1].t - a[1].t);
    diskCache = Object.fromEntries(entries.slice(0, CACHE_MAX));
  }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(diskCache)); }
  catch { /* quota — drop silently, in-memory cache still works */ }
}

export function AutoCropImage({
  src,
  alt,
  className,
  style,
}: {
  src:       string;
  alt:       string;
  className?: string;
  style?:     React.CSSProperties;
}) {
  // Seed with cached value when we already have one — avoids a flash of empty
  // space and a wasted render cycle.
  const [dataUrl, setDataUrl] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    hydrateDiskCache();
    return memoryCache.get(src) ?? null;
  });
  // Becomes true once the element scrolls into the viewport. Defers the
  // canvas job for off-screen badges in large grids.
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  // Observe visibility. If IntersectionObserver isn't supported (very old
  // browsers), default to true so behavior matches the original.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('IntersectionObserver' in window)) { setInView(true); return; }
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) { setInView(true); io.disconnect(); break; }
      }
    }, { rootMargin: '200px' }); // start work just before it scrolls into view
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    // Already cached → nothing to do.
    if (dataUrl) return;
    // Wait for visibility before burning a CPU budget.
    if (!inView) return;
    // Re-check the cache in case another instance populated it while we
    // were waiting for IO.
    const cached = memoryCache.get(src);
    if (cached) { setDataUrl(cached); return; }

    let cancelled = false;
    const img = new Image();
    img.onerror = () => { if (!cancelled) setDataUrl(src); };
    img.onload = () => {
      if (cancelled) return;
      const W = img.naturalWidth, H = img.naturalHeight;
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = H;
      const t = tmp.getContext('2d')!;
      t.drawImage(img, 0, 0);

      const raw = t.getImageData(0, 0, W, H);
      const d = raw.data;

      // Sample corner pixels as background color references (handles colored backgrounds)
      const cornerRefs: [number, number, number][] = [];
      for (const [cx, cy] of [[0,0],[W-1,0],[0,H-1],[W-1,H-1]] as [number,number][]) {
        const i = (cy * W + cx) * 4;
        if (d[i + 3] > 10) cornerRefs.push([d[i], d[i + 1], d[i + 2]]);
      }

      const visited = new Uint8Array(W * H);
      const isBg = (i: number) => {
        if (d[i + 3] < 10) return true;
        // Light/white background (original rule)
        if (d[i] > 185 && d[i + 1] > 185 && d[i + 2] > 185) return true;
        // Match any corner color within tolerance (handles colored/JPEG backgrounds)
        for (const [r, g, b] of cornerRefs) {
          const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
          if (dr * dr + dg * dg + db * db < 900) return true; // ~30 RGB units
        }
        return false;
      };
      const stack: number[] = [];

      for (const [cx, cy] of [[0,0],[W-1,0],[0,H-1],[W-1,H-1]] as [number,number][]) {
        const p = cy * W + cx;
        if (!visited[p] && isBg(p * 4)) stack.push(p);
      }
      while (stack.length > 0) {
        const p = stack.pop()!;
        if (visited[p]) continue;
        visited[p] = 1;
        if (!isBg(p * 4)) continue;
        d[p * 4 + 3] = 0;
        const px = p % W, py = Math.floor(p / W);
        if (px > 0)   stack.push(p - 1);
        if (px < W-1) stack.push(p + 1);
        if (py > 0)   stack.push(p - W);
        if (py < H-1) stack.push(p + W);
      }
      t.putImageData(raw, 0, 0);

      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (d[(y * W + x) * 4 + 3] > 20) {
            if (x < x0) x0 = x;
            if (y < y0) y0 = y;
            if (x > x1) x1 = x;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }

      const out = document.createElement('canvas');
      out.width = 256; out.height = 256;
      out.getContext('2d')!.drawImage(tmp, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, 256, 256);
      const url = out.toDataURL();
      memoryCache.set(src, url);
      persistDiskCache(src, url);
      setDataUrl(url);
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src, inView, dataUrl]);

  // Preserve the original render shape (a single <img>) once the data URL is
  // ready, so layouts that rely on img-as-inline-replaced-element keep
  // working. Before the image is ready we render a same-sized placeholder
  // span that doubles as the IntersectionObserver target.
  if (dataUrl) {
    return (
      <img
        ref={el => { rootRef.current = el as unknown as HTMLSpanElement; }}
        src={dataUrl}
        alt={alt}
        className={className ?? 'w-full h-full object-contain'}
        style={style}
        loading="lazy"
        decoding="async"
      />
    );
  }
  // Placeholder: same className so it occupies the same layout slot. Empty
  // contents so it doesn't render anything visible.
  return <span ref={rootRef} aria-hidden className={className ?? 'w-full h-full inline-block'} style={style} />;
}
