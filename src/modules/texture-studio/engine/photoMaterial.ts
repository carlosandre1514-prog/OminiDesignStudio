import type { Field, Img } from '@/core/ai/vision';
import { blur } from './compose';

/**
 * Photo of a real surface → seamless PBR source maps (colour + height).
 * The height comes from on-device AI depth (Depth Anything V2) or, without AI, from luminance.
 */

/** Centre square crop. */
export function squareCrop(img: Img): Img {
  const s = Math.min(img.width, img.height);
  const x0 = Math.floor((img.width - s) / 2);
  const y0 = Math.floor((img.height - s) / 2);
  const out = new Uint8ClampedArray(s * s * 4);
  for (let y = 0; y < s; y++) out.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + s) * 4), y * s * 4);
  return { width: s, height: s, data: out };
}

/** Weight that is 1 in the centre and 0 at the borders (smooth), used by the seamless cross-fade. */
const edgeWeight = (x: number, y: number, n: number, band: number) => {
  const d = Math.min(x, y, n - 1 - x, n - 1 - y) / (n * band);
  const t = Math.min(1, d);
  return t * t * (3 - 2 * t);
};

/**
 * Make a square image tile seamlessly: cross-fade it with a copy shifted by half a tile
 * (whose borders are continuous across the wrap) near the edges.
 */
export function makeSeamless(img: Img, band = 0.22): Img {
  const n = img.width;
  const out = new Uint8ClampedArray(img.data.length);
  const h = n >> 1;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const a = edgeWeight(x, y, n, band);
      const i = (y * n + x) * 4;
      const j = (((y + h) % n) * n + ((x + h) % n)) * 4;
      for (let c = 0; c < 3; c++) out[i + c] = img.data[i + c] * a + img.data[j + c] * (1 - a);
      out[i + 3] = 255;
    }
  return { width: n, height: n, data: out };
}

export function makeSeamlessField(f: Field, band = 0.22): Field {
  const n = f.width;
  const out = new Float32Array(f.data.length);
  const h = n >> 1;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const a = edgeWeight(x, y, n, band);
      out[y * n + x] = f.data[y * n + x] * a + f.data[((y + h) % n) * n + ((x + h) % n)] * (1 - a);
    }
  return { width: n, height: n, data: out };
}

/** Height without AI: luminance (darker = deeper), as a starting point. */
export function luminanceHeight(img: Img): Field {
  const out = new Float32Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) out[i] = (img.data[i * 4] * 0.3 + img.data[i * 4 + 1] * 0.59 + img.data[i * 4 + 2] * 0.11) / 255;
  return { width: img.width, height: img.height, data: out };
}

/**
 * Keep surface detail, drop the large slope of the photo (perspective, lighting gradient):
 * height − blur(height), then normalise to [0,1].
 */
export function detailHeight(f: Field, radiusFrac = 0.06): Field {
  const n = f.width;
  const low = blur(f.data, n, Math.max(2, n * radiusFrac), 2);
  const hp = new Float32Array(f.data.length);
  for (let i = 0; i < hp.length; i++) hp[i] = f.data[i] - low[i];
  const sorted = Array.from(hp).sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.01)];
  const hi = sorted[Math.floor(sorted.length * 0.99)];
  const span = hi - lo || 1;
  for (let i = 0; i < hp.length; i++) hp[i] = Math.min(1, Math.max(0, (hp[i] - lo) / span));
  return { width: n, height: n, data: hp };
}

export const fieldToRgba = (f: Field): Img => {
  const out = new Uint8ClampedArray(f.width * f.height * 4);
  for (let i = 0; i < f.data.length; i++) {
    const v = Math.round(f.data[i] * 255);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return { width: f.width, height: f.height, data: out };
};
