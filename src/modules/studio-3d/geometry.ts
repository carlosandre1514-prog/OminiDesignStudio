import * as THREE from 'three';
import * as P from './mesh/polyMesh';
import { buildAtlas } from './mesh/uvAtlas';
import type { GeometrySource, Modifiers, Obj3D, UVProjection } from './model';

/** Polygon mesh for a geometry source (before modifiers). */
export function sourceMesh(g: GeometrySource): P.PolyMesh {
  if (g.kind === 'mesh') return g.mesh;
  const p = g.params;
  switch (g.primitive) {
    case 'box':
      return P.box(p.width, p.height, p.depth);
    case 'sphere':
      return P.sphere(p.radius, p.widthSegments, p.heightSegments);
    case 'cylinder':
      return P.cylinder(p.radiusTop, p.radiusBottom, p.height, p.radialSegments);
    case 'cone':
      return P.cylinder(0, p.radius, p.height, p.radialSegments);
    case 'plane':
      return P.plane(p.width, p.depth, Math.max(1, Math.round(p.segmentsX)), Math.max(1, Math.round(p.segmentsZ)));
    case 'torus':
      return P.torus(p.radius, p.tube, p.radialSegments, p.tubularSegments);
  }
}

/** Apply non-destructive modifiers (mirror, then subdivision). */
export function applyModifiers(m: P.PolyMesh, mod: Modifiers): P.PolyMesh {
  let out = m;
  if (mod.mirror.x) out = P.mirror(out, 0);
  if (mod.mirror.y) out = P.mirror(out, 1);
  if (mod.mirror.z) out = P.mirror(out, 2);
  const levels = Math.min(4, Math.max(0, Math.round(mod.subdivision)));
  for (let i = 0; i < levels; i++) out = P.subdivide(out, mod.smoothSubdivision);
  return out;
}

export function finalMesh(o: Obj3D): P.PolyMesh | null {
  return o.geometry ? applyModifiers(sourceMesh(o.geometry), o.modifiers) : null;
}

function projectUV(p: P.Vec3, n: P.Vec3, mode: UVProjection): [number, number] {
  switch (mode) {
    case 'planarXY':
      return [p[0] + 0.5, p[1] + 0.5];
    case 'planarXZ':
      return [p[0] + 0.5, -p[2] + 0.5];
    case 'planarYZ':
      return [-p[2] + 0.5, p[1] + 0.5];
    case 'spherical': {
      const r = P.len(p) || 1;
      return [0.5 + Math.atan2(-p[2], p[0]) / (2 * Math.PI), 0.5 + Math.asin(Math.max(-1, Math.min(1, p[1] / r))) / Math.PI];
    }
    case 'cylindrical':
      return [0.5 + Math.atan2(-p[2], p[0]) / (2 * Math.PI), p[1] + 0.5];
    case 'box':
    default: {
      // Triplanar by dominant face normal axis.
      const ax = Math.abs(n[0]);
      const ay = Math.abs(n[1]);
      const az = Math.abs(n[2]);
      if (ax >= ay && ax >= az) return [(n[0] > 0 ? -p[2] : p[2]) + 0.5, p[1] + 0.5];
      if (ay >= az) return [p[0] + 0.5, (n[1] > 0 ? -p[2] : p[2]) + 0.5];
      return [(n[2] > 0 ? p[0] : -p[0]) + 0.5, p[1] + 0.5];
    }
  }
}

export const AUTO_SMOOTH_DEG = 35;

export interface BuildOptions {
  shading: 'flat' | 'smooth' | 'auto';
  uv: UVProjection;
}

/**
 * Triangulated, non-indexed BufferGeometry with normals and UVs.
 * userData.triToFace maps each triangle to its polygon face (for picking in edit mode).
 */
export function toBufferGeometry(m: P.PolyMesh, opts: BuildOptions): THREE.BufferGeometry {
  const tris = m.f.reduce((s, f) => s + f.length - 2, 0);
  const pos = new Float32Array(tris * 9);
  const nor = new Float32Array(tris * 9);
  const uv = new Float32Array(tris * 6);
  const triToFace = new Int32Array(tris);
  const faceN = m.f.map((f) => P.faceNormal(m, f));
  let vn: P.Vec3[] | null = null;
  if (opts.shading === 'smooth') {
    vn = Array.from({ length: P.vcount(m) }, () => [0, 0, 0] as P.Vec3);
    m.f.forEach((f, fi) => f.forEach((i) => (vn![i] = P.add(vn![i], faceN[fi]))));
    vn = vn.map((n) => P.normalize(n));
  }
  // Auto smooth: per face corner, average only the neighbouring faces within the angle threshold.
  let vertFaces: number[][] | null = null;
  const cosT = Math.cos((AUTO_SMOOTH_DEG * Math.PI) / 180);
  if (opts.shading === 'auto') {
    vertFaces = Array.from({ length: P.vcount(m) }, () => []);
    m.f.forEach((f, fi) => f.forEach((i) => vertFaces![i].push(fi)));
  }
  const cornerNormal = (vi: number, fi: number): P.Vec3 => {
    if (vn) return vn[vi];
    if (!vertFaces) return faceN[fi];
    const own = faceN[fi];
    let s: P.Vec3 = [0, 0, 0];
    for (const g of vertFaces[vi]) {
      const n = faceN[g];
      if (n[0] * own[0] + n[1] * own[1] + n[2] * own[2] >= cosT) s = P.add(s, n);
    }
    return P.normalize(s);
  };
  let t = 0;
  const stored = opts.uv === 'atlas' && m.fuv && m.fuv.length === m.f.length ? m.fuv : null;
  m.f.forEach((face, fi) => {
    for (let k = 1; k < face.length - 1; k++) {
      const corners = [face[0], face[k], face[k + 1]];
      const slots = [0, k, k + 1];
      corners.forEach((vi, c) => {
        const p = P.vget(m, vi);
        const n = cornerNormal(vi, fi);
        pos.set(p, t * 9 + c * 3);
        nor.set(n, t * 9 + c * 3);
        if (stored) uv.set([stored[fi][slots[c] * 2] ?? 0, stored[fi][slots[c] * 2 + 1] ?? 0], t * 6 + c * 2);
        else if (opts.uv !== 'atlas') uv.set(projectUV(p, faceN[fi], opts.uv), t * 6 + c * 2);
      });
      triToFace[t++] = fi;
    }
  });
  if (opts.uv === 'atlas' && !stored) uv.set(buildAtlas(pos).uv);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('uv1', new THREE.BufferAttribute(uv, 2)); // aoMap channel
  g.userData.triToFace = triToFace;
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Geometry for an object, memoised by the identity of its geometry/modifier data. */
const cache = new WeakMap<object, Map<string, THREE.BufferGeometry>>();
export function objectGeometry(o: Obj3D): THREE.BufferGeometry | null {
  if (!o.geometry) return null;
  const key = `${o.shading}|${o.uv}|${JSON.stringify(o.modifiers)}`;
  let byKey = cache.get(o.geometry);
  if (!byKey) cache.set(o.geometry, (byKey = new Map()));
  let g = byKey.get(key);
  if (!g) {
    g = toBufferGeometry(finalMesh(o)!, { shading: o.shading, uv: o.uv });
    byKey.set(key, g);
  }
  return g;
}

/** Edges as line segments (for wireframe overlays and edit mode). */
export function edgePositions(m: P.PolyMesh): { positions: Float32Array; edges: [number, number][] } {
  const es = P.edges(m);
  const positions = new Float32Array(es.length * 6);
  es.forEach((e, i) => {
    positions.set(P.vget(m, e.a), i * 6);
    positions.set(P.vget(m, e.b), i * 6 + 3);
  });
  return { positions, edges: es.map((e) => [e.a, e.b]) };
}

/** Kelvin to RGB (approximation by Tanner Helland), used for light colour temperature. */
export function kelvinToHex(kelvin: number): string {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
