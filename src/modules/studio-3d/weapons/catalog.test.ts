import { describe, expect, it } from 'vitest';
import * as P from '../mesh/polyMesh';
import { WEAPONS, buildWeapon, defaultParams, randomParams } from './catalog';

const finite = (m: P.PolyMesh) => m.v.every((x) => Number.isFinite(x));

describe('weapon catalog', () => {
  it('covers the four categories', () => {
    const cats = new Set(WEAPONS.map((w) => w.category));
    expect([...cats].sort()).toEqual(['firearm', 'melee', 'ranged', 'scifi']);
    expect(new Set(WEAPONS.map((w) => w.id)).size).toBe(WEAPONS.length);
  });

  for (const w of WEAPONS)
    it(`${w.name}: valid closed parts for default and random parameters`, () => {
      for (const params of [defaultParams(w), randomParams(w, 7), randomParams(w, 99)]) {
        const parts = buildWeapon(w, params, 3);
        expect(parts.length).toBeGreaterThan(1);
        for (const part of parts) {
          expect(finite(part.mesh), `${part.name} finite`).toBe(true);
          expect(part.mesh.f.every((f) => f.length >= 3 && f.every((i) => i >= 0 && i < P.vcount(part.mesh))), part.name).toBe(true);
          expect(P.isClosedManifold(part.mesh), `${w.name} / ${part.name} closed`).toBe(true);
          expect(P.volume(part.mesh), `${w.name} / ${part.name} outward`).toBeGreaterThan(0);
        }
      }
    });

  it('is deterministic for the same seed', () => {
    const w = WEAPONS.find((x) => x.id === 'magic-staff')!;
    expect(buildWeapon(w, randomParams(w, 5), 11)).toEqual(buildWeapon(w, randomParams(w, 5), 11));
  });

  it('respects real-world dimensions (sword length follows the blade parameter)', () => {
    const w = WEAPONS.find((x) => x.id === 'longsword')!;
    const height = (blade: number) => {
      const parts = buildWeapon(w, { blade });
      const ys = parts.flatMap((p) => p.mesh.v.filter((_, i) => i % 3 === 1));
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(height(1.0) - height(0.7)).toBeCloseTo(0.3, 2);
    expect(height(0.9)).toBeGreaterThan(1.1);
    expect(height(0.9)).toBeLessThan(1.3);
  });
});

describe('high-quality HD meshes', () => {
  for (const w of WEAPONS.filter((x) => x.hd))
    it(`${w.name}: support loops keep parts closed and subdividable`, async () => {
      const { subdivide } = await import('../mesh/polyMesh');
      const low = buildWeapon(w, {}, 1, 'normal');
      const hi = buildWeapon(w, {}, 1, 'ultra');
      expect(hi.length).toBe(low.length);
      const tri = (m: P.PolyMesh) => m.f.reduce((s, f) => s + f.length - 2, 0);
      expect(hi.reduce((s, p) => s + tri(p.mesh), 0)).toBeGreaterThan(low.reduce((s, p) => s + tri(p.mesh), 0));
      for (const part of hi) {
        expect(P.isClosedManifold(part.mesh), `${part.name} closed`).toBe(true);
        const sub = subdivide(part.mesh, true);
        expect(P.isClosedManifold(sub), `${part.name} subdivided closed`).toBe(true);
        // subdivision must not melt the part: bounding box stays within 10 % / 3 mm
        const b0 = P.bounds(part.mesh);
        const b1 = P.bounds(sub);
        for (let k = 0; k < 3; k++) {
          const s0 = b0.max[k] - b0.min[k];
          const s1 = b1.max[k] - b1.min[k];
          expect(s0 - s1, `${part.name} axis ${k}`).toBeLessThan(Math.max(0.003, s0 * 0.1));
        }
      }
    });
});
