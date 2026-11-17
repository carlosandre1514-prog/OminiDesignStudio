import type { Field, Img } from '@/core/ai/vision';
import { estimateDepth, normalizeField, resizeField, resizeImage, segmentObject } from '@/core/ai/vision';
import type { Progress } from '@/core/ai/runtime';
import type { WeaponPart } from '@/modules/studio-3d/weapons/catalog';
import { buildRelief, distanceInside } from './relief';
import { foregroundMask } from './silhouette';

/**
 * Photo → textured 3D model, on device:
 * 1. object cut-out (U²-Netp AI, or transparency / plain-background segmentation without AI),
 * 2. per-pixel depth (Depth Anything V2 AI, or a shading heuristic without AI),
 * 3. watertight relief solid in real size, 4. the photo itself as the colour texture
 *    (colours bled past the outline) + a normal map computed from the depth for fine detail.
 */

export interface PhotoTexture {
  color: Img;
  normal: Img;
  /** Photo rectangle in model space (planarXY UVs: u = x + 0.5, v = y + 0.5). */
  frame: { x0: number; y0: number; w: number; h: number };
}

export interface Photo3DResult {
  part: WeaponPart;
  texture: PhotoTexture;
  usedAI: { segment: boolean; depth: boolean };
  notes: string[];
}

export interface Photo3DOptions {
  length: number;
  /** relief depth (fraction of length) */
  relief: number;
  useAI: boolean;
  onStage?: (text: string) => void;
  onProgress?: Progress;
}

/** Decode an image file to RGBA, longest side ≤ max. */
export async function decodeImage(file: Blob, max = 1024): Promise<Img> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(8, Math.round(bmp.width * s));
  const h = Math.max(8, Math.round(bmp.height * s));
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
}

const hasAlpha = (img: Img) => {
  let t = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 128) t++;
  return t > (img.data.length / 4) * 0.02;
};

/** Crop an image / field to a rectangle. */
export function cropImg(img: Img, x0: number, y0: number, w: number, h: number): Img {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + w) * 4), y * w * 4);
  return { width: w, height: h, data: out };
}
export function cropField(f: Field, x0: number, y0: number, w: number, h: number): Field {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) out.set(f.data.subarray((y0 + y) * f.width + x0, (y0 + y) * f.width + x0 + w), y * w);
  return { width: w, height: h, data: out };
}

/** Bounding box of mask > 0.5 with a margin (in pixels), clamped to the image. */
export function maskBox(m: Field, marginFrac = 0.03) {
  let x0 = m.width;
  let y0 = m.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++)
      if (m.data[y * m.width + x] > 0.5) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return null;
  const mg = Math.round(Math.max(x1 - x0, y1 - y0) * marginFrac) + 1;
  x0 = Math.max(0, x0 - mg);
  y0 = Math.max(0, y0 - mg);
  x1 = Math.min(m.width - 1, x1 + mg);
  y1 = Math.min(m.height - 1, y1 + mg);
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Push object colours outward past the outline so texture filtering never shows the background. */
export function bleedColors(img: Img, mask: Field, iterations = 12): Img {
  const { width: w, height: h } = img;
  const data = new Uint8ClampedArray(img.data);
  let known = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) known[i] = mask.data[i] > 0.5 ? 1 : 0;
  for (let it = 0; it < iterations; it++) {
    const next = known.slice();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (known[i]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h || !known[yy * w + xx]) continue;
          const j = (yy * w + xx) * 4;
          r += data[j];
          g += data[j + 1];
          b += data[j + 2];
          n++;
        }
        if (!n) continue;
        data[i * 4] = r / n;
        data[i * 4 + 1] = g / n;
        data[i * 4 + 2] = b / n;
        data[i * 4 + 3] = 255;
        next[i] = 1;
      }
    known = next;
  }
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width: w, height: h, data };
}

/** Tangent-space normal map from a depth field (detail that the mesh grid is too coarse for). */
export function normalFromDepth(d: Field, strength: number): Img {
  const { width: w, height: h } = d;
  const out = new Uint8ClampedArray(w * h * 4);
  const H = (x: number, y: number) => d.data[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength;
      const gy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength;
      const l = Math.hypot(gx, gy, 1);
      const o = (y * w + x) * 4;
      out[o] = (-gx / l * 0.5 + 0.5) * 255;
      out[o + 1] = (gy / l * 0.5 + 0.5) * 255;
      out[o + 2] = (1 / l * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  return { width: w, height: h, data: out };
}

/** Depth without AI: rounded body from the distance to the outline + a little shading from luminance. */
export function heuristicDepth(img: Img, mask: Field): Field {
  const { width: w, height: h } = img;
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inside[i] = mask.data[i] > 0.5 ? 1 : 0;
  const dist = distanceInside(inside, w, h);
  let max = 1;
  for (const v of dist) if (v < 1e8) max = Math.max(max, v);
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const lum = (img.data[i * 4] * 0.3 + img.data[i * 4 + 1] * 0.59 + img.data[i * 4 + 2] * 0.11) / 255;
    out[i] = inside[i] ? Math.sqrt(Math.min(1, dist[i] / max)) * 0.7 + lum * 0.3 : 0;
  }
  return { width: w, height: h, data: out };
}

export async function photoTo3D(file: Blob, opts: Photo3DOptions): Promise<Photo3DResult> {
  const stage = opts.onStage ?? (() => undefined);
  const notes: string[] = [];
  stage('Lendo foto…');
  const img = await decodeImage(file, 1024);

  // ---- 1. cut-out
  let mask: Field | null = null;
  let segAI = false;
  if (hasAlpha(img)) {
    const m = foregroundMask(img);
    mask = { width: img.width, height: img.height, data: Float32Array.from(m.mask) };
    notes.push('Recorte: transparência do PNG');
  } else if (opts.useAI) {
    try {
      stage('IA: recortando o objeto…');
      mask = await segmentObject(img, opts.onProgress);
      segAI = true;
      notes.push('Recorte: IA (U²-Netp)');
    } catch (e) {
      notes.push(`IA de recorte indisponível (${e instanceof Error ? e.message : e}); usei a cor de fundo`);
    }
  }
  if (!mask) {
    const small = Math.min(1, 400 / Math.max(img.width, img.height));
    const si = resizeImage(img, Math.round(img.width * small), Math.round(img.height * small));
    const m = foregroundMask(si);
    mask = resizeField({ width: si.width, height: si.height, data: Float32Array.from(m.mask) }, img.width, img.height);
    if (!notes.length) notes.push('Recorte: cor de fundo');
  }
  const box = maskBox(mask);
  if (!box) throw new Error('Não encontrei um objeto na foto. Use uma foto de lado com fundo liso.');
  const crop = cropImg(img, box.x0, box.y0, box.w, box.h);
  const cmask = cropField(mask, box.x0, box.y0, box.w, box.h);

  // ---- 2. depth
  let depth: Field | null = null;
  let depthAI = false;
  if (opts.useAI) {
    try {
      stage('IA: estimando profundidade…');
      depth = await estimateDepth(crop, opts.onProgress);
      depthAI = true;
      notes.push('Profundidade: IA (Depth Anything V2)');
    } catch (e) {
      notes.push(`IA de profundidade indisponível (${e instanceof Error ? e.message : e}); usei estimativa simples`);
    }
  }
  if (!depth) {
    depth = heuristicDepth(crop, cmask);
    if (!depthAI) notes.push('Profundidade: estimativa sem IA');
  }
  const dn = normalizeField(depth, 0.02, 0.98, cmask.data);

  // ---- 3. mesh
  stage('Gerando malha 3D…');
  await new Promise((r) => setTimeout(r, 0));
  const relief = buildRelief(cmask, dn, { length: opts.length, relief: opts.relief, grid: 170 });
  notes.push(`${relief.cells.toLocaleString('pt-BR')} células · ${relief.mesh.f.length.toLocaleString('pt-BR')} faces`);

  // ---- 4. textures
  stage('Gerando texturas…');
  const color = bleedColors(crop, cmask, 16);
  const normal = normalFromDepth(dn, (crop.width / 256) * 1.2);
  return {
    part: { name: 'Modelo da foto', slot: 'photo', mesh: relief.mesh, shading: 'smooth', uv: 'planarXY' },
    texture: { color, normal, frame: relief.frame },
    usedAI: { segment: segAI, depth: depthAI },
    notes,
  };
}
