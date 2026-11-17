import { describe, expect, it } from 'vitest';
import * as B from '@/modules/studio-3d/mesh/builders';
import { denseGeometry } from './dense';

describe('high-poly dense geometry', () => {
  it('multiplies triangles by 4 per level and stays indexed', () => {
    const m = B.bevelExtrude(B.roundedRect(0.1, 0.04, 0.005, 3), 0.02, 0.002, [], 2);
    const g0 = denseGeometry(m, 0);
    const g2 = denseGeometry(m, 2);
    expect(g2.triangles).toBeGreaterThan(g0.triangles * 8);
    expect(g2.index.length).toBe(g2.triangles * 3);
    expect(Math.max(...g2.index)).toBeLessThan(g2.position.length / 3);
    // compact: fewer vertices than triangles
    expect(g2.position.length / 3).toBeLessThan(g2.triangles);
  });

  it('normals are unit length and convexity is high on edges, ~0 on flat faces', () => {
    const g = denseGeometry(B.bevelExtrude([[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1]], 0.05, 0.004, [], 2), 2);
    for (let i = 0; i < g.normal.length; i += 3) expect(Math.hypot(g.normal[i], g.normal[i + 1], g.normal[i + 2])).toBeCloseTo(1, 4);
    let center = 0;
    let corner = 0;
    for (let i = 0; i < g.curv.length; i++) {
      const x = g.position[i * 3];
      const y = g.position[i * 3 + 1];
      const z = g.position[i * 3 + 2];
      if (Math.abs(x - 0.05) < 0.01 && Math.abs(y - 0.05) < 0.01 && z > 0.02) center = Math.max(center, g.curv[i]);
      if (x > 0.094 && Math.abs(y - 0.05) < 0.01 && z > 0.018) corner = Math.max(corner, g.curv[i]); // bevelled cap edge
    }
    expect(center).toBeLessThan(0.01);
    expect(corner).toBeGreaterThan(0.05);
  });
});
