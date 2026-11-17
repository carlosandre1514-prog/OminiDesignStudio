import * as THREE from 'three';
import { importAssetBytes } from '@/core/assets/assetService';
import { assetUri } from '@/core/assets/types';
import { getDocument, saveModuleData } from '@/core/projects/projectService';
import { finalMesh } from '@/modules/studio-3d/geometry';
import { buildAtlas } from '@/modules/studio-3d/mesh/uvAtlas';
import { createMaterial, normalizeScene, type Scene3DDoc } from '@/modules/studio-3d/model';
import { worldMatrix } from '@/modules/studio-3d/ops';
import type { TextureMaps } from './compose';
import { bakeMesh, type MeshBake } from './meshBake';
import { Painter3D } from './paint3d';
import type { PaintTarget } from './types';

/**
 * 3D painting target: the chosen objects of a 3D Studio project, merged in world space and laid out
 * in one UV atlas (or the atlas they already carry from an earlier "apply"), plus the mesh bake.
 */

export const BAKE_RES = 1024;
/** Module id of the 3D Studio documents (kept literal: don't pull the studio's store in here). */
const STUDIO3D = '3d-studio';

export interface LoadedTarget {
  geometry: THREE.BufferGeometry;
  bake: MeshBake;
  painter: Painter3D;
  /** Per object: face corner UVs from the atlas (to write back on apply). */
  faceUV: Map<string, number[][]>;
  objectIds: string[];
  triangles: number;
  charts: number;
  /** World size covered by the whole UV square (for real-world pattern scale). */
  worldPerUV: number;
}

/** Suggested pattern repeats across the atlas: ~30 cm per tile. */
export const suggestedModelScale = (t: LoadedTarget) => Math.max(1, Math.min(24, Math.round(t.worldPerUV / 0.3)));

const cache = new Map<string, Promise<LoadedTarget>>();
const keyOf = (t: PaintTarget) => `${t.projectId}|${t.objectIds.join(',')}`;

export async function readScene(projectId: string): Promise<Scene3DDoc> {
  const doc = await getDocument(projectId);
  if (!doc) throw new Error('Projeto 3D não encontrado');
  return normalizeScene(doc.modules[STUDIO3D]);
}

export function getTarget(t: PaintTarget): Promise<LoadedTarget> {
  const k = keyOf(t);
  let p = cache.get(k);
  if (!p) {
    p = loadTarget(t);
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return p;
}

export function forgetTarget(t: PaintTarget) {
  cache.delete(keyOf(t));
}

async function loadTarget(t: PaintTarget): Promise<LoadedTarget> {
  const scene = await readScene(t.projectId);
  const objs = t.objectIds.map((id) => scene.objects.find((o) => o.id === id)).filter((o) => o && o.type === 'mesh' && o.geometry) as Scene3DDoc['objects'];
  if (!objs.length) throw new Error('Nenhuma malha para pintar (os objetos foram apagados?)');

  // triangulate every object in world space, remembering where each corner came from
  const pos: number[] = [];
  const stored: number[] = [];
  let allStored = true;
  const corners: { obj: number; face: number; slot: number }[] = [];
  const meshes = objs.map((o) => finalMesh(o)!);
  objs.forEach((o, oi) => {
    const m = meshes[oi];
    const mat = worldMatrix(scene, o.id);
    const v = new THREE.Vector3();
    const fuv = o.uv === 'atlas' && m.fuv?.length === m.f.length ? m.fuv : null;
    if (!fuv) allStored = false;
    m.f.forEach((face, fi) => {
      for (let k = 1; k < face.length - 1; k++)
        [0, k, k + 1].forEach((slot) => {
          const vi = face[slot];
          v.set(m.v[vi * 3], m.v[vi * 3 + 1], m.v[vi * 3 + 2]).applyMatrix4(mat);
          pos.push(v.x, v.y, v.z);
          stored.push(fuv?.[fi][slot * 2] ?? 0, fuv?.[fi][slot * 2 + 1] ?? 0);
          corners.push({ obj: oi, face: fi, slot });
        });
    });
  });
  const P = new Float32Array(pos);
  let uv: Float32Array;
  let charts = 0;
  if (allStored) uv = new Float32Array(stored);
  else {
    const a = buildAtlas(P, { resolution: BAKE_RES });
    uv = a.uv;
    charts = a.charts;
  }

  const faceUV = new Map<string, number[][]>();
  objs.forEach((o, oi) => faceUV.set(o.id, meshes[oi].f.map((f) => new Array(f.length * 2).fill(0))));
  corners.forEach((c, i) => {
    const arr = faceUV.get(objs[c.obj].id)![c.face];
    arr[c.slot * 2] = uv[i * 2];
    arr[c.slot * 2 + 1] = uv[i * 2 + 1];
  });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  // auto smooth like the 3D studio: keep hard edges (non-indexed → flat; smooth by welding below 35°)
  smoothNormals(g, 35);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  // texel density: 3D area vs UV area
  let a3 = 0;
  let a2 = 0;
  for (let t = 0; t < P.length / 9; t++) {
    const o = t * 9;
    const ux = P[o + 3] - P[o];
    const uy = P[o + 4] - P[o + 1];
    const uz = P[o + 5] - P[o + 2];
    const vx = P[o + 6] - P[o];
    const vy = P[o + 7] - P[o + 1];
    const vz = P[o + 8] - P[o + 2];
    a3 += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const q = t * 6;
    a2 += Math.abs((uv[q + 2] - uv[q]) * (uv[q + 5] - uv[q + 1]) - (uv[q + 4] - uv[q]) * (uv[q + 3] - uv[q + 1]));
  }
  const worldPerUV = a2 > 0 ? Math.sqrt(a3 / a2) : 1;
  const bake = bakeMesh(P, uv, BAKE_RES);
  return { geometry: g, bake, painter: new Painter3D(bake), faceUV, objectIds: objs.map((o) => o.id), triangles: P.length / 9, charts, worldPerUV };
}

/** Per-corner normals averaged over coincident corners whose faces are within `deg` (auto smooth). */
function smoothNormals(g: THREE.BufferGeometry, deg: number) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const fnorm = new Float32Array(n * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < n / 3; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    const nn = b.sub(a).cross(c.sub(a)).normalize();
    for (let k = 0; k < 3; k++) fnorm.set([nn.x, nn.y, nn.z], (t * 3 + k) * 3);
  }
  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
    const l = groups.get(k);
    if (l) l.push(i);
    else groups.set(k, [i]);
  }
  const cos = Math.cos((deg * Math.PI) / 180);
  const out = new Float32Array(n * 3);
  for (const list of groups.values())
    for (const i of list) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (const j of list) {
        const d = fnorm[i * 3] * fnorm[j * 3] + fnorm[i * 3 + 1] * fnorm[j * 3 + 1] + fnorm[i * 3 + 2] * fnorm[j * 3 + 2];
        if (d >= cos) {
          x += fnorm[j * 3];
          y += fnorm[j * 3 + 1];
          z += fnorm[j * 3 + 2];
        }
      }
      const l = Math.hypot(x, y, z) || 1;
      out.set([x / l, y / l, z / l], i * 3);
    }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
}

/** PNG bytes of an RGBA map (browser). */
async function png(rgba: Uint8ClampedArray, size: number): Promise<ArrayBuffer> {
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), size, size), 0, 0);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Falha ao gerar PNG');
  return blob.arrayBuffer();
}

/**
 * Write the painted texture back to the 3D Studio project: maps go to the Asset Library, a material
 * is created (or updated) and the objects get the atlas UVs stored in their meshes.
 */
export async function applyToModel(t: PaintTarget, maps: TextureMaps, name: string): Promise<{ materialId: string; objects: number }> {
  const loaded = await getTarget(t);
  const doc = await getDocument(t.projectId);
  if (!doc) throw new Error('Projeto 3D não encontrado');
  const scene = normalizeScene(doc.modules[STUDIO3D]);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pintura';
  const put = async (key: keyof Omit<TextureMaps, 'size'>, label: string) => {
    const r = await importAssetBytes(`${slug}_${key}.png`, await png(maps[key], maps.size), { name: `${name} — ${label}`, category: 'textures', tags: ['textura', 'pbr', 'pintura-3d', slug], projectId: t.projectId });
    if (r.status === 'error') throw new Error(r.error);
    return assetUri(r.asset.id);
  };
  const matName = name.startsWith('Pintura 3D') ? name : `Pintura 3D — ${name}`;
  const existing = scene.materials.find((m) => m.name === matName);
  const mat = {
    ...(existing ?? createMaterial(matName, '#ffffff')),
    color: '#ffffff',
    metalness: 1,
    roughness: 1,
    normalScale: 1,
    aoIntensity: 1,
    emissive: '#ffffff',
    emissiveIntensity: 1,
    uvRepeat: [1, 1] as [number, number],
    uvOffset: [0, 0] as [number, number],
    uvRotation: 0,
    maps: {
      map: await put('baseColor', 'Cor base'),
      normalMap: await put('normal', 'Normal'),
      roughnessMap: await put('roughness', 'Rugosidade'),
      metalnessMap: await put('metallic', 'Metálico'),
      aoMap: await put('ao', 'Oclusão'),
      emissiveMap: await put('emissive', 'Emissivo'),
    },
  };
  const materials = existing ? scene.materials.map((m) => (m.id === existing.id ? mat : m)) : [...scene.materials, mat];
  let count = 0;
  const objects = scene.objects.map((o) => {
    const fuv = loaded.faceUV.get(o.id);
    if (!fuv || !o.geometry) return o;
    count++;
    // bake modifiers into the mesh so the stored UVs match its faces
    const m = finalMesh(o)!;
    return { ...o, geometry: { kind: 'mesh' as const, mesh: { v: m.v, f: m.f, fuv } }, modifiers: { ...o.modifiers, subdivision: 0, mirror: { x: false, y: false, z: false } }, uv: 'atlas' as const, materialId: mat.id };
  });
  await saveModuleData(t.projectId, STUDIO3D, { ...scene, objects, materials });
  return { materialId: mat.id, objects: count };
}

/** Canvas texture of a map (exporters need real images; image top = v 1 like the atlas). */
function canvasTexture(rgba: Uint8ClampedArray, size: number, srgb: boolean) {
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), size, size), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.flipY = false;
  return t;
}

/** The painted model as a GLB (one mesh, atlas UVs, PBR material with the maps embedded). */
export async function targetGlb(t: PaintTarget, maps: TextureMaps, name: string): Promise<ArrayBuffer> {
  const loaded = await getTarget(t);
  const g = loaded.geometry.clone();
  // glTF images have their origin at the top-left: v must be flipped for unflipped canvases
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const flipped = new Float32Array(uv.array.length);
  for (let i = 0; i < uv.count; i++) {
    flipped[i * 2] = uv.getX(i);
    flipped[i * 2 + 1] = 1 - uv.getY(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(flipped, 2));
  g.deleteAttribute('uv1');
  const m = new THREE.MeshStandardMaterial({ name, color: '#ffffff', roughness: 1, metalness: 1 });
  m.map = canvasTexture(maps.baseColor, maps.size, true);
  m.normalMap = canvasTexture(maps.normal, maps.size, false);
  // glTF packs AO/roughness/metal in one ORM image (R, G, B)
  m.roughnessMap = m.metalnessMap = m.aoMap = canvasTexture(maps.orm, maps.size, false);
  const mesh = new THREE.Mesh(g, m);
  mesh.name = name;
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  return (await new GLTFExporter().parseAsync(mesh, { binary: true, maxTextureSize: 4096 })) as ArrayBuffer;
}
