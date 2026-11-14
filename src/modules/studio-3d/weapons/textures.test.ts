import { describe, expect, it } from 'vitest';
import type { Slot } from './catalog';
import { DEFAULT_FINISH, FINISH_LABELS, materialFor, synthesize, type Finish } from './textures';

const SLOTS: Slot[] = ['blade', 'metal', 'dark', 'trim', 'wood', 'grip', 'polymer', 'string', 'fletch', 'glow', 'crystal'];

describe('procedural weapon textures', () => {
  it('produces a material for every slot and finish', () => {
    for (const steel of Object.keys(FINISH_LABELS.steel.options) as Finish['steel'][])
      for (const slot of SLOTS) {
        const m = materialFor(slot, { ...DEFAULT_FINISH, steel });
        expect(m.key).toBeTruthy();
        expect(m.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    expect(materialFor('glow', DEFAULT_FINISH).emissiveIntensity).toBeGreaterThan(1);
  });

  it('synthesises coherent, tileable maps', () => {
    const p = materialFor('wood', DEFAULT_FINISH).pattern!;
    const t = synthesize(p, 64);
    expect(t.color.length).toBe(64 * 64 * 4);
    // Not a flat colour: there is visible variation.
    const lum = Array.from({ length: 64 * 64 }, (_, i) => t.color[i * 4]);
    expect(Math.max(...lum) - Math.min(...lum)).toBeGreaterThan(20);
    // Normal map is a valid unit-ish vector pointing outward (blue dominant).
    for (let i = 0; i < 64 * 64; i += 97) expect(t.normal[i * 4 + 2]).toBeGreaterThan(127);
    // Tileable: the first and last columns are similar (no hard seam).
    let seam = 0;
    for (let y = 0; y < 64; y++) seam += Math.abs(t.color[(y * 64) * 4] - t.color[(y * 64 + 63) * 4]);
    expect(seam / 64).toBeLessThan(25);
  });

  it('is deterministic and wear adds scratches', () => {
    const p = materialFor('blade', DEFAULT_FINISH).pattern!;
    expect(synthesize(p, 32).color).toEqual(synthesize(p, 32).color);
    const clean = synthesize({ ...p, wear: 0 }, 64);
    const worn = synthesize({ ...p, wear: 1 }, 64);
    expect(Array.from(worn.color).join()).not.toBe(Array.from(clean.color).join());
  });
});
