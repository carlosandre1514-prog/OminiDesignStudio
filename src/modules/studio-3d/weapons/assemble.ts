import { assetUri } from '@/core/assets/types';
import * as P from '../mesh/polyMesh';
import { createGroup, createMaterial, createPrimitive, type Material3D, type Obj3D, type Scene3DDoc } from '../model';
import * as ops from '../ops';
import type { WeaponPart, WeaponType } from './catalog';
import { materialFor, type Finish, type MaterialSpec } from './textures';

/** Asset ids of the generated texture maps of a material. */
export interface TextureIds {
  map?: string;
  roughnessMap?: string;
  normalMap?: string;
}

/** Weapons modelled along +X (guns, crossbows) get their texture direction rotated so grain/brushing follows the length. */
export const isHorizontal = (w: WeaponType) => w.category === 'firearm' || ['crossbow', 'plasma-rifle', 'laser-pistol'].includes(w.id);

/** Texture tile size: 1 / 4 m = 25 cm per repeat (UVs are in metres with box projection). */
export const UV_REPEAT = 4;

export function materialDef(spec: MaterialSpec, tex: TextureIds | undefined, horizontal: boolean): Material3D {
  const m = createMaterial(spec.name, spec.color);
  m.metalness = spec.metalness;
  m.roughness = spec.roughness;
  if (spec.emissive) m.emissive = spec.emissive;
  if (spec.emissiveIntensity !== undefined) m.emissiveIntensity = spec.emissiveIntensity;
  if (spec.opacity !== undefined) m.opacity = spec.opacity;
  m.normalScale = spec.normalScale ?? 1;
  if (tex) {
    m.maps = {
      ...(tex.map ? { map: assetUri(tex.map) } : {}),
      ...(tex.roughnessMap ? { roughnessMap: assetUri(tex.roughnessMap) } : {}),
      ...(tex.normalMap ? { normalMap: assetUri(tex.normalMap) } : {}),
    };
    m.uvRepeat = [UV_REPEAT, UV_REPEAT];
    m.uvRotation = horizontal ? 90 : 0;
  }
  return m;
}

const sameMaterial = (a: Material3D, b: Material3D) =>
  a.name === b.name && a.color === b.color && JSON.stringify(a.maps) === JSON.stringify(b.maps) && a.uvRotation === b.uvRotation && a.emissive === b.emissive;

/**
 * Add a generated weapon to the scene as a group of editable meshes with PBR materials.
 * Materials identical to existing ones are reused. The weapon rests on the ground, next to existing objects.
 */
export function assembleWeapon(
  doc: Scene3DDoc,
  w: WeaponType,
  parts: WeaponPart[],
  finish: Finish,
  textures: Record<string, TextureIds>,
): { doc: Scene3DDoc; groupId: string; materialIds: string[] } {
  let d = doc;
  const horizontal = isHorizontal(w);
  const matIds = new Map<string, string>();
  for (const part of parts) {
    const spec = materialFor(part.slot, finish);
    if (matIds.has(spec.key)) continue;
    const def = materialDef(spec, textures[spec.key], horizontal);
    const existing = d.materials.find((m) => sameMaterial(m, def));
    if (existing) matIds.set(spec.key, existing.id);
    else {
      const r = ops.addMaterial(d, def);
      d = r.doc;
      matIds.set(spec.key, r.id);
    }
  }

  const group = createGroup(w.name);
  let minY = Infinity;
  for (const part of parts) for (let i = 1; i < part.mesh.v.length; i += 3) minY = Math.min(minY, part.mesh.v[i]);
  group.position = [0, Number.isFinite(minY) ? -minY : 0, 0];
  group.castShadow = true;
  const children: Obj3D[] = parts.map((part) => {
    const o = createPrimitive('box');
    o.name = part.name;
    o.geometry = { kind: 'mesh', mesh: P.compact(part.mesh) };
    o.position = [0, 0, 0];
    o.shading = part.shading ?? 'auto';
    o.uv = 'box';
    o.parentId = group.id;
    o.materialId = matIds.get(materialFor(part.slot, finish).key);
    return o;
  });

  // Place next to existing objects instead of inside them.
  const isGround = (x: Obj3D) => x.geometry?.kind === 'primitive' && x.geometry.primitive === 'plane';
  const others = d.objects.filter((x) => !x.parentId && x.type !== 'light' && !isGround(x)).map((x) => ops.worldBox(d, x.id)).filter((b) => !b.isEmpty());
  for (let i = 0; i < 16; i++) {
    const probe = ops.worldBox(ops.addObjects(d, [group, ...children]), group.id);
    if (!others.some((b) => b.intersectsBox(probe))) break;
    group.position = [group.position[0] + Math.max(0.6, probe.max.x - probe.min.x + 0.2), group.position[1], group.position[2]];
  }
  d = ops.addObjects(d, [group, ...children]);
  return { doc: d, groupId: group.id, materialIds: [...new Set(matIds.values())] };
}
