import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Slot } from '@/modules/studio-3d/weapons/catalog';
import { materialFor, texturesFor, type Finish, type MaterialSpec, type TextureSet } from '@/modules/studio-3d/weapons/textures';
import type { CamoPattern } from '../lib/promptParser';
import { applyEdgeWear, camouflage, createWearUniforms, type WearUniforms } from '../lib/surface';

/** Texture tile: 25 cm (UVs are in metres with box projection). */
export const UV_REPEAT = 4;
/** Slots that receive the camouflage / cerakote coating. */
export const COATED: Slot[] = ['polymer', 'dark'];

/** What shows through on worn edges for each slot. */
const WEAR_KIND: Partial<Record<Slot, 'metal' | 'polymer' | 'wood'>> = {
  polymer: 'polymer',
  dark: 'metal',
  metal: 'metal',
  blade: 'metal',
  trim: 'metal',
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
    uniforms.metal.uBare.value.set('#c4c8ce');
    uniforms.metal.uBareMetal.value = 1;
    uniforms.polymer.uBare.value.set('#8e8d86');
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
      const tex = slotTextures(slot, spec, s);
      if (tex) {
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
  }, [slotList, JSON.stringify(s.finish), coatKey, s.horizontal, uniforms]);

  useEffect(
    () => () =>
      materials.forEach((m) => {
        for (const t of [m.map, m.roughnessMap, m.normalMap]) t?.dispose();
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
