import * as THREE from 'three';
import { getAsset, getAssetBlob, getAssetBytes } from '@/core/assets/assetService';
import { db } from '@/core/db/database';
import { blobToArrayBuffer } from '@/core/utils/binary';

export interface LoadedModel {
  object: THREE.Object3D;
  /** Non-fatal problems (e.g. a texture referenced by the file is not in the library). */
  warnings: string[];
}

/** Resolves a file name referenced inside a model (texture, .bin, .mtl) to a blob URL from the library. */
export type NameResolver = (fileName: string) => Promise<string | null>;

const baseName = (p: string) => decodeURIComponent(p.split(/[\\/]/).pop() ?? p).split('?')[0];

/** Default resolver: looks for a library asset whose original file name matches. */
export async function libraryResolver(fileName: string): Promise<string | null> {
  const name = baseName(fileName).toLowerCase();
  const match = (await db.assets.toArray()).find((a) => a.originalName.toLowerCase() === name);
  if (!match) return null;
  const blob = await getAssetBlob(match.id);
  return blob ? URL.createObjectURL(blob) : null;
}

/** Loading manager that maps every external URL the loader asks for to a library file (or reports it missing). */
async function managerFor(urls: string[], resolve: NameResolver, warnings: string[]) {
  const map = new Map<string, string>();
  for (const u of urls) {
    if (!u || u.startsWith('data:') || u.startsWith('blob:')) continue;
    const r = await resolve(u);
    if (r) map.set(baseName(u), r);
    else warnings.push(`Arquivo dependente ausente na biblioteca: ${baseName(u)}`);
  }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    return map.get(baseName(url)) ?? url;
  });
  return { manager, missing: (u: string) => !map.has(baseName(u)) && !u.startsWith('data:') && !u.startsWith('blob:') };
}

/** Parse model bytes. `ext` is the file extension (glb, gltf, obj, fbx, stl). */
export async function parseModel(data: ArrayBuffer, ext: string, resolve: NameResolver = libraryResolver): Promise<LoadedModel> {
  const warnings: string[] = [];
  switch (ext) {
    case 'glb': {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().parseAsync(data, '');
      return { object: gltf.scene, warnings };
    }
    case 'gltf': {
      const text = new TextDecoder().decode(data);
      const json = JSON.parse(text) as { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
      const uris = [...(json.buffers ?? []), ...(json.images ?? [])].map((x) => x.uri ?? '').filter(Boolean);
      const { manager, missing } = await managerFor(uris, resolve, warnings);
      const missingBuffers = (json.buffers ?? []).filter((b) => b.uri && missing(b.uri));
      if (missingBuffers.length) throw new Error(`O GLTF depende de arquivos ausentes na biblioteca: ${missingBuffers.map((b) => baseName(b.uri!)).join(', ')}. Importe-os ou use .glb.`);
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader(manager).parseAsync(text, '');
      return { object: gltf.scene, warnings };
    }
    case 'obj': {
      const text = new TextDecoder().decode(data);
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      const loader = new OBJLoader();
      const mtlName = /^\s*mtllib\s+(.+?)\s*$/m.exec(text)?.[1];
      if (mtlName) {
        const mtlUrl = await resolve(mtlName);
        if (!mtlUrl) warnings.push(`Arquivo de materiais ausente na biblioteca: ${baseName(mtlName)}`);
        else {
          const mtlText = await (await fetch(mtlUrl)).text();
          const texNames = [...mtlText.matchAll(/^\s*map_\w+\s+(?:-\S+\s+\S+\s+)*(\S+)\s*$/gm)].map((m) => m[1]);
          const { manager } = await managerFor(texNames, resolve, warnings);
          const { MTLLoader } = await import('three/examples/jsm/loaders/MTLLoader.js');
          const materials = new MTLLoader(manager).parse(mtlText, '');
          materials.preload();
          loader.setMaterials(materials);
        }
      }
      return { object: loader.parse(text), warnings };
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      // Embedded textures load directly; external ones are looked up in the library by file name.
      const images = (await db.assets.where('kind').equals('image').toArray()).filter((a) => a.originalName);
      const byName = new Map<string, string>();
      for (const a of images) {
        const blob = await getAssetBlob(a.id);
        if (blob) byName.set(a.originalName.toLowerCase(), URL.createObjectURL(blob));
      }
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => (url.startsWith('data:') || url.startsWith('blob:') ? url : (byName.get(baseName(url).toLowerCase()) ?? url)));
      manager.onError = (url) => warnings.push(`Textura não encontrada: ${baseName(url)}`);
      const object = new FBXLoader(manager).parse(data, '');
      return { object, warnings };
    }
    case 'stl': {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      const geometry = new STLLoader().parse(data);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb9bfcc, roughness: 0.6 }));
      return { object: mesh, warnings };
    }
    case 'mtl':
      throw new Error('Arquivos .mtl são materiais de um .obj: importe o .obj (o .mtl é usado automaticamente).');
    default:
      throw new Error(`Formato de modelo não suportado: .${ext}`);
  }
}

const cache = new Map<string, Promise<LoadedModel>>();

/** Load (and cache) a model from the Asset Library. Consumers must clone the returned object. */
export function loadModelAsset(assetId: string): Promise<LoadedModel> {
  let p = cache.get(assetId);
  if (!p) {
    p = (async () => {
      const asset = await getAsset(assetId);
      if (!asset) throw new Error('Modelo ausente na biblioteca');
      const data = await getAssetBytes(assetId);
      if (!data) throw new Error('Conteúdo do modelo ausente');
      const res = await parseModel(data, asset.ext);
      res.object.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });
      return res;
    })();
    p.catch(() => cache.delete(assetId));
    cache.set(assetId, p);
  }
  return p;
}

/** Load an HDR environment map from the library. */
const hdrCache = new Map<string, Promise<THREE.DataTexture>>();
export function loadHdrAsset(assetId: string): Promise<THREE.DataTexture> {
  let p = hdrCache.get(assetId);
  if (!p) {
    p = (async () => {
      const blob = await getAssetBlob(assetId);
      if (!blob) throw new Error('HDRI ausente na biblioteca');
      const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
      const tex = new RGBELoader().parse(await blobToArrayBuffer(blob)) as unknown as { data: Uint16Array | Float32Array; width: number; height: number; type: THREE.TextureDataType };
      const t = new THREE.DataTexture(tex.data, tex.width, tex.height, THREE.RGBAFormat, tex.type);
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.LinearSRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.flipY = true;
      t.needsUpdate = true;
      return t;
    })();
    p.catch(() => hdrCache.delete(assetId));
    hdrCache.set(assetId, p);
  }
  return p;
}

/** Load a texture from the library (sRGB for colour maps). */
const texCache = new Map<string, Promise<THREE.Texture>>();
export function loadTextureAsset(assetId: string, srgb: boolean): Promise<THREE.Texture> {
  const key = `${assetId}|${srgb}`;
  let p = texCache.get(key);
  if (!p) {
    p = (async () => {
      const blob = await getAssetBlob(assetId);
      if (!blob) throw new Error('Textura ausente na biblioteca');
      const url = URL.createObjectURL(blob);
      const tex = await new THREE.TextureLoader().loadAsync(url);
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      return tex;
    })();
    p.catch(() => texCache.delete(key));
    texCache.set(key, p);
  }
  return p;
}

/** Fit an object into a unit box centred on the origin (for thumbnails/previews). */
export function frameObject(obj: THREE.Object3D, camera: THREE.PerspectiveCamera) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 1e-3) * 0.75;
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.copy(center).add(new THREE.Vector3(1, 0.7, 1).normalize().multiplyScalar(dist));
  camera.near = dist / 100;
  camera.far = dist * 100;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

/** Render a PNG thumbnail of a model (used when importing into the Asset Library). */
export async function renderModelThumbnail(data: ArrayBuffer, ext: string, size = 256): Promise<string | undefined> {
  if (typeof document === 'undefined' || /jsdom/i.test(navigator.userAgent)) return undefined;
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    const { object } = await parseModel(data, ext, async () => null);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(size, size);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(3, 5, 4);
    scene.add(key, object);
    const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
    frameObject(object, cam);
    renderer.render(scene, cam);
    return renderer.domElement.toDataURL('image/png');
  } catch {
    return undefined;
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
