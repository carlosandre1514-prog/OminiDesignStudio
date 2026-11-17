import { describe, expect, it } from 'vitest';
import * as P from '@/modules/studio-3d/mesh/polyMesh';
import { area, otsu, silhouetteToMesh, traceContours, type ImageLike } from './silhouette';

/** Draw a simple "pistol" on a light background: frame + grip, with a trigger-guard opening. */
function pistolImage(transparent = false): ImageLike {
  const w = 120;
  const h = 80;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const slide = x >= 10 && x < 110 && y >= 10 && y < 30;
      const grip = x >= 15 && x < 40 && y >= 30 && y < 72;
      const guard = x >= 40 && x < 65 && y >= 30 && y < 50 && !(x >= 45 && x < 60 && y >= 30 && y < 45);
      const on = slide || grip || guard;
      const i = (y * w + x) * 4;
      if (on) data.set([30, 32, 35, 255], i);
      else data.set(transparent ? [0, 0, 0, 0] : [235, 236, 238, 255], i);
      // a few specks of noise in the background
      if (!on && (x * 7 + y * 13) % 97 === 0) data.set(transparent ? [0, 0, 0, 0] : [215, 216, 218, 255], i);
    }
  return { width: w, height: h, data };
}

describe('silhouette image-to-3D', () => {
  it('otsu splits a bimodal histogram', () => {
    const v = [...Array(100).fill(10), ...Array(100).fill(200)];
    const t = otsu(v);
    expect(t).toBeGreaterThanOrEqual(10);
    expect(t).toBeLessThan(200);
  });

  it('traces the outline and the trigger guard opening of a photo on plain background', () => {
    const r = silhouetteToMesh(pistolImage(), { length: 0.2, depth: 0.03 });
    expect(r.method).toBe('background');
    expect(r.holes).toHaveLength(1);
    expect(P.isClosedManifold(r.mesh)).toBe(true);
    expect(P.volume(r.mesh)).toBeGreaterThan(0);
    const xs = r.mesh.v.filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.2, 2);
    const ys = r.mesh.v.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
    // The opening removes material: volume < outline area × depth.
    expect(P.volume(r.mesh)).toBeLessThan(Math.abs(area(r.outline)) * 0.03);
    // Simplification keeps it light.
    expect(r.outline.length).toBeLessThan(40);
  });

  it('uses transparency when the image has an alpha channel', () => {
    const r = silhouetteToMesh(pistolImage(true), { length: 0.2, depth: 0.03 });
    expect(r.method).toBe('alpha');
    expect(r.holes).toHaveLength(1);
  });

  it('marching squares produces separate closed loops', () => {
    const w = 6;
    const m = new Uint8Array(w * w);
    for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) m[y * w + x] = x === 2 && y === 2 ? 0 : 1;
    const loops = traceContours(m, w, w);
    expect(loops).toHaveLength(2);
  });

  it('rejects an empty image', () => {
    const img = { width: 10, height: 10, data: new Uint8ClampedArray(400).fill(255) };
    expect(() => silhouetteToMesh(img, { length: 1, depth: 0.1 })).toThrow(/objeto/);
  });
});
