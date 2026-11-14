import { assetUri } from '@/core/assets/types';
import { createId } from '@/core/utils/id';
import type { PolyMesh, Vec3 } from './mesh/polyMesh';

export type Primitive = 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'torus';
export type UVProjection = 'box' | 'planarXY' | 'planarXZ' | 'planarYZ' | 'spherical' | 'cylindrical';
export type ObjType = 'mesh' | 'group' | 'light' | 'model';
export type LightKind = 'directional' | 'point' | 'spot' | 'area' | 'hemisphere';

export type GeometrySource =
  | { kind: 'primitive'; primitive: Primitive; params: Record<string, number> }
  | { kind: 'mesh'; mesh: PolyMesh };

export interface Modifiers {
  /** Subdivision levels (0 = off). */
  subdivision: number;
  /** Catmull–Clark (true) or linear (false). */
  smoothSubdivision: boolean;
  mirror: { x: boolean; y: boolean; z: boolean };
}

export interface LightProps {
  kind: LightKind;
  color: string;
  /** Use colour temperature (Kelvin) instead of the colour. */
  useTemperature: boolean;
  temperature: number;
  intensity: number;
  castShadow: boolean;
  distance: number;
  /** Spot cone angle in degrees. */
  angle: number;
  penumbra: number;
  width: number;
  height: number;
  groundColor: string;
}

export interface Obj3D {
  id: string;
  name: string;
  type: ObjType;
  parentId: string | null;
  visible: boolean;
  locked: boolean;
  position: Vec3;
  /** Euler XYZ, radians. */
  rotation: Vec3;
  scale: Vec3;
  geometry?: GeometrySource;
  materialId?: string;
  /** flat = faceted, smooth = all averaged, auto = smooth below 35° (keeps hard edges). */
  shading: 'flat' | 'smooth' | 'auto';
  uv: UVProjection;
  modifiers: Modifiers;
  castShadow: boolean;
  receiveShadow: boolean;
  light?: LightProps;
  /** Imported model: Asset Library reference ("asset:<id>"). */
  assetId?: string;
}

export interface MaterialMaps {
  map?: string;
  normalMap?: string;
  roughnessMap?: string;
  metalnessMap?: string;
  aoMap?: string;
  emissiveMap?: string;
  alphaMap?: string;
}

export interface Material3D {
  id: string;
  name: string;
  color: string;
  metalness: number;
  roughness: number;
  opacity: number;
  emissive: string;
  emissiveIntensity: number;
  normalScale: number;
  aoIntensity: number;
  /** Asset Library image references ("asset:<id>"). */
  maps: MaterialMaps;
  uvRepeat: [number, number];
  uvOffset: [number, number];
  /** Degrees. */
  uvRotation: number;
  doubleSided: boolean;
}

export type EnvPreset = 'none' | 'studio' | 'outdoor' | 'night' | 'hdri';

export interface Environment3D {
  backgroundMode: 'color' | 'environment' | 'transparent';
  background: string;
  preset: EnvPreset;
  hdriAssetId?: string;
  envIntensity: number;
  ambient: number;
  shadows: { enabled: boolean; mapSize: number; radius: number; bias: number };
  grid: boolean;
  axes: boolean;
}

export interface Camera3D {
  position: Vec3;
  target: Vec3;
  fov: number;
  orthographic: boolean;
}

export interface Scene3DDoc {
  version: 1;
  objects: Obj3D[];
  materials: Material3D[];
  environment: Environment3D;
  camera: Camera3D;
}

export const PRIMITIVE_LABELS: Record<Primitive, string> = {
  box: 'Cubo',
  sphere: 'Esfera',
  cylinder: 'Cilindro',
  cone: 'Cone',
  plane: 'Plano',
  torus: 'Toro',
};

export const DEFAULT_PARAMS: Record<Primitive, Record<string, number>> = {
  box: { width: 1, height: 1, depth: 1 },
  sphere: { radius: 0.5, widthSegments: 24, heightSegments: 16 },
  cylinder: { radiusTop: 0.5, radiusBottom: 0.5, height: 1, radialSegments: 24 },
  cone: { radius: 0.5, height: 1, radialSegments: 24 },
  plane: { width: 2, depth: 2, segmentsX: 1, segmentsZ: 1 },
  torus: { radius: 0.5, tube: 0.18, radialSegments: 32, tubularSegments: 14 },
};

export const PARAM_LABELS: Record<string, string> = {
  width: 'Largura',
  height: 'Altura',
  depth: 'Profundidade',
  radius: 'Raio',
  widthSegments: 'Segmentos (largura)',
  heightSegments: 'Segmentos (altura)',
  radiusTop: 'Raio superior',
  radiusBottom: 'Raio inferior',
  radialSegments: 'Segmentos radiais',
  segmentsX: 'Segmentos X',
  segmentsZ: 'Segmentos Z',
  tube: 'Espessura',
  tubularSegments: 'Segmentos do tubo',
};

const DEFAULT_UV: Record<Primitive, UVProjection> = {
  box: 'box',
  sphere: 'spherical',
  cylinder: 'cylindrical',
  cone: 'cylindrical',
  plane: 'planarXZ',
  torus: 'box',
};

export const defaultModifiers = (): Modifiers => ({ subdivision: 0, smoothSubdivision: true, mirror: { x: false, y: false, z: false } });

function baseObject(type: ObjType, name: string): Obj3D {
  return {
    id: createId('obj'),
    name,
    type,
    parentId: null,
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    shading: 'flat',
    uv: 'box',
    modifiers: defaultModifiers(),
    castShadow: true,
    receiveShadow: true,
  };
}

export function createPrimitive(primitive: Primitive, materialId?: string): Obj3D {
  const o = baseObject('mesh', PRIMITIVE_LABELS[primitive]);
  o.geometry = { kind: 'primitive', primitive, params: { ...DEFAULT_PARAMS[primitive] } };
  o.uv = DEFAULT_UV[primitive];
  o.shading = primitive === 'sphere' || primitive === 'torus' || primitive === 'cylinder' || primitive === 'cone' ? 'smooth' : 'flat';
  o.materialId = materialId;
  // Rest on the ground plane.
  const p = o.geometry.params;
  const h = primitive === 'box' ? p.height : primitive === 'sphere' ? p.radius * 2 : primitive === 'torus' ? p.tube * 2 : primitive === 'plane' ? 0 : p.height;
  o.position = [0, h / 2, 0];
  return o;
}

export const LIGHT_LABELS: Record<LightKind, string> = {
  directional: 'Luz direcional',
  point: 'Luz pontual',
  spot: 'Luz spot',
  area: 'Luz de área',
  hemisphere: 'Luz hemisférica',
};

export function createLight(kind: LightKind): Obj3D {
  const o = baseObject('light', LIGHT_LABELS[kind]);
  o.light = {
    kind,
    color: '#ffffff',
    useTemperature: false,
    temperature: 6500,
    intensity: kind === 'directional' ? 2 : kind === 'hemisphere' ? 0.8 : kind === 'area' ? 4 : 20,
    castShadow: kind === 'directional' || kind === 'spot',
    distance: 0,
    angle: 35,
    penumbra: 0.3,
    width: 2,
    height: 1,
    groundColor: '#444444',
  };
  o.castShadow = false;
  o.receiveShadow = false;
  o.position = kind === 'directional' ? [-4, 6, 2] : kind === 'hemisphere' ? [0, 5, 0] : [2, 3, 2];
  if (kind === 'area') o.rotation = [-Math.PI / 2, 0, 0];
  return o;
}

export function createGroup(name = 'Grupo'): Obj3D {
  const o = baseObject('group', name);
  o.castShadow = false;
  o.receiveShadow = false;
  return o;
}

export function createModel(assetId: string, name: string): Obj3D {
  const o = baseObject('model', name);
  o.assetId = assetUri(assetId);
  return o;
}

export function createMaterial(name = 'Material', color = '#b9bfcc'): Material3D {
  return {
    id: createId('mat'),
    name,
    color,
    metalness: 0,
    roughness: 0.5,
    opacity: 1,
    emissive: '#000000',
    emissiveIntensity: 1,
    normalScale: 1,
    aoIntensity: 1,
    maps: {},
    uvRepeat: [1, 1],
    uvOffset: [0, 0],
    uvRotation: 0,
    doubleSided: false,
  };
}

export function createEmptyScene(): Scene3DDoc {
  const mat = createMaterial('Material padrão');
  const cube = createPrimitive('box', mat.id);
  const ground = createPrimitive('plane', createMaterial('Chão', '#3a4152').id);
  const groundMat = createMaterial('Chão', '#3a4152');
  ground.materialId = groundMat.id;
  ground.name = 'Chão';
  ground.geometry = { kind: 'primitive', primitive: 'plane', params: { width: 10, depth: 10, segmentsX: 1, segmentsZ: 1 } };
  ground.castShadow = false;
  const sun = createLight('directional');
  sun.name = 'Sol';
  return {
    version: 1,
    objects: [ground, cube, sun],
    materials: [mat, groundMat],
    environment: {
      backgroundMode: 'color',
      background: '#1b1f29',
      preset: 'studio',
      envIntensity: 0.6,
      ambient: 0.15,
      shadows: { enabled: true, mapSize: 2048, radius: 3, bias: -0.0005 },
      grid: true,
      axes: true,
    },
    camera: { position: [4, 3, 5], target: [0, 0.5, 0], fov: 45, orthographic: false },
  };
}

// ---------------------------------------------------------------- validation

const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
const num = (v: unknown, d: number, min = -Infinity, max = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const PRIMS = Object.keys(PRIMITIVE_LABELS) as Primitive[];
const UVS: UVProjection[] = ['box', 'planarXY', 'planarXZ', 'planarYZ', 'spherical', 'cylindrical'];

function validMesh(m: unknown): m is { v: number[]; f: number[][] } {
  if (!m || typeof m !== 'object') return false;
  const { v, f } = m as { v: unknown; f: unknown };
  if (!Array.isArray(v) || v.length % 3 !== 0 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) return false;
  const n = v.length / 3;
  return Array.isArray(f) && f.every((face) => Array.isArray(face) && face.length >= 3 && face.every((i) => Number.isInteger(i) && i >= 0 && i < n));
}

/** Validate/repair a stored scene. Corrupt objects are dropped rather than crashing the studio. */
export function normalizeScene(raw: unknown): Scene3DDoc {
  if (!raw || typeof raw !== 'object') return createEmptyScene();
  const r = raw as Partial<Scene3DDoc>;
  const base = createEmptyScene();
  const materials: Material3D[] = (Array.isArray(r.materials) ? r.materials : [])
    .filter((m) => m && typeof m.id === 'string')
    .map((m) => {
      const d = createMaterial();
      return {
        ...d,
        ...m,
        color: color(m.color, d.color),
        emissive: color(m.emissive, d.emissive),
        metalness: num(m.metalness, 0, 0, 1),
        roughness: num(m.roughness, 0.5, 0, 1),
        opacity: num(m.opacity, 1, 0, 1),
        maps: m.maps && typeof m.maps === 'object' ? m.maps : {},
        uvRepeat: Array.isArray(m.uvRepeat) ? [num(m.uvRepeat[0], 1), num(m.uvRepeat[1], 1)] : [1, 1],
        uvOffset: Array.isArray(m.uvOffset) ? [num(m.uvOffset[0], 0), num(m.uvOffset[1], 0)] : [0, 0],
      };
    });
  const matIds = new Set(materials.map((m) => m.id));
  const objects: Obj3D[] = (Array.isArray(r.objects) ? r.objects : [])
    .filter((o) => o && typeof o.id === 'string' && ['mesh', 'group', 'light', 'model'].includes(o.type))
    .map((o) => {
      const d = baseObject(o.type, typeof o.name === 'string' ? o.name : 'Objeto');
      const obj: Obj3D = {
        ...d,
        ...o,
        position: isVec3(o.position) ? o.position : [0, 0, 0],
        rotation: isVec3(o.rotation) ? o.rotation : [0, 0, 0],
        scale: isVec3(o.scale) ? o.scale : [1, 1, 1],
        uv: UVS.includes(o.uv) ? o.uv : 'box',
        shading: o.shading === 'smooth' || o.shading === 'auto' ? o.shading : 'flat',
        modifiers: { ...defaultModifiers(), ...(o.modifiers ?? {}), subdivision: num(o.modifiers?.subdivision, 0, 0, 4) },
        materialId: o.materialId && matIds.has(o.materialId) ? o.materialId : undefined,
      };
      if (obj.type === 'mesh') {
        const g = o.geometry;
        if (g?.kind === 'primitive' && PRIMS.includes(g.primitive)) obj.geometry = { kind: 'primitive', primitive: g.primitive, params: { ...DEFAULT_PARAMS[g.primitive], ...g.params } };
        else if (g?.kind === 'mesh' && validMesh(g.mesh)) obj.geometry = g;
        else return null;
      }
      if (obj.type === 'light') obj.light = { ...createLight(o.light?.kind ?? 'point').light!, ...(o.light ?? {}) };
      if (obj.type === 'model' && (typeof o.assetId !== 'string' || !o.assetId.startsWith('asset:'))) return null;
      return obj;
    })
    .filter((o): o is Obj3D => !!o);
  const ids = new Set(objects.map((o) => o.id));
  for (const o of objects) if (o.parentId && !ids.has(o.parentId)) o.parentId = null;
  const env = { ...base.environment, ...(r.environment ?? {}) } as Environment3D;
  env.shadows = { ...base.environment.shadows, ...(r.environment?.shadows ?? {}) };
  const cam = r.camera && isVec3(r.camera.position) && isVec3(r.camera.target) ? { ...base.camera, ...r.camera } : base.camera;
  return { version: 1, objects, materials, environment: env, camera: cam };
}
