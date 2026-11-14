import { describe, expect, it } from 'vitest';
import { blobToArrayBuffer } from '@/core/utils/binary';
import { createEmptyScene, createGroup, createLight, createPrimitive } from './model';
import { buildExportScene, exportScene } from './exporters';
import { parseModel } from './loaders';
import * as ops from './ops';

const text = async (b: Blob) => new TextDecoder().decode(await blobToArrayBuffer(b));

describe('3D export', () => {
  it('builds the hierarchy with transforms and filters by selection', async () => {
    let d = createEmptyScene();
    const g = createGroup('Mesa');
    g.position = [1, 0, 0];
    const top = createPrimitive('box');
    top.parentId = g.id;
    top.position = [0, 1, 0];
    d = ops.addObjects(d, [g, top]);
    const { scene } = await buildExportScene(d, { only: [g.id] });
    const names: string[] = [];
    scene.traverse((o) => names.push(o.name));
    expect(names).toContain('Mesa');
    expect(names).not.toContain('Chão');
    const mesh = scene.getObjectByName('Cubo')!;
    mesh.updateWorldMatrix(true, false);
    expect(mesh.getWorldPosition(mesh.position.clone()).toArray()).toEqual([1, 1, 0]);
  });

  it('exports OBJ and STL that load back with the same geometry', async () => {
    const d = createEmptyScene();
    d.objects = [createPrimitive('box')];
    const obj = await exportScene(d, 'obj', 'cena');
    expect(obj.fileName).toBe('cena.obj');
    const objText = await text(obj.blob);
    expect(objText.match(/^v /gm)?.length).toBe(36);
    const back = await parseModel(new TextEncoder().encode(objText).buffer as ArrayBuffer, 'obj', async () => null);
    let tris = 0;
    back.object.traverse((o) => {
      const m = o as unknown as { isMesh?: boolean; geometry?: { getAttribute(n: string): { count: number } } };
      if (m.isMesh) tris += m.geometry!.getAttribute('position').count / 3;
    });
    expect(tris).toBe(12);
    const stl = await exportScene(d, 'stl', 'cena');
    const view = new DataView(await blobToArrayBuffer(stl.blob));
    expect(view.getUint32(80, true)).toBe(12); // triangle count
    expect(view.byteLength).toBe(84 + 12 * 50);
  });

  it('exports glTF JSON with nodes, meshes, materials and lights', async () => {
    const d = createEmptyScene();
    d.objects.push(createLight('point'));
    const r = await exportScene(d, 'gltf', 'cena', { includeLights: true });
    const json = JSON.parse(await text(r.blob));
    expect(json.asset.version).toBe('2.0');
    expect(json.meshes.length).toBeGreaterThanOrEqual(2);
    expect(json.materials.map((m: { name: string }) => m.name)).toContain('Material padrão');
    expect(json.extensionsUsed).toContain('KHR_lights_punctual');
  });

  it('refuses to export an empty selection', async () => {
    const d = createEmptyScene();
    d.objects = [createLight('directional')];
    await expect(exportScene(d, 'stl', 'x')).rejects.toThrow(/Nada para exportar/);
  });
});
