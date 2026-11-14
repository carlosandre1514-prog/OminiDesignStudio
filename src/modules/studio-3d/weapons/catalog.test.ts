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
