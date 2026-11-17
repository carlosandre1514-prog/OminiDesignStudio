import { describe, expect, it } from 'vitest';
import { roundedBox } from '@/modules/studio-3d/mesh/builders';
import * as P from '@/modules/studio-3d/mesh/polyMesh';
import { toBufferGeometry } from '@/modules/studio-3d/geometry';
import { DEFAULT_FINISH, materialFor, synthesize } from '@/modules/studio-3d/weapons/textures';
import { camouflage, edgeWearAttributes } from './surface';

describe('edge wear attributes', () => {
  it('match the triangle corner layout', () => {
    const box = P.box(1, 1, 1);
    const g = toBufferGeometry(box, { shading: 'auto', uv: 'box' });
    const { bary, edgeH } = edgeWearAttributes(box);
    expect(bary.length / 3).toBe(g.getAttribute('position').count);
    expect(edgeH.length).toBe(bary.length);
  });

  it('marks polygon edges of a cube as hard, never the fan diagonal', () => {
    const { edgeH } = edgeWearAttributes(P.box(1, 1, 1));
    // Each quad = 2 triangles; per triangle exactly 2 hard edges (the 3rd is the diagonal), altitude ≈ 1 / √2 or 1.
    for (let t = 0; t < edgeH.length / 9; t++) {
      const h = Array.from(edgeH.slice(t * 9, t * 9 + 3));
      expect(h.filter((x) => x > 0)).toHaveLength(2);
      for (const x of h.filter((v) => v > 0)) expect(x).toBeCloseTo(1, 5);
    }
  });

  it('a flat subdivided plane has no hard edges inside, only its open border', () => {
    const { edgeH } = edgeWearAttributes(P.plane(1, 1, 4, 4));
    const hardCount = Array.from(edgeH).filter((x) => x > 0).length / 3;
    // 16 border edges, each seen by the 3 corners of its triangle.
    expect(hardCount).toBe(16);
  });

  it('distance to a hard edge is metric, independent of face size', () => {
    const big = edgeWearAttributes(P.box(2, 2, 2)).edgeH;
    expect(Math.max(...big)).toBeCloseTo(2, 5);
    const rounded = edgeWearAttributes(roundedBox(1, 1, 1, 0.2, 3)).edgeH;
    // chamfer steps are 30° apart → only the gentle bevels, no 90° edges: few or none flagged
    expect(Array.from(rounded).filter((x) => x > 0).length).toBeLessThan(rounded.length / 4);
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
