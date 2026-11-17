import * as THREE from 'three';
import { parseAssetUri } from '@/core/assets/types';
import { createProject, getDocument, listProjects } from '@/core/projects/projectService';
import { createLayer, createTextureDoc } from '@/modules/texture-studio/engine/types';
import { loadModelAsset } from './loaders';
import * as P from './mesh/polyMesh';
import type { Obj3D, Scene3DDoc } from './model';
import { descendants } from './ops';

/**
 * "Pintar em 3D": opens the texture studio on the chosen objects of this scene. Imported models
 * (GLB/OBJ…) are first turned into editable meshes so they can carry the painted atlas.
 */

/** Merge every mesh of an imported model into one polygon mesh (in the model's own space). */
export async function modelToPolyMesh(o: Obj3D): Promise<P.PolyMesh | null> {
  const id = parseAssetUri(o.assetId);
  if (!id) return null;
  const { object } = await loadModelAsset(id);
  object.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(object.matrixWorld).invert();
  const v: number[] = [];
  const f: number[][] = [];
  const p = new THREE.Vector3();
  object.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const g = m.geometry as THREE.BufferGeometry;
    const pos = g.getAttribute('position');
    if (!pos) return;
    const mat = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const base = v.length / 3;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mat);
      v.push(p.x, p.y, p.z);
    }
    const idx = g.getIndex();
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      const a = idx ? idx.getX(i) : i;
      const b = idx ? idx.getX(i + 1) : i + 1;
      const cc = idx ? idx.getX(i + 2) : i + 2;
      if (a !== b && b !== cc && a !== cc) f.push([base + a, base + b, base + cc]);
    }
  });
  if (!f.length) return null;
  return P.mergeByDistance({ v, f }, 1e-6);
}

/** Objects to paint: the selection (groups expanded) or every visible mesh except the ground plane. */
export function paintableIds(doc: Scene3DDoc, selection: string[]): string[] {
  const picked = selection.length > 0;
  const ids = picked ? [...new Set(selection.flatMap((id) => [id, ...descendants(doc, id)]))] : doc.objects.filter((o) => o.visible).map((o) => o.id);
  return ids.filter((id) => {
    const o = doc.objects.find((x) => x.id === id);
    if (!o) return false;
    // a floor plane would take most of the texture: only painted when explicitly selected
    if (!picked && o.geometry?.kind === 'primitive' && o.geometry.primitive === 'plane') return false;
    return (o.type === 'mesh' && !!o.geometry) || (o.type === 'model' && !!o.assetId);
  });
}

/** Replace imported models among `ids` by editable meshes (same transform). */
export async function convertModels(doc: Scene3DDoc, ids: string[]): Promise<Scene3DDoc> {
  let out = doc;
  for (const id of ids) {
    const o = out.objects.find((x) => x.id === id);
    if (!o || o.type !== 'model') continue;
    const mesh = await modelToPolyMesh(o);
    if (!mesh) continue;
    out = { ...out, objects: out.objects.map((x) => (x.id === id ? { ...x, type: 'mesh' as const, geometry: { kind: 'mesh' as const, mesh }, assetId: undefined, shading: 'auto' as const, uv: 'atlas' as const } : x)) };
  }
  return out;
}

/** Find the texture project already painting exactly these objects, or create one. */
export async function openPaintProject(projectId: string, projectName: string, objectIds: string[], objectName: string): Promise<string> {
  const key = [...objectIds].sort().join(',');
  for (const meta of await listProjects()) {
    if (!meta.tags.includes('pintura-3d')) continue;
    const d = await getDocument(meta.id);
    const t = (d?.modules['texture-studio'] as { target?: { projectId: string; objectIds: string[] } } | undefined)?.target;
    if (t && t.projectId === projectId && [...t.objectIds].sort().join(',') === key) return meta.id;
  }
  const name = `Pintura 3D — ${objectName}`;
  const doc = {
    ...createTextureDoc(name, [
      createLayer('Base', { heightMode: 'normal', content: { colors: ['#6f7378'], roughA: 0.55, roughB: 0.55, metalA: 0, metalB: 0 } }),
      createLayer('Pintura', { channels: { height: false, metal: false }, content: { colors: ['#c0392b'], roughA: 0.45, roughB: 0.45 }, mask: { kind: 'paint' } }),
    ]),
    previewShape: 'model' as const,
    previewTiling: 1,
    target: { projectId, objectIds, name: objectName },
  };
  const meta = await createProject({ name, description: `Textura pintada no modelo de "${projectName}"`, category: '3d', modules: { 'texture-studio': doc }, tags: ['textura', 'pintura-3d'] });
  return meta.id;
}
