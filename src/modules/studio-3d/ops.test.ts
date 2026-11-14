import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { findAssetRefs } from '@/core/projects/projectPackage';
import { objectGeometry } from './geometry';
import * as P from './mesh/polyMesh';
import { createEmptyScene, createLight, createMaterial, createModel, createPrimitive, normalizeScene } from './model';
import * as ops from './ops';

const scene = () => {
  const doc = createEmptyScene();
  doc.objects = [];
  return doc;
};
const near = (a: number[], b: number[]) => a.every((x, i) => Math.abs(x - b[i]) < 1e-6);

describe('3D scene ops', () => {
  it('creates resting primitives with editable geometry', () => {
    const cube = createPrimitive('box');
    expect(cube.position[1]).toBeCloseTo(0.5);
    const g = objectGeometry(cube)!;
    expect(g.getAttribute('position').count).toBe(36);
    expect((g.userData.triToFace as Int32Array).length).toBe(12);
    expect(objectGeometry(cube)).toBe(g); // memoised
  });

  it('groups and ungroups preserving world transforms', () => {
    let d = scene();
    const a = createPrimitive('box');
    a.position = [2, 0.5, 0];
    const b = createPrimitive('sphere');
    b.position = [-2, 1, 0];
    d = ops.addObjects(d, [a, b]);
    const before = [ops.worldMatrix(d, a.id).elements, ops.worldMatrix(d, b.id).elements];
    const g = ops.groupObjects(d, [a.id, b.id]);
    d = g.doc;
    expect(ops.getObj(d, a.id)!.parentId).toBe(g.groupId);
    expect(near(ops.worldMatrix(d, a.id).elements, before[0])).toBe(true);
    // Moving the group moves the children.
    d = ops.updateObjects(d, [g.groupId!], () => ({ position: [0, 5, 0], rotation: [0, Math.PI / 2, 0] }));
    const moved = new THREE.Vector3().setFromMatrixPosition(ops.worldMatrix(d, a.id));
    expect(moved.y).toBeCloseTo(4.75); // group created at the centroid (y = 0.75): child local y = -0.25
    const u = ops.ungroup(d, g.groupId!);
    expect(u.freed.sort()).toEqual([a.id, b.id].sort());
    expect(new THREE.Vector3().setFromMatrixPosition(ops.worldMatrix(u.doc, a.id)).y).toBeCloseTo(4.75);
    expect(u.doc.objects.some((o) => o.type === 'group')).toBe(false);
  });

  it('refuses parenting cycles', () => {
    let d = scene();
    const g1 = ops.groupObjects(ops.addObjects(d, [createPrimitive('box'), createPrimitive('box')]), []).doc;
    d = ops.addObjects(g1, [createPrimitive('box')]);
    const [x, y] = d.objects;
    d = ops.reparent(d, y.id, x.id);
    expect(ops.reparent(d, x.id, y.id)).toBe(d);
  });

  it('duplicates, deletes with descendants, aligns and drops to the ground', () => {
    let d = scene();
    const a = createPrimitive('box');
    a.position = [0, 3, 0];
    d = ops.addObjects(d, [a]);
    const dup = ops.duplicateObjects(d, [a.id]);
    d = dup.doc;
    expect(d.objects).toHaveLength(2);
    d = ops.alignObjects(d, [a.id], 1, 'ground');
    expect(ops.getObj(d, a.id)!.position[1]).toBeCloseTo(0.5);
    d = ops.alignObjects(d, [a.id, dup.newIds[0]], 0, 'origin');
    expect(d.objects.every((o) => o.position[0] === 0)).toBe(true);
    const g = ops.groupObjects(d, [a.id, dup.newIds[0]]);
    expect(ops.deleteObjects(g.doc, [g.groupId!]).objects).toHaveLength(0);
  });

  it('converts, applies transforms, joins and separates meshes', () => {
    let d = scene();
    const a = createPrimitive('box');
    a.scale = [2, 1, 1];
    a.rotation = [0, Math.PI / 4, 0];
    const b = createPrimitive('box');
    b.position = [3, 0.5, 0];
    d = ops.addObjects(d, [a, b]);
    d = ops.applyTransform(d, a.id);
    const mesh = (ops.getObj(d, a.id)!.geometry as { mesh: P.PolyMesh }).mesh;
    expect(P.volume(mesh)).toBeCloseTo(2);
    expect(ops.getObj(d, a.id)!.scale).toEqual([1, 1, 1]);
    const j = ops.joinMeshes(d, [a.id, b.id]);
    expect(j.doc.objects).toHaveLength(1);
    const joined = (j.doc.objects[0].geometry as { mesh: P.PolyMesh }).mesh;
    expect(P.stats(joined).faces).toBe(12);
    expect(P.volume(joined)).toBeCloseTo(3);
    const s = ops.separateFaces(j.doc, j.id!, [6, 7, 8, 9, 10, 11]);
    expect(s.doc.objects).toHaveLength(2);
    expect(P.stats((ops.getObj(s.doc, s.newId!)!.geometry as { mesh: P.PolyMesh }).mesh).faces).toBe(6);
  });

  it('mirrors with negative scale and manages materials', () => {
    let d = scene();
    const a = createPrimitive('box');
    d = ops.addObjects(d, [a]);
    d = ops.mirrorObjects(d, [a.id], 0);
    expect(ops.getObj(d, a.id)!.scale[0]).toBe(-1);
    const r = ops.addMaterial(d);
    d = ops.updateObjects(r.doc, [a.id], () => ({ materialId: r.id }));
    d = ops.updateMaterial(d, r.id, { roughness: 0.1, maps: { map: 'asset:img1' } });
    expect(d.materials.find((m) => m.id === r.id)!.roughness).toBe(0.1);
    d = ops.deleteMaterial(d, r.id);
    expect(ops.getObj(d, a.id)!.materialId).toBeUndefined();
  });

  it('exposes asset references for project packages', () => {
    const d = scene();
    const m = createMaterial();
    m.maps.map = 'asset:tex1';
    d.materials.push(m);
    d.objects.push(createModel('mdl1', 'Modelo'));
    d.environment.hdriAssetId = 'asset:hdr1';
    expect(ops.sceneAssetIds(d).sort()).toEqual(['hdr1', 'mdl1', 'tex1']);
    expect([...findAssetRefs(d)].sort()).toEqual(['hdr1', 'mdl1', 'tex1']);
  });

  it('normalizes corrupted scenes', () => {
    const d = normalizeScene({
      objects: [
        { id: 'a', type: 'mesh', geometry: { kind: 'mesh', mesh: { v: [0, 0, 0], f: [[0, 1, 2]] } } },
        { id: 'b', type: 'mesh', geometry: { kind: 'primitive', primitive: 'box', params: { width: 2 } }, parentId: 'missing', position: 'x' },
        { id: 'c', type: 'light', light: { kind: 'spot' } },
        { id: 'd', type: 'model', assetId: 'nope' },
        null,
      ],
      materials: [{ id: 'm', color: 'red', roughness: 9 }],
    });
    expect(d.objects.map((o) => o.id)).toEqual(['b', 'c']);
    expect(d.objects[0]).toMatchObject({ parentId: null, position: [0, 0, 0] });
    expect((d.objects[0].geometry as { params: Record<string, number> }).params).toMatchObject({ width: 2, height: 1 });
    expect(d.objects[1].light).toMatchObject({ kind: 'spot', intensity: 20 });
    expect(d.materials[0]).toMatchObject({ color: '#b9bfcc', roughness: 1 });
    expect(createLight('area').rotation[0]).toBeCloseTo(-Math.PI / 2);
  });
});
