'use client';

import { useState, useEffect } from 'react';

/**
 * Flood-fills from all 4 corners to remove background pixels (white, grey, or
 * checkerboard patterns where R,G,B > 185), tight-crops the remaining art,
 * and renders it as a transparent-background data-URL <img>.
 */
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
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onerror = () => setDataUrl(src);
    img.onload = () => {
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
      setDataUrl(out.toDataURL());
    };
    img.src = src;
  }, [src]);

  if (!dataUrl) return null;
  return (
    <img
      src={dataUrl}
      alt={alt}
      className={className ?? 'w-full h-full object-contain'}
      style={style}
    />
  );
}
