import { weldPositions } from '@/modules/studio-3d/mesh/uvAtlas';
import type { Bitmap } from './compose';

/**
 * Bakes a model into its UV atlas (texture space), like the "bake mesh maps" step of professional
 * texturing tools:
 *  - position + normal per texel (3D painting across UV seams, brush facing test);
 *  - distance to sharp convex / concave edges of the real geometry (automatic edge wear, dirt);
 *  - vertex convexity for smooth/organic surfaces;
 *  - coverage (to pad the texture beyond chart borders).
 * Texel (x, y) ↔ UV (u = (x + 0.5) / S, v = 1 − (y + 0.5) / S): image top = v 1.
 */

export interface MeshBake {
  size: number;
  /** 0 = empty, 1 = inside a triangle, 2 = gutter (dilated). */
  cover: Uint8Array;
  pos: Float32Array;
  nor: Float32Array;
  /** RGBA: R = convex edge proximity, G = concave edge proximity, B = vertex convexity (0.5 flat), A = coverage. */
  curvature: Bitmap;
  /** Model diagonal (world units). */
  diag: number;
  /** Max wear width used for the edge proximity (world units). */
  wear: number;
}

const SHARP_COS = Math.cos((28 * Math.PI) / 180);

export function bakeMesh(pos: Float32Array, uv: Float32Array, size = 1024, gutter = 3): MeshBake {
  const tris = pos.length / 9;
  const N = size * size;
  const cover = new Uint8Array(N);
  const tpos = new Float32Array(N * 3);
  const tnor = new Float32Array(N * 3);
  const conv = new Float32Array(N);

  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    lo = [Math.min(lo[0], pos[i]), Math.min(lo[1], pos[i + 1]), Math.min(lo[2], pos[i + 2])];
    hi = [Math.max(hi[0], pos[i]), Math.max(hi[1], pos[i + 1]), Math.max(hi[2], pos[i + 2])];
  }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  const wear = diag * 0.012;

  // ---------------------------------------------------------------- topology
  const { ids, count } = weldPositions(pos);
  const fn = new Float32Array(tris * 3);
  const vn = new Float32Array(count * 3);
  for (let t = 0; t < tris; t++) {
    const o = t * 9;
    const ux = pos[o + 3] - pos[o];
    const uy = pos[o + 4] - pos[o + 1];
    const uz = pos[o + 5] - pos[o + 2];
    const vx = pos[o + 6] - pos[o];
    const vy = pos[o + 7] - pos[o + 1];
    const vz = pos[o + 8] - pos[o + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    fn[t * 3] = nx / l;
    fn[t * 3 + 1] = ny / l;
    fn[t * 3 + 2] = nz / l;
    for (let k = 0; k < 3; k++) {
      const id = ids[t * 3 + k];
      vn[id * 3] += nx;
      vn[id * 3 + 1] += ny;
      vn[id * 3 + 2] += nz;
    }
  }
  const wp = new Float32Array(count * 3);
  for (let i = 0; i < tris * 3; i++) wp.set(pos.subarray(i * 3, i * 3 + 3), ids[i] * 3);
  for (let i = 0; i < count; i++) {
    const l = Math.hypot(vn[i * 3], vn[i * 3 + 1], vn[i * 3 + 2]) || 1;
    vn[i * 3] /= l;
    vn[i * 3 + 1] /= l;
    vn[i * 3 + 2] /= l;
  }

  // edges → adjacent triangles
  const edges = new Map<string, number[]>();
  for (let t = 0; t < tris; t++)
    for (let k = 0; k < 3; k++) {
      const a = ids[t * 3 + k];
      const b = ids[t * 3 + ((k + 1) % 3)];
      if (a === b) continue;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const list = edges.get(key);
      if (list) list.push(t);
      else edges.set(key, [t]);
    }
  const centroid = (t: number, k: number) => (pos[t * 9 + k] + pos[t * 9 + 3 + k] + pos[t * 9 + 6 + k]) / 3;

  // Sharp edges (dihedral > ~28°) are measured by distance below. Smooth edges give the surface
  // curvature (signed dihedral angle / distance between the faces), averaged per vertex and
  // scaled by the model size: organic bumps, knuckles, ridges.
  const vc = new Float32Array(count);
  const vcn = new Float32Array(count);
  const sharp: { a: number; b: number; convex: boolean }[] = [];
  for (const [key, list] of edges) {
    if (list.length !== 2) continue;
    const [t1, t2] = list;
    const d = fn[t1 * 3] * fn[t2 * 3] + fn[t1 * 3 + 1] * fn[t2 * 3 + 1] + fn[t1 * 3 + 2] * fn[t2 * 3 + 2];
    // convex when the second face's centroid lies below the first face's plane
    let sgn = 0;
    for (let k = 0; k < 3; k++) sgn += (centroid(t2, k) - pos[t1 * 9 + k]) * fn[t1 * 3 + k];
    const [a, b] = key.split('_').map(Number);
    if (d <= SHARP_COS) {
      sharp.push({ a, b, convex: sgn < 0 });
      continue;
    }
    const angle = Math.acos(Math.max(-1, Math.min(1, d)));
    if (angle < 1e-4) {
      vcn[a]++;
      vcn[b]++;
      continue;
    }
    const gap = Math.hypot(centroid(t1, 0) - centroid(t2, 0), centroid(t1, 1) - centroid(t2, 1), centroid(t1, 2) - centroid(t2, 2)) || 1e-9;
    const k = ((sgn < 0 ? 1 : -1) * angle) / gap;
    vc[a] += k;
    vc[b] += k;
    vcn[a]++;
    vcn[b]++;
  }
  // curvature × size: a sphere ≈ 3.5, a finger on a 2 m character ≈ 200
  for (let i = 0; i < count; i++) vc[i] = vcn[i] ? (vc[i] / vcn[i]) * diag : 0;

  // ---------------------------------------------------------------- rasterise in UV space
  for (let t = 0; t < tris; t++) {
    const X = [0, 0, 0];
    const Y = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      X[k] = uv[t * 6 + k * 2] * size - 0.5;
      Y[k] = (1 - uv[t * 6 + k * 2 + 1]) * size - 0.5;
    }
    const area = (X[1] - X[0]) * (Y[2] - Y[0]) - (X[2] - X[0]) * (Y[1] - Y[0]);
    if (Math.abs(area) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(X[0], X[1], X[2])));
    const x1 = Math.min(size - 1, Math.ceil(Math.max(X[0], X[1], X[2])));
    const y0 = Math.max(0, Math.floor(Math.min(Y[0], Y[1], Y[2])));
    const y1 = Math.min(size - 1, Math.ceil(Math.max(Y[0], Y[1], Y[2])));
    const ia = 1 / area;
    const eps = -1e-4;
    const c0 = vc[ids[t * 3]];
    const c1 = vc[ids[t * 3 + 1]];
    const c2 = vc[ids[t * 3 + 2]];
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const w0 = ((X[1] - x) * (Y[2] - y) - (X[2] - x) * (Y[1] - y)) * ia;
        const w1 = ((X[2] - x) * (Y[0] - y) - (X[0] - x) * (Y[2] - y)) * ia;
        const w2 = 1 - w0 - w1;
        if (w0 < eps || w1 < eps || w2 < eps) continue;
        const i = y * size + x;
        cover[i] = 1;
        const o = t * 9;
        for (let k = 0; k < 3; k++) {
          tpos[i * 3 + k] = pos[o + k] * w0 + pos[o + 3 + k] * w1 + pos[o + 6 + k] * w2;
          tnor[i * 3 + k] = fn[t * 3 + k];
        }
        conv[i] = c0 * w0 + c1 * w1 + c2 * w2;
      }
  }

  // gutter: copy the nearest covered texel outwards (so brushes and filtering don't leave seams)
  for (let g = 0; g < gutter; g++) {
    const next: number[] = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (cover[i]) continue;
        const j = x + 1 < size && cover[i + 1] ? i + 1 : x > 0 && cover[i - 1] ? i - 1 : y + 1 < size && cover[i + size] ? i + size : y > 0 && cover[i - size] ? i - size : -1;
        if (j >= 0) next.push(i, j);
      }
    for (let k = 0; k < next.length; k += 2) {
      const i = next[k];
      const j = next[k + 1];
      cover[i] = 2;
      tpos.set(tpos.subarray(j * 3, j * 3 + 3), i * 3);
      tnor.set(tnor.subarray(j * 3, j * 3 + 3), i * 3);
      conv[i] = conv[j];
    }
  }

  // ---------------------------------------------------------------- distance to sharp edges
  // Texels are bucketed in a 3D grid (cell = max wear width); each sharp edge only visits the
  // cells along it, so the cost follows the edges, not the texture size.
  const cell = wear;
  const key3 = (x: number, y: number, z: number) => (x + 65536) * 17179869184 + (y + 65536) * 131072 + (z + 65536);
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < N; i++) {
    if (!cover[i]) continue;
    const k = key3(Math.floor(tpos[i * 3] / cell), Math.floor(tpos[i * 3 + 1] / cell), Math.floor(tpos[i * 3 + 2] / cell));
    const l = buckets.get(k);
    if (l) l.push(i);
    else buckets.set(k, [i]);
  }
  const dv = new Float32Array(N).fill(Infinity);
  const dc = new Float32Array(N).fill(Infinity);
  for (const e of sharp) {
    const ax = wp[e.a * 3];
    const ay = wp[e.a * 3 + 1];
    const az = wp[e.a * 3 + 2];
    const ex = wp[e.b * 3] - ax;
    const ey = wp[e.b * 3 + 1] - ay;
    const ez = wp[e.b * 3 + 2] - az;
    const ll = ex * ex + ey * ey + ez * ez || 1;
    const steps = Math.max(1, Math.ceil(Math.sqrt(ll) / (cell * 0.5)));
    const seen = new Set<number>();
    const dist = e.convex ? dv : dc;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = Math.floor((ax + ex * t) / cell);
      const cy = Math.floor((ay + ey * t) / cell);
      const cz = Math.floor((az + ez * t) / cell);
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++)
          for (let oz = -1; oz <= 1; oz++) {
            const k = key3(cx + ox, cy + oy, cz + oz);
            if (seen.has(k)) continue;
            seen.add(k);
            const list = buckets.get(k);
            if (!list) continue;
            for (const i of list) {
              const px = tpos[i * 3] - ax;
              const py = tpos[i * 3 + 1] - ay;
              const pz = tpos[i * 3 + 2] - az;
              const u = Math.max(0, Math.min(1, (px * ex + py * ey + pz * ez) / ll));
              const d = Math.hypot(px - ex * u, py - ey * u, pz - ez * u);
              if (d < dist[i]) dist[i] = d;
            }
          }
    }
  }
  const data = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    if (!cover[i]) continue;
    data[i * 4] = Math.max(0, 1 - dv[i] / wear) * 255;
    data[i * 4 + 1] = Math.max(0, 1 - dc[i] / wear) * 255;
    data[i * 4 + 2] = Math.max(0, Math.min(1, 0.5 + conv[i] / 40)) * 255;
    data[i * 4 + 3] = 255;
  }
  return { size, cover, pos: tpos, nor: tnor, curvature: { width: size, height: size, data }, diag, wear };
}
