import * as B from '@/modules/studio-3d/mesh/builders';
import type * as P from '@/modules/studio-3d/mesh/polyMesh';

/**
 * Local "image-to-3D" for hard-surface profiles.
 *
 * A side-view picture of a weapon (photo on a plain background, drawing or transparent PNG)
 * is segmented, its outline and inner openings (trigger guard, stock cut-outs…) are traced with
 * marching squares, simplified, scaled to a real length and extruded into a closed mesh.
 * No network and no AI: it reconstructs the silhouette, not hidden geometry.
 */

export interface ImageLike {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface SilhouetteOptions {
  /** Real length of the longest side, in metres. */
  length: number;
  /** Extrusion thickness, in metres. */
  depth: number;
  /** Simplification tolerance in pixels. */
  tolerance?: number;
}

export interface SilhouetteResult {
  mesh: P.PolyMesh;
  outline: B.V2[];
  holes: B.V2[][];
  /** Foreground mask (1 = object), for previews and tests. */
  mask: Uint8Array;
  /** How the object was separated from the background. */
  method: 'alpha' | 'background';
}

/** Otsu threshold of a 0..255 histogram. */
export function otsu(values: Uint8Array | number[]): number {
  const hist = new Array(256).fill(0);
  for (const v of values) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

/** Separate the object from the background: transparency when present, otherwise distance to the border colour. */
export function foregroundMask(img: ImageLike): { mask: Uint8Array; method: 'alpha' | 'background' } {
  const { width: w, height: h, data } = img;
  const n = w * h;
  let transparent = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 128) transparent++;
  const mask = new Uint8Array(n);
  if (transparent > n * 0.02) {
    for (let i = 0; i < n; i++) mask[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
    return { mask: largestComponent(mask, w, h), method: 'alpha' };
  }
  // Background colour = median of the border pixels (robust to a few object pixels touching the edge).
  const border: number[][] = [];
  for (let x = 0; x < w; x++) border.push(px(data, x, 0, w), px(data, x, h - 1, w));
  for (let y = 0; y < h; y++) border.push(px(data, 0, y, w), px(data, w - 1, y, w));
  const med = [0, 1, 2].map((c) => border.map((p) => p[c]).sort((a, b) => a - b)[border.length >> 1]);
  const dist = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const d = Math.abs(data[i * 4] - med[0]) + Math.abs(data[i * 4 + 1] - med[1]) + Math.abs(data[i * 4 + 2] - med[2]);
    dist[i] = Math.min(255, d / 2);
  }
  const thr = Math.max(18, otsu(dist));
  for (let i = 0; i < n; i++) mask[i] = dist[i] > thr ? 1 : 0;
  return { mask: largestComponent(mask, w, h), method: 'background' };
}

const px = (d: ImageLike['data'], x: number, y: number, w: number) => [d[(y * w + x) * 4], d[(y * w + x) * 4 + 1], d[(y * w + x) * 4 + 2]];

/** Keep only the largest 4-connected foreground region (drops noise and specks). */
export function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array {
  const label = new Int32Array(w * h).fill(-1);
  let best = -1;
  let bestSize = 0;
  const stack: number[] = [];
  let id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    let size = 0;
    stack.push(s);
    label[s] = id;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w;
      const y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && mask[j] && label[j] < 0) {
          label[j] = id;
          stack.push(j);
        }
    }
    if (size > bestSize) {
      bestSize = size;
      best = id;
    }
    id++;
  }
  const out = new Uint8Array(w * h);
  if (best < 0) return out;
  for (let i = 0; i < w * h; i++) out[i] = label[i] === best ? 1 : 0;
  return out;
}

/**
 * Marching squares over the mask (sampled at pixel centres, padded with background) → closed loops
 * in pixel coordinates. Loops never touch each other, so holes are always strictly inside the outline.
 */
export function traceContours(mask: Uint8Array, w: number, h: number): B.V2[][] {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);
  // Points are keyed on a doubled integer grid so midpoints are exact.
  const next = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    (next.get(a) ?? next.set(a, []).get(a)!).push(b);
    (next.get(b) ?? next.set(b, []).get(b)!).push(a);
  };
  const T = (x: number, y: number) => `${2 * x + 1},${2 * y}`; // top edge midpoint of cell (x,y)
  const R = (x: number, y: number) => `${2 * x + 2},${2 * y + 1}`;
  const Bm = (x: number, y: number) => `${2 * x + 1},${2 * y + 2}`;
  const L = (x: number, y: number) => `${2 * x},${2 * y + 1}`;
  for (let y = -1; y < h; y++)
    for (let x = -1; x < w; x++) {
      const c = (at(x, y) << 3) | (at(x + 1, y) << 2) | (at(x + 1, y + 1) << 1) | at(x, y + 1);
      const t = T(x, y);
      const r = R(x, y);
      const b = Bm(x, y);
      const l = L(x, y);
      switch (c) {
        case 1: case 14: link(l, b); break;
        case 2: case 13: link(b, r); break;
        case 3: case 12: link(l, r); break;
        case 4: case 11: link(t, r); break;
        case 6: case 9: link(t, b); break;
        case 7: case 8: link(l, t); break;
        case 5: link(l, t); link(b, r); break; // saddle: keep diagonals separate
        case 10: link(t, r); link(l, b); break;
      }
    }
  const seen = new Set<string>();
  const loops: B.V2[][] = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: B.V2[] = [];
    let prev = '';
    let cur = start;
    while (!seen.has(cur)) {
      seen.add(cur);
      const [a, b] = cur.split(',').map(Number);
      loop.push([a / 2 - 0.5, b / 2 - 0.5]);
      const nb = next.get(cur)!;
      const nxt = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur;
      if (!nxt) break;
      cur = nxt;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

export const area = (pts: B.V2[]) => pts.reduce((s, [x, y], i) => {
  const [x2, y2] = pts[(i + 1) % pts.length];
  return s + x * y2 - x2 * y;
}, 0) / 2;

function dp(pts: B.V2[], tol: number): B.V2[] {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1e-9;
  let far = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
    if (d > far) {
      far = d;
      idx = i;
    }
  }
  if (far <= tol) return [pts[0], pts[pts.length - 1]];
  return [...dp(pts.slice(0, idx + 1), tol).slice(0, -1), ...dp(pts.slice(idx), tol)];
}

/** Douglas–Peucker for a closed loop (split at the two mutually farthest points). */
export function simplifyLoop(loop: B.V2[], tol: number): B.V2[] {
  if (loop.length < 8) return loop;
  const i0 = 0;
  let i1 = 0;
  let far = -1;
  for (let i = 0; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]);
    if (d > far) {
      far = d;
      i1 = i;
    }
  }
  const a = dp(loop.slice(i0, i1 + 1), tol);
  const b = dp([...loop.slice(i1), loop[i0]], tol);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : loop;
}

const inside = ([x, y]: B.V2, poly: B.V2[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

/** Full pipeline: image → mask → contours → simplified, metric outline + holes → extruded mesh. */
export function silhouetteToMesh(img: ImageLike, opts: SilhouetteOptions): SilhouetteResult {
  const { mask, method } = foregroundMask(img);
  let count = 0;
  for (const v of mask) count += v;
  if (count < 30) throw new Error('Não encontrei um objeto na imagem. Use uma foto de lado, com fundo liso ou PNG transparente.');
  const loops = traceContours(mask, img.width, img.height).map((l) => simplifyLoop(l, opts.tolerance ?? 0.9));
  loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  const outerPx = loops[0];
  const minHole = Math.abs(area(outerPx)) * 0.002 + 4;
  const holesPx = loops.slice(1).filter((l) => l.length >= 3 && Math.abs(area(l)) > minHole && inside(l[0], outerPx));
  // Metric scale: the longest side of the bounding box becomes `length`.
  const xs = outerPx.map((p) => p[0]);
  const ys = outerPx.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = opts.length / Math.max(maxX - minX, maxY - minY, 1);
  const cx = (minX + maxX) / 2;
  const to = ([x, y]: B.V2): B.V2 => [(x - cx) * s, (maxY - y) * s]; // image y points down; model y up, resting on y = 0
  const outline = outerPx.map(to);
  const holes = holesPx.map((h) => h.map(to));
  const mesh = B.extrude(outline, opts.depth, holes);
  return { mesh, outline, holes, mask, method };
}
