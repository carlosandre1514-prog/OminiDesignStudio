import { describe, expect, it } from 'vitest';
import { toBufferGeometry } from '@/modules/studio-3d/geometry';
import * as PM from '@/modules/studio-3d/mesh/polyMesh';
import { buildAtlas } from '@/modules/studio-3d/mesh/uvAtlas';
import { dilateMaps, evaluate } from './compose';
import { godotMaterialTres } from './godot';
import { bakeMesh } from './meshBake';
import { DEFAULT_BRUSH, Painter3D } from './paint3d';
import { PRESETS } from './presets';
import { createLayer, createTextureDoc } from './types';

/** Triangle soup (positions per corner) of a polygon mesh. */
function soup(m: PM.PolyMesh): Float32Array {
  const out: number[] = [];
  for (const f of m.f) for (let k = 1; k < f.length - 1; k++) for (const vi of [f[0], f[k], f[k + 1]]) out.push(m.v[vi * 3], m.v[vi * 3 + 1], m.v[vi * 3 + 2]);
  return new Float32Array(out);
}

/** Rasterise UV triangles into an id buffer; returns how many texels were claimed twice. */
function overlaps(uv: Float32Array, size: number): number {
  const owner = new Int32Array(size * size).fill(-1);
  let twice = 0;
  for (let t = 0; t < uv.length / 6; t++) {
    const X = [0, 1, 2].map((k) => uv[t * 6 + k * 2] * size);
    const Y = [0, 1, 2].map((k) => uv[t * 6 + k * 2 + 1] * size);
    const area = (X[1] - X[0]) * (Y[2] - Y[0]) - (X[2] - X[0]) * (Y[1] - Y[0]);
    for (let y = Math.floor(Math.min(...Y)); y <= Math.ceil(Math.max(...Y)); y++)
      for (let x = Math.floor(Math.min(...X)); x <= Math.ceil(Math.max(...X)); x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((X[1] - px) * (Y[2] - py) - (X[2] - px) * (Y[1] - py)) / area;
        const w1 = ((X[2] - px) * (Y[0] - py) - (X[0] - px) * (Y[2] - py)) / area;
        if (w0 < 0.02 || w1 < 0.02 || 1 - w0 - w1 < 0.02) continue;
        const i = y * size + x;
        if (owner[i] >= 0 && owner[i] !== t) twice++;
        owner[i] = t;
      }
  }
  return twice;
}

describe('UV atlas', () => {
  it('lays out a box and a sphere without overlaps, inside the unit square', () => {
    for (const m of [PM.box(1, 2, 0.5), PM.sphere(1, 24, 16), PM.torus(1, 0.3, 24, 12)]) {
      const pos = soup(m);
      const a = buildAtlas(pos);
      expect(a.charts).toBeGreaterThanOrEqual(6);
      for (const x of a.uv) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
      }
      expect(overlaps(a.uv, 256)).toBe(0);
      expect(a.fill).toBeGreaterThan(0.25);
    }
  });

  it('keeps texel density uniform (no stretching between charts)', () => {
    const pos = soup(PM.box(1, 2, 0.5));
    const { uv } = buildAtlas(pos);
    // ratio UV area / 3D area must be the same for every triangle
    const ratios: number[] = [];
    for (let t = 0; t < pos.length / 9; t++) {
      const p = (k: number) => [pos[t * 9 + k * 3], pos[t * 9 + k * 3 + 1], pos[t * 9 + k * 3 + 2]];
      const [a, b, c] = [p(0), p(1), p(2)];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const area3 = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
      const q = (k: number) => [uv[t * 6 + k * 2], uv[t * 6 + k * 2 + 1]];
      const [A, B, C] = [q(0), q(1), q(2)];
      const area2 = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
      ratios.push(area2 / area3);
    }
    expect(Math.max(...ratios) / Math.min(...ratios)).toBeLessThan(1.001);
  });

  it('is used by the 3D studio for the "atlas" projection, and stored face UVs win', () => {
    const m = PM.box(1, 1, 1);
    const g = toBufferGeometry(m, { shading: 'flat', uv: 'atlas' });
    expect(overlaps(g.getAttribute('uv').array as Float32Array, 128)).toBe(0);
    const fuv = m.f.map((f) => f.flatMap(() => [0.25, 0.75]));
    const g2 = toBufferGeometry({ ...m, fuv }, { shading: 'flat', uv: 'atlas' });
    expect([...g2.getAttribute('uv').array].every((x, i) => (i % 2 ? x === 0.75 : x === 0.25))).toBe(true);
  });
});

describe('mesh bake + 3D brush', () => {
  const pos = soup(PM.subdivide(PM.box(1, 1, 1), false));
  const { uv } = buildAtlas(pos, { resolution: 128 });
  const bake = bakeMesh(pos, uv, 128);
  const at = (x: number, y: number, z: number) => {
    // texel whose 3D position is closest to (x, y, z)
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < bake.size ** 2; i++) {
      if (bake.cover[i] !== 1) continue;
      const d = Math.hypot(bake.pos[i * 3] - x, bake.pos[i * 3 + 1] - y, bake.pos[i * 3 + 2] - z);
      if (d < bd) [bd, best] = [d, i];
    }
    return best;
  };

  it('finds the sharp convex edges of the real geometry', () => {
    const edge = at(0.5, 0.5, 0); // on the edge between +X and +Y faces
    const middle = at(0.5, 0.25, 0.25); // inside a face
    expect(bake.curvature.data[edge * 4]).toBeGreaterThan(150);
    expect(bake.curvature.data[middle * 4]).toBe(0);
    expect(bake.curvature.data[edge * 4 + 1]).toBe(0); // no concave edges on a box
  });

  it('paints a dab around a 3D point, across UV seams, only on the facing side', () => {
    const painter = new Painter3D(bake);
    const data = new Uint8ClampedArray(bake.size * bake.size * 4);
    // dab on the corner edge: both faces get paint even though they are separate UV islands
    painter.dab(data, [0.5, 0.5, 0], [Math.SQRT1_2, Math.SQRT1_2, 0], { ...DEFAULT_BRUSH, size: 0.15, hardness: 1 }, 0);
    expect(data[at(0.5, 0.45, 0) * 4 + 3]).toBe(255); // +X face
    expect(data[at(0.45, 0.5, 0) * 4 + 3]).toBe(255); // +Y face
    expect(data[at(-0.5, 0.45, 0) * 4 + 3]).toBe(0); // far side untouched
    expect(painter.takeDirty()).not.toBeNull();
  });

  it('feeds geometry-aware edge wear and pads the charts in the texture', () => {
    const doc = createTextureDoc('t', [
      createLayer('Base', { content: { colors: ['#000000'] } }),
      createLayer('Bordas', { content: { colors: ['#ffffff'] }, mask: { kind: 'curvature', side: 'convex', amount: 0.6 } }),
    ]);
    const maps = evaluate(doc, 128, { 'mesh:curv': bake.curvature });
    const edge = at(0.5, 0.5, 0);
    const middle = at(0.5, 0.25, 0.25);
    expect(maps.baseColor[edge * 4]).toBeGreaterThan(200);
    expect(maps.baseColor[middle * 4]).toBeLessThan(40);
    // texels outside every chart copy their nearest chart texel
    const a = new Uint8ClampedArray([10, 10, 10, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    dilateMaps([a], new Uint8Array([1, 0, 0, 0]), 2);
    expect([...a]).toEqual([10, 10, 10, 255, 10, 10, 10, 255, 10, 10, 10, 255, 10, 10, 10, 255]);
  });
});

describe('materials and Godot export', () => {
  it('has skin and animal presets that evaluate', () => {
    const ids = ['skin-light', 'skin-dark', 'reptile', 'croc', 'fish-scales', 'tiger-fur', 'leopard-fur', 'wolf-fur', 'feathers', 'horn'];
    for (const id of ids) {
      const p = PRESETS.find((x) => x.id === id)!;
      expect(p, id).toBeTruthy();
      const maps = evaluate(createTextureDoc(p.name, p.build()), 32);
      expect(maps.baseColor.some((v) => v > 0)).toBe(true);
    }
    expect(PRESETS.find((x) => x.id === 'skin-light')!.surface).toBe('skin');
  });

  it('writes a Godot 4 StandardMaterial3D with every map', () => {
    const tres = godotMaterialTres({ name: 'Arma', folder: 'arma', files: { albedo: 'a.png', normal: 'n.png', roughness: 'r.png', metallic: 'm.png', ao: 'o.png' }, skin: true });
    expect(tres).toMatch(/^\[gd_resource type="StandardMaterial3D" load_steps=6 format=3\]/);
    expect(tres).toContain('[ext_resource type="Texture2D" path="res://arma/a.png" id="albedo_tex"]');
    expect(tres).toContain('albedo_texture = ExtResource("albedo_tex")');
    expect(tres).toContain('normal_enabled = true');
    expect(tres).toContain('roughness_texture = ExtResource("roughness_tex")');
    expect(tres).toContain('subsurf_scatter_enabled = true');
  });
});
