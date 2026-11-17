/**
 * Automatic UV atlas ("smart UV project") for 3D painting: every surface point gets its own,
 * non-overlapping place in the texture, with uniform texel density.
 *
 * 1. Each triangle is assigned to one of six projection directions (±X, ±Y, ±Z) by its normal.
 * 2. Charts = edge-connected triangles with the same direction, projected flat onto that plane
 *    (orientation like a box projection, so nothing is mirrored).
 * 3. Charts are packed into the unit square (shelf packing, tallest first) with a gutter around each.
 */

export interface AtlasOptions {
  /** Texture resolution the gutter is sized for (default 1024). */
  resolution?: number;
  /** Gutter in pixels between charts (default 6). */
  padding?: number;
}

export interface AtlasResult {
  /** Per triangle corner (u, v), v up. */
  uv: Float32Array;
  charts: number;
  /** Fraction of the square covered by charts. */
  fill: number;
}

/** Weld coincident corners (positions quantised relative to the model size). */
export function weldPositions(pos: Float32Array): { ids: Int32Array; count: number } {
  const n = pos.length / 3;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pos.length; i++) {
    lo = Math.min(lo, pos[i]);
    hi = Math.max(hi, pos[i]);
  }
  const q = 1e-6 * Math.max(1e-9, hi - lo) * 100;
  const map = new Map<string, number>();
  const ids = new Int32Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] / q)},${Math.round(pos[i * 3 + 1] / q)},${Math.round(pos[i * 3 + 2] / q)}`;
    let id = map.get(k);
    if (id === undefined) map.set(k, (id = count++));
    ids[i] = id;
  }
  return { ids, count };
}

/** Projection axis of a triangle: 0..5 = +X, −X, +Y, −Y, +Z, −Z. */
function axisOf(nx: number, ny: number, nz: number): number {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ax >= ay && ax >= az) return nx >= 0 ? 0 : 1;
  if (ay >= az) return ny >= 0 ? 2 : 3;
  return nz >= 0 ? 4 : 5;
}

/** 2D coordinates on the projection plane (same orientation as the studio's box UVs). */
function project(axis: number, x: number, y: number, z: number): [number, number] {
  switch (axis) {
    case 0:
      return [-z, y];
    case 1:
      return [z, y];
    case 2:
      return [x, -z];
    case 3:
      return [x, z];
    case 4:
      return [x, y];
    default:
      return [-x, y];
  }
}

export function buildAtlas(pos: Float32Array, opts: AtlasOptions = {}): AtlasResult {
  const tris = pos.length / 9;
  const uv = new Float32Array(tris * 6);
  if (!tris) return { uv, charts: 0, fill: 0 };
  const res = opts.resolution ?? 1024;
  const padPx = opts.padding ?? 6;
  const { ids } = weldPositions(pos);

  // ---------------------------------------------------------------- axis per triangle
  const axis = new Uint8Array(tris);
  for (let t = 0; t < tris; t++) {
    const o = t * 9;
    const ux = pos[o + 3] - pos[o];
    const uy = pos[o + 4] - pos[o + 1];
    const uz = pos[o + 5] - pos[o + 2];
    const vx = pos[o + 6] - pos[o];
    const vy = pos[o + 7] - pos[o + 1];
    const vz = pos[o + 8] - pos[o + 2];
    axis[t] = axisOf(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }

  // ---------------------------------------------------------------- charts (union-find over shared edges)
  const parent = new Int32Array(tris).map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const edgeOwner = new Map<string, number>();
  for (let t = 0; t < tris; t++)
    for (let k = 0; k < 3; k++) {
      const a = ids[t * 3 + k];
      const b = ids[t * 3 + ((k + 1) % 3)];
      if (a === b) continue;
      const key = a < b ? `${a}_${b}_${axis[t]}` : `${b}_${a}_${axis[t]}`;
      const other = edgeOwner.get(key);
      if (other === undefined) edgeOwner.set(key, t);
      else {
        const ra = find(t);
        const rb = find(other);
        if (ra !== rb) parent[ra] = rb;
      }
    }
  const chartOf = new Int32Array(tris);
  const roots = new Map<number, number>();
  for (let t = 0; t < tris; t++) {
    const r = find(t);
    let c = roots.get(r);
    if (c === undefined) roots.set(r, (c = roots.size));
    chartOf[t] = c;
  }
  const nc = roots.size;

  // ---------------------------------------------------------------- project + bounds
  const p2 = new Float32Array(tris * 6);
  const minX = new Float64Array(nc).fill(Infinity);
  const minY = new Float64Array(nc).fill(Infinity);
  const maxX = new Float64Array(nc).fill(-Infinity);
  const maxY = new Float64Array(nc).fill(-Infinity);
  for (let t = 0; t < tris; t++) {
    const c = chartOf[t];
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      const [x, y] = project(axis[t], pos[o], pos[o + 1], pos[o + 2]);
      p2[t * 6 + k * 2] = x;
      p2[t * 6 + k * 2 + 1] = y;
      minX[c] = Math.min(minX[c], x);
      minY[c] = Math.min(minY[c], y);
      maxX[c] = Math.max(maxX[c], x);
      maxY[c] = Math.max(maxY[c], y);
    }
  }
  const w = new Float64Array(nc);
  const h = new Float64Array(nc);
  const rot = new Uint8Array(nc);
  let area = 0;
  for (let c = 0; c < nc; c++) {
    w[c] = Math.max(1e-9, maxX[c] - minX[c]);
    h[c] = Math.max(1e-9, maxY[c] - minY[c]);
    // stand charts upright: shelves pack tall-and-narrow better
    if (w[c] > h[c]) {
      rot[c] = 1;
      [w[c], h[c]] = [h[c], w[c]];
    }
    area += w[c] * h[c];
  }

  // ---------------------------------------------------------------- shelf packing (iterate the gutter)
  const order = Array.from({ length: nc }, (_, i) => i).sort((a, b) => h[b] - h[a] || w[b] - w[a]);
  const px = new Float64Array(nc);
  const py = new Float64Array(nc);
  let side = Math.sqrt(area) * 1.15;
  let total = side;
  for (let iter = 0; iter < 4; iter++) {
    const pad = (padPx / res) * total;
    // a shelf can never be narrower than the widest chart
    let width = side;
    for (let c = 0; c < nc; c++) width = Math.max(width, w[c] + 2 * pad);
    let x = 0;
    let y = 0;
    let shelf = 0;
    for (const c of order) {
      const cw = w[c] + 2 * pad;
      const ch = h[c] + 2 * pad;
      if (x + cw > width && x > 0) {
        y += shelf;
        x = 0;
        shelf = 0;
      }
      px[c] = x + pad;
      py[c] = y + pad;
      x += cw;
      shelf = Math.max(shelf, ch);
    }
    const height = y + shelf;
    total = Math.max(width, height);
    // aim for a square layout next round
    side = Math.sqrt(width * height);
  }

  // ---------------------------------------------------------------- write UVs
  const s = 1 / total;
  for (let t = 0; t < tris; t++) {
    const c = chartOf[t];
    for (let k = 0; k < 3; k++) {
      let x = p2[t * 6 + k * 2] - minX[c];
      let y = p2[t * 6 + k * 2 + 1] - minY[c];
      // rotate 90° (keeps orientation, no mirroring)
      if (rot[c]) [x, y] = [maxY[c] - minY[c] - y, x];
      uv[t * 6 + k * 2] = (px[c] + x) * s;
      uv[t * 6 + k * 2 + 1] = (py[c] + y) * s;
    }
  }
  return { uv, charts: nc, fill: area * s * s };
}
