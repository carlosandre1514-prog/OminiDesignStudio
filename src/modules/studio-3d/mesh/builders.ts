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

// ---------------------------------------------------------------- hard-surface builders

const signedArea2 = (pts: V2[]) => pts.reduce((s, [x, y], i) => {
  const [x2, y2] = pts[(i + 1) % pts.length];
  return s + x * y2 - x2 * y;
}, 0) / 2;

/**
 * Offset a closed polygon toward its own interior by `d` (negative = outward), with mitred corners
 * (miter length capped at 3·d so sharp tips don't explode). Works for either winding.
 */
export function offsetPolygon(pts: V2[], d: number): V2[] {
  if (Math.abs(d) < 1e-9) return pts.map((p) => [...p] as V2);
  const s = signedArea2(pts) >= 0 ? 1 : -1;
  const n = pts.length;
  const normal = (a: V2, b: V2): V2 => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1e-9;
    return [(-dy / l) * s, (dx / l) * s];
  };
  return pts.map((p, i) => {
    const n1 = normal(pts[(i - 1 + n) % n], p);
    const n2 = normal(p, pts[(i + 1) % n]);
    let mx = n1[0] + n2[0];
    let my = n1[1] + n2[1];
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) {
      mx = n1[0];
      my = n1[1];
    } else {
      mx /= ml;
      my /= ml;
    }
    const cos = mx * n1[0] + my * n1[1];
    const len = Math.min(Math.abs(d) * 3, Math.abs(d) / Math.max(0.2, cos)) * Math.sign(d);
    return [p[0] + mx * len, p[1] + my * len] as V2;
  });
}

/**
 * Extrusion with rounded (bevelled) edges on both caps — the key ingredient of realistic hard-surface
 * parts: every edge catches a highlight instead of being razor sharp. Holes are bevelled too.
 * `segments` = 1 gives a chamfer, 2–3 a rounded fillet.
 */
const segDist = (p: V2, a: V2, b: V2) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1e-12)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
/** Smallest distance between a vertex of one loop and the edges of another (wall thickness around holes). */
const loopGap = (a: V2[], b: V2[]) => {
  let m = Infinity;
  for (const p of a) for (let i = 0; i < b.length; i++) m = Math.min(m, segDist(p, b[i], b[(i + 1) % b.length]));
  for (const p of b) for (let i = 0; i < a.length; i++) m = Math.min(m, segDist(p, a[i], a[(i + 1) % a.length]));
  return m;
};

export function bevelExtrude(outline: V2[], depth: number, bevel: number, holes: V2[][] = [], segments = 2): P.PolyMesh {
  let b = Math.max(0, Math.min(bevel, depth * 0.45));
  // Never let bevels of neighbouring loops (outline ↔ hole, hole ↔ hole) cross each other.
  const loops0 = [outline, ...holes];
  for (let i = 0; i < loops0.length; i++) for (let j = i + 1; j < loops0.length; j++) b = Math.min(b, loopGap(loops0[i], loops0[j]) * 0.4);
  if (b < 1e-6) return extrude(outline, depth, holes);
  const ccw = (pts: V2[]) => (signedArea2(pts) < 0 ? [...pts].reverse() : pts);
  const outer = ccw(outline);
  const inner = holes.map((h) => [...ccw(h)].reverse());
  const loops = [outer, ...inner];
  const seg = Math.max(1, Math.round(segments));
  // profile: back cap edge → back fillet → front fillet → front cap edge
  const prof: { inset: number; z: number }[] = [];
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * (Math.PI / 2);
    prof.push({ inset: b * (1 - Math.sin(a)), z: -depth / 2 + b * (1 - Math.cos(a)) });
  }
  for (let k = seg; k >= 0; k--) {
    const a = (k / seg) * (Math.PI / 2);
    prof.push({ inset: b * (1 - Math.sin(a)), z: depth / 2 - b * (1 - Math.cos(a)) });
  }
  const v: number[] = [];
  // rings[loop][profileStep] = vertex ids
  const rings = loops.map((loop, li) =>
    prof.map(({ inset, z }) => {
      // outer loop shrinks inward, holes grow into the material
      const pts = offsetPolygon(loop, li === 0 ? inset : -inset);
      return pts.map(([x, y]) => (v.push(x, y, z), v.length / 3 - 1));
    }),
  );
  const f: number[][] = [];
  rings.forEach((rs) => {
    for (let r = 0; r < rs.length - 1; r++) {
      const a = rs[r];
      const c = rs[r + 1];
      for (let i = 0; i < a.length; i++) {
        const j = (i + 1) % a.length;
        f.push([a[i], a[j], c[j], c[i]]);
      }
    }
  });
  const capOuter = offsetPolygon(outer, b);
  const capHoles = inner.map((h) => offsetPolygon(h, -b));
  const tris = THREE.ShapeUtils.triangulateShape(
    capOuter.map(([x, y]) => new THREE.Vector2(x, y)),
    capHoles.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y))),
  );
  const back = rings.flatMap((rs) => rs[0]);
  const front = rings.flatMap((rs) => rs[rs.length - 1]);
  for (const [a, bb, c] of tris) {
    f.push([back[c], back[bb], back[a]]);
    f.push([front[a], front[bb], front[c]]);
  }
  return orientOutward({ v, f });
}

/** Revolve a closed profile ([radius, y] loop, all radii > 0) around Y: rings, muzzle devices, hollow tubes. */
export function latheLoop(profile: V2[], segments = 24): P.PolyMesh {
  const n = Math.max(3, Math.round(segments));
  const v: number[] = [];
  const rings = profile.map(([r, y]) => {
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      v.push(Math.cos(a) * r, y, -Math.sin(a) * r);
      ids.push(v.length / 3 - 1);
    }
    return ids;
  });
  const f: number[][] = [];
  for (let k = 0; k < rings.length; k++) {
    const lo = rings[k];
    const up = rings[(k + 1) % rings.length];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      f.push([lo[i], lo[j], up[j], up[i]]);
    }
  }
  return orientOutward({ v, f });
}

/** Rounded-rectangle outline (2D), handy for slots, buttons and plates. */
export function roundedRect(w: number, h: number, r: number, steps = 4, cx = 0, cy = 0): V2[] {
  const rr = Math.min(r, w / 2 - 1e-6, h / 2 - 1e-6);
  const pts: V2[] = [];
  const corners: [number, number, number][] = [
    [w / 2 - rr, h / 2 - rr, 0],
    [-(w / 2 - rr), h / 2 - rr, Math.PI / 2],
    [-(w / 2 - rr), -(h / 2 - rr), Math.PI],
    [w / 2 - rr, -(h / 2 - rr), (3 * Math.PI) / 2],
  ];
  for (const [x, y, a0] of corners)
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (k / steps) * (Math.PI / 2);
      pts.push([cx + x + Math.cos(a) * rr, cy + y + Math.sin(a) * rr]);
    }
  return pts;
}

/** Circle outline (2D). */
export const circle = (r: number, steps = 24, cx = 0, cy = 0): V2[] => Array.from({ length: steps }, (_, i) => [cx + Math.cos((i / steps) * Math.PI * 2) * r, cy + Math.sin((i / steps) * Math.PI * 2) * r] as V2);
