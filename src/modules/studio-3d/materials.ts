import * as THREE from 'three';
import { parseAssetUri } from '@/core/assets/types';
import { loadTextureAsset } from './loaders';
import type { Material3D, MaterialMaps } from './model';

export const MAP_LABELS: Record<keyof MaterialMaps, string> = {
  map: 'Cor (Base Color)',
  normalMap: 'Normal',
  roughnessMap: 'Rugosidade',
  metalnessMap: 'Metálico',
  aoMap: 'Oclusão ambiente (AO)',
  emissiveMap: 'Emissivo',
  alphaMap: 'Opacidade (alpha)',
};

const SRGB: (keyof MaterialMaps)[] = ['map', 'emissiveMap'];

/** Apply the scalar parameters of a material definition to a THREE material. */
export function applyParams(m: THREE.MeshStandardMaterial, def: Material3D) {
  m.color.set(def.color);
  m.metalness = def.metalness;
  m.roughness = def.roughness;
  m.opacity = def.opacity;
  m.transparent = def.opacity < 1 || !!def.maps.alphaMap;
  m.depthWrite = def.opacity >= 1;
  m.emissive.set(def.emissive);
  m.emissiveIntensity = def.emissiveIntensity;
  m.normalScale.set(def.normalScale, def.normalScale);
  m.aoMapIntensity = def.aoIntensity;
  m.side = def.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
  m.name = def.name;
}

function applyUv(t: THREE.Texture, def: Material3D) {
  t.repeat.set(def.uvRepeat[0], def.uvRepeat[1]);
  t.offset.set(def.uvOffset[0], def.uvOffset[1]);
  t.rotation = THREE.MathUtils.degToRad(def.uvRotation);
  t.center.set(0.5, 0.5);
  t.needsUpdate = true;
}

/**
 * Load the texture maps of a material (from the Asset Library) and attach them.
 * Textures are cloned per material so UV settings don't leak between materials.
 * Returns the list of maps that could not be loaded.
 */
export async function applyMaps(m: THREE.MeshStandardMaterial, def: Material3D): Promise<string[]> {
  const failed: string[] = [];
  for (const key of Object.keys(MAP_LABELS) as (keyof MaterialMaps)[]) {
    const id = parseAssetUri(def.maps[key]);
    const prev = m[key] as THREE.Texture | null;
    if (!id) {
      if (prev) {
        prev.dispose();
        m[key] = null;
      }
      continue;
    }
    try {
      const base = await loadTextureAsset(id, SRGB.includes(key));
      const t = base.clone();
      applyUv(t, def);
      if (prev) prev.dispose();
      m[key] = t;
    } catch {
      failed.push(MAP_LABELS[key]);
      m[key] = null;
    }
  }
  m.needsUpdate = true;
  return failed;
}

/** Fully built material (used by exporters). */
export async function buildMaterial(def: Material3D | undefined): Promise<THREE.MeshStandardMaterial> {
  const m = new THREE.MeshStandardMaterial();
  if (!def) {
    m.color.set('#b9bfcc');
    m.roughness = 0.5;
    return m;
  }
  applyParams(m, def);
  await applyMaps(m, def);
  return m;
}
