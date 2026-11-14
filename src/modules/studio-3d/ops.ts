import * as THREE from 'three';
import { parseAssetUri } from '@/core/assets/types';
import { createId } from '@/core/utils/id';
import { finalMesh, objectGeometry, sourceMesh } from './geometry';
import * as P from './mesh/polyMesh';
import { createGroup, createMaterial, defaultModifiers, type Material3D, type Obj3D, type Scene3DDoc } from './model';

export const getObj = (doc: Scene3DDoc, id: string) => doc.objects.find((o) => o.id === id);
export const childrenOf = (doc: Scene3DDoc, id: string | null) => doc.objects.filter((o) => o.parentId === id);

export function descendants(doc: Scene3DDoc, id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const o of doc.objects)
      if (o.parentId === pid) {
        out.push(o.id);
        walk(o.id);
      }
  };
  walk(id);
  return out;
}

export function localMatrix(o: Pick<Obj3D, 'position' | 'rotation' | 'scale'>): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(...o.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotation)), new THREE.Vector3(...o.scale));
}

export function worldMatrix(doc: Scene3DDoc, id: string): THREE.Matrix4 {
  const o = getObj(doc, id);
  if (!o) return new THREE.Matrix4();
  const m = localMatrix(o);
  return o.parentId ? worldMatrix(doc, o.parentId).multiply(m) : m;
}

function setFromMatrix(o: Obj3D, m: THREE.Matrix4): Obj3D {
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  m.decompose(p, q, s);
  const e = new THREE.Euler().setFromQuaternion(q);
  return { ...o, position: [p.x, p.y, p.z], rotation: [e.x, e.y, e.z], scale: [s.x, s.y, s.z] };
}

export function addObjects(doc: Scene3DDoc, objs: Obj3D[]): Scene3DDoc {
  return { ...doc, objects: [...doc.objects, ...objs] };
}

export function updateObjects(doc: Scene3DDoc, ids: string[], fn: (o: Obj3D) => Partial<Obj3D>): Scene3DDoc {
  const set = new Set(ids);
  return { ...doc, objects: doc.objects.map((o) => (set.has(o.id) ? { ...o, ...fn(o) } : o)) };
}

export function deleteObjects(doc: Scene3DDoc, ids: string[]): Scene3DDoc {
  const all = new Set(ids.flatMap((id) => [id, ...descendants(doc, id)]));
  return { ...doc, objects: doc.objects.filter((o) => !all.has(o.id)) };
}

/** Deep copy (with descendants), offset slightly so the copy is visible. */
export function duplicateObjects(doc: Scene3DDoc, ids: string[]): { doc: Scene3DDoc; newIds: string[] } {
  const roots = ids.filter((id) => !ids.some((other) => other !== id && descendants(doc, other).includes(id)));
  const copies: Obj3D[] = [];
  const newIds: string[] = [];
  for (const rid of roots) {
    const map = new Map<string, string>();
    const group = [rid, ...descendants(doc, rid)];
    for (const id of group) map.set(id, createId('obj'));
    for (const id of group) {
      const o = getObj(doc, id)!;
      const c: Obj3D = { ...structuredClone(o), id: map.get(id)!, parentId: o.parentId && map.has(o.parentId) ? map.get(o.parentId)! : o.parentId };
      if (id === rid) {
        c.name = `${o.name} (cópia)`;
        c.position = [o.position[0] + 0.5, o.position[1], o.position[2] + 0.5];
        newIds.push(c.id);
      }
      copies.push(c);
    }
  }
  return { doc: addObjects(doc, copies), newIds };
}

/** Change parent keeping the world transform. Refuses cycles. */
export function reparent(doc: Scene3DDoc, id: string, parentId: string | null): Scene3DDoc {
  if (id === parentId || (parentId && descendants(doc, id).includes(parentId))) return doc;
  const world = worldMatrix(doc, id);
  const parentInv = parentId ? worldMatrix(doc, parentId).invert() : new THREE.Matrix4();
  const local = parentInv.multiply(world);
  return { ...doc, objects: doc.objects.map((o) => (o.id === id ? { ...setFromMatrix(o, local), parentId } : o)) };
}

export function groupObjects(doc: Scene3DDoc, ids: string[]): { doc: Scene3DDoc; groupId?: string } {
  const objs = ids.map((id) => getObj(doc, id)).filter((o): o is Obj3D => !!o);
  if (!objs.length) return { doc };
  const parentId = objs[0].parentId;
  if (!objs.every((o) => o.parentId === parentId)) return { doc };
  const g = createGroup();
  g.parentId = parentId;
  const c = objs.reduce((s, o) => s.add(new THREE.Vector3(...o.position)), new THREE.Vector3()).divideScalar(objs.length);
  g.position = [c.x, c.y, c.z];
  let d = addObjects(doc, [g]);
  for (const o of objs) d = reparent(d, o.id, g.id);
  return { doc: d, groupId: g.id };
}

export function ungroup(doc: Scene3DDoc, groupId: string): { doc: Scene3DDoc; freed: string[] } {
  const g = getObj(doc, groupId);
  if (!g || g.type !== 'group') return { doc, freed: [] };
  let d = doc;
  const kids = childrenOf(doc, groupId).map((k) => k.id);
  for (const k of kids) d = reparent(d, k, g.parentId);
  return { doc: { ...d, objects: d.objects.filter((o) => o.id !== groupId) }, freed: kids };
}

/** World-space bounding box of an object (and its descendants). */
export function worldBox(doc: Scene3DDoc, id: string): THREE.Box3 {
  const box = new THREE.Box3();
  for (const oid of [id, ...descendants(doc, id)]) {
    const o = getObj(doc, oid)!;
    const g = objectGeometry(o);
    if (g?.boundingBox) box.union(g.boundingBox.clone().applyMatrix4(worldMatrix(doc, oid)));
    else box.expandByPoint(new THREE.Vector3().setFromMatrixPosition(worldMatrix(doc, oid)));
  }
  return box;
}

export type AlignMode = 'origin' | 'center' | 'min' | 'max' | 'ground';

/** Align objects on an axis: to the world origin, to their common centre/min/max, or drop onto the ground (y = 0). */
export function alignObjects(doc: Scene3DDoc, ids: string[], axis: 0 | 1 | 2, mode: AlignMode): Scene3DDoc {
  const boxes = new Map(ids.map((id) => [id, worldBox(doc, id)]));
  const all = new THREE.Box3();
  boxes.forEach((b) => all.union(b));
  const key = (['x', 'y', 'z'] as const)[axis];
  return updateObjects(doc, ids, (o) => {
    const b = boxes.get(o.id)!;
    let delta = 0;
    if (mode === 'origin') delta = -o.position[axis];
    if (mode === 'center') delta = (all.min[key] + all.max[key]) / 2 - (b.min[key] + b.max[key]) / 2;
    if (mode === 'min') delta = all.min[key] - b.min[key];
    if (mode === 'max') delta = all.max[key] - b.max[key];
    if (mode === 'ground') delta = -b.min.y;
    const pos = [...o.position] as P.Vec3;
    pos[mode === 'ground' ? 1 : axis] += delta;
    return { position: pos };
  });
}

/** Mirror objects across an axis (negative scale; renderers flip face culling automatically). */
export function mirrorObjects(doc: Scene3DDoc, ids: string[], axis: 0 | 1 | 2): Scene3DDoc {
  return updateObjects(doc, ids, (o) => {
    const s = [...o.scale] as P.Vec3;
    s[axis] = -s[axis];
    return { scale: s };
  });
}

/** Turn a primitive (and, optionally, its modifiers) into an editable polygon mesh. */
export function convertToMesh(doc: Scene3DDoc, id: string, bakeModifiers = false): Scene3DDoc {
  return updateObjects(doc, [id], (o) => {
    if (!o.geometry) return {};
    const mesh = bakeModifiers ? finalMesh(o)! : sourceMesh(o.geometry);
    return { geometry: { kind: 'mesh', mesh }, ...(bakeModifiers ? { modifiers: defaultModifiers() } : {}) };
  });
}

/** Bake rotation and scale into the mesh vertices (position kept). */
export function applyTransform(doc: Scene3DDoc, id: string): Scene3DDoc {
  return updateObjects(doc, [id], (o) => {
    if (!o.geometry) return {};
    const m = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotation)), new THREE.Vector3(...o.scale));
    const src = sourceMesh(o.geometry);
    const v = new THREE.Vector3();
    const det = m.determinant();
    let mesh = P.transformVertices(src, Array.from({ length: P.vcount(src) }, (_, i) => i), (p) => v.set(...p).applyMatrix4(m).toArray() as P.Vec3);
    if (det < 0) mesh = P.flipFaces(mesh);
    return { geometry: { kind: 'mesh', mesh }, rotation: [0, 0, 0], scale: [1, 1, 1] };
  });
}

/** Join several mesh objects into one editable mesh (world transforms baked, relative to the first). */
export function joinMeshes(doc: Scene3DDoc, ids: string[]): { doc: Scene3DDoc; id?: string } {
  const meshes = ids.map((id) => getObj(doc, id)).filter((o): o is Obj3D => !!o && o.type === 'mesh' && !!o.geometry);
  if (meshes.length < 2) return { doc };
  const target = meshes[0];
  const inv = worldMatrix(doc, target.id).invert();
  const v: number[] = [];
  const f: number[][] = [];
  const tmp = new THREE.Vector3();
  for (const o of meshes) {
    const m = finalMesh(o)!;
    const toTarget = inv.clone().multiply(worldMatrix(doc, o.id));
    const flip = toTarget.determinant() < 0;
    const base = v.length / 3;
    for (let i = 0; i < P.vcount(m); i++) v.push(...tmp.set(...P.vget(m, i)).applyMatrix4(toTarget).toArray());
    for (const face of m.f) f.push((flip ? [...face].reverse() : face).map((i) => i + base));
  }
  const joined: Obj3D = { ...target, geometry: { kind: 'mesh', mesh: { v, f } }, modifiers: defaultModifiers() };
  const rest = new Set(meshes.slice(1).map((o) => o.id));
  return { doc: { ...doc, objects: doc.objects.filter((o) => !rest.has(o.id)).map((o) => (o.id === target.id ? joined : o)) }, id: target.id };
}

/** Move the selected faces of an editable mesh into a new object ("Separar"). */
export function separateFaces(doc: Scene3DDoc, id: string, faceIds: number[]): { doc: Scene3DDoc; newId?: string } {
  const o = getObj(doc, id);
  if (!o || o.geometry?.kind !== 'mesh' || !faceIds.length) return { doc };
  const mesh = o.geometry.mesh;
  const sel = new Set(faceIds);
  if (sel.size >= mesh.f.length) return { doc };
  const part = P.compact({ v: mesh.v, f: mesh.f.filter((_, i) => sel.has(i)) });
  const rest = P.deleteFaces(mesh, faceIds);
  const copy: Obj3D = { ...structuredClone(o), id: createId('obj'), name: `${o.name} (separado)`, geometry: { kind: 'mesh', mesh: part } };
  const d = updateObjects(doc, [id], () => ({ geometry: { kind: 'mesh', mesh: rest } }));
  return { doc: addObjects(d, [copy]), newId: copy.id };
}

// ---------------------------------------------------------------- materials

export function addMaterial(doc: Scene3DDoc, m: Material3D = createMaterial(`Material ${doc.materials.length + 1}`)): { doc: Scene3DDoc; id: string } {
  return { doc: { ...doc, materials: [...doc.materials, m] }, id: m.id };
}

export function updateMaterial(doc: Scene3DDoc, id: string, patch: Partial<Material3D>): Scene3DDoc {
  return { ...doc, materials: doc.materials.map((m) => (m.id === id ? { ...m, ...patch, maps: patch.maps ? { ...m.maps, ...patch.maps } : m.maps } : m)) };
}

export function deleteMaterial(doc: Scene3DDoc, id: string): Scene3DDoc {
  return {
    ...doc,
    materials: doc.materials.filter((m) => m.id !== id),
    objects: doc.objects.map((o) => (o.materialId === id ? { ...o, materialId: undefined } : o)),
  };
}

export function duplicateMaterial(doc: Scene3DDoc, id: string): { doc: Scene3DDoc; id?: string } {
  const m = doc.materials.find((x) => x.id === id);
  if (!m) return { doc };
  return addMaterial(doc, { ...structuredClone(m), id: createId('mat'), name: `${m.name} (cópia)` });
}

/** Asset ids referenced by the scene (models, texture maps, HDRI). */
export function sceneAssetIds(doc: Scene3DDoc): string[] {
  const ids = new Set<string>();
  const add = (ref: string | undefined) => {
    const id = parseAssetUri(ref);
    if (id) ids.add(id);
  };
  for (const o of doc.objects) add(o.assetId);
  for (const m of doc.materials) for (const v of Object.values(m.maps)) add(v);
  add(doc.environment.hdriAssetId);
  return [...ids];
}
