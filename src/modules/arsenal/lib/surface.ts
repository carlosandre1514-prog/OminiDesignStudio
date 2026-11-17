import * as THREE from 'three';
import * as P from '@/modules/studio-3d/mesh/polyMesh';
import { makeCells, makeFbm, type TextureSet } from '@/modules/studio-3d/weapons/textures';
import type { CamoPattern } from './promptParser';

// ---------------------------------------------------------------- edge wear

/**
 * Per-triangle-corner "sharpness" (0 = flat, 1 = 90°+ edge), in the exact corner order of
 * `toBufferGeometry` (faces in order, fan triangulation [f0, fk, fk+1]).
 * The shader uses it to reveal bare metal / lighter plastic on worn edges.
 */
export function edgeSharpness(m: P.PolyMesh): Float32Array {
  const faceN = m.f.map((f) => P.faceNormal(m, f));
  const vertFaces: number[][] = Array.from({ length: P.vcount(m) }, () => []);
  m.f.forEach((f, fi) => f.forEach((i) => vertFaces[i].push(fi)));
  // Sharpness of a vertex = largest angle between any two adjacent faces (via the minimum dot product).
  const sharp = vertFaces.map((faces) => {
    let minDot = 1;
    for (let a = 0; a < faces.length; a++)
      for (let b = a + 1; b < faces.length; b++) {
        const na = faceN[faces[a]];
        const nb = faceN[faces[b]];
        minDot = Math.min(minDot, na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2]);
      }
    // dot 1 → 0 ; dot ≤ 0 (90° or more) → 1
    return Math.min(1, Math.max(0, 1 - minDot));
  });
  const tris = m.f.reduce((s, f) => s + f.length - 2, 0);
  const out = new Float32Array(tris * 3);
  let t = 0;
  for (const face of m.f)
    for (let k = 1; k < face.length - 1; k++) {
      out[t * 3] = sharp[face[0]];
      out[t * 3 + 1] = sharp[face[k]];
      out[t * 3 + 2] = sharp[face[k + 1]];
      t++;
    }
  return out;
}

export interface WearUniforms {
  uWear: { value: number };
  uBare: { value: THREE.Color };
  uBareMetal: { value: number };
}

export const createWearUniforms = (): WearUniforms => ({ uWear: { value: 0.4 }, uBare: { value: new THREE.Color('#b8bcc2') }, uBareMetal: { value: 1 } });

/**
 * Patch a MeshStandardMaterial so worn edges (attribute `edgeWear`) show the bare substrate:
 * lighter colour, more metallic (for coated metal) and smoother, broken up by 3D noise so the wear is irregular.
 * The uniforms object is shared so sliders update without recompiling shaders.
 */
export function applyEdgeWear(mat: THREE.MeshStandardMaterial, u: WearUniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float edgeWear;\nvarying float vEdge;\nvarying vec3 vWearPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = edgeWear;\nvWearPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWear; uniform vec3 uBare; uniform float uBareMetal;
varying float vEdge; varying vec3 vWearPos;
float wHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(wHash(i), wHash(i+vec3(1,0,0)), f.x), mix(wHash(i+vec3(0,1,0)), wHash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(wHash(i+vec3(0,0,1)), wHash(i+vec3(1,0,1)), f.x), mix(wHash(i+vec3(0,1,1)), wHash(i+vec3(1,1,1)), f.x), f.y), f.z); }
float wearMask(){
  float n = wNoise(vWearPos * 180.0) * 0.6 + wNoise(vWearPos * 40.0) * 0.4;
  float e = vEdge * (0.55 + n);
  return smoothstep(1.0 - uWear * 0.9, 1.05 - uWear * 0.9, e) * step(0.001, uWear);
}`,
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat wm = wearMask();\ndiffuseColor.rgb = mix(diffuseColor.rgb, uBare, wm);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 1.0, wm * uBareMetal);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.28, wm * uBareMetal);');
  };
  mat.customProgramCacheKey = () => 'edge-wear-v1';
  mat.needsUpdate = true;
}

// ---------------------------------------------------------------- camouflage

export const CAMO_LABELS: Record<CamoPattern, string> = {
  nenhum: 'Nenhuma',
  solido: 'Cerakote (cor sólida)',
  woodland: 'Woodland',
  deserto: 'Deserto',
  digital: 'Digital',
  urbano: 'Urbano',
  tigre: 'Tiger stripe',
};

/** Palettes from the base colour outward; the user's colour replaces the first entry. */
const CAMO_PALETTES: Record<Exclude<CamoPattern, 'nenhum' | 'solido'>, string[]> = {
  woodland: ['#4b5a32', '#2f3a22', '#6b5638', '#1a1a17'],
  deserto: ['#c2a878', '#9b8259', '#d9c49b', '#6f5c3f'],
  digital: ['#6d7360', '#454c3b', '#9aa088', '#2e322a'],
  urbano: ['#8a8d90', '#5b5e62', '#c3c5c7', '#2e3033'],
  tigre: ['#5b6439', '#26291c', '#7c6a45', '#1b1c16'],
};

const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * Paint a camouflage over an existing texture set (keeps the roughness/normal micro-detail,
 * modulates the colour by the original luminance so the surface texture still reads).
 */
export function camouflage(base: TextureSet, pattern: CamoPattern, color: string, seed = 7): TextureSet {
  if (pattern === 'nenhum') return base;
  const size = base.size;
  const out = new Uint8ClampedArray(base.color.length);
  const palette = pattern === 'solido' ? [color] : [color, ...CAMO_PALETTES[pattern].slice(1)];
  const cols = palette.map(rgb);
  const fbmA = makeFbm(seed);
  const fbmB = makeFbm(seed + 1);
  const fbmC = makeFbm(seed + 2);
  const cells = makeCells(seed + 3, 6);
  // Average luminance of the base, to keep relative shading.
  let lumAvg = 0;
  for (let i = 0; i < size * size; i++) lumAvg += base.color[i * 4] + base.color[i * 4 + 1] + base.color[i * 4 + 2];
  lumAvg /= size * size * 3;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let k = 0;
      switch (pattern) {
        case 'woodland':
        case 'deserto': {
          const a = fbmA(u, v, 2, 2);
          const b = fbmB(u, v, 3, 3);
          const c = fbmC(u, v, 4, 4);
          k = a > 0.56 ? 1 : b > 0.58 ? 2 : c > 0.62 ? 3 : 0;
          break;
        }
        case 'digital': {
          const q = 48;
          const uu = Math.floor(u * q) / q;
          const vv = Math.floor(v * q) / q;
          const a = fbmA(uu, vv, 3, 3);
          const b = fbmB(uu, vv, 4, 4);
          k = a > 0.58 ? 1 : b > 0.6 ? 2 : a < 0.38 ? 3 : 0;
          break;
        }
        case 'urbano': {
          const c = cells(u, v);
          const a = fbmA(u, v, 3, 3);
          k = c < 0.35 ? 2 : a > 0.55 ? 1 : a < 0.35 ? 3 : 0;
          break;
        }
        case 'tigre': {
          const warp = fbmA(u, v, 2, 2) * 0.9;
          const stripe = Math.sin((v * 6 + warp) * Math.PI * 2) * 0.5 + 0.5;
          const brk = fbmB(u, v, 6, 3);
          k = stripe > 0.78 && brk > 0.4 ? 1 : stripe < 0.12 ? 3 : brk > 0.62 ? 2 : 0;
          break;
        }
        default:
          k = 0;
      }
      const i = (y * size + x) * 4;
      const lum = (base.color[i] + base.color[i + 1] + base.color[i + 2]) / 3;
      const shade = Math.min(1.35, Math.max(0.65, 0.5 + (0.5 * lum) / Math.max(1, lumAvg)));
      const c = cols[Math.min(k, cols.length - 1)];
      out[i] = c[0] * shade;
      out[i + 1] = c[1] * shade;
      out[i + 2] = c[2] * shade;
      out[i + 3] = 255;
    }
  return { ...base, color: out };
}
