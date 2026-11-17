import type { Field } from '@/core/ai/vision';
import { resizeField } from '@/core/ai/vision';
import * as B from '@/modules/studio-3d/mesh/builders';
import type * as P from '@/modules/studio-3d/mesh/polyMesh';
import { largestComponent } from './silhouette';

/**
 * Photo → 3D reconstruction from a foreground mask and a depth map (AI or heuristic).
 * Builds a closed, watertight solid: front surface displaced by depth, mirrored back,
 * edges rounded by a distance transform, boundary staircase smoothed, real-world size in metres.
 */

export interface ReliefOptions {
  /** Real length of the longest side (m). */
  length: number;
  /** Extra half-thickness from depth, as a fraction of the length. */
  relief: number;
  /** Base half-thickness, as a fraction of the length. */
  base: number;
  /** Grid resolution on the long side (cells). */
  grid: number;
  /** Edge rounding radius in cells. */
  round: number;
}

export const DEFAULT_RELIEF: ReliefOptions = { length: 0.9, relief: 0.02, base: 0.012, grid: 160, round: 4 };

export interface ReliefResult {
  mesh: P.PolyMesh;
  /** Photo rectangle in model coordinates (for planar texture mapping). */
  frame: { x0: number; y0: number; w: number; h: number };
  cells: number;
}

/** Remove diagonal-only contacts (2×2 checker patterns) that would make the surface non-manifold. */
export function fixPinches(m: Uint8Array, w: number, h: number) {
  for (let it = 0; it < 8; it++) {
    let changed = false;
    for (let y = 0; y < h - 1; y++)
      for (let x = 0; x < w - 1; x++) {
        const a = m[y * w + x];
        const b = m[y * w + x + 1];
        const c = m[(y + 1) * w + x];
        const d = m[(y + 1) * w + x + 1];
        if (a && d && !b && !c) {
          m[y * w + x + 1] = 1;
          m[(y + 1) * w + x] = 1;
          changed = true;
        } else if (b && c && !a && !d) {
          m[y * w + x] = 1;
          m[(y + 1) * w + x + 1] = 1;
          changed = true;
        }
      }
    if (!changed) return;
  }
}

/** Chamfer distance (in cells) from each inside cell to the nearest outside cell. */
export function distanceInside(m: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = m[i] ? INF : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  const D = Math.SQRT2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!m[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + D, at(x + 1, y - 1) + D);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!m[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + D, at(x - 1, y + 1) + D);
    }
  return d;
}

export function buildRelief(maskField: Field, depthField: Field, opts: Partial<ReliefOptions> = {}): ReliefResult {
  const o = { ...DEFAULT_RELIEF, ...opts };
  const long = Math.max(maskField.width, maskField.height);
  const gw = Math.max(4, Math.round((maskField.width / long) * o.grid));
  const gh = Math.max(4, Math.round((maskField.height / long) * o.grid));
  const mask = resizeField(maskField, gw, gh);
  const depth = resizeField(depthField, gw, gh);
  let inside = new Uint8Array(gw * gh);
  for (let i = 0; i < inside.length; i++) inside[i] = mask.data[i] > 0.5 ? 1 : 0;
  inside = largestComponent(inside, gw, gh);
  fixPinches(inside, gw, gh);
  let count = 0;
  for (const v of inside) count += v;
  if (count < 8) throw new Error('Não encontrei um objeto na imagem.');

  // depth normalised inside the object (robust), then thickness per cell
  const vals: number[] = [];
  for (let i = 0; i < inside.length; i++) if (inside[i]) vals.push(depth.data[i]);
  vals.sort((a, b) => a - b);
  const lo = vals[Math.floor(vals.length * 0.02)];
  const hi = vals[Math.floor((vals.length - 1) * 0.98)];
  const span = hi - lo || 1;
  const cs = o.length / Math.max(gw, gh); // cell size (m)
  const dist = distanceInside(inside, gw, gh);
  const zCell = new Float32Array(gw * gh);
  for (let i = 0; i < inside.length; i++) {
    if (!inside[i]) continue;
    const dn = Math.min(1, Math.max(0, (depth.data[i] - lo) / span));
    const t = Math.min(1, dist[i] / o.round);
    const rounding = Math.sqrt(1 - (1 - t) * (1 - t));
    zCell[i] = Math.max(cs * 0.35, (o.base + o.relief * dn) * o.length * rounding);
  }

  // nodes at cell corners
  const NW = gw + 1;
  const nodeId = new Int32Array(NW * (gh + 1)).fill(-1);
  const cellIn = (x: number, y: number) => x >= 0 && y >= 0 && x < gw && y < gh && inside[y * gw + x] === 1;
  const nx: number[] = [];
  const ny: number[] = [];
  const nz: number[] = [];
  for (let y = 0; y <= gh; y++)
    for (let x = 0; x <= NW - 1; x++) {
      let s = 0;
      let k = 0;
      for (const [cx, cy] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]])
        if (cellIn(cx, cy)) {
          s += zCell[cy * gw + cx];
          k++;
        }
      if (!k) continue;
      nodeId[y * NW + x] = nx.length;
      nx.push((x - gw / 2) * cs);
      ny.push((gh - y) * cs);
      nz.push(s / k);
    }
  const N = nx.length;

  // boundary edges (between an inside cell and an outside one), oriented consistently
  const bEdges: [number, number][] = [];
  const front: number[][] = [];
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      if (!cellIn(x, y)) continue;
      const a = nodeId[y * NW + x];
      const b = nodeId[y * NW + x + 1];
      const c = nodeId[(y + 1) * NW + x + 1];
      const d = nodeId[(y + 1) * NW + x];
      front.push([a, d, c, b]);
      if (!cellIn(x, y - 1)) bEdges.push([a, b]);
      if (!cellIn(x + 1, y)) bEdges.push([b, c]);
      if (!cellIn(x, y + 1)) bEdges.push([c, d]);
      if (!cellIn(x - 1, y)) bEdges.push([d, a]);
    }

  // smooth the staircase outline (boundary nodes along the boundary) and the surface (interior nodes)
  const bNb: number[][] = Array.from({ length: N }, () => []);
  for (const [a, b] of bEdges) {
    bNb[a].push(b);
    bNb[b].push(a);
  }
  for (let it = 0; it < 4; it++) {
    const px = nx.slice();
    const py = ny.slice();
    for (let i = 0; i < N; i++) {
      const nb = bNb[i];
      if (nb.length !== 2) continue;
      const lam = it % 2 ? -0.34 : 0.5; // Taubin: shrink-free smoothing
      nx[i] = px[i] + lam * ((px[nb[0]] + px[nb[1]]) / 2 - px[i]);
      ny[i] = py[i] + lam * ((py[nb[0]] + py[nb[1]]) / 2 - py[i]);
    }
  }
  const gridNb: number[][] = Array.from({ length: N }, () => []);
  for (const f of front)
    for (let k = 0; k < 4; k++) {
      const a = f[k];
      const b = f[(k + 1) % 4];
      gridNb[a].push(b);
      gridNb[b].push(a);
    }
  for (let it = 0; it < 2; it++) {
    const pz = nz.slice();
    for (let i = 0; i < N; i++) {
      if (bNb[i].length) continue;
      const nb = gridNb[i];
      let s = 0;
      for (const j of nb) s += pz[j];
      nz[i] = pz[i] * 0.5 + (s / nb.length) * 0.5;
    }
  }

  const v: number[] = [];
  for (let i = 0; i < N; i++) v.push(nx[i], ny[i], nz[i]);
  for (let i = 0; i < N; i++) v.push(nx[i], ny[i], -nz[i]);
  const f: number[][] = [];
  for (const q of front) {
    f.push(q);
    f.push(q.map((i) => i + N).reverse());
  }
  for (const [a, b] of bEdges) f.push([a, b, b + N, a + N]);
  const mesh = B.orientOutward({ v, f });
  return { mesh, frame: { x0: -(gw / 2) * cs, y0: 0, w: gw * cs, h: gh * cs }, cells: count };
}
