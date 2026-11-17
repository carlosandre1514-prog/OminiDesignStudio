import { describe, expect, it } from 'vitest';
import { roundedBox } from '@/modules/studio-3d/mesh/builders';
import * as P from '@/modules/studio-3d/mesh/polyMesh';
import { toBufferGeometry } from '@/modules/studio-3d/geometry';
import { DEFAULT_FINISH, materialFor, synthesize } from '@/modules/studio-3d/weapons/textures';
import { camouflage, edgeSharpness } from './surface';

describe('edge wear attribute', () => {
  it('matches the triangle corner layout and marks hard edges', () => {
    const box = P.box(1, 1, 1);
    const g = toBufferGeometry(box, { shading: 'auto', uv: 'box' });
    const e = edgeSharpness(box);
    expect(e.length).toBe(g.getAttribute('position').count);
    // Every corner of a cube is on a 90° edge.
    expect(Math.min(...e)).toBeCloseTo(1, 5);
  });

  it('is low on flat areas and high on corners', () => {
    const m = P.plane(1, 1, 4, 4);
    const e = edgeSharpness(m);
    expect(Math.max(...e)).toBeLessThan(0.01);
    const rb = edgeSharpness(roundedBox(1, 1, 1, 0.2, 3));
    expect(Math.max(...rb)).toBeLessThan(0.5); // rounded: no 90° edges
  });
});

describe('camouflage', () => {
  const base = synthesize(materialFor('polymer', DEFAULT_FINISH).pattern!, 64);
  it('solid cerakote takes the chosen colour', () => {
    const t = camouflage(base, 'solido', '#806040');
    const avg = [0, 1, 2].map((c) => {
      let s = 0;
      for (let i = 0; i < 64 * 64; i++) s += t.color[i * 4 + c];
      return s / (64 * 64);
    });
    expect(avg[0]).toBeGreaterThan(avg[2] * 1.5);
    expect(t.normal).toBe(base.normal);
  });

  it('patterns use several colours', () => {
    for (const p of ['woodland', 'deserto', 'digital', 'urbano', 'tigre'] as const) {
      const t = camouflage(base, p, '#4b5a32');
      const keys = new Set<string>();
      for (let i = 0; i < 64 * 64; i += 7) keys.add(`${t.color[i * 4] >> 5},${t.color[i * 4 + 1] >> 5},${t.color[i * 4 + 2] >> 5}`);
      expect(keys.size, p).toBeGreaterThan(2);
    }
  });
});
