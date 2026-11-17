import { describe, expect, it } from 'vitest';
import { buildWeapon, defaultParams, WEAPONS } from '@/modules/studio-3d/weapons/catalog';
import { finishFromColor, fitReference, modelSilhouette, similarity, toSilhouette } from './reference';

const HD = WEAPONS.filter((w) => w.hd);
const ar = WEAPONS.find((w) => w.id === 'ar15-hd')!;

describe('reference image → weapon fit', () => {
  it('silhouettes: identical = 1, different weapons score lower', () => {
    const a = modelSilhouette(buildWeapon(ar, defaultParams(ar), 1));
    expect(similarity(a, a)).toBeCloseTo(1, 5);
    const ak = WEAPONS.find((w) => w.id === 'sniper-hd')!;
    expect(similarity(a, modelSilhouette(buildWeapon(ak, defaultParams(ak), 1)))).toBeLessThan(0.85);
  });

  it('recovers type and configuration from a silhouette', async () => {
    const target = { ...defaultParams(ar), optic: 'holo', stock: 'm4', barrel: 0.5, handguard: 'mlok' };
    const ref = modelSilhouette(buildWeapon(ar, target, 1));
    const r = await fitReference(ref, HD, {});
    expect(r.weapon.id).toBe('ar15-hd');
    expect(r.score).toBeGreaterThan(0.9);
    expect(r.params.optic).toBe('holo');
    expect(r.params.stock).toBe('m4');
    expect(Math.abs(Number(r.params.barrel) - 0.5)).toBeLessThan(0.04);
  }, 60000);

  it('keeps what the prompt said', async () => {
    const ref = modelSilhouette(buildWeapon(ar, { ...defaultParams(ar), optic: 'holo' }, 1));
    const r = await fitReference(ref, HD, { weapon: ar, params: { ...defaultParams(ar), optic: 'luneta' }, locked: ['optic'] });
    expect(r.params.optic).toBe('luneta');
  }, 60000);

  it('resamples masks and reads coating colours', () => {
    const s = toSilhouette(new Uint8Array([1, 0, 0, 1]), 2, 2);
    expect(s.w).toBe(220);
    expect(finishFromColor([30, 30, 32]).polymer).toBe('preto');
    expect(finishFromColor([180, 150, 105]).coat).toBe('fde');
    expect(finishFromColor([80, 95, 55]).coat).toBe('oliva');
  });
});
