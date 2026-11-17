import { rng } from '../mesh/builders';
import type { Slot } from './catalog';

/**
 * Procedural, tileable PBR textures for weapons (no network, no AI service).
 * Every texture is computed from a height field + palette, so the colour, roughness and
 * normal maps of a finish always match each other.
 */

export interface Finish {
  steel: 'polido' | 'escuro' | 'damasco' | 'gasto';
  trim: 'ouro' | 'latao' | 'bronze' | 'aco';
  wood: 'carvalho' | 'nogueira' | 'ebano' | 'freixo';
  grip: 'couro-marrom' | 'couro-preto' | 'tecido' | 'borracha';
  polymer: 'preto' | 'areia' | 'oliva' | 'cinza';
  energy: 'azul' | 'vermelho' | 'verde' | 'roxo' | 'laranja';
  /** 0 = new, 1 = battle-worn (scratches, dirt, worn edges in the roughness). */
  wear: number;
}

export const DEFAULT_FINISH: Finish = { steel: 'polido', trim: 'latao', wood: 'nogueira', grip: 'couro-marrom', polymer: 'preto', energy: 'azul', wear: 0.35 };

export const FINISH_LABELS: { [K in Exclude<keyof Finish, 'wear'>]: { label: string; options: Record<Finish[K], string> } } = {
  steel: { label: 'Aço / lâmina', options: { polido: 'Polido', escuro: 'Enegrecido', damasco: 'Damasco', gasto: 'Gasto / oxidado' } },
  trim: { label: 'Detalhes', options: { ouro: 'Ouro', latao: 'Latão', bronze: 'Bronze', aco: 'Aço' } },
  wood: { label: 'Madeira', options: { carvalho: 'Carvalho', nogueira: 'Nogueira', ebano: 'Ébano', freixo: 'Freixo claro' } },
  grip: { label: 'Empunhadura', options: { 'couro-marrom': 'Couro marrom', 'couro-preto': 'Couro preto', tecido: 'Tecido trançado', borracha: 'Borracha' } },
  polymer: { label: 'Polímero', options: { preto: 'Preto', areia: 'Areia (tan)', oliva: 'Verde oliva', cinza: 'Cinza' } },
  energy: { label: 'Energia', options: { azul: 'Azul', vermelho: 'Vermelho', verde: 'Verde', roxo: 'Roxo', laranja: 'Laranja' } },
};

export const ENERGY_COLORS: Record<Finish['energy'], string> = { azul: '#3ab8ff', vermelho: '#ff3b3b', verde: '#3dff7a', roxo: '#b45cff', laranja: '#ff8a1f' };

export interface MaterialSpec {
  key: string;
  name: string;
  color: string;
  metalness: number;
  roughness: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  normalScale?: number;
  /** pattern used to build the maps; none = plain material */
  pattern?: Pattern;
}

type RGB = [number, number, number];
export interface Pattern {
  kind: 'brushed' | 'damascus' | 'blackened' | 'hammered' | 'wood' | 'leather' | 'wrap' | 'rubber' | 'polymer' | 'rust';
  /** palette from low to high height */
  dark: RGB;
  light: RGB;
  rough: [number, number];
  wear: number;
  seed: number;
}


/** Material for a slot with the chosen finish. */
export function materialFor(slot: Slot, f: Finish): MaterialSpec {
  const w = f.wear;
  const steel = (base: 'blade' | 'metal'): MaterialSpec => {
    const rough = base === 'blade' ? 0 : 0.08;
    switch (f.steel) {
      case 'escuro':
        return { key: `${base}-escuro`, name: 'Aço enegrecido', color: '#ffffff', metalness: 0.85, roughness: 1, pattern: { kind: 'blackened', dark: [28, 29, 32], light: [70, 72, 78], rough: [0.38 + rough, 0.6], wear: w, seed: 11 } };
      case 'damasco':
        return { key: `${base}-damasco`, name: 'Aço damasco', color: '#ffffff', metalness: 1, roughness: 1, pattern: { kind: 'damascus', dark: [70, 72, 76], light: [205, 208, 212], rough: [0.18 + rough, 0.42], wear: w, seed: 12 } };
      case 'gasto':
        return { key: `${base}-gasto`, name: 'Aço gasto', color: '#ffffff', metalness: 0.8, roughness: 1, pattern: { kind: 'rust', dark: [96, 62, 40], light: [168, 170, 172], rough: [0.35 + rough, 0.85], wear: Math.max(w, 0.6), seed: 13 } };
      default:
        return { key: `${base}-polido`, name: 'Aço polido', color: '#ffffff', metalness: 1, roughness: 1, pattern: { kind: 'brushed', dark: [150, 154, 160], light: [222, 225, 230], rough: [0.12 + rough, 0.32], wear: w, seed: 10 } };
    }
  };
  switch (slot) {
    case 'blade':
      return steel('blade');
    case 'metal':
      return steel('metal');
    case 'dark':
      return { key: 'parkerizado', name: 'Metal fosfatizado', color: '#ffffff', metalness: 0.7, roughness: 1, pattern: { kind: 'blackened', dark: [30, 31, 33], light: [62, 64, 66], rough: [0.45, 0.7], wear: w, seed: 21 } };
    case 'trim': {
      const pal: Record<Finish['trim'], [RGB, RGB]> = { ouro: [[160, 112, 30], [255, 214, 120]], latao: [[130, 98, 40], [228, 196, 120]], bronze: [[90, 56, 30], [196, 140, 90]], aco: [[120, 124, 130], [210, 214, 220]] };
      const [dark, light] = pal[f.trim];
      return { key: `trim-${f.trim}`, name: FINISH_LABELS.trim.options[f.trim], color: '#ffffff', metalness: 1, roughness: 1, pattern: { kind: 'hammered', dark, light, rough: [0.2, 0.45], wear: w, seed: 31 } };
    }
    case 'wood': {
      const pal: Record<Finish['wood'], [RGB, RGB]> = { carvalho: [[104, 70, 38], [176, 130, 82]], nogueira: [[58, 34, 20], [124, 80, 48]], ebano: [[18, 14, 12], [58, 44, 36]], freixo: [[160, 126, 88], [226, 196, 150]] };
      const [dark, light] = pal[f.wood];
      return { key: `wood-${f.wood}`, name: FINISH_LABELS.wood.options[f.wood], color: '#ffffff', metalness: 0, roughness: 1, pattern: { kind: 'wood', dark, light, rough: [0.45, 0.75], wear: w, seed: 41 } };
    }
    case 'grip': {
      const kind: Pattern['kind'] = f.grip === 'tecido' ? 'wrap' : f.grip === 'borracha' ? 'rubber' : 'leather';
      const pal: Record<Finish['grip'], [RGB, RGB]> = { 'couro-marrom': [[52, 30, 18], [120, 74, 44]], 'couro-preto': [[14, 13, 13], [52, 48, 46]], tecido: [[24, 22, 26], [92, 86, 96]], borracha: [[18, 18, 19], [44, 44, 46]] };
      const [dark, light] = pal[f.grip];
      return { key: `grip-${f.grip}`, name: FINISH_LABELS.grip.options[f.grip], color: '#ffffff', metalness: 0, roughness: 1, normalScale: 1.4, pattern: { kind, dark, light, rough: [0.55, 0.9], wear: w, seed: 51 } };
    }
    case 'polymer': {
      const pal: Record<Finish['polymer'], [RGB, RGB]> = { preto: [[20, 21, 22], [44, 45, 47]], areia: [[150, 124, 88], [196, 170, 128]], oliva: [[56, 62, 38], [96, 104, 66]], cinza: [[70, 72, 74], [118, 120, 122]] };
      const [dark, light] = pal[f.polymer];
      return { key: `polymer-${f.polymer}`, name: `Polímero ${FINISH_LABELS.polymer.options[f.polymer].toLowerCase()}`, color: '#ffffff', metalness: 0, roughness: 1, pattern: { kind: 'polymer', dark, light, rough: [0.55, 0.8], wear: w, seed: 61 } };
    }
    case 'anodized':
      return { key: 'anodizado', name: 'Alumínio anodizado', color: '#ffffff', metalness: 0.9, roughness: 1, pattern: { kind: 'blackened', dark: [26, 27, 30], light: [52, 54, 58], rough: [0.42, 0.55], wear: w * 0.6, seed: 71 } };
    case 'bright':
      return { key: 'aco-claro', name: 'Aço níquel-boro', color: '#ffffff', metalness: 1, roughness: 1, pattern: { kind: 'brushed', dark: [150, 152, 156], light: [205, 207, 210], rough: [0.2, 0.32], wear: w * 0.5, seed: 72 } };
    case 'lens':
      return { key: 'lente', name: 'Lente', color: '#8fb8cc', metalness: 0, roughness: 0.04, opacity: 0.3 };
    case 'string':
      return { key: 'string', name: 'Corda encerada', color: '#d9cdb0', metalness: 0, roughness: 0.7 };
    case 'fletch':
      return { key: 'fletch', name: 'Penas', color: '#e8e2d6', metalness: 0, roughness: 0.9 };
    case 'glow':
      return { key: `glow-${f.energy}`, name: `Energia ${FINISH_LABELS.energy.options[f.energy].toLowerCase()}`, color: ENERGY_COLORS[f.energy], metalness: 0, roughness: 0.2, emissive: ENERGY_COLORS[f.energy], emissiveIntensity: 3 };
    case 'crystal':
      return { key: `crystal-${f.energy}`, name: `Cristal ${FINISH_LABELS.energy.options[f.energy].toLowerCase()}`, color: ENERGY_COLORS[f.energy], metalness: 0.1, roughness: 0.05, emissive: ENERGY_COLORS[f.energy], emissiveIntensity: 1.2, opacity: 0.85 };
  }
}

// ---------------------------------------------------------------- noise

/** Tileable value noise with integer periods px × py. */
function makeNoise(seed: number) {
  const r = rng(seed);
  const SIZE = 256;
  const table = Float32Array.from({ length: SIZE * SIZE }, () => r.next());
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (u: number, v: number, px: number, py: number) => {
    const x = u * px;
    const y = v * py;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const at = (i: number, j: number) => table[(((j % py) + py) % py % SIZE) * SIZE + ((((i % px) + px) % px) % SIZE)];
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

export function makeFbm(seed: number) {
  const noise = makeNoise(seed);
  return (u: number, v: number, px: number, py: number, oct = 4) => {
    let s = 0;
    let amp = 0.5;
    let tot = 0;
    for (let o = 0; o < oct; o++) {
      s += noise(u, v, px << o, py << o) * amp;
      tot += amp;
      amp *= 0.5;
    }
    return s / tot;
  };
}

/** Tileable cellular (Worley) noise: distance to the nearest feature point, 0..~1. */
export function makeCells(seed: number, cells: number) {
  const r = rng(seed);
  const pts = Array.from({ length: cells * cells }, () => [r.next(), r.next()]);
  return (u: number, v: number) => {
    const cx = Math.floor(u * cells);
    const cy = Math.floor(v * cells);
    let best = 9;
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const gx = cx + i;
        const gy = cy + j;
        const p = pts[(((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells)];
        const dx = (gx + p[0]) / cells - u;
        const dy = (gy + p[1]) / cells - v;
        best = Math.min(best, Math.hypot(dx, dy) * cells);
      }
    return best;
  };
}

// ---------------------------------------------------------------- texture synthesis

export interface TextureSet {
  size: number;
  /** RGBA, sRGB */
  color: Uint8ClampedArray;
  /** RGBA, roughness in G (three.js convention), metalness in B */
  roughness: Uint8ClampedArray;
  /** RGBA tangent-space normal map */
  normal: Uint8ClampedArray;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Height (0..1), colour mix (0..1), roughness offset and dirt for each texel. */
function sampler(p: Pattern) {
  const fbm = makeFbm(p.seed);
  const fbm2 = makeFbm(p.seed + 7);
  const cells = makeCells(p.seed + 3, 12);
  const big = makeCells(p.seed + 5, 5);
  const fine = makeCells(p.seed + 9, 72);
  return (u: number, v: number): { h: number; mix: number; rough: number; dirt: number } => {
    const grime = clamp01((fbm2(u, v, 3, 3) - 0.55) * 3) * p.wear;
    let h = 0.5;
    let mix = 0.5;
    let rough = 0.5;
    switch (p.kind) {
      case 'brushed': {
        const streak = fbm(u, v, 96, 2, 3);
        h = 0.5 + (streak - 0.5) * 0.15;
        mix = 0.55 + (streak - 0.5) * 0.5 + (fbm2(u, v, 4, 4) - 0.5) * 0.3;
        rough = streak * 0.6 + fbm2(u, v, 6, 6) * 0.4;
        break;
      }
      case 'damascus': {
        const w = fbm(u, v, 4, 4);
        const band = 0.5 + 0.5 * Math.sin((v * 14 + w * 4 + Math.sin(u * Math.PI * 2 * 2) * 0.6) * Math.PI * 2);
        const sharp = band > 0.5 ? 1 : 0;
        mix = sharp * 0.7 + band * 0.3;
        h = 0.5 + (mix - 0.5) * 0.08;
        rough = 1 - mix;
        break;
      }
      case 'blackened': {
        const n = fbm(u, v, 8, 8);
        mix = n * 0.7 + fbm2(u, v, 32, 32, 2) * 0.3;
        h = 0.5 + (fbm(u, v, 48, 48, 2) - 0.5) * 0.05;
        rough = 0.35 + mix * 0.65;
        break;
      }
      case 'hammered': {
        const c = big(u, v);
        h = 0.5 + Math.min(1, c) * 0.4 - 0.2;
        mix = 0.4 + c * 0.4 + (fbm(u, v, 16, 16) - 0.5) * 0.3;
        rough = 1 - mix;
        break;
      }
      case 'wood': {
        const warp = fbm(u, v, 3, 2) * 2.2;
        const ring = 0.5 + 0.5 * Math.sin((u * 9 + warp) * Math.PI * 2);
        const fibre = fbm2(u, v, 160, 3, 2);
        mix = ring * 0.55 + fibre * 0.45;
        h = 0.5 + (fibre - 0.5) * 0.5 - (1 - ring) * 0.1;
        rough = 0.6 + (1 - ring) * 0.4;
        break;
      }
      case 'leather': {
        const c = cells(u, v);
        const pebble = clamp01(c * 1.4);
        h = pebble * 0.7 + fbm(u, v, 48, 48, 2) * 0.3;
        mix = 0.35 + pebble * 0.4 + (fbm2(u, v, 5, 5) - 0.5) * 0.5;
        rough = 1 - pebble * 0.4;
        break;
      }
      case 'wrap': {
        // Diagonal cord wrap (like a tsuka-ito or paracord grip).
        const a = (u + v) * 18;
        const b = (u - v) * 18;
        const ca = 0.5 + 0.5 * Math.cos(a * Math.PI * 2);
        const cb = 0.5 + 0.5 * Math.cos(b * Math.PI * 2);
        const over = Math.floor(a) % 2 === 0 ? ca : cb;
        const weave = fbm(u, v, 128, 128, 1);
        h = over * 0.8 + weave * 0.2;
        mix = 0.3 + over * 0.6;
        rough = 0.7 + weave * 0.3;
        break;
      }
      case 'rubber': {
        // fine stippling (~1 mm dimples at the default 25 cm tile)
        const c = fine(u, v);
        const stipple = 1 - Math.min(1, c * 1.6);
        h = 0.35 + stipple * 0.45 + fbm(u, v, 64, 64, 2) * 0.2;
        mix = 0.4 + stipple * 0.2;
        rough = 0.8;
        break;
      }
      case 'polymer': {
        const n = fbm(u, v, 64, 64, 2);
        h = 0.5 + (n - 0.5) * 0.25;
        mix = 0.45 + (fbm2(u, v, 6, 6) - 0.5) * 0.4 + (n - 0.5) * 0.2;
        rough = 0.5 + n * 0.5;
        break;
      }
      case 'rust': {
        const n = fbm(u, v, 6, 6, 5);
        const rust = clamp01((0.58 - n) * 5);
        mix = 1 - rust;
        h = 0.5 + rust * 0.25 + (fbm2(u, v, 64, 64, 2) - 0.5) * 0.2 * rust;
        rough = 0.3 + rust * 0.7;
        break;
      }
    }
    return { h: clamp01(h), mix: clamp01(mix), rough: clamp01(rough), dirt: grime };
  };
}

/** Thin bright scratches (more with wear), rasterised with wrap-around so the texture tiles. */
function scratchMask(p: Pattern, size: number): Float32Array {
  const mask = new Float32Array(size * size);
  if (p.wear <= 0) return mask;
  const r = rng(p.seed + 99);
  const count = Math.round(8 + p.wear * 60);
  const k = Math.min(1, 0.4 + p.wear);
  for (let n = 0; n < count; n++) {
    const x = r.next() * size;
    const y = r.next() * size;
    const a = r.range(-0.5, 0.5) + (p.kind === 'brushed' ? Math.PI / 2 : r.range(0, Math.PI));
    const len = r.range(0.03, 0.18) * size;
    const w = r.range(0.4, 1.1);
    const steps = Math.ceil(len * 2);
    for (let t = 0; t <= steps; t++) {
      const px = x + Math.cos(a) * (len * t) / steps;
      const py = y + Math.sin(a) * (len * t) / steps;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const ix = Math.round(px) + ox;
          const iy = Math.round(py) + oy;
          const d = Math.hypot(ix - px, iy - py);
          if (d > w + 0.5) continue;
          const i = (((iy % size) + size) % size) * size + (((ix % size) + size) % size);
          mask[i] = Math.max(mask[i], (1 - d / (w + 0.5)) * k);
        }
    }
  }
  return mask;
}

/** Normal-map strength per pattern: fine finishes get subtle relief, cord wraps and leather get more. */
const BUMP: Record<Pattern['kind'], number> = { brushed: 1.2, damascus: 1.5, blackened: 0.8, hammered: 2.5, wood: 1.6, leather: 2.2, wrap: 3, rubber: 1.8, polymer: 0.6, rust: 2.5 };

export function synthesize(p: Pattern, size = 256): TextureSet {
  const sample = sampler(p);
  const N = size * size;
  const scratch = scratchMask(p, size);
  const height = new Float32Array(N);
  const color = new Uint8ClampedArray(N * 4);
  const roughness = new Uint8ClampedArray(N * 4);
  const normal = new Uint8ClampedArray(N * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const s = sample(x / size, y / size);
      const sc = scratch[i];
      if (sc > 0) {
        s.h = clamp01(s.h - sc * 0.15);
        s.mix = clamp01(s.mix + sc * 0.5);
        s.rough = clamp01(s.rough - sc * 0.3);
      }
      height[i] = s.h;
      const dirt = s.dirt * 0.55;
      for (let c = 0; c < 3; c++) color[i * 4 + c] = (p.dark[c] + (p.light[c] - p.dark[c]) * s.mix) * (1 - dirt) + 30 * dirt;
      color[i * 4 + 3] = 255;
      const rgh = p.rough[0] + (p.rough[1] - p.rough[0]) * s.rough + s.dirt * 0.3;
      roughness[i * 4] = 255;
      roughness[i * 4 + 1] = clamp01(rgh) * 255;
      roughness[i * 4 + 2] = 255;
      roughness[i * 4 + 3] = 255;
    }
  // Normal map from the height field (Sobel, wrapped so the texture still tiles).
  const strength = BUMP[p.kind];
  const H = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength;
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      normal[i] = (-dx / l * 0.5 + 0.5) * 255;
      normal[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      normal[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  return { size, color, roughness, normal };
}

/** Memoised texture sets by pattern (generation takes ~50–150 ms on a phone). */
const cache = new Map<string, TextureSet>();
export function texturesFor(p: Pattern, size = 256): TextureSet {
  const key = `${JSON.stringify(p)}|${size}`;
  let t = cache.get(key);
  if (!t) {
    t = synthesize(p, size);
    if (cache.size > 40) cache.clear();
    cache.set(key, t);
  }
  return t;
}

/** Encode RGBA pixels as PNG bytes (browser only). */
export async function encodePng(rgba: Uint8ClampedArray, size: number): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), size, size), 0, 0);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Falha ao gerar PNG');
  return blob.arrayBuffer();
}
