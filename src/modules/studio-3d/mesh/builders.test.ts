import { describe, expect, it } from 'vitest';
import * as B from './builders';
import * as P from './polyMesh';

describe('mesh builders', () => {
  it('lathe makes closed solids (with poles and caps)', () => {
    const cyl = B.lathe([[0.5, 0], [0.5, 1]], 32);
    expect(P.isClosedManifold(cyl)).toBe(true);
    expect(P.volume(cyl)).toBeCloseTo(Math.PI * 0.25, 1);
    const pommel = B.lathe([[0, 0], [0.3, 0.1], [0.4, 0.3], [0.2, 0.5], [0, 0.55]], 16);
    expect(P.isClosedManifold(pommel)).toBe(true);
    expect(P.volume(pommel)).toBeGreaterThan(0);
  });

  it('extrudes concave outlines with holes', () => {
    // L-shaped outline (concave)
    const L = B.extrude([[0, 0], [2, 0], [2, 0.5], [0.5, 0.5], [0.5, 2], [0, 2]], 0.2);
    expect(P.isClosedManifold(L)).toBe(true);
    expect(P.volume(L)).toBeCloseTo((2 * 0.5 + 0.5 * 1.5) * 0.2);
    // Ring (trigger guard style)
    const ring = B.extrude([[-1, -1], [1, -1], [1, 1], [-1, 1]], 0.1, [[[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]]);
    expect(P.isClosedManifold(ring)).toBe(true);
    expect(P.volume(ring)).toBeCloseTo((4 - 1) * 0.1);
  });

  it('lofts sections into a closed solid with a pointed tip', () => {
    const diamond = (y: number, w: number, t: number): P.Vec3[] => [[w, y, 0], [0, y, t], [-w, y, 0], [0, y, -t]];
    const blade = B.loft([diamond(0, 0.03, 0.004), diamond(0.5, 0.03, 0.004), diamond(0.8, 0, 0)]);
    expect(P.isClosedManifold(blade)).toBe(true);
    expect(P.volume(blade)).toBeGreaterThan(0);
    expect(P.bounds(blade).max[1]).toBeCloseTo(0.8);
  });

  it('tubes follow curved paths and transforms keep outward faces', () => {
    const path: P.Vec3[] = Array.from({ length: 20 }, (_, i) => [Math.sin(i / 6), i / 10, 0]);
    const t = B.tube(path, () => 0.02, 8);
    expect(P.isClosedManifold(t)).toBe(true);
    expect(P.volume(t)).toBeGreaterThan(0);
    const mirrored = B.transform(t, B.T.s(-1, 1, 1));
    expect(P.volume(mirrored)).toBeGreaterThan(0);
  });

  it('rounded boxes are closed with bevelled edges', () => {
    const b = B.roundedBox(1, 0.5, 0.3, 0.05);
    expect(P.isClosedManifold(b)).toBe(true);
    expect(P.volume(b)).toBeLessThan(0.15);
    expect(P.volume(b)).toBeGreaterThan(0.13);
  });

  it('seeded rng is deterministic', () => {
    const a = B.rng(42);
    const b = B.rng(42);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });
});

describe('auto smooth shading', () => {
  it('keeps hard edges and smooths curved surfaces', async () => {
    const { toBufferGeometry } = await import('../geometry');
    const box = toBufferGeometry(P.box(1, 1, 1), { shading: 'auto', uv: 'box' });
    const n = box.getAttribute('normal');
    // every normal of a box stays axis-aligned (90° edges are not smoothed)
    for (let i = 0; i < n.count; i++) expect(Math.max(Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i)))).toBeCloseTo(1);
    const cyl = toBufferGeometry(P.cylinder(0.5, 0.5, 1, 32), { shading: 'auto', uv: 'box' });
    const cn = cyl.getAttribute('normal');
    // side normals are smoothed (not all identical within a face): some have both x and z components
    let mixed = 0;
    for (let i = 0; i < cn.count; i++) if (Math.abs(cn.getX(i)) > 0.1 && Math.abs(cn.getZ(i)) > 0.1 && Math.abs(cn.getY(i)) < 0.01) mixed++;
    expect(mixed).toBeGreaterThan(0);
  });
});

describe('hard-surface builders', () => {
  it('bevelExtrude is closed, keeps the outer size and rounds the edges', async () => {
    const { bevelExtrude, extrude, roundedRect, circle } = await import('./builders');
    const outline: [number, number][] = [[0, 0], [0.2, 0], [0.2, 0.05], [0.12, 0.05], [0.1, 0.12], [0, 0.12]];
    const hole = roundedRect(0.04, 0.02, 0.008, 4, 0.06, 0.025);
    const m = bevelExtrude(outline, 0.03, 0.004, [hole], 3);
    expect(P.isClosedManifold(m)).toBe(true);
    expect(P.volume(m)).toBeGreaterThan(0);
    const ref = extrude(outline, 0.03, [hole]);
    expect(P.volume(m)).toBeLessThan(P.volume(ref));
    expect(P.volume(m)).toBeGreaterThan(P.volume(ref) * 0.85);
    const bx = P.bounds(m);
    expect(bx.max[0] - bx.min[0]).toBeCloseTo(0.2, 4);
    expect(bx.max[2] - bx.min[2]).toBeCloseTo(0.03, 6);
    expect(P.isClosedManifold(bevelExtrude(circle(0.01, 20), 0.005, 0.001))).toBe(true);
  });

  it('latheLoop revolves a closed profile into a hollow ring', async () => {
    const { latheLoop } = await import('./builders');
    const ring = latheLoop([[0.004, 0], [0.007, 0], [0.007, 0.02], [0.004, 0.02]], 24);
    expect(P.isClosedManifold(ring)).toBe(true);
    const vol = P.volume(ring);
    const exact = Math.PI * (0.007 ** 2 - 0.004 ** 2) * 0.02;
    expect(vol).toBeGreaterThan(exact * 0.93);
    expect(vol).toBeLessThan(exact * 1.01);
  });

  it('offsetPolygon moves edges by the distance', async () => {
    const { offsetPolygon } = await import('./builders');
    const sq: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const o = offsetPolygon(sq, 0.1);
    expect(o[0][0]).toBeCloseTo(0.1, 6);
    expect(o[0][1]).toBeCloseTo(0.1, 6);
    const cw = offsetPolygon([...sq].reverse(), 0.1);
    expect(cw[3][0]).toBeCloseTo(0.1, 6);
  });
});
