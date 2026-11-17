import * as THREE from 'three';
import * as B from '../../mesh/builders';
import { place, T, type V2 } from '../../mesh/builders';
import type * as P from '../../mesh/polyMesh';

/**
 * Hard-surface kit used by the HD weapons. Conventions: metres, +X = muzzle, +Y = up,
 * +Z = right side of the weapon (the side the default camera sees), bore axis on y = z = 0.
 */

/**
 * Level of detail of the kit (set by buildWeapon from the chosen mesh quality):
 * `seg` multiplies bevel segments (rounder edges), `rev` multiplies the segments of revolved parts.
 */
export const detail = { seg: 1, rev: 1, support: 0 };
const sg = (n: number) => Math.max(1, Math.round(n * detail.seg));
const rv = (n: number) => Math.max(3, Math.round(n * detail.rev));

/**
 * Support loops for subdivision: insert points `eps` away from every corner along both edges, so
 * Catmull–Clark keeps corners tight (≈ eps radius) instead of melting them. No-op at normal quality.
 */
export function support(pts: V2[], closed = true, bevel = 0): V2[] {
  if (!detail.support || pts.length < 3) return pts;
  // the support point must sit beyond the bevel band, otherwise the inset outline folds over itself
  const eps = Math.max(detail.support, bevel * 1.35);
  const out: V2[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const first = !closed && i === 0;
    const last = !closed && i === n - 1;
    // at an acute corner the bevel inset travels further along the bisector: d / tan(θ/2)
    const ux = prev[0] - p[0];
    const uy = prev[1] - p[1];
    const vx = next[0] - p[0];
    const vy = next[1] - p[1];
    const cos = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
    const half = Math.acos(Math.max(-1, Math.min(1, cos))) / 2;
    const e = first || last ? eps : Math.max(eps, (bevel / Math.max(0.05, Math.tan(half))) * 1.25);
    const near = (q: V2) => {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      // skip short edges: there is no room for a support point (the edge itself is the support)
      return d > e * 2.6 ? ([p[0] + ((q[0] - p[0]) * e) / d, p[1] + ((q[1] - p[1]) * e) / d] as V2) : null;
    };
    const a = first ? null : near(prev);
    const b = last ? null : near(next);
    if (a) out.push(a);
    out.push(p);
    if (b) out.push(b);
  }
  return out;
}
const sup = (loops: V2[][], bevel = 0) => loops.map((l) => support(l, true, bevel));
/** Lathe profiles: open polylines [radius, x]; keep the poles (radius 0) untouched. */
const supOpen = (pr: V2[]) => support(pr, false);

/** Side-profile part: outline in XY, extruded across Z from z0 to z1, with rounded edges. */
export const side = (outline: V2[], z0: number, z1: number, bevel: number, holes: V2[][] = [], seg = 2): P.PolyMesh =>
  place(B.bevelExtrude(support(outline, true, bevel), z1 - z0, bevel, sup(holes, bevel), sg(seg)), T.at(0, 0, (z0 + z1) / 2));

/** Top-view part: outline in XZ (x, z), extruded along Y from y0 to y1. */
export const top = (outline: V2[], y0: number, y1: number, bevel: number, holes: V2[][] = [], seg = 2): P.PolyMesh =>
  place(B.bevelExtrude(support(outline, true, bevel), y1 - y0, bevel, sup(holes, bevel), sg(seg)), T.at(0, (y0 + y1) / 2, 0), T.rx(Math.PI / 2));

/** Cross-section part: profile in (z, y), extruded along X from x0 to x1 (rails, tubes, sights). */
export const alongX = (profile: V2[], x0: number, x1: number, bevel = 0, holes: V2[][] = [], seg = 1): P.PolyMesh =>
  place(B.bevelExtrude(support(profile.map(([z, y]) => [-z, y] as V2), true, bevel), x1 - x0, bevel, sup(holes.map((h) => h.map(([z, y]) => [-z, y] as V2)), bevel), sg(seg)), T.at((x0 + x1) / 2, 0, 0), T.ry(Math.PI / 2));

/** Solid of revolution along X: profile [radius, x] (radius 0 = closed pole). */
export const turnX = (profile: V2[], y = 0, z = 0, segments = 32): P.PolyMesh => place(B.lathe(supOpen(profile), rv(segments)), T.at(0, y, z), T.rz(-Math.PI / 2));

/** Hollow solid of revolution along X (closed [radius, x] loop): barrels, muzzle devices, nuts, tubes. */
export const tubeX = (loop: V2[], y = 0, z = 0, segments = 32): P.PolyMesh => place(B.latheLoop(support(loop), segments <= 8 ? segments : rv(segments)), T.at(0, y, z), T.rz(-Math.PI / 2));

/** Short pin / screw head on a side face (axis Z). */
export const pinZ = (x: number, y: number, z: number, r: number, len: number, segments = 16): P.PolyMesh =>
  place(B.lathe(supOpen([[0, 0], [r * 0.92, 0], [r, len * 0.25], [r, len * 0.75], [r * 0.85, len], [0, len]]), rv(segments)), T.at(x, y, z - len / 2), T.rx(Math.PI / 2));

/** Annular sector (z, y) cross-section, for slotted muzzle devices. Angles in radians, 0 = +Z, CCW toward +Y. */
export const sector = (r0: number, r1: number, a0: number, a1: number, steps = 8): V2[] => {
  const pts: V2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([Math.cos(a) * r1, Math.sin(a) * r1]);
  }
  for (let i = steps; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([Math.cos(a) * r0, Math.sin(a) * r0]);
  }
  return pts;
};

/** MIL-STD-1913 (Picatinny) rail from x0 to x1 sitting on y = base. Real slot pitch 10 mm. */
export function picatinny(x0: number, x1: number, base: number): P.PolyMesh {
  const body: V2[] = [
    [-0.0083, base],
    [0.0083, base],
    [0.0106, base + 0.0028],
    [0.0106, base + 0.0052],
    [0.0085, base + 0.0062],
    [-0.0085, base + 0.0062],
    [-0.0106, base + 0.0052],
    [-0.0106, base + 0.0028],
  ];
  const tooth: V2[] = [
    [-0.0085, base + 0.006],
    [0.0085, base + 0.006],
    [0.0085, base + 0.0082],
    [0.0076, base + 0.0094],
    [-0.0076, base + 0.0094],
    [-0.0085, base + 0.0082],
  ];
  const parts = [alongX(body, x0, x1, 0.0004)];
  const pitch = 0.01;
  const n = Math.floor((x1 - x0 - 0.004) / pitch);
  const start = x0 + (x1 - x0 - (n * pitch - 0.00523)) / 2;
  for (let i = 0; i < n; i++) parts.push(alongX(tooth, start + i * pitch, start + i * pitch + 0.00477, 0.0004));
  return B.merge(...parts);
}

/** Thin raised ridges (slide serrations, grip texture lines) on the faces z = ±zFace. */
export function serrations(x0: number, x1: number, count: number, y0: number, y1: number, zFace: number, both = true): P.PolyMesh {
  const parts: P.PolyMesh[] = [];
  const pitch = (x1 - x0) / count;
  for (let i = 0; i < count; i++) {
    const x = x0 + i * pitch;
    const r: V2[] = [[x, y0], [x + pitch * 0.5, y0], [x + pitch * 0.5, y1], [x, y1]];
    parts.push(side(r, zFace - 0.0002, zFace + 0.0007, 0.00025, [], 1));
    if (both) parts.push(side(r, -zFace - 0.0007, -zFace + 0.0002, 0.00025, [], 1));
  }
  return B.merge(...parts);
}

export { B, place, T };
export type { V2 };

/**
 * Annular sector of a "superellipse" ring in the (z, y) plane — rounded-square tubes such as polymer
 * handguards. Angle 0 = +Z (right side), counter-clockwise toward +Y (top).
 */
export function superSector(a: number, b: number, wall: number, n: number, t0: number, t1: number, cy = 0, steps?: number): V2[] {
  const k = steps ?? Math.max(4, Math.round(((t1 - t0) / (Math.PI * 2)) * 48 * detail.rev));
  const pt = (t: number, A: number, Bv: number): V2 => {
    const c = Math.cos(t);
    const s = Math.sin(t);
    return [A * Math.sign(c) * Math.abs(c) ** (2 / n), cy + Bv * Math.sign(s) * Math.abs(s) ** (2 / n)];
  };
  const out: V2[] = [];
  for (let i = 0; i <= k; i++) out.push(pt(t0 + ((t1 - t0) * i) / k, a, b));
  for (let i = k; i >= 0; i--) out.push(pt(t0 + ((t1 - t0) * i) / k, a - wall, b - wall));
  return out;
}

// ---------------------------------------------------------------- organic grips

/** Side-view profile given top → bottom as (value, y) points, smoothed (Catmull–Rom) and read at any height. */
function profileAt(pts: V2[]) {
  const smp = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(240);
  return (y: number) => {
    if (y >= smp[0].y) return smp[0].x;
    for (let i = 1; i < smp.length; i++)
      if (smp[i].y <= y) {
        const a = smp[i - 1];
        const b = smp[i];
        return a.x + ((b.x - a.x) * (a.y - y)) / (a.y - b.y || 1);
      }
    return smp[smp.length - 1].x;
  };
}

/**
 * Pistol-grip shape in its own frame (x forward, y up along the grip, z across). Profiles are given
 * top → bottom: front strap and back strap as (x, y), half width as (halfWidth, y).
 */
export interface GripShape {
  front: V2[];
  back: V2[];
  half: V2[];
  /** y of the flat base */
  base: number;
  /** radius of the rounded base edge */
  round?: number;
  /** how much narrower the front strap is than the middle (0..1) */
  taperFront?: number;
  /** same for the back strap, by height (e.g. a narrow beavertail on top) */
  taperBack?: (y: number) => number;
  /** superellipse exponent of the cross-section (2 = ellipse, higher = boxier) */
  power?: number;
}

/** Point of the grip surface at height y and angle phi (0 = front strap, π/2 = right side, π = back strap). */
export function gripSurface(g: GripShape) {
  const F = profileAt(g.front);
  const Bk = profileAt(g.back);
  const H = profileAt(g.half);
  const e = 2 / (g.power ?? 2.5);
  const tf = g.taperFront ?? 0.3;
  return (y: number, phi: number, inset = 0): P.Vec3 => {
    const xf = F(y) - inset;
    const xb = Bk(y) + inset;
    const hw = H(y) - inset;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    const cx = Math.sign(c) * Math.abs(c) ** e;
    const sz = Math.sign(sn) * Math.abs(sn) ** e;
    const taper = 1 - (c >= 0 ? tf : (g.taperBack?.(y) ?? 0.12)) * c * c;
    return [(xf + xb) / 2 + ((xf - xb) / 2) * cx, y, hw * sz * taper];
  };
}

/** Rounded, lofted pistol grip from `top` down to the base, with a rounded base edge. */
export function grip(g: GripShape, top: number, rings = 20, around = 28): P.PolyMesh {
  const S = gripSurface(g);
  const r = g.round ?? 0.004;
  const nr = rv(rings);
  const na = rv(around);
  const sections: P.Vec3[][] = [];
  const ring = (y: number, inset: number) => Array.from({ length: na }, (_, i) => S(y, (i / na) * Math.PI * 2, inset));
  for (let k = 0; k < nr; k++) sections.push(ring(top + ((g.base + r - top) * k) / nr, 0));
  const steps = sg(4);
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2);
    sections.push(ring(g.base + r - r * Math.sin(a), r * (1 - Math.cos(a))));
  }
  return B.loft(sections);
}

/**
 * Raised textured panel following the grip surface on both sides: rows from y0 to y1, centred on
 * angle `phi` (from the front strap) with half-span `span`, rounded ends. Thin shell: no subdivision.
 */
export function gripPanels(g: GripShape, y0: number, y1: number, phi: number, span: number, raise = 0.0005, rows = 16, cols = 12): P.PolyMesh {
  const S = gripSurface(g);
  const nr = rv(rows);
  const nc = rv(cols);
  const panel = (sideSign: number) => {
    const sections: P.Vec3[][] = [];
    for (let j = 0; j <= nr; j++) {
      const v = j / nr;
      const q = Math.max(0.3, (1 - Math.abs(2 * v - 1) ** 4) ** 0.25);
      const y = y0 + (y1 - y0) * v;
      const outer: P.Vec3[] = [];
      const inner: P.Vec3[] = [];
      for (let i = 0; i <= nc; i++) {
        const a = sideSign * (phi + span * q * ((2 * i) / nc - 1));
        outer.push(S(y, a, -raise));
        inner.unshift(S(y, a, raise));
      }
      sections.push([...outer, ...inner]);
    }
    return B.loft(sections);
  };
  return B.merge(panel(1), panel(-1));
}
