import { describe, expect, it } from 'vitest';
import { blur, evaluate, patternField } from './compose';
import { GENERATORS, defaultGenParams } from './generators';
import { fbm, worley } from './noise';
import { PRESETS, docFromPreset } from './presets';
import { createLayer, createTextureDoc, normalizeTextureDoc, pattern } from './types';

const SIZE = 64;

/** Average absolute difference between the first and last column/row (seam check). */
function seam(field: Float32Array, size: number) {
  let s = 0;
  for (let i = 0; i < size; i++) {
    s += Math.abs(field[i * size] - field[i * size + size - 1]);
    s += Math.abs(field[i] - field[(size - 1) * size + i]);
  }
  return s / (2 * size);
}
/** Average neighbour difference inside the field, as a reference for "smooth". */
function inner(field: Float32Array, size: number) {
  let s = 0;
  for (let i = 0; i < size; i++) s += Math.abs(field[i * size + 10] - field[i * size + 11]);
  return s / size;
}

describe('noise', () => {
  it('fbm is periodic', () => {
    for (const [u, v] of [[0.1, 0.2], [0.7, 0.45]]) expect(fbm(u, v, 4, 5, 0.5, 3)).toBeCloseTo(fbm(u + 1, v + 1, 4, 5, 0.5, 3), 6);
  });
  it('worley is periodic', () => {
    expect(worley(0.001, 0.5, 8, 2).f1).toBeCloseTo(worley(1.001, 0.5, 8, 2).f1, 6);
  });
});

describe('generators', () => {
  for (const g of GENERATORS)
    it(`${g.label}: values in [0,1], not constant, seamless`, () => {
      const f = patternField(pattern(g.id, defaultGenParams(g.id)), SIZE);
      let lo = 1;
      let hi = 0;
      for (const v of f) {
        expect(Number.isFinite(v)).toBe(true);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      expect(lo).toBeGreaterThanOrEqual(0);
      expect(hi).toBeLessThanOrEqual(1);
      if (g.id !== 'gradient') expect(hi - lo).toBeGreaterThan(0.1);
      // Tiling: the wrap-around step is no rougher than typical steps inside (with slack for sharp patterns).
      // (checker has a square boundary exactly on the wrap line, which is correct tiling)
      if (g.id !== 'gradient' && g.id !== 'checker') expect(seam(f, SIZE)).toBeLessThan(Math.max(0.2, inner(f, SIZE) * 4 + 0.08));
    });
});

describe('compose', () => {
  it('a single metal layer gives uniform maps and a flat normal', () => {
    const doc = createTextureDoc('t', [createLayer('Base', { heightMode: 'normal', content: { colors: ['#ff0000'], roughA: 0.25, roughB: 0.25, metalA: 1, metalB: 1 } })]);
    const m = evaluate(doc, 16);
    expect([m.baseColor[0], m.baseColor[1], m.baseColor[2]]).toEqual([255, 0, 0]);
    expect(Math.abs(m.roughness[0] - 0.25 * 255)).toBeLessThanOrEqual(1);
    expect(m.metallic[100]).toBe(255);
    expect(m.normal[2]).toBe(255);
    expect(m.orm[1]).toBe(m.roughness[0]);
  });

  it('masks limit where a layer paints and blend modes combine colours', () => {
    const doc = createTextureDoc('t', [
      createLayer('Base', { heightMode: 'normal', content: { colors: ['#808080'] } }),
      createLayer('Listras', { channels: { height: false }, content: { colors: ['#ffffff'] }, mask: { kind: 'pattern', pattern: pattern('stripes', { count: 2, width: 0.5, dir: 'v', soft: 0 }) } }),
    ]);
    const m = evaluate(doc, 32);
    const row = Array.from({ length: 32 }, (_, x) => m.baseColor[x * 4]);
    expect(Math.max(...row)).toBe(255);
    expect(Math.min(...row)).toBeLessThan(140);
    doc.layers[1].blend = 'multiply';
    doc.layers[1].content.colors = ['#000000'];
    const m2 = evaluate(doc, 32);
    expect(Math.min(...Array.from({ length: 32 }, (_, x) => m2.baseColor[x * 4]))).toBe(0);
  });

  it('height creates normal-map relief and AO in cavities', () => {
    const doc = createTextureDoc('t', [createLayer('Placas', { heightMode: 'normal', content: { pattern: pattern('plates', { cols: 2, rows: 2 }), heightAmount: 0.3 } })]);
    const m = evaluate(doc, 64);
    let tilted = 0;
    let dark = 0;
    for (let i = 0; i < 64 * 64; i++) {
      if (Math.abs(m.normal[i * 4] - 128) > 20) tilted++;
      if (m.ao[i * 4] < 200) dark++;
    }
    expect(tilted).toBeGreaterThan(50);
    expect(dark).toBeGreaterThan(20);
  });

  it('curvature mask finds the edges of the relief', () => {
    const doc = createTextureDoc('t', [
      createLayer('Pontos', { heightMode: 'normal', content: { colors: ['#000000'], pattern: pattern('dots', { count: 4, radius: 0.3, soft: 0 }), heightAmount: 0.4 } }),
      createLayer('Bordas', { channels: { height: false }, content: { colors: ['#ffffff'] }, mask: { kind: 'curvature', side: 'convex', amount: 0.8 } }),
    ]);
    const m = evaluate(doc, 64);
    let white = 0;
    for (let i = 0; i < 64 * 64; i++) if (m.baseColor[i * 4] > 200) white++;
    expect(white).toBeGreaterThan(30);
    expect(white).toBeLessThan(64 * 64 * 0.5);
  });

  it('bitmap masks (painting / text) are sampled', () => {
    const layer = createLayer('Pintura', { channels: { height: false }, content: { colors: ['#00ff00'] }, mask: { kind: 'paint' } });
    const doc = createTextureDoc('t', [createLayer('Base', { heightMode: 'normal', content: { colors: ['#000000'] } }), layer]);
    const data = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < 32; i++) data.set([255, 255, 255, 255], i * 4); // top half painted
    const m = evaluate(doc, 8, { [`mask:${layer.id}`]: { width: 8, height: 8, data } });
    expect(m.baseColor[1]).toBeGreaterThan(200); // top-left green
    expect(m.baseColor[(7 * 8) * 4 + 1]).toBeLessThan(60); // bottom-left black
  });

  it('every smart material evaluates', () => {
    for (const p of PRESETS) {
      const m = evaluate(docFromPreset(p.id), 32);
      expect(m.baseColor.length, p.name).toBe(32 * 32 * 4);
    }
  });

  it('blur keeps the mean and normalize repairs partial docs', () => {
    const f = new Float32Array(64).map((_, i) => (i % 2 ? 1 : 0));
    const b = blur(f, 8, 1);
    expect(b.reduce((s, v) => s + v, 0) / 64).toBeCloseTo(0.5, 5);
    const d = normalizeTextureDoc({ name: 'x', layers: [{ name: 'só nome' }] });
    expect(d.layers[0].content.colors.length).toBeGreaterThan(0);
    expect(d.resolution).toBe(1024);
  });
});
