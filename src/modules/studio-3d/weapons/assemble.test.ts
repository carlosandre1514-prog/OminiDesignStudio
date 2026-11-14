import { describe, expect, it } from 'vitest';
import { createEmptyScene } from '../model';
import * as ops from '../ops';
import { assembleWeapon } from './assemble';
import { WEAPONS, buildWeapon } from './catalog';
import { DEFAULT_FINISH, materialFor } from './textures';

const sword = WEAPONS.find((w) => w.id === 'longsword')!;
const rifle = WEAPONS.find((w) => w.id === 'assault-rifle')!;

describe('assembleWeapon', () => {
  it('adds a group of editable meshes with PBR materials resting on the ground', () => {
    const parts = buildWeapon(sword, {});
    const key = materialFor('blade', DEFAULT_FINISH).key;
    const { doc, groupId } = assembleWeapon(createEmptyScene(), sword, parts, DEFAULT_FINISH, { [key]: { map: 'a1', roughnessMap: 'a2', normalMap: 'a3' } });
    const kids = doc.objects.filter((o) => o.parentId === groupId);
    expect(kids).toHaveLength(parts.length);
    expect(kids.every((k) => k.geometry?.kind === 'mesh' && k.materialId)).toBe(true);
    const blade = doc.materials.find((m) => m.id === kids.find((k) => k.name === 'Lâmina')!.materialId)!;
    expect(blade.maps).toEqual({ map: 'asset:a1', roughnessMap: 'asset:a2', normalMap: 'asset:a3' });
    expect(blade.metalness).toBe(1);
    expect(ops.worldBox(doc, groupId).min.y).toBeCloseTo(0, 5);
    expect(ops.sceneAssetIds(doc).sort()).toEqual(['a1', 'a2', 'a3']);
  });

  it('reuses identical materials and places a second weapon beside the first', () => {
    let doc = createEmptyScene();
    const r1 = assembleWeapon(doc, rifle, buildWeapon(rifle, {}), DEFAULT_FINISH, {});
    doc = r1.doc;
    const before = doc.materials.length;
    const r2 = assembleWeapon(doc, rifle, buildWeapon(rifle, {}), DEFAULT_FINISH, {});
    expect(r2.doc.materials.length).toBe(before);
    const a = ops.worldBox(r2.doc, r1.groupId);
    const b = ops.worldBox(r2.doc, r2.groupId);
    expect(a.intersectsBox(b)).toBe(false);
  });
});
