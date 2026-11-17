/**
 * Tileable noise primitives. Every function takes UV in [0,1) and an integer period,
 * so textures repeat without seams.
 */

/** Integer hash → [0,1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const wrap = (i: number, p: number) => ((i % p) + p) % p;

/** Periodic value noise, period px × py cells over the unit square. */
export function valueNoise(u: number, v: number, px: number, py: number, seed: number): number {
  const x = u * px;
  const y = v * py;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const a = hash2(wrap(x0, px), wrap(y0, py), seed);
  const b = hash2(wrap(x0 + 1, px), wrap(y0, py), seed);
  const c = hash2(wrap(x0, px), wrap(y0 + 1, py), seed);
  const d = hash2(wrap(x0 + 1, px), wrap(y0 + 1, py), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** 256 unit gradients (avoids trig per lattice corner). */
const GX = new Float32Array(256);
const GY = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  GX[i] = Math.cos((i / 256) * Math.PI * 2);
  GY[i] = Math.sin((i / 256) * Math.PI * 2);
}

/** Periodic gradient (Perlin-style) noise in [0,1]. Less blocky than value noise. */
export function gradNoise(u: number, v: number, px: number, py: number, seed: number): number {
  const x = u * px;
  const y = v * py;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const dx = x - x0;
  const dy = y - y0;
  const g = (ix: number, iy: number, ox: number, oy: number) => {
    const k = (hash2(wrap(ix, px), wrap(iy, py), seed) * 256) | 0;
    return GX[k] * ox + GY[k] * oy;
  };
  const n00 = g(x0, y0, dx, dy);
  const n10 = g(x0 + 1, y0, dx - 1, dy);
  const n01 = g(x0, y0 + 1, dx, dy - 1);
  const n11 = g(x0 + 1, y0 + 1, dx - 1, dy - 1);
  const fx = fade(dx);
  const fy = fade(dy);
  const n = n00 + (n10 - n00) * fx + (n01 - n00) * fy + (n00 - n10 - n01 + n11) * fx * fy;
  return Math.min(1, Math.max(0, n * 0.75 + 0.5));
}

/** Fractal (fBm) gradient noise, normalised to [0,1]. */
export function fbm(u: number, v: number, scale: number, octaves: number, persistence: number, seed: number, sx = 1, sy = 1): number {
  let s = 0;
  let amp = 1;
  let tot = 0;
  let f = Math.max(1, Math.round(scale));
  for (let o = 0; o < octaves; o++) {
    s += gradNoise(u, v, Math.max(1, Math.round(f * sx)), Math.max(1, Math.round(f * sy)), seed + o * 1013) * amp;
    tot += amp;
    amp *= persistence;
    f *= 2;
  }
  return s / tot;
}

export interface Worley {
  f1: number;
  f2: number;
  /** random id of the nearest cell (0..1) */
  id: number;
}

/** Periodic Worley / cellular noise with `cells` × `cells` feature points. Distances in cell units. */
export function worley(u: number, v: number, cells: number, seed: number, jitter = 1): Worley {
  const x = u * cells;
  const y = v * cells;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      const wx = wrap(gx, cells);
      const wy = wrap(gy, cells);
      const px = gx + 0.5 + (hash2(wx, wy, seed) - 0.5) * jitter;
      const py = gy + 0.5 + (hash2(wx, wy, seed + 77) - 0.5) * jitter;
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash2(wx, wy, seed + 151);
      } else if (d < f2) f2 = d;
    }
  return { f1, f2, id };
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
};
