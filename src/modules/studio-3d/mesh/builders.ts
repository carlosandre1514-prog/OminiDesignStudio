import * as THREE from 'three';
import * as P from './polyMesh';

/**
 * Higher-level mesh builders used by the procedural generators.
 * Every builder returns a closed, outward-facing PolyMesh (orientation is fixed by the signed volume).
 */

export type V2 = [number, number];

/** Make sure faces point outward (positive signed volume). */
export function orientOutward(m: P.PolyMesh): P.PolyMesh {
  return P.volume(m) < 0 ? P.flipFaces(m) : m;
}

/** Apply a transform; mirroring transforms flip the winding back to outward. */
export function transform(m: P.PolyMesh, mat: THREE.Matrix4): P.PolyMesh {
  const v = new THREE.Vector3();
  const out: number[] = new Array(m.v.length);
  for (let i = 0; i < m.v.length; i += 3) {
    v.set(m.v[i], m.v[i + 1], m.v[i + 2]).applyMatrix4(mat);
    out[i] = v.x;
    out[i + 1] = v.y;
    out[i + 2] = v.z;
  }
  const r = { v: out, f: m.f.map((x) => [...x]) };
  return mat.determinant() < 0 ? P.flipFaces(r) : r;
}

export const T = {
  at: (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z),
  rx: (a: number) => new THREE.Matrix4().makeRotationX(a),
  ry: (a: number) => new THREE.Matrix4().makeRotationY(a),
  rz: (a: number) => new THREE.Matrix4().makeRotationZ(a),
  s: (x: number, y = x, z = x) => new THREE.Matrix4().makeScale(x, y, z),
  /** Compose left-to-right: chain(a, b, c) applies c, then b, then a. */
  chain: (...m: THREE.Matrix4[]) => m.reduce((acc, x) => acc.multiply(x), new THREE.Matrix4()),
};

export const place = (m: P.PolyMesh, ...mats: THREE.Matrix4[]) => transform(m, T.chain(...mats));

/** Concatenate meshes into one (no welding). */
export function merge(...meshes: P.PolyMesh[]): P.PolyMesh {
  const v: number[] = [];
  const f: number[][] = [];
  for (const m of meshes) {
    const base = v.length / 3;
    v.push(...m.v);
    for (const face of m.f) f.push(face.map((i) => i + base));
  }
  return { v, f };
}

/**
 * Surface of revolution around Y. `profile` is a list of [radius, y] from bottom to top;
 * radius 0 makes a pole, otherwise open ends are capped.
 */
export function lathe(profile: V2[], segments = 24): P.PolyMesh {
  const n = Math.max(3, Math.round(segments));
  const v: number[] = [];
  const rings: number[][] = profile.map(([r, y]) => {
    if (r <= 1e-6) {
      v.push(0, y, 0);
      return [v.length / 3 - 1];
    }
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      v.push(Math.cos(a) * r, y, -Math.sin(a) * r);
      ids.push(v.length / 3 - 1);
    }
    return ids;
  });
  const f: number[][] = [];
  for (let k = 0; k < rings.length - 1; k++) {
    const lo = rings[k];
    const up = rings[k + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (lo.length === 1 && up.length === 1) continue;
      if (lo.length === 1) f.push([lo[0], up[j], up[i]]);
      else if (up.length === 1) f.push([lo[i], lo[j], up[0]]);
      else f.push([lo[i], lo[j], up[j], up[i]]);
    }
  }
  if (rings[0].length > 1) f.push([...rings[0]].reverse());
  const last = rings[rings.length - 1];
  if (last.length > 1) f.push([...last]);
  return orientOutward({ v, f });
}

/**
 * Skin a sequence of cross-sections (each a ring of the same number of points).
 * A section whose points all coincide becomes a tip. Open ends are capped.
 */
export function loft(sections: P.Vec3[][]): P.PolyMesh {
  const m = sections[0].length;
  const v: number[] = [];
  const ids = sections.map((sec) => sec.map((p) => (v.push(...p), v.length / 3 - 1)));
  const f: number[][] = [];
  for (let k = 0; k < sections.length - 1; k++)
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      f.push([ids[k][i], ids[k][j], ids[k + 1][j], ids[k + 1][i]]);
    }
  f.push([...ids[0]].reverse());
  f.push([...ids[ids.length - 1]]);
  return orientOutward(P.mergeByDistance({ v, f }, 1e-7));
}

/**
 * Extrude a 2D outline (in the XY plane) along Z, centred on z = 0. Supports holes.
 * Caps are triangulated so concave outlines (gun frames, axe heads) render correctly.
 */
export function extrude(outline: V2[], depth: number, holes: V2[][] = []): P.PolyMesh {
  const ccw = (pts: V2[]) => (THREE.ShapeUtils.isClockWise(pts.map(([x, y]) => new THREE.Vector2(x, y))) ? [...pts].reverse() : pts);
  const cw = (pts: V2[]) => [...ccw(pts)].reverse();
  const outer = ccw(outline);
  const inner = holes.map(cw);
  const all = [outer, ...inner];
  const z = depth / 2;
  const v: number[] = [];
  const front: number[][] = [];
  const back: number[][] = [];
  for (const loop of all) {
    front.push(loop.map(([x, y]) => (v.push(x, y, z), v.length / 3 - 1)));
    back.push(loop.map(([x, y]) => (v.push(x, y, -z), v.length / 3 - 1)));
  }
  const flatFront = front.flat();
  const flatBack = back.flat();
  const tris = THREE.ShapeUtils.triangulateShape(
    outer.map(([x, y]) => new THREE.Vector2(x, y)),
    inner.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y))),
  );
  const f: number[][] = [];
  for (const [a, b, c] of tris) {
    f.push([flatFront[a], flatFront[b], flatFront[c]]);
    f.push([flatBack[c], flatBack[b], flatBack[a]]);
  }
  all.forEach((loop, li) => {
    for (let i = 0; i < loop.length; i++) {
      const j = (i + 1) % loop.length;
      f.push([back[li][i], back[li][j], front[li][j], front[li][i]]);
    }
  });
  return orientOutward({ v, f });
}

/** Tube along a 3D path with a radius function (parallel-transport frames, no twisting artefacts). */
export function tube(path: P.Vec3[], radius: (t: number) => number, sides = 12): P.PolyMesh {
  const pts = path.map((p) => new THREE.Vector3(...p));
  const n = pts.length;
  const tangents = pts.map((_, i) => new THREE.Vector3().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize());
  let normal = new THREE.Vector3(0, 0, 1);
  if (Math.abs(normal.dot(tangents[0])) > 0.9) normal = new THREE.Vector3(1, 0, 0);
  normal = normal.sub(tangents[0].clone().multiplyScalar(normal.dot(tangents[0]))).normalize();
  const sections: P.Vec3[][] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const axis = new THREE.Vector3().crossVectors(tangents[i - 1], tangents[i]);
      const ang = Math.acos(Math.min(1, Math.max(-1, tangents[i - 1].dot(tangents[i]))));
      if (axis.lengthSq() > 1e-12) normal.applyAxisAngle(axis.normalize(), ang);
    }
    const bin = new THREE.Vector3().crossVectors(tangents[i], normal).normalize();
    const r = radius(n === 1 ? 0 : i / (n - 1));
    const ring: P.Vec3[] = [];
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const p = pts[i].clone().addScaledVector(normal, Math.cos(a) * r).addScaledVector(bin, Math.sin(a) * r);
      ring.push([p.x, p.y, p.z]);
    }
    sections.push(ring);
  }
  return loft(sections);
}

/** Rounded box: a box with bevelled (chamfered) edges, built from a loft of rounded rectangles. */
export function roundedBox(w: number, h: number, d: number, r: number, steps = 2): P.PolyMesh {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  if (rr <= 1e-5) return P.box(w, h, d);
  const rect = (hw: number, hd: number, rad: number): V2[] => {
    const pts: V2[] = [];
    const corners: [number, number, number][] = [
      [hw - rad, hd - rad, 0],
      [-(hw - rad), hd - rad, Math.PI / 2],
      [-(hw - rad), -(hd - rad), Math.PI],
      [hw - rad, -(hd - rad), (3 * Math.PI) / 2],
    ];
    for (const [cx, cz, a0] of corners)
      for (let k = 0; k <= steps; k++) {
        const a = a0 + (k / steps) * (Math.PI / 2);
        pts.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]);
      }
    return pts;
  };
  const sections: P.Vec3[][] = [];
  const ys: [number, number][] = [];
  for (let k = 0; k <= steps; k++) {
    const a = -Math.PI / 2 + (k / steps) * (Math.PI / 2);
    ys.push([-(h / 2 - rr) + Math.sin(a) * rr, Math.cos(a) * rr]);
  }
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2);
    ys.push([h / 2 - rr + Math.sin(a) * rr, Math.cos(a) * rr]);
  }
  for (const [y, inset] of ys) sections.push(rect(w / 2 - rr + inset, d / 2 - rr + inset, Math.max(1e-4, inset)).map(([x, z]) => [x, y, -z] as P.Vec3));
  return loft(sections);
}

/** Seeded pseudo-random generator (mulberry32) so a seed always produces the same weapon. */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min: number, max: number) => min + next() * (max - min),
    pick: <T,>(list: T[]) => list[Math.floor(next() * list.length)],
  };
}
