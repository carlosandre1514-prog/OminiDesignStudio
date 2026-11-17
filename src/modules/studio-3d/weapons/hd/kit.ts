import * as B from '../../mesh/builders';
import { place, T, type V2 } from '../../mesh/builders';
import type * as P from '../../mesh/polyMesh';

/**
 * Hard-surface kit used by the HD weapons. Conventions: metres, +X = muzzle, +Y = up,
 * +Z = right side of the weapon (the side the default camera sees), bore axis on y = z = 0.
 */

/** Side-profile part: outline in XY, extruded across Z from z0 to z1, with rounded edges. */
export const side = (outline: V2[], z0: number, z1: number, bevel: number, holes: V2[][] = [], seg = 2): P.PolyMesh =>
  place(B.bevelExtrude(outline, z1 - z0, bevel, holes, seg), T.at(0, 0, (z0 + z1) / 2));

/** Top-view part: outline in XZ (x, z), extruded along Y from y0 to y1. */
export const top = (outline: V2[], y0: number, y1: number, bevel: number, holes: V2[][] = [], seg = 2): P.PolyMesh =>
  place(B.bevelExtrude(outline, y1 - y0, bevel, holes, seg), T.at(0, (y0 + y1) / 2, 0), T.rx(Math.PI / 2));

/** Cross-section part: profile in (z, y), extruded along X from x0 to x1 (rails, tubes, sights). */
export const alongX = (profile: V2[], x0: number, x1: number, bevel = 0, holes: V2[][] = [], seg = 1): P.PolyMesh =>
  place(B.bevelExtrude(profile.map(([z, y]) => [-z, y] as V2), x1 - x0, bevel, holes.map((h) => h.map(([z, y]) => [-z, y] as V2)), seg), T.at((x0 + x1) / 2, 0, 0), T.ry(Math.PI / 2));

/** Solid of revolution along X: profile [radius, x] (radius 0 = closed pole). */
export const turnX = (profile: V2[], y = 0, z = 0, segments = 32): P.PolyMesh => place(B.lathe(profile, segments), T.at(0, y, z), T.rz(-Math.PI / 2));

/** Hollow solid of revolution along X (closed [radius, x] loop): barrels, muzzle devices, nuts, tubes. */
export const tubeX = (loop: V2[], y = 0, z = 0, segments = 32): P.PolyMesh => place(B.latheLoop(loop, segments), T.at(0, y, z), T.rz(-Math.PI / 2));

/** Short pin / screw head on a side face (axis Z). */
export const pinZ = (x: number, y: number, z: number, r: number, len: number, segments = 16): P.PolyMesh =>
  place(B.lathe([[0, 0], [r * 0.92, 0], [r, len * 0.25], [r, len * 0.75], [r * 0.85, len], [0, len]], segments), T.at(x, y, z - len / 2), T.rx(Math.PI / 2));

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
