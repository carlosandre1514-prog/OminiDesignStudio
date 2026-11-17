/**
 * Editable polygon mesh (vertices + n-gon faces), the geometry representation used by the 3D studio.
 * Faces are counter-clockwise when seen from outside. All operations are pure: they return new meshes.
 */
export interface PolyMesh {
  /** Flat xyz coordinates. */
  v: number[];
  /** Faces as lists of vertex indices (3+ each). */
  f: number[][];
  /** Optional per-face corner UVs [u0, v0, u1, v1, …] (UV atlas of a painted model). */
  fuv?: number[][];
}

export type Vec3 = [number, number, number];

export const vcount = (m: PolyMesh) => m.v.length / 3;
export const vget = (m: PolyMesh, i: number): Vec3 => [m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

export function clone(m: PolyMesh): PolyMesh {
  return { v: [...m.v], f: m.f.map((x) => [...x]) };
}

/** Face normal (Newell's method, robust for n-gons). */
export function faceNormal(m: PolyMesh, face: number[]): Vec3 {
  let n: Vec3 = [0, 0, 0];
  for (let i = 0; i < face.length; i++) {
    const a = vget(m, face[i]);
    const b = vget(m, face[(i + 1) % face.length]);
    n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
  }
  return normalize(n);
}

export function faceCenter(m: PolyMesh, face: number[]): Vec3 {
  let c: Vec3 = [0, 0, 0];
  for (const i of face) c = add(c, vget(m, i));
  return mul(c, 1 / face.length);
}

/** Unique edges with the faces that use them. */
export function edges(m: PolyMesh): { a: number; b: number; faces: number[] }[] {
  const map = new Map<string, { a: number; b: number; faces: number[] }>();
  m.f.forEach((face, fi) => {
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const k = edgeKey(a, b);
      const e = map.get(k) ?? { a: Math.min(a, b), b: Math.max(a, b), faces: [] };
      e.faces.push(fi);
      map.set(k, e);
    }
  });
  return [...map.values()];
}

/** Remove unused vertices and re-index faces. */
export function compact(m: PolyMesh): PolyMesh {
  const used = new Map<number, number>();
  const v: number[] = [];
  const f = m.f.map((face) =>
    face.map((i) => {
      let n = used.get(i);
      if (n === undefined) {
        n = used.size;
        used.set(i, n);
        v.push(m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]);
      }
      return n;
    }),
  );
  return { v, f };
}

/** Stats used by the UI and by tests. */
export function stats(m: PolyMesh) {
  const tris = m.f.reduce((s, face) => s + face.length - 2, 0);
  return { vertices: vcount(m), faces: m.f.length, triangles: tris, edges: edges(m).length };
}

/** Is every edge shared by exactly two faces with opposite directions (closed, consistently oriented)? */
export function isClosedManifold(m: PolyMesh): boolean {
  const directed = new Map<string, number>();
  for (const face of m.f)
    for (let i = 0; i < face.length; i++) {
      const k = `${face[i]}>${face[(i + 1) % face.length]}`;
      directed.set(k, (directed.get(k) ?? 0) + 1);
    }
  for (const [k, n] of directed) {
    if (n !== 1) return false;
    const [a, b] = k.split('>');
    if (directed.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

/** Signed volume (positive when faces point outward). */
export function volume(m: PolyMesh): number {
  let vol = 0;
  for (const face of m.f) {
    const a = vget(m, face[0]);
    for (let i = 1; i < face.length - 1; i++) {
      const b = vget(m, face[i]);
      const c = vget(m, face[i + 1]);
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  return vol;
}

// ---------------------------------------------------------------- primitives

export function box(w = 1, h = 1, d = 1): PolyMesh {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  // prettier-ignore
  const v = [-x, -y, z, x, -y, z, x, y, z, -x, y, z, -x, -y, -z, x, -y, -z, x, y, -z, -x, y, -z];
  const f = [
    [0, 1, 2, 3], // +z
    [5, 4, 7, 6], // -z
    [1, 5, 6, 2], // +x
    [4, 0, 3, 7], // -x
    [3, 2, 6, 7], // +y
    [4, 5, 1, 0], // -y
  ];
  return { v, f };
}

export function plane(w = 2, d = 2, segX = 1, segZ = 1): PolyMesh {
  const v: number[] = [];
  const f: number[][] = [];
  for (let j = 0; j <= segZ; j++)
    for (let i = 0; i <= segX; i++) v.push(-w / 2 + (w * i) / segX, 0, -d / 2 + (d * j) / segZ);
  const row = segX + 1;
  for (let j = 0; j < segZ; j++)
    for (let i = 0; i < segX; i++) {
      const a = j * row + i;
      f.push([a, a + row, a + row + 1, a + 1]); // CCW seen from +Y
    }
  return { v, f };
}

/** Cylinder or cone (radiusTop = 0 gives an apex). */
export function cylinder(radiusTop = 0.5, radiusBottom = 0.5, height = 1, radial = 24, caps = true): PolyMesh {
  const v: number[] = [];
  const f: number[][] = [];
  const h = height / 2;
  const n = Math.max(3, Math.round(radial));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    v.push(Math.cos(a) * radiusBottom, -h, -Math.sin(a) * radiusBottom);
  }
  if (radiusTop > 0) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      v.push(Math.cos(a) * radiusTop, h, -Math.sin(a) * radiusTop);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      f.push([i, j, n + j, n + i]);
    }
    if (caps) f.push(Array.from({ length: n }, (_, i) => n + i));
  } else {
    v.push(0, h, 0);
    for (let i = 0; i < n; i++) f.push([i, (i + 1) % n, n]);
  }
  if (caps) f.push(Array.from({ length: n }, (_, i) => n - 1 - i));
  return { v, f };
}

export function sphere(radius = 0.5, wSeg = 24, hSeg = 16): PolyMesh {
  const v: number[] = [];
  const f: number[][] = [];
  const W = Math.max(3, Math.round(wSeg));
  const H = Math.max(2, Math.round(hSeg));
  v.push(0, radius, 0); // north pole: 0
  for (let j = 1; j < H; j++) {
    const phi = (j / H) * Math.PI;
    for (let i = 0; i < W; i++) {
      const th = (i / W) * Math.PI * 2;
      v.push(Math.sin(phi) * Math.cos(th) * radius, Math.cos(phi) * radius, -Math.sin(phi) * Math.sin(th) * radius);
    }
  }
  const south = v.length / 3;
  v.push(0, -radius, 0);
  const ring = (j: number, i: number) => 1 + (j - 1) * W + (i % W);
  for (let i = 0; i < W; i++) f.push([0, ring(1, i), ring(1, i + 1)]);
  for (let j = 1; j < H - 1; j++) for (let i = 0; i < W; i++) f.push([ring(j, i), ring(j + 1, i), ring(j + 1, i + 1), ring(j, i + 1)]);
  for (let i = 0; i < W; i++) f.push([ring(H - 1, i), south, ring(H - 1, i + 1)]);
  return { v, f };
}

export function torus(R = 0.5, r = 0.2, radial = 24, tubular = 12): PolyMesh {
  const v: number[] = [];
  const f: number[][] = [];
  const A = Math.max(3, Math.round(radial));
  const B = Math.max(3, Math.round(tubular));
  for (let i = 0; i < A; i++) {
    const u = (i / A) * Math.PI * 2;
    for (let j = 0; j < B; j++) {
      const w = (j / B) * Math.PI * 2;
      v.push((R + r * Math.cos(w)) * Math.cos(u), r * Math.sin(w), -(R + r * Math.cos(w)) * Math.sin(u));
    }
  }
  const id = (i: number, j: number) => (i % A) * B + (j % B);
  for (let i = 0; i < A; i++) for (let j = 0; j < B; j++) f.push([id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)]);
  return { v, f };
}

/** Build from an indexed triangle list (imported meshes); coincident vertices are merged. */
export function fromTriangles(positions: ArrayLike<number>, indices?: ArrayLike<number>, eps = 1e-6): PolyMesh {
  const v = Array.from(positions);
  const f: number[][] = [];
  const count = indices ? indices.length : v.length / 3;
  for (let i = 0; i + 2 < count; i += 3) {
    const a = indices ? indices[i] : i;
    const b = indices ? indices[i + 1] : i + 1;
    const c = indices ? indices[i + 2] : i + 2;
    f.push([a, b, c]);
  }
  return mergeByDistance({ v, f }, eps);
}

// ---------------------------------------------------------------- operations

/** Move vertices by a delta. */
export function translateVertices(m: PolyMesh, ids: number[], d: Vec3): PolyMesh {
  const v = [...m.v];
  for (const i of new Set(ids)) {
    v[i * 3] += d[0];
    v[i * 3 + 1] += d[1];
    v[i * 3 + 2] += d[2];
  }
  return { v, f: m.f };
}

/** Apply an arbitrary transform (e.g. rotate/scale around a pivot) to some vertices. */
export function transformVertices(m: PolyMesh, ids: number[], fn: (p: Vec3) => Vec3): PolyMesh {
  const v = [...m.v];
  for (const i of new Set(ids)) {
    const p = fn(vget(m, i));
    v[i * 3] = p[0];
    v[i * 3 + 1] = p[1];
    v[i * 3 + 2] = p[2];
  }
  return { v, f: m.f };
}

/**
 * Region extrude: selected faces move along their averaged normals by `distance`,
 * and side walls are created along the region boundary (orientation preserved).
 */
export function extrudeFaces(m: PolyMesh, faceIds: number[], distance: number): { mesh: PolyMesh; faces: number[] } {
  const sel = new Set(faceIds.filter((i) => i >= 0 && i < m.f.length));
  if (!sel.size) return { mesh: m, faces: [] };
  const v = [...m.v];
  // Directed edges inside the selection; an edge is on the boundary if its reverse isn't selected.
  const selDirected = new Set<string>();
  for (const fi of sel) {
    const face = m.f[fi];
    for (let i = 0; i < face.length; i++) selDirected.add(`${face[i]}>${face[(i + 1) % face.length]}`);
  }
  // Per-vertex extrusion direction: average of adjacent selected face normals.
  const dir = new Map<number, Vec3>();
  for (const fi of sel) {
    const n = faceNormal(m, m.f[fi]);
    for (const i of m.f[fi]) dir.set(i, add(dir.get(i) ?? [0, 0, 0], n));
  }
  const dup = new Map<number, number>();
  for (const [i, d] of dir) {
    const n = normalize(d);
    const p = add(vget(m, i), mul(n, distance));
    dup.set(i, v.length / 3);
    v.push(...p);
  }
  const f = m.f.map((face, fi) => (sel.has(fi) ? face.map((i) => dup.get(i)!) : [...face]));
  for (const fi of sel) {
    const face = m.f[fi];
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      if (!selDirected.has(`${b}>${a}`)) f.push([a, b, dup.get(b)!, dup.get(a)!]);
    }
  }
  return { mesh: compact({ v, f }), faces: [...sel] };
}

/** Inset each selected face individually by `amount` (0..1 of the way to its centre). */
export function insetFaces(m: PolyMesh, faceIds: number[], amount: number, depth = 0): { mesh: PolyMesh; faces: number[] } {
  const sel = new Set(faceIds.filter((i) => i >= 0 && i < m.f.length));
  const t = Math.min(0.99, Math.max(0.001, amount));
  const v = [...m.v];
  const f: number[][] = [];
  const inner: number[] = [];
  m.f.forEach((face, fi) => {
    if (!sel.has(fi)) {
      f.push([...face]);
      return;
    }
    const c = faceCenter(m, face);
    const n = faceNormal(m, face);
    const ids = face.map((i) => {
      const p = add(lerp(vget(m, i), c, t), mul(n, depth));
      v.push(...p);
      return v.length / 3 - 1;
    });
    inner.push(f.length);
    f.push(ids);
    for (let i = 0; i < face.length; i++) {
      const j = (i + 1) % face.length;
      f.push([face[i], face[j], ids[j], ids[i]]);
    }
  });
  return { mesh: { v, f }, faces: inner };
}

/** Face bevel: inset plus a push along the normal (creates a chamfered step). */
export function bevelFaces(m: PolyMesh, faceIds: number[], amount: number, depth: number) {
  return insetFaces(m, faceIds, amount, depth);
}

export function deleteFaces(m: PolyMesh, faceIds: number[]): PolyMesh {
  const sel = new Set(faceIds);
  return compact({ v: m.v, f: m.f.filter((_, i) => !sel.has(i)) });
}

export function deleteVertices(m: PolyMesh, ids: number[]): PolyMesh {
  const sel = new Set(ids);
  return compact({ v: m.v, f: m.f.filter((face) => !face.some((i) => sel.has(i))) });
}

export function flipFaces(m: PolyMesh, faceIds?: number[]): PolyMesh {
  const sel = faceIds ? new Set(faceIds) : null;
  return { v: m.v, f: m.f.map((face, i) => (!sel || sel.has(i) ? [...face].reverse() : [...face])) };
}

/** Merge vertices closer than eps; drops faces that collapse. */
export function mergeByDistance(m: PolyMesh, eps = 1e-4): PolyMesh {
  const n = vcount(m);
  const remap = new Int32Array(n);
  const cell = new Map<string, number[]>();
  const key = (p: Vec3) => p.map((x) => Math.round(x / Math.max(eps, 1e-9))).join(',');
  for (let i = 0; i < n; i++) {
    const p = vget(m, i);
    const k = key(p);
    let found = -1;
    // check neighbouring cells to catch values near cell borders
    const base = p.map((x) => Math.round(x / Math.max(eps, 1e-9)));
    outer: for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const list = cell.get(`${base[0] + dx},${base[1] + dy},${base[2] + dz}`);
          if (!list) continue;
          for (const j of list) if (len(sub(vget(m, j), p)) <= eps) {
            found = j;
            break outer;
          }
        }
    if (found >= 0) remap[i] = remap[found];
    else {
      remap[i] = i;
      const list = cell.get(k) ?? [];
      list.push(i);
      cell.set(k, list);
    }
  }
  const f: number[][] = [];
  for (const face of m.f) {
    const out: number[] = [];
    for (const i of face) {
      const r = remap[i];
      if (out[out.length - 1] !== r) out.push(r);
    }
    while (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
    if (new Set(out).size >= 3) f.push(out);
  }
  return compact({ v: m.v, f });
}

/**
 * Catmull–Clark subdivision (smooth) or linear subdivision (smooth = false).
 * Every n-gon becomes n quads; boundaries are kept sharp-ish.
 */
export function subdivide(m: PolyMesh, smooth = true): PolyMesh {
  const nv = vcount(m);
  const facePts = m.f.map((face) => faceCenter(m, face));
  const es = edges(m);
  const edgeIndex = new Map<string, number>();
  const v: number[] = [];
  const vertexAdjFaces: number[][] = Array.from({ length: nv }, () => []);
  m.f.forEach((face, fi) => face.forEach((i) => vertexAdjFaces[i].push(fi)));
  const vertexEdges: number[][] = Array.from({ length: nv }, () => []);
  es.forEach((e, ei) => {
    vertexEdges[e.a].push(ei);
    vertexEdges[e.b].push(ei);
  });
  const isBoundaryEdge = (ei: number) => es[ei].faces.length !== 2;
  // Updated original vertices (indices 0..nv-1)
  for (let i = 0; i < nv; i++) {
    const P = vget(m, i);
    let out: Vec3 = P;
    if (smooth) {
      const bEdges = vertexEdges[i].filter(isBoundaryEdge);
      if (bEdges.length) {
        if (bEdges.length === 2) {
          const others = bEdges.map((ei) => vget(m, es[ei].a === i ? es[ei].b : es[ei].a));
          out = add(mul(P, 0.75), mul(add(others[0], others[1]), 0.125));
        }
      } else if (vertexAdjFaces[i].length) {
        const n = vertexEdges[i].length;
        let F: Vec3 = [0, 0, 0];
        for (const fi of vertexAdjFaces[i]) F = add(F, facePts[fi]);
        F = mul(F, 1 / vertexAdjFaces[i].length);
        let R: Vec3 = [0, 0, 0];
        for (const ei of vertexEdges[i]) R = add(R, lerp(vget(m, es[ei].a), vget(m, es[ei].b), 0.5));
        R = mul(R, 1 / n);
        out = mul(add(add(F, mul(R, 2)), mul(P, n - 3)), 1 / n);
      }
    }
    v.push(...out);
  }
  // Edge points
  es.forEach((e, ei) => {
    const mid = lerp(vget(m, e.a), vget(m, e.b), 0.5);
    let p = mid;
    if (smooth && !isBoundaryEdge(ei)) p = mul(add(add(vget(m, e.a), vget(m, e.b)), add(facePts[e.faces[0]], facePts[e.faces[1]])), 0.25);
    edgeIndex.set(edgeKey(e.a, e.b), v.length / 3);
    v.push(...p);
  });
  // Face points + new quads
  const f: number[][] = [];
  m.f.forEach((face, fi) => {
    const fp = v.length / 3;
    v.push(...facePts[fi]);
    const k = face.length;
    for (let i = 0; i < k; i++) {
      const prev = face[(i - 1 + k) % k];
      const cur = face[i];
      const next = face[(i + 1) % k];
      f.push([cur, edgeIndex.get(edgeKey(cur, next))!, fp, edgeIndex.get(edgeKey(prev, cur))!]);
    }
  });
  return { v, f };
}

/**
 * Loop cut through quads, starting at edge (a, b): splits the ring of quads across that edge at `t`.
 * Non-quad faces touching a cut edge get the new vertex inserted so the mesh stays connected.
 */
export function loopCut(m: PolyMesh, a: number, b: number, t = 0.5): { mesh: PolyMesh; newVertices: number[] } {
  const faceEdges = new Map<string, number[]>();
  m.f.forEach((face, fi) => {
    for (let i = 0; i < face.length; i++) {
      const k = edgeKey(face[i], face[(i + 1) % face.length]);
      faceEdges.set(k, [...(faceEdges.get(k) ?? []), fi]);
    }
  });
  const start = edgeKey(a, b);
  if (!faceEdges.has(start)) return { mesh: m, newVertices: [] };
  // cutFaces: face -> local index i of the entering edge (cut edges are (i,i+1) and (i+2,i+3))
  const cut = new Map<number, number>();
  const cutEdges = new Set<string>([start]);
  const walk = (fromEdge: string, face: number) => {
    let edge = fromEdge;
    let fi = face;
    while (fi >= 0 && !cut.has(fi)) {
      const q = m.f[fi];
      if (q.length !== 4) break;
      const i = q.findIndex((_, k) => edgeKey(q[k], q[(k + 1) % 4]) === edge);
      if (i < 0) break;
      cut.set(fi, i);
      const opp = edgeKey(q[(i + 2) % 4], q[(i + 3) % 4]);
      cutEdges.add(opp);
      edge = opp;
      fi = (faceEdges.get(opp) ?? []).find((x) => x !== fi && !cut.has(x)) ?? -1;
    }
  };
  for (const fi of faceEdges.get(start)!) walk(start, fi);
  if (!cut.size) return { mesh: m, newVertices: [] };
  // Orientation of the parameter along each cut edge follows the first endpoint of its key.
  const v = [...m.v];
  const mid = new Map<string, number>();
  const pointOn = (x: number, y: number) => {
    const k = edgeKey(x, y);
    let id = mid.get(k);
    if (id === undefined) {
      const [p, q] = x < y ? [x, y] : [y, x];
      v.push(...lerp(vget(m, p), vget(m, q), t));
      id = v.length / 3 - 1;
      mid.set(k, id);
    }
    return id;
  };
  const f: number[][] = [];
  m.f.forEach((face, fi) => {
    const i = cut.get(fi);
    if (i !== undefined) {
      const q = [0, 1, 2, 3].map((k) => face[(i + k) % 4]);
      const m01 = pointOn(q[0], q[1]);
      const m23 = pointOn(q[2], q[3]);
      f.push([q[0], m01, m23, q[3]], [m01, q[1], q[2], m23]);
      return;
    }
    // keep neighbours watertight
    const out: number[] = [];
    for (let k = 0; k < face.length; k++) {
      const x = face[k];
      const y = face[(k + 1) % face.length];
      out.push(x);
      if (cutEdges.has(edgeKey(x, y))) out.push(pointOn(x, y));
    }
    f.push(out);
  });
  return { mesh: { v, f }, newVertices: [...mid.values()] };
}

/** Mirror across a local axis plane and weld the seam (used by the mirror modifier). */
export function mirror(m: PolyMesh, axis: 0 | 1 | 2, eps = 1e-4): PolyMesh {
  const n = vcount(m);
  const v = [...m.v];
  for (let i = 0; i < n; i++) {
    const p = vget(m, i);
    p[axis] = -p[axis];
    v.push(...p);
  }
  const f = [...m.f.map((x) => [...x]), ...m.f.map((face) => face.map((i) => i + n).reverse())];
  return mergeByDistance({ v, f }, eps);
}

/** Vertex ids used by a set of faces. */
export function faceVertices(m: PolyMesh, faceIds: number[]): number[] {
  const s = new Set<number>();
  for (const fi of faceIds) for (const i of m.f[fi] ?? []) s.add(i);
  return [...s];
}

export function centroid(m: PolyMesh, ids: number[]): Vec3 {
  if (!ids.length) return [0, 0, 0];
  let c: Vec3 = [0, 0, 0];
  for (const i of ids) c = add(c, vget(m, i));
  return mul(c, 1 / ids.length);
}

export function bounds(m: PolyMesh): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vcount(m); i++) {
    const p = vget(m, i);
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  }
  return { min, max };
}

export { cross, sub, add, mul };
