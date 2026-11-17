import * as P from '@/modules/studio-3d/mesh/polyMesh';

/**
 * High-poly ("Ultra"/"Cinema") geometry: Catmull–Clark subdivision of the hard-surface parts
 * (bevels act as support loops, so edges stay crisp while every surface becomes smooth),
 * output as a compact INDEXED buffer (≈ 30 bytes per triangle) so millions of triangles fit in memory:
 * smooth area-weighted normals, triplanar box UVs (metres, like the low-poly path) and a per-vertex
 * convexity value that drives edge wear on the dense mesh.
 */
export interface DenseGeo {
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  curv: Float32Array;
  index: Uint32Array;
  triangles: number;
}

export function denseGeometry(mesh: P.PolyMesh, levels: number): DenseGeo {
  let m = mesh;
  for (let i = 0; i < levels; i++) m = P.subdivide(m, true);
  const nv = m.v.length / 3;
  const v = m.v;
  let tris = 0;
  for (const f of m.f) tris += f.length - 2;
  const index = new Uint32Array(tris * 3);
  const nrm = new Float64Array(nv * 3);
  let t = 0;
  for (const f of m.f) {
    // Newell normal (magnitude = 2 × area) accumulated on the face's vertices
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let k = 0; k < f.length; k++) {
      const a = f[k] * 3;
      const b = f[(k + 1) % f.length] * 3;
      nx += (v[a + 1] - v[b + 1]) * (v[a + 2] + v[b + 2]);
      ny += (v[a + 2] - v[b + 2]) * (v[a] + v[b]);
      nz += (v[a] - v[b]) * (v[a + 1] + v[b + 1]);
    }
    for (const i of f) {
      nrm[i * 3] += nx;
      nrm[i * 3 + 1] += ny;
      nrm[i * 3 + 2] += nz;
    }
    for (let k = 1; k < f.length - 1; k++) {
      index[t++] = f[0];
      index[t++] = f[k];
      index[t++] = f[k + 1];
    }
  }
  const position = new Float32Array(v);
  const normal = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  for (let i = 0; i < nv; i++) {
    const x = nrm[i * 3];
    const y = nrm[i * 3 + 1];
    const z = nrm[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    normal[i * 3] = x / l;
    normal[i * 3 + 1] = y / l;
    normal[i * 3 + 2] = z / l;
    // triplanar by dominant normal axis (same convention as the low-poly "box" projection)
    const px = v[i * 3];
    const py = v[i * 3 + 1];
    const pz = v[i * 3 + 2];
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const az = Math.abs(z);
    if (ax >= ay && ax >= az) {
      uv[i * 2] = (x > 0 ? -pz : pz) + 0.5;
      uv[i * 2 + 1] = py + 0.5;
    } else if (ay >= az) {
      uv[i * 2] = px + 0.5;
      uv[i * 2 + 1] = (y > 0 ? -pz : pz) + 0.5;
    } else {
      uv[i * 2] = (z > 0 ? px : -px) + 0.5;
      uv[i * 2 + 1] = py + 0.5;
    }
  }
  // convexity: how far the neighbours fall below the tangent plane, per unit edge length (≈ bend angle)
  const sum = new Float64Array(nv * 3);
  const len = new Float64Array(nv);
  const cnt = new Uint16Array(nv);
  for (const f of m.f)
    for (let k = 0; k < f.length; k++) {
      const a = f[k];
      const b = f[(k + 1) % f.length];
      for (const [p, q] of [[a, b], [b, a]]) {
        const dx = v[q * 3] - v[p * 3];
        const dy = v[q * 3 + 1] - v[p * 3 + 1];
        const dz = v[q * 3 + 2] - v[p * 3 + 2];
        sum[p * 3] += dx;
        sum[p * 3 + 1] += dy;
        sum[p * 3 + 2] += dz;
        len[p] += Math.hypot(dx, dy, dz);
        cnt[p]++;
      }
    }
  let curv = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    if (!cnt[i]) continue;
    const d = (sum[i * 3] * normal[i * 3] + sum[i * 3 + 1] * normal[i * 3 + 1] + sum[i * 3 + 2] * normal[i * 3 + 2]) / cnt[i];
    curv[i] = Math.max(0, -d / (len[i] / cnt[i] || 1));
  }
  // widen the band a little (two neighbour-max passes keep thin edges visible after subdivision)
  for (let it = 0; it < 2; it++) {
    const next = curv.slice();
    for (let k = 0; k < index.length; k += 3) {
      const a = index[k];
      const b = index[k + 1];
      const c = index[k + 2];
      const mx = Math.max(curv[a], curv[b], curv[c]) * 0.85;
      if (next[a] < mx) next[a] = mx;
      if (next[b] < mx) next[b] = mx;
      if (next[c] < mx) next[c] = mx;
    }
    curv = next;
  }
  return { position, normal, uv, curv, index, triangles: tris };
}
