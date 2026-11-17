import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Slot } from '@/modules/studio-3d/weapons/catalog';
import { materialFor, texturesFor, type Finish, type MaterialSpec, type TextureSet } from '@/modules/studio-3d/weapons/textures';
import type { TextureMaps } from '@/modules/texture-studio/engine/compose';
import type { CamoPattern } from '../lib/promptParser';
import type { PhotoTexture } from '../lib/photo3d';
import { applyEdgeWear, camouflage, createWearUniforms, type WearUniforms } from '../lib/surface';

/** Texture tile: 25 cm (UVs are in metres with box projection). */
export const UV_REPEAT = 4;
/** Slots that receive the camouflage / cerakote coating. */
export const COATED: Slot[] = ['polymer', 'dark', 'anodized'];

/** What shows through on worn edges for each slot. */
const WEAR_KIND: Partial<Record<Slot, 'metal' | 'polymer' | 'wood'>> = {
  polymer: 'polymer',
  dark: 'metal',
  metal: 'metal',
  blade: 'metal',
  trim: 'metal',
  anodized: 'metal',
  wood: 'wood',
};

export interface SurfaceSettings {
  finish: Finish;
  camo: { pattern: CamoPattern; color: string };
  edgeWear: number;
  roughness: number;
  metalness: number;
  /** rotate textures 90° for weapons modelled along X (grain/brushing follows the length) */
  horizontal: boolean;
  /** Texture Studio maps applied to slots (override the procedural finish). */
  custom?: Partial<Record<Slot, TextureMaps>>;
  /** Repeats per metre for custom textures. */
  customScale?: number;
  /** Photo texture for photo-based models (slot 'photo', planarXY UVs). */
  photo?: PhotoTexture | null;
}

/** Texture of a photo mapped onto its model rectangle (planarXY: u = x + 0.5, v = y + 0.5). */
function photoTexture(img: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }, frame: PhotoTexture['frame'], srgb: boolean) {
  const row = img.width * 4;
  const flipped = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++) flipped.set(img.data.subarray(y * row, y * row + row), (img.height - 1 - y) * row);
  const t = new THREE.DataTexture(flipped, img.width, img.height, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(1 / frame.w, 1 / frame.h);
  t.offset.set(-(frame.x0 + 0.5) / frame.w, -(frame.y0 + 0.5) / frame.h);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** DataTexture from studio maps; rows flipped so the image top maps to v = 1. */
function studioTexture(data: Uint8ClampedArray, size: number, srgb: boolean, repeat: number, horizontal: boolean) {
  const flipped = new Uint8Array(data.length);
  const row = size * 4;
  for (let y = 0; y < size; y++) flipped.set(data.subarray(y * row, y * row + row), (size - 1 - y) * row);
  const t = new THREE.DataTexture(flipped, size, size, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.center.set(0.5, 0.5);
  t.rotation = horizontal ? Math.PI / 2 : 0;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export function dataTexture(rgba: Uint8ClampedArray, size: number, srgb: boolean, horizontal: boolean) {
  const t = new THREE.DataTexture(new Uint8Array(rgba.buffer.slice(0)), size, size, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(UV_REPEAT, UV_REPEAT);
  t.center.set(0.5, 0.5);
  t.rotation = horizontal ? Math.PI / 2 : 0;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

/** Texture set of a slot with the coating applied (pure, used by the viewport and by "send to studio"). */
export function slotTextures(slot: Slot, spec: MaterialSpec, s: Pick<SurfaceSettings, 'camo'>, size = 256): TextureSet | null {
  if (!spec.pattern) return null;
  const base = texturesFor(spec.pattern, size);
  return COATED.includes(slot) && s.camo.pattern !== 'nenhum' ? camouflage(base, s.camo.pattern, s.camo.color) : base;
}

/** Key of the material actually used by a slot (finish + coating). */
export const slotKey = (slot: Slot, s: Pick<SurfaceSettings, 'finish' | 'camo'>) => {
  const k = materialFor(slot, s.finish).key;
  return COATED.includes(slot) && s.camo.pattern !== 'nenhum' ? `${k}~${s.camo.pattern}~${s.camo.color}` : k;
};

/**
 * One MeshStandardMaterial per slot in use, with procedural PBR maps, optional camouflage and
 * the edge-wear shader patch. Heavy work (textures) only reruns when the finish/coating changes;
 * the sliders (wear, roughness, metalness) only touch uniforms / scalars.
 */
export function useWeaponMaterials(slots: Slot[], s: SurfaceSettings) {
  const uniforms = useMemo(() => ({ metal: createWearUniforms(), polymer: createWearUniforms(), wood: createWearUniforms() }), []);
  useMemo(() => {
    // Subtle: worn coatings reveal grey steel/aluminium, not chrome.
    uniforms.metal.uBare.value.set('#aab0b8');
    uniforms.metal.uBareMetal.value = 1;
    uniforms.polymer.uBare.value.set('#56565a');
    uniforms.polymer.uBareMetal.value = 0;
    uniforms.wood.uBare.value.set('#c9a27a');
    uniforms.wood.uBareMetal.value = 0;
  }, [uniforms]);

  const slotList = [...new Set(slots)].sort().join(',');
  const coatKey = `${s.camo.pattern}|${s.camo.color}`;
  const materials = useMemo(() => {
    const map = new Map<Slot, THREE.MeshStandardMaterial & { userData: { spec: MaterialSpec } }>();
    for (const slot of slotList.split(',').filter(Boolean) as Slot[]) {
      const spec = materialFor(slot, s.finish);
      const m = new THREE.MeshStandardMaterial({ color: spec.color, metalness: spec.metalness, roughness: spec.roughness }) as THREE.MeshStandardMaterial & { userData: { spec: MaterialSpec } };
      m.name = spec.name;
      m.userData.spec = spec;
      if (spec.emissive) {
        m.emissive.set(spec.emissive);
        m.emissiveIntensity = spec.emissiveIntensity ?? 1;
        m.toneMapped = false;
      }
      if (spec.opacity !== undefined && spec.opacity < 1) {
        m.transparent = true;
        m.opacity = spec.opacity;
      }
      const studio = s.custom?.[slot];
      const tex = studio || slot === 'photo' ? null : slotTextures(slot, spec, s);
      if (slot === 'photo' && s.photo) {
        m.map = photoTexture(s.photo.color, s.photo.frame, true);
        m.normalMap = photoTexture(s.photo.normal, s.photo.frame, false);
        m.normalScale.set(1, 1);
        m.name = 'Textura da foto';
      } else if (studio) {
        const rep = s.customScale ?? 8;
        m.color.set('#ffffff');
        m.metalness = 1;
        m.roughness = 1;
        m.userData.spec = { ...spec, metalness: 1, roughness: 1 };
        m.map = studioTexture(studio.baseColor, studio.size, true, rep, s.horizontal);
        m.roughnessMap = studioTexture(studio.roughness, studio.size, false, rep, s.horizontal);
        m.metalnessMap = studioTexture(studio.metallic, studio.size, false, rep, s.horizontal);
        m.normalMap = studioTexture(studio.normal, studio.size, false, rep, s.horizontal);
        m.aoMap = studioTexture(studio.ao, studio.size, false, rep, s.horizontal);
        m.aoMap.channel = 0;
        m.emissiveMap = studioTexture(studio.emissive, studio.size, true, rep, s.horizontal);
        m.emissive.set('#ffffff');
        m.emissiveIntensity = 1.5;
        m.name = `${spec.name} (Estúdio de Texturas)`;
      } else if (tex) {
        m.map = dataTexture(tex.color, tex.size, true, s.horizontal);
        m.roughnessMap = dataTexture(tex.roughness, tex.size, false, s.horizontal);
        m.normalMap = dataTexture(tex.normal, tex.size, false, s.horizontal);
        const ns = spec.normalScale ?? 1;
        m.normalScale.set(ns, ns);
      }
      const wk = WEAR_KIND[slot];
      if (wk) applyEdgeWear(m, uniforms[wk] as WearUniforms);
      map.set(slot, m);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish/coat captured via keys
  }, [slotList, JSON.stringify(s.finish), coatKey, s.horizontal, uniforms, s.custom, s.customScale, s.photo]);

  useEffect(
    () => () =>
      materials.forEach((m) => {
        for (const t of [m.map, m.roughnessMap, m.normalMap, m.metalnessMap, m.aoMap, m.emissiveMap]) t?.dispose();
        m.dispose();
      }),
    [materials],
  );

  // Cheap live updates.
  useEffect(() => {
    for (const u of Object.values(uniforms)) u.uWear.value = s.edgeWear;
    materials.forEach((m) => {
      const spec = m.userData.spec;
      m.roughness = Math.min(1, spec.roughness * s.roughness);
      m.metalness = Math.min(1, spec.metalness * s.metalness);
    });
  }, [materials, uniforms, s.edgeWear, s.roughness, s.metalness]);

  return materials;
}
