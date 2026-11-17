import { GEN_BY_ID } from './generators';
import { clamp01, smooth } from './noise';
import type { BlendMode, Layer, PatternRef, TextureDoc } from './types';

/** Decoded bitmap passed to the engine (paint masks, text, images). */
export interface Bitmap {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Bitmaps keyed by `mask:<layerId>` and `color:<layerId>`. */
export type BitmapSet = Record<string, Bitmap | undefined>;

/** Final PBR maps, 8-bit RGBA each. */
export interface TextureMaps {
  size: number;
  baseColor: Uint8ClampedArray;
  roughness: Uint8ClampedArray;
  metallic: Uint8ClampedArray;
  normal: Uint8ClampedArray;
  height: Uint8ClampedArray;
  ao: Uint8ClampedArray;
  emissive: Uint8ClampedArray;
  /** glTF-style packed map: R = AO, G = roughness, B = metallic. */
  orm: Uint8ClampedArray;
}

export const MAP_LABELS: Record<Exclude<keyof TextureMaps, 'size'>, string> = {
  baseColor: 'Cor base',
  roughness: 'Rugosidade',
  metallic: 'Metálico',
  normal: 'Normal',
  height: 'Altura',
  ao: 'Oclusão (AO)',
  emissive: 'Emissivo',
  orm: 'ORM (AO+Rug.+Met.)',
};

const hexRgb = (h: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = m ? parseInt(m[1], 16) : 0x808080;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Evaluate a pattern into a Float32 field with its levels/invert applied. */
export function patternField(ref: PatternRef, size: number): Float32Array {
  const gen = GEN_BY_ID.get(ref.gen);
  const out = new Float32Array(size * size);
  if (!gen) return out.fill(0.5);
  const f = gen.prepare(ref.params, size);
  const span = ref.high - ref.low || 1e-6;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = clamp01((f((x + 0.5) / size, (y + 0.5) / size) - ref.low) / span);
      if (ref.invert) v = 1 - v;
      out[y * size + x] = v;
    }
  return out;
}

/** Bilinear, wrapping sampler over a bitmap: returns RGBA in [0,1]. */
function bitmapSampler(b: Bitmap) {
  const { width: w, height: h, data } = b;
  return (u: number, v: number, out: number[]) => {
    const x = u * w - 0.5;
    const y = v * h - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const idx = (xx: number, yy: number) => ((((yy % h) + h) % h) * w + (((xx % w) + w) % w)) * 4;
    const i00 = idx(x0, y0);
    const i10 = idx(x0 + 1, y0);
    const i01 = idx(x0, y0 + 1);
    const i11 = idx(x0 + 1, y0 + 1);
    for (let c = 0; c < 4; c++) {
      const a = data[i00 + c] + (data[i10 + c] - data[i00 + c]) * fx;
      const bb = data[i01 + c] + (data[i11 + c] - data[i01 + c]) * fx;
      out[c] = (a + (bb - a) * fy) / 255;
    }
    return out;
  };
}

/** Separable box blur with wrap-around (repeated for a smoother kernel). */
export function blur(src: Float32Array, size: number, radius: number, passes = 2): Float32Array {
  const r = Math.max(1, Math.round(radius));
  const a = src.slice();
  const b = new Float32Array(src.length);
  const norm = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      const row = y * size;
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[row + ((k % size) + size) % size];
      for (let x = 0; x < size; x++) {
        b[row + x] = s * norm;
        s += a[row + ((x + r + 1) % size)] - a[row + ((x - r + size) % size)];
      }
    }
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += b[(((k % size) + size) % size) * size + x];
      for (let y = 0; y < size; y++) {
        a[y * size + x] = s * norm;
        s += b[((y + r + 1) % size) * size + x] - b[((y - r + size) % size) * size + x];
      }
    }
  }
  return a;
}

function blendChannel(mode: BlendMode, a: number, b: number): number {
  switch (mode) {
    case 'multiply':
      return a * b;
    case 'screen':
      return 1 - (1 - a) * (1 - b);
    case 'overlay':
      return a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b);
    case 'add':
      return Math.min(1, a + b);
    case 'softlight':
      return b < 0.5 ? a - (1 - 2 * b) * a * (1 - a) : a + (2 * b - 1) * ((a <= 0.25 ? ((16 * a - 12) * a + 4) * a : Math.sqrt(a)) - a);
    case 'darken':
      return Math.min(a, b);
    case 'lighten':
      return Math.max(a, b);
    default:
      return b;
  }
}

/** Mask of a layer (0..1), using the stack evaluated so far for curvature/height masks. */
function layerMask(layer: Layer, size: number, height: Float32Array, bitmaps: BitmapSet): Float32Array {
  const m = layer.mask;
  const N = size * size;
  let out: Float32Array;
  switch (m.kind) {
    case 'pattern':
      out = m.pattern ? patternField(m.pattern, size) : new Float32Array(N).fill(1);
      break;
    case 'paint':
    case 'text':
    case 'image': {
      const b = bitmaps[`mask:${layer.id}`];
      out = new Float32Array(N);
      if (b) {
        const s = bitmapSampler(b);
        const px = [0, 0, 0, 0];
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++) {
            s((x + 0.5) / size, (y + 0.5) / size, px);
            // grayscale × alpha, so transparent PNGs and white-on-black masks both work
            out[y * size + x] = ((px[0] + px[1] + px[2]) / 3) * px[3];
          }
      }
      break;
    }
    case 'curvature': {
      // Difference between the height and its blurred version: > 0 on ridges/edges, < 0 in cavities.
      const r = Math.max(1, size / 160);
      const bl = blur(height, size, r);
      out = new Float32Array(N);
      const k = 0.002 + (1 - m.amount) * 0.03;
      for (let i = 0; i < N; i++) {
        const d = height[i] - bl[i];
        out[i] = m.side === 'concave' ? smooth(0, k, -d) : smooth(0, k, d);
      }
      break;
    }
    case 'height': {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < N; i++) {
        lo = Math.min(lo, height[i]);
        hi = Math.max(hi, height[i]);
      }
      const span = hi - lo || 1;
      out = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const t = (height[i] - lo) / span;
        out[i] = m.side === 'low' ? 1 - smooth(m.amount, m.amount + 0.15, t) : smooth(1 - m.amount - 0.15, 1 - m.amount, t);
      }
      break;
    }
    default:
      out = new Float32Array(N).fill(1);
  }
  if (m.invert) for (let i = 0; i < N; i++) out[i] = 1 - out[i];
  return out;
}

/**
 * Evaluate the whole stack. Bottom layer first; each layer writes the enabled channels through
 * its mask × opacity with its blend mode. Then normal (Sobel), AO (cavity) and packed maps.
 */
export function evaluate(doc: TextureDoc, size: number, bitmaps: BitmapSet = {}, onProgress?: (p: number) => void): TextureMaps {
  const N = size * size;
  const color = new Float32Array(N * 3).fill(0.5);
  const rough = new Float32Array(N).fill(0.5);
  const metal = new Float32Array(N);
  const height = new Float32Array(N).fill(0.5);
  const emis = new Float32Array(N * 3);
  const layers = doc.layers.filter((l) => l.visible && l.opacity > 0);
  const px = [0, 0, 0, 0];

  layers.forEach((layer, li) => {
    const c = layer.content;
    const val = c.pattern ? patternField(c.pattern, size) : null;
    const mask = layerMask(layer, size, height, bitmaps);
    const stops = c.colors.map(hexRgb);
    const img = c.imageId ? bitmaps[`color:${layer.id}`] : undefined;
    const imgS = img ? bitmapSampler(img) : null;
    const em = hexRgb(c.emissive);
    const ch = layer.channels;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const a = mask[i] * layer.opacity;
        if (a <= 0) continue;
        const v = val ? val[i] : 0;
        if (ch.color) {
          let r: number;
          let g: number;
          let b: number;
          if (imgS) {
            imgS((x + 0.5) / size, (y + 0.5) / size, px);
            [r, g, b] = px;
          } else if (stops.length === 1) [r, g, b] = stops[0];
          else if (c.stepped) [r, g, b] = stops[Math.min(stops.length - 1, Math.floor(v * stops.length))];
          else {
            const t = v * (stops.length - 1);
            const k = Math.min(stops.length - 2, Math.floor(t));
            const f = t - k;
            r = stops[k][0] + (stops[k + 1][0] - stops[k][0]) * f;
            g = stops[k][1] + (stops[k + 1][1] - stops[k][1]) * f;
            b = stops[k][2] + (stops[k + 1][2] - stops[k][2]) * f;
          }
          for (let k = 0; k < 3; k++) {
            const base = color[i * 3 + k];
            const top = blendChannel(layer.blend, base, k === 0 ? r : k === 1 ? g : b);
            color[i * 3 + k] = base + (top - base) * a;
          }
        }
        if (ch.roughness) rough[i] += (c.roughA + (c.roughB - c.roughA) * v - rough[i]) * a;
        if (ch.metal) metal[i] += (c.metalA + (c.metalB - c.metalA) * v - metal[i]) * a;
        if (ch.height) {
          const lh = c.heightOffset + v * c.heightAmount;
          const h = height[i];
          switch (layer.heightMode) {
            case 'normal':
              height[i] = h + (0.5 + lh - h) * a;
              break;
            case 'add':
              height[i] = h + lh * a;
              break;
            case 'subtract':
              height[i] = h - lh * a;
              break;
            case 'max':
              height[i] = h + (Math.max(h, 0.5 + lh) - h) * a;
              break;
            case 'min':
              height[i] = h + (Math.min(h, 0.5 + lh) - h) * a;
              break;
          }
        }
        if (ch.emissive) for (let k = 0; k < 3; k++) emis[i * 3 + k] += (em[k] * c.emissiveIntensity * (val ? v : 1) - emis[i * 3 + k]) * a;
      }
    onProgress?.((li + 1) / (layers.length + 1));
  });

  // ---------------------------------------------------------------- outputs
  const out = (n: number) => new Uint8ClampedArray(n * 4);
  const baseColor = out(N);
  const roughness = out(N);
  const metallic = out(N);
  const heightMap = out(N);
  const normal = out(N);
  const ao = out(N);
  const emissive = out(N);
  const orm = out(N);

  // AO: multi-scale cavity (how much lower a texel is than its surroundings).
  const b1 = blur(height, size, Math.max(1, size / 128));
  const b2 = blur(height, size, Math.max(2, size / 32));
  const strength = (doc.normalStrength * size) / 64;
  const H = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  const dy = doc.normalFormat === 'directx' ? -1 : 1;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const o = i * 4;
      for (let k = 0; k < 3; k++) {
        baseColor[o + k] = color[i * 3 + k] * 255;
        emissive[o + k] = Math.min(1, emis[i * 3 + k]) * 255;
      }
      const r = clamp01(rough[i]) * 255;
      const m = clamp01(metal[i]) * 255;
      const h = clamp01(height[i]) * 255;
      roughness[o] = roughness[o + 1] = roughness[o + 2] = r;
      metallic[o] = metallic[o + 1] = metallic[o + 2] = m;
      heightMap[o] = heightMap[o + 1] = heightMap[o + 2] = h;
      const cav = Math.max(0, b1[i] - height[i]) * 6 + Math.max(0, b2[i] - height[i]) * 3;
      const a = clamp01(1 - cav * doc.aoStrength * 4) * 255;
      ao[o] = ao[o + 1] = ao[o + 2] = a;
      orm[o] = a;
      orm[o + 1] = r;
      orm[o + 2] = m;
      // Sobel normal (tangent space). Texture v grows downward, so +Y in the map = up = -row.
      const gx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength;
      const gy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength;
      const l = Math.hypot(gx, gy, 1);
      normal[o] = (-gx / l * 0.5 + 0.5) * 255;
      normal[o + 1] = ((dy * gy) / l * 0.5 + 0.5) * 255;
      normal[o + 2] = (1 / l * 0.5 + 0.5) * 255;
      for (const arr of [baseColor, roughness, metallic, heightMap, normal, ao, emissive, orm]) arr[o + 3] = 255;
    }
  onProgress?.(1);
  return { size, baseColor, roughness, metallic, normal, height: heightMap, ao, emissive, orm };
}
