import * as THREE from 'three';
import { importAssetBytes } from '@/core/assets/assetService';
import { createProject } from '@/core/projects/projectService';
import { createEmptyScene } from '@/modules/studio-3d/model';
import { assembleWeapon, type TextureIds } from '@/modules/studio-3d/weapons/assemble';
import type { WeaponPart, WeaponType } from '@/modules/studio-3d/weapons/catalog';
import { encodePng, materialFor, type Finish } from '@/modules/studio-3d/weapons/textures';
import type { CamoPattern } from './promptParser';
import { slotTextures } from '../canvas/useWeaponMaterials';
import { textureProjectMaps } from './textureLink';
import type { PhotoTexture } from './photo3d';
import type { Slot } from '@/modules/studio-3d/weapons/catalog';

export type ExportFormat = 'glb' | 'gltf' | 'obj';

/**
 * Clean copy of the visible weapon for export: transforms baked into the hierarchy as shown
 * (including the exploded view), standard PBR materials without the viewport shader patches.
 */
/** GLTFExporter needs drawable images: turn procedural DataTextures into CanvasTextures (same settings). */
function toCanvasTexture(t: THREE.Texture | null, cache: Map<THREE.Texture, THREE.Texture>): THREE.Texture | null {
  if (!t) return null;
  if (!(t instanceof THREE.DataTexture)) return t;
  const hit = cache.get(t);
  if (hit) return hit;
  const { width, height, data } = t.image as { width: number; height: number; data: Uint8Array };
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data.buffer.slice(0)), width, height), 0, 0);
  const c = new THREE.CanvasTexture(canvas);
  c.flipY = t.flipY;
  c.colorSpace = t.colorSpace;
  c.wrapS = t.wrapS;
  c.wrapT = t.wrapT;
  c.repeat.copy(t.repeat);
  c.offset.copy(t.offset);
  c.center.copy(t.center);
  c.rotation = t.rotation;
  c.name = t.name;
  cache.set(t, c);
  return c;
}

export function exportableScene(root: THREE.Object3D): THREE.Scene {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.name = root.name || 'Arma';
  root.updateWorldMatrix(true, true);
  const mats = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const texCache = new Map<THREE.Texture, THREE.Texture>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    const src = m.material as THREE.MeshStandardMaterial;
    let mat = mats.get(src);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial();
      mat.copy(src);
      mat.onBeforeCompile = () => undefined;
      mat.map = toCanvasTexture(mat.map, texCache);
      mat.roughnessMap = toCanvasTexture(mat.roughnessMap, texCache);
      mat.normalMap = toCanvasTexture(mat.normalMap, texCache);
      mat.metalnessMap = toCanvasTexture(mat.metalnessMap, texCache);
      mat.aoMap = toCanvasTexture(mat.aoMap, texCache);
      mat.emissiveMap = toCanvasTexture(mat.emissiveMap, texCache);
      mat.name = src.name;
      mats.set(src, mat);
    }
    const geo = m.geometry.clone();
    geo.deleteAttribute('bary');
    geo.deleteAttribute('edgeH');
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = m.name;
    m.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
    group.add(mesh);
  });
  scene.add(group);
  return scene;
}

/** Export the weapon as GLB / GLTF (geometry, part hierarchy, PBR materials and textures) or OBJ (geometry). */
export async function exportWeapon(root: THREE.Object3D, format: ExportFormat, baseName: string): Promise<{ blob: Blob; fileName: string }> {
  const scene = exportableScene(root);
  if (!scene.children[0].children.length) throw new Error('Nenhuma peça visível para exportar.');
  if (format === 'obj') {
    const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js');
    return { blob: new Blob([new OBJExporter().parse(scene)], { type: 'model/obj' }), fileName: `${baseName}.obj` };
  }
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const out = await new GLTFExporter().parseAsync(scene, { binary: format === 'glb', maxTextureSize: 2048 });
  if (format === 'glb') return { blob: new Blob([out as ArrayBuffer], { type: 'model/gltf-binary' }), fileName: `${baseName}.glb` };
  return { blob: new Blob([JSON.stringify(out)], { type: 'model/gltf+json' }), fileName: `${baseName}.gltf` };
}

/**
 * Open the weapon in the full 3D Design Studio: textures (with coating) go to the Asset Library,
 * and a new 3D project is created with the weapon as a group of editable meshes.
 */
export async function sendToStudio(
  weapon: WeaponType,
  parts: WeaponPart[],
  finish: Finish,
  camo: { pattern: CamoPattern; color: string },
  name: string,
  custom: Partial<Record<Slot, { id: string; name: string }>> = {},
  photo: PhotoTexture | null = null,
): Promise<string> {
  const textures: Record<string, TextureIds> = {};
  const done = new Set<string>();
  for (const p of parts) {
    const spec = materialFor(p.slot, finish);
    if (done.has(spec.key)) continue;
    done.add(spec.key);
    if (p.slot === 'photo' && photo) {
      // Photo-based model: the photo is the colour map, mapped 1:1 onto the model rectangle.
      const fr = photo.frame;
      // Wanted: uv' = uv·r + o. The 3D studio uses texture.center = (0.5, 0.5), which turns the
      // offset into o + (1 − r)·0.5, so pre-compensate: offset = o − (1 − r)·0.5.
      const r: [number, number] = [1 / fr.w, 1 / fr.h];
      const o: [number, number] = [-(fr.x0 + 0.5) / fr.w, -(fr.y0 + 0.5) / fr.h];
      const ids: TextureIds = { repeat: r, offset: [o[0] - (1 - r[0]) * 0.5, o[1] - (1 - r[1]) * 0.5] };
      const enc = async (img: PhotoTexture['color']) => {
        const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
        c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
        const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
        if (!blob) throw new Error('Falha ao gerar PNG');
        return blob.arrayBuffer();
      };
      for (const [map, img, label] of [['map', photo.color, 'cor'], ['normalMap', photo.normal, 'normal']] as const) {
        const r = await importAssetBytes(`foto3d-${label}.png`, await enc(img), { name: `${name} — ${label}`, category: 'textures', tags: ['arma', 'arsenal', 'foto'] });
        if (r.status === 'error') throw new Error(r.error);
        ids[map] = r.asset.id;
      }
      textures[spec.key] = ids;
      continue;
    }
    const studio = custom[p.slot];
    if (studio) {
      // Texture Studio material: full PBR set (colour, roughness, metal, normal, AO)
      const maps = await textureProjectMaps(studio.id, 1024);
      const ids: TextureIds = {};
      for (const [map, data, label] of [
        ['map', maps.baseColor, 'cor'],
        ['roughnessMap', maps.roughness, 'rugosidade'],
        ['metalnessMap', maps.metallic, 'metalico'],
        ['normalMap', maps.normal, 'normal'],
        ['aoMap', maps.ao, 'ao'],
      ] as const) {
        const r = await importAssetBytes(`estudio-${studio.id}-${label}.png`, await encodePng(data, maps.size), { name: `${studio.name} — ${label}`, category: 'textures', tags: ['arma', 'arsenal', 'textura'] });
        if (r.status === 'error') throw new Error(r.error);
        ids[map] = r.asset.id;
      }
      textures[spec.key] = ids;
      continue;
    }
    const tex = slotTextures(p.slot, spec, { camo }, 512);
    if (!tex) continue;
    const ids: TextureIds = {};
    for (const [map, data, label] of [
      ['map', tex.color, 'cor'],
      ['roughnessMap', tex.roughness, 'rugosidade'],
      ['normalMap', tex.normal, 'normal'],
    ] as const) {
      const r = await importAssetBytes(`arsenal-${spec.key}-${label}.png`, await encodePng(data, tex.size), { name: `${spec.name} — ${label}`, category: 'textures', tags: ['arma', 'arsenal', 'pbr'] });
      if (r.status === 'error') throw new Error(r.error);
      ids[map] = r.asset.id;
    }
    textures[spec.key] = ids;
  }
  const empty = createEmptyScene();
  // Start from the default lights + ground, without the default cube.
  const base = { ...empty, objects: empty.objects.filter((o) => !(o.geometry?.kind === 'primitive' && o.geometry.primitive === 'box')) };
  const { doc } = assembleWeapon(base, weapon, parts, finish, textures);
  const meta = await createProject({ name, category: '3d', modules: { '3d-studio': doc }, tags: ['arma', 'arsenal'] });
  return meta.id;
}
