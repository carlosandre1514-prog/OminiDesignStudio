import { describe, expect, it } from 'vitest';
import * as P from './polyMesh';

const closed = (m: P.PolyMesh) => P.isClosedManifold(m);

describe('primitives', () => {
  it('are closed, outward-facing and have expected sizes', () => {
    const b = P.box(2, 2, 2);
    expect(P.stats(b)).toMatchObject({ vertices: 8, faces: 6, triangles: 12, edges: 12 });
    expect(closed(b)).toBe(true);
    expect(P.volume(b)).toBeCloseTo(8);
    const s = P.sphere(1, 32, 16);
    expect(closed(s)).toBe(true);
    expect(P.volume(s)).toBeGreaterThan(3.9); // ≈ 4.19
    expect(P.volume(s)).toBeLessThan(4.19);
    const c = P.cylinder(0.5, 0.5, 2, 24);
    expect(closed(c)).toBe(true);
    expect(P.volume(c)).toBeCloseTo(Math.PI * 0.25 * 2, 1);
    const cone = P.cylinder(0, 0.5, 1, 32);
    expect(closed(cone)).toBe(true);
    expect(P.volume(cone)).toBeGreaterThan(0);
    const t = P.torus(1, 0.25, 24, 12);
    expect(closed(t)).toBe(true);
    expect(P.volume(t)).toBeGreaterThan(0);
    const pl = P.plane(2, 2, 2, 2);
    expect(P.stats(pl)).toMatchObject({ vertices: 9, faces: 4 });
    expect(P.faceNormal(pl, pl.f[0])[1]).toBeCloseTo(1);
  });
});

describe('operations', () => {
  it('extrudes a face outward and keeps the mesh closed', () => {
    const b = P.box(1, 1, 1);
    const top = b.f.findIndex((f) => P.faceNormal(b, f)[1] > 0.9);
    const { mesh } = P.extrudeFaces(b, [top], 1);
    expect(P.stats(mesh)).toMatchObject({ vertices: 12, faces: 10 });
    expect(closed(mesh)).toBe(true);
    expect(P.volume(mesh)).toBeCloseTo(2);
    expect(P.bounds(mesh).max[1]).toBeCloseTo(1.5);
  });

  it('extrudes a region of adjacent faces as one block', () => {
    const pl = P.plane(2, 1, 2, 1);
    const { mesh } = P.extrudeFaces(pl, [0, 1], 0.5);
    // 6 original + 6 lifted; 2 caps + 6 boundary walls
    expect(P.stats(mesh)).toMatchObject({ vertices: 12, faces: 8 });
  });

  it('insets and bevels faces', () => {
    const b = P.box(1, 1, 1);
    const ins = P.insetFaces(b, [0], 0.25);
    expect(P.stats(ins.mesh)).toMatchObject({ vertices: 12, faces: 10 });
    expect(closed(ins.mesh)).toBe(true);
    expect(P.volume(ins.mesh)).toBeCloseTo(1);
    const bev = P.bevelFaces(b, [0], 0.2, 0.1);
    expect(closed(bev.mesh)).toBe(true);
    expect(P.volume(bev.mesh)).toBeGreaterThan(1);
  });

  it('subdivides (Catmull–Clark) into quads and smooths the shape', () => {
    const b = P.box(2, 2, 2);
    const s1 = P.subdivide(b);
    expect(P.stats(s1)).toMatchObject({ faces: 24, vertices: 26 });
    expect(closed(s1)).toBe(true);
    expect(P.volume(s1)).toBeLessThan(8); // rounded
    const lin = P.subdivide(b, false);
    expect(P.volume(lin)).toBeCloseTo(8); // linear keeps the shape
    expect(P.stats(P.subdivide(s1)).faces).toBe(96);
  });

  it('loop-cuts around a box', () => {
    const b = P.box(1, 1, 1);
    // a vertical edge of the front face
    const front = b.f[0];
    const { mesh, newVertices } = P.loopCut(b, front[1], front[2]);
    expect(newVertices).toHaveLength(4);
    expect(P.stats(mesh)).toMatchObject({ vertices: 12, faces: 10 });
    expect(closed(mesh)).toBe(true);
    expect(P.volume(mesh)).toBeCloseTo(1);
  });

  it('loop cut on a cylinder ring keeps the caps connected', () => {
    const c = P.cylinder(0.5, 0.5, 1, 8);
    const side = c.f[0];
    const { mesh } = P.loopCut(c, side[1], side[2]);
    expect(closed(mesh)).toBe(true);
    expect(P.stats(mesh).faces).toBe(c.f.length + 8);
  });

  it('merges by distance, deletes, flips and mirrors', () => {
    const b = P.box(1, 1, 1);
    const tri = P.fromTriangles(new Float32Array(b.f.flatMap((f) => [f[0], f[1], f[2], f[0], f[2], f[3]].flatMap((i) => P.vget(b, i)))));
    expect(P.stats(tri)).toMatchObject({ vertices: 8, faces: 12 });
    expect(closed(tri)).toBe(true);
    const del = P.deleteFaces(b, [0]);
    expect(P.stats(del).faces).toBe(5);
    expect(closed(del)).toBe(false);
    expect(P.volume(P.flipFaces(b))).toBeCloseTo(-1);
    // Mirror half a box across X: welded into a full closed box of double width.
    const half = P.deleteFaces(P.translateVertices(P.box(1, 1, 1), [0, 1, 2, 3, 4, 5, 6, 7], [0.5, 0, 0]), [3]);
    const full = P.mirror(half, 0);
    // The open seam at x = 0 is welded: the result is one closed box of width 2.
    expect(closed(full)).toBe(true);
    expect(P.volume(full)).toBeCloseTo(2);
    expect(P.stats(full).vertices).toBe(12);
    expect(P.bounds(full).min[0]).toBeCloseTo(-1);
  });

  it('moves and transforms vertices', () => {
    const b = P.box(1, 1, 1);
    const top = b.f[4];
    const moved = P.translateVertices(b, top, [0, 1, 0]);
    expect(P.bounds(moved).max[1]).toBeCloseTo(1.5);
    const scaled = P.transformVertices(b, [0, 1, 2, 3, 4, 5, 6, 7], (p) => [p[0] * 2, p[1], p[2]]);
    expect(P.volume(scaled)).toBeCloseTo(2);
  });
});
