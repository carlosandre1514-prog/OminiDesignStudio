import * as THREE from 'three';
import * as P from '@/modules/studio-3d/mesh/polyMesh';
import { makeCells, makeFbm, type TextureSet } from '@/modules/studio-3d/weapons/textures';
import type { CamoPattern } from './promptParser';

// ---------------------------------------------------------------- edge wear

/** Dihedral angle above which a polygon edge counts as a hard (wearable) edge. */
export const WEAR_EDGE_DEG = 25;

/**
 * Per-corner attributes for metric edge wear, in the exact corner order of `toBufferGeometry`
 * (faces in order, fan triangulation [f0, fk, fk+1]):
 * - `bary`: barycentric coordinates (1,0,0), (0,1,0), (0,0,1);
 * - `edgeH`: for each triangle edge opposite corner i, the triangle altitude from corner i when that
 *   edge is a hard polygon edge, or -1 otherwise (diagonals and smooth edges never wear).
 * In the shader, distance to a hard edge = bary_i × edgeH_i (metres), so wear has a real width
 * whatever the size of the face.
 */
const dot3 = (a: P.Vec3, b: P.Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function edgeWearAttributes(m: P.PolyMesh): { bary: Float32Array; edgeH: Float32Array } {
  const faceN = m.f.map((f) => P.faceNormal(m, f));
  const edgeFaces = new Map<string, number[]>();
  m.f.forEach((f, fi) =>
    f.forEach((a, k) => {
      const key = P.edgeKey(a, f[(k + 1) % f.length]);
      (edgeFaces.get(key) ?? edgeFaces.set(key, []).get(key)!).push(fi);
    }),
  );
  const cosT = Math.cos((WEAR_EDGE_DEG * Math.PI) / 180);
  const centre = m.f.map((f) => P.faceCenter(m, f));
  // Only convex edges wear (outer corners get knocked); concave corners collect dirt instead.
  const hard = (a: number, b: number, fi: number) => {
    const fs = edgeFaces.get(P.edgeKey(a, b)) ?? [];
    if (fs.length < 2) return true; // open border
    return fs.some((g) => g !== fi && dot3(faceN[g], faceN[fi]) < cosT && dot3(faceN[fi], P.sub(centre[g], centre[fi])) < 0);
  };
  const tris = m.f.reduce((s, f) => s + f.length - 2, 0);
  const bary = new Float32Array(tris * 9);
  const edgeH = new Float32Array(tris * 9);
  let t = 0;
  for (let fi = 0; fi < m.f.length; fi++) {
    const face = m.f[fi];
    const n = face.length;
    for (let k = 1; k < n - 1; k++) {
      const ids = [face[0], face[k], face[k + 1]];
      const p = ids.map((i) => P.vget(m, i));
      const area2 = P.len(P.cross(P.sub(p[1], p[0]), P.sub(p[2], p[0])));
      // Edge opposite corner i joins corners (i+1, i+2); fan diagonals are not polygon edges:
      // opposite 0 = (fk, fk+1) always; opposite 1 = (fk+1, f0) only in the last triangle; opposite 2 = (f0, fk) only in the first.
      const isPolyEdge = [true, k === n - 2, k === 1];
      const h = [0, 1, 2].map((i) => {
        const a = ids[(i + 1) % 3];
        const b = ids[(i + 2) % 3];
        if (!isPolyEdge[i] || !hard(a, b, fi)) return -1;
        const L = P.len(P.sub(p[(i + 2) % 3], p[(i + 1) % 3])) || 1e-9;
        return area2 / L;
      });
      for (let c = 0; c < 3; c++) {
        bary[t * 9 + c * 3 + c] = 1;
        edgeH.set(h, t * 9 + c * 3);
      }
      t++;
    }
  }
  return { bary, edgeH };
}

export interface WearUniforms {
  uWear: { value: number };
  uBare: { value: THREE.Color };
  uBareMetal: { value: number };
}

export const createWearUniforms = (): WearUniforms => ({ uWear: { value: 0.4 }, uBare: { value: new THREE.Color('#b8bcc2') }, uBareMetal: { value: 1 } });

/** Maximum width of worn bands at 100 % wear (metres). */
export const MAX_WEAR_WIDTH = 0.0035;

/**
 * Patch a MeshStandardMaterial so the surface near hard edges (attributes `bary` + `edgeH`)
 * shows the bare substrate: lighter colour, more metallic (for coated metal) and smoother.
 * The band width grows with uWear and is broken up by 3D noise so the wear looks chipped.
 * The uniforms object is shared so sliders update without recompiling shaders.
 */
export function applyEdgeWear(mat: THREE.MeshStandardMaterial, u: WearUniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 bary;\nattribute vec3 edgeH;\nvarying vec3 vBary;\nvarying vec3 vEdgeH;\nvarying vec3 vWearPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBary = bary;\nvEdgeH = edgeH;\nvWearPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWear; uniform vec3 uBare; uniform float uBareMetal;
varying vec3 vBary; varying vec3 vEdgeH; varying vec3 vWearPos;
float wHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(wHash(i), wHash(i+vec3(1,0,0)), f.x), mix(wHash(i+vec3(0,1,0)), wHash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(wHash(i+vec3(0,0,1)), wHash(i+vec3(1,0,1)), f.x), mix(wHash(i+vec3(0,1,1)), wHash(i+vec3(1,1,1)), f.x), f.y), f.z); }
float wearMask(){
  if (uWear <= 0.001) return 0.0;
  float d = 1e3;
  if (vEdgeH.x > 0.0) d = min(d, vBary.x * vEdgeH.x);
  if (vEdgeH.y > 0.0) d = min(d, vBary.y * vEdgeH.y);
  if (vEdgeH.z > 0.0) d = min(d, vBary.z * vEdgeH.z);
  // Chipped, broken bands: medium noise decides where the edge is worn at all, fine noise frays the border.
  float patches = wNoise(vWearPos * 420.0) * 0.65 + wNoise(vWearPos * 95.0) * 0.35;
  float fray = wNoise(vWearPos * 2600.0);
  float present = smoothstep(0.62 - uWear * 0.45, 0.72 - uWear * 0.45, patches);
  float width = ${MAX_WEAR_WIDTH.toFixed(5)} * uWear * (0.35 + 1.3 * patches) * (0.6 + 0.8 * fray);
  return (1.0 - smoothstep(width * 0.5, width, d)) * present;
}`,
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat wm = wearMask();\ndiffuseColor.rgb = mix(diffuseColor.rgb, uBare, wm);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 1.0, wm * uBareMetal);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, wm * uBareMetal);');
  };
  mat.customProgramCacheKey = () => 'edge-wear-v3';
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
export const CAMO_PALETTES: Record<Exclude<CamoPattern, 'nenhum' | 'solido'>, string[]> = {
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
