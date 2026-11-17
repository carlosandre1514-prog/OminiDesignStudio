import type { MeshBake } from './meshBake';

/**
 * Brushes. 3D painting works in model space: a dab at surface point P paints every texel whose
 * baked 3D position is within the brush radius (and faces the same way), so strokes flow across
 * UV seams and never stretch, like the projection painting of professional tools.
 */

export type BrushShape = 'round' | 'square' | 'spray' | 'grunge' | 'stipple';
export const BRUSH_SHAPES: Record<BrushShape, string> = { round: 'Redondo', square: 'Quadrado', spray: 'Spray', grunge: 'Grunge', stipple: 'Pontilhado' };

export interface BrushSettings {
  /** Radius: fraction of the texture width (2D) or of the model size (3D). */
  size: number;
  hardness: number;
  /** Max coverage of a stroke. */
  opacity: number;
  /** Coverage added per dab (build-up). */
  flow: number;
  /** Distance between dabs, fraction of the radius. */
  spacing: number;
  erase: boolean;
  shape: BrushShape;
}

export const DEFAULT_BRUSH: BrushSettings = { size: 0.05, hardness: 0.6, opacity: 1, flow: 1, spacing: 0.25, erase: false, shape: 'round' };

const fract = (x: number) => x - Math.floor(x);
const hash3 = (x: number, y: number, z: number) => fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);
const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const h = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v), l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
}

/**
 * Brush tip coverage (0..1). (ax, ay) = position inside the tip in [-1, 1]; (wx, wy, wz) = a stable
 * surface coordinate (texture-space or world) for the noisy tips, so they don't swim between dabs.
 */
export function brushAlpha(b: Pick<BrushSettings, 'shape' | 'hardness'>, ax: number, ay: number, wx: number, wy: number, wz: number, dab: number): number {
  const r = b.shape === 'square' ? Math.max(Math.abs(ax), Math.abs(ay)) : Math.hypot(ax, ay);
  if (r >= 1) return 0;
  const h = Math.min(0.98, b.hardness);
  const fall = r <= h ? 1 : 1 - sstep(0, 1, (r - h) / (1 - h));
  switch (b.shape) {
    case 'spray':
      // random droplets, new ones on every dab
      return hash3(Math.floor(wx * 0.7), Math.floor(wy * 0.7), Math.floor(wz * 0.7) + dab * 17.13) > 0.86 - (1 - r) * 0.1 ? Math.min(1, fall * 1.6) : 0;
    case 'grunge': {
      const n = vnoise(wx * 0.05, wy * 0.05, wz * 0.05) * 0.6 + vnoise(wx * 0.17, wy * 0.17, wz * 0.17) * 0.4;
      return fall * sstep(0.48, 0.6, n);
    }
    case 'stipple': {
      const s = 0.18;
      const cx = Math.floor(wx * s);
      const cy = Math.floor(wy * s);
      const cz = Math.floor(wz * s);
      const ox = fract(wx * s) - 0.5;
      const oy = fract(wy * s) - 0.5;
      const oz = fract(wz * s) - 0.5;
      const on = hash3(cx, cy, cz) > 0.45 ? 1 : 0;
      return on * fall * (1 - sstep(0.18, 0.32, Math.hypot(ox, oy, oz)));
    }
    default:
      return fall;
  }
}

/** Blend one dab's coverage into an RGBA mask pixel (white + alpha). */
export function applyCoverage(data: Uint8ClampedArray, i: number, cov: number, b: Pick<BrushSettings, 'opacity' | 'flow' | 'erase'>) {
  if (cov <= 0) return;
  const o = i * 4;
  const a = data[o + 3] / 255;
  const k = cov * b.flow;
  const next = b.erase ? a * (1 - k) : a + (Math.max(a, b.opacity) - a) * k;
  data[o] = data[o + 1] = data[o + 2] = 255;
  data[o + 3] = Math.round(next * 255);
}

/** Spatial index of the baked texels for fast 3D dabs. */
export class Painter3D {
  readonly bake: MeshBake;
  private readonly cell: number;
  private readonly cells = new Map<number, Int32Array>();
  /** Bounding box of the touched texels since the last flush (for partial canvas updates). */
  dirty = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

  constructor(bake: MeshBake) {
    this.bake = bake;
    this.cell = bake.diag / 48;
    const lists = new Map<number, number[]>();
    const { cover, pos, size } = bake;
    for (let i = 0; i < size * size; i++) {
      if (!cover[i]) continue;
      const k = this.key(Math.floor(pos[i * 3] / this.cell), Math.floor(pos[i * 3 + 1] / this.cell), Math.floor(pos[i * 3 + 2] / this.cell));
      const l = lists.get(k);
      if (l) l.push(i);
      else lists.set(k, [i]);
    }
    for (const [k, l] of lists) this.cells.set(k, Int32Array.from(l));
  }

  private key(x: number, y: number, z: number) {
    return (x + 1024) * 4194304 + (y + 1024) * 2048 + (z + 1024);
  }

  /** Brush radius in model units for a brush size. */
  radius(size: number) {
    return Math.max(this.bake.diag * 0.002, size * this.bake.diag * 0.5);
  }

  /**
   * Stamp at surface point p with normal n into the mask pixels (same layout as the bake).
   * Returns the number of texels touched.
   */
  dab(data: Uint8ClampedArray, p: [number, number, number], n: [number, number, number], b: BrushSettings, dabIndex: number): number {
    const { pos, nor, size } = this.bake;
    const R = this.radius(b.size);
    // tangent frame for the brush tip
    const up: [number, number, number] = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let t1: [number, number, number] = [n[1] * up[2] - n[2] * up[1], n[2] * up[0] - n[0] * up[2], n[0] * up[1] - n[1] * up[0]];
    const l1 = Math.hypot(...t1) || 1;
    t1 = [t1[0] / l1, t1[1] / l1, t1[2] / l1];
    const t2: [number, number, number] = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
    const c = this.cell;
    const r = Math.ceil(R / c);
    const cx = Math.floor(p[0] / c);
    const cy = Math.floor(p[1] / c);
    const cz = Math.floor(p[2] / c);
    // noisy tips: coordinates in units of ~1/40 of the radius, stable on the surface
    const ns = 40 / R;
    let touched = 0;
    for (let x = cx - r; x <= cx + r; x++)
      for (let y = cy - r; y <= cy + r; y++)
        for (let z = cz - r; z <= cz + r; z++) {
          const list = this.cells.get(this.key(x, y, z));
          if (!list) continue;
          for (let k = 0; k < list.length; k++) {
            const i = list[k];
            const dx = pos[i * 3] - p[0];
            const dy = pos[i * 3 + 1] - p[1];
            const dz = pos[i * 3 + 2] - p[2];
            if (dx * dx + dy * dy + dz * dz >= R * R) continue;
            // don't paint through thin parts: the texel must face roughly the same way
            const facing = nor[i * 3] * n[0] + nor[i * 3 + 1] * n[1] + nor[i * 3 + 2] * n[2];
            if (facing < 0.05) continue;
            const ax = (dx * t1[0] + dy * t1[1] + dz * t1[2]) / R;
            const ay = (dx * t2[0] + dy * t2[1] + dz * t2[2]) / R;
            const cov = brushAlpha(b, ax, ay, pos[i * 3] * ns, pos[i * 3 + 1] * ns, pos[i * 3 + 2] * ns, dabIndex) * Math.min(1, facing * 3);
            if (cov <= 0) continue;
            applyCoverage(data, i, cov, b);
            touched++;
            const px = i % size;
            const py = (i - px) / size;
            const d = this.dirty;
            if (px < d.x0) d.x0 = px;
            if (px > d.x1) d.x1 = px;
            if (py < d.y0) d.y0 = py;
            if (py > d.y1) d.y1 = py;
          }
        }
    return touched;
  }

  takeDirty() {
    const d = this.dirty;
    this.dirty = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    return d.x1 >= d.x0 ? d : null;
  }
}
