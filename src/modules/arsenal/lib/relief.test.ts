import { describe, expect, it } from 'vitest';
import * as P from '@/modules/studio-3d/mesh/polyMesh';
import { buildRelief, distanceInside, fixPinches } from './relief';

/** Synthetic "pistol" mask + a depth map that bulges in the middle of the slide. */
function scene(w = 120, h = 80) {
  const mask = new Float32Array(w * h);
  const depth = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const slide = x >= 10 && x < 110 && y >= 10 && y < 30;
      const grip = x >= 15 && x < 40 && y >= 30 && y < 72;
      const guard = x >= 40 && x < 65 && y >= 30 && y < 50 && !(x >= 45 && x < 60 && y >= 30 && y < 45);
      mask[y * w + x] = slide || grip || guard ? 1 : 0;
      depth[y * w + x] = 0.5 + 0.5 * Math.exp(-((x - 60) ** 2) / 800 - ((y - 20) ** 2) / 60);
    }
  return { mask: { width: w, height: h, data: mask }, depth: { width: w, height: h, data: depth } };
}

describe('photo → 3D relief', () => {
  it('builds a closed solid with the real length and the trigger-guard opening', () => {
    const { mask, depth } = scene();
    const r = buildRelief(mask, depth, { length: 0.2, grid: 120 });
    expect(P.isClosedManifold(r.mesh)).toBe(true);
    expect(P.volume(r.mesh)).toBeGreaterThan(0);
    const b = P.bounds(r.mesh);
    expect(b.max[0] - b.min[0]).toBeGreaterThan(0.16);
    expect(b.max[0] - b.min[0]).toBeLessThan(0.2);
    // symmetric thickness
    expect(b.max[2]).toBeCloseTo(-b.min[2], 6);
    // the bulge from the depth map makes the slide thicker than the grip
    const zAt = (x: number, y: number) => {
      let best = 0;
      for (let i = 0; i < r.mesh.v.length; i += 3) if (Math.hypot(r.mesh.v[i] - x, r.mesh.v[i + 1] - y) < 0.004) best = Math.max(best, r.mesh.v[i + 2]);
      return best;
    };
    const cs = 0.2 / 120;
    expect(zAt((60 - 60) * cs, (80 - 20) * cs)).toBeGreaterThan(zAt((27 - 60) * cs, (80 - 55) * cs));
    // genus 1 (one hole): Euler characteristic V − E + F = 0
    expect(P.vcount(r.mesh) - P.edges(r.mesh).length + r.mesh.f.length).toBe(0);
  });

  it('removes diagonal pinches and computes distances', () => {
    const m = new Uint8Array([1, 0, 0, 1]);
    fixPinches(m, 2, 2);
    expect(Array.from(m)).toEqual([1, 1, 1, 1]);
    const sq = new Uint8Array(25).fill(1);
    const d = distanceInside(sq, 5, 5);
    expect(d[12]).toBeGreaterThan(d[0]);
  });

  it('rejects an empty mask', () => {
    const z = { width: 10, height: 10, data: new Float32Array(100) };
    expect(() => buildRelief(z, z)).toThrow();
  });
});
