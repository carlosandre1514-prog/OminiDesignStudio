import { getAssetBlob } from '@/core/assets/assetService';
import { evaluate, type Bitmap, type BitmapSet, type TextureMaps } from './compose';
import { applyCoverage, brushAlpha, type BrushSettings } from './paint3d';
import { getTarget } from './target';
import type { Layer, TextMask, TextureDoc } from './types';

/**
 * Main-thread side of the engine: decodes bitmaps (painted masks, text, library images)
 * and runs the evaluation in a Web Worker (falls back to the main thread when workers are unavailable).
 */

export const PAINT_RES = 1024;
const TEXT_RES = 1024;

// ---------------------------------------------------------------- painted masks (live canvases)

const paintCanvases = new Map<string, { canvas: HTMLCanvasElement; src: string | undefined; ready: Promise<void> }>();

/** Canvas holding the painted mask of a layer; reloaded when the stored PNG changes (undo/redo/sync). */
export function paintCanvas(layer: Layer): { canvas: HTMLCanvasElement; ready: Promise<void> } {
  const src = layer.mask.paint;
  const hit = paintCanvases.get(layer.id);
  if (hit && hit.src === src) return hit;
  const canvas = hit?.canvas ?? Object.assign(document.createElement('canvas'), { width: PAINT_RES, height: PAINT_RES });
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, PAINT_RES, PAINT_RES);
  const ready = src
    ? new Promise<void>((res) => {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, PAINT_RES, PAINT_RES);
          ctx.drawImage(img, 0, 0, PAINT_RES, PAINT_RES);
          res();
        };
        img.onerror = () => res();
        img.src = src;
      })
    : Promise.resolve();
  const entry = { canvas, src, ready };
  paintCanvases.set(layer.id, entry);
  return entry;
}

/** Mark a canvas as already containing `src` (after a stroke is committed) to avoid a reload. */
export function syncPaintSource(layerId: string, src: string) {
  const hit = paintCanvases.get(layerId);
  if (hit) hit.src = src;
}

/** Stamp the brush tip at UV (wraps around the edges so painting stays seamless). */
export function dab(canvas: HTMLCanvasElement, u: number, v: number, brush: BrushSettings, dabIndex = 0) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const r = Math.max(1, brush.size * PAINT_RES * 0.5);
  const ns = 40 / r;
  for (const ox of [-1, 0, 1])
    for (const oy of [-1, 0, 1]) {
      const cx = (u + ox) * PAINT_RES;
      const cy = (v + oy) * PAINT_RES;
      const x0 = Math.max(0, Math.floor(cx - r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const x1 = Math.min(PAINT_RES, Math.ceil(cx + r));
      const y1 = Math.min(PAINT_RES, Math.ceil(cy + r));
      if (x1 <= x0 || y1 <= y0) continue;
      const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
      const w = x1 - x0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const cov = brushAlpha(brush, (x + 0.5 - cx) / r, (y + 0.5 - cy) / r, (x - ox * PAINT_RES) * ns, (y - oy * PAINT_RES) * ns, 0, dabIndex);
          applyCoverage(img.data, (y - y0) * w + (x - x0), cov, brush);
        }
      ctx.putImageData(img, x0, y0);
    }
}

// ---------------------------------------------------------------- text & images

export function renderText(t: TextMask): Bitmap {
  const c = Object.assign(document.createElement('canvas'), { width: TEXT_RES, height: TEXT_RES });
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, TEXT_RES, TEXT_RES);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = Math.max(1, Math.round(t.repeat));
  const px = (t.size * TEXT_RES) / n;
  ctx.font = `${t.bold ? 'bold ' : ''}${Math.max(4, px)}px ${t.font}, sans-serif`;
  const lines = t.text.split('\n');
  for (let gy = 0; gy < n; gy++)
    for (let gx = 0; gx < n; gx++)
      for (const ox of [-1, 0, 1])
        for (const oy of [-1, 0, 1]) {
          ctx.save();
          ctx.translate(((gx + t.x) / n + ox) * TEXT_RES, ((gy + t.y) / n + oy) * TEXT_RES);
          ctx.rotate((t.rotation * Math.PI) / 180);
          lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * px * 1.15));
          ctx.restore();
        }
  const d = ctx.getImageData(0, 0, TEXT_RES, TEXT_RES);
  return { width: TEXT_RES, height: TEXT_RES, data: d.data };
}

const imageCache = new Map<string, Promise<Bitmap | undefined>>();
export function assetBitmap(id: string): Promise<Bitmap | undefined> {
  let p = imageCache.get(id);
  if (!p) {
    p = (async () => {
      const blob = await getAssetBlob(id);
      if (!blob) return undefined;
      const bmp = await createImageBitmap(blob);
      const s = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * s));
      const h = Math.max(1, Math.round(bmp.height * s));
      const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0, w, h);
      return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
    })();
    imageCache.set(id, p);
  }
  return p;
}

const textCache = new Map<string, Bitmap>();

/** Collect every bitmap the stack needs. */
export async function resolveBitmaps(doc: TextureDoc): Promise<BitmapSet> {
  const out: BitmapSet = {};
  if (doc.target && doc.previewShape === 'model') {
    // geometry-aware masks (edge wear, cavities) and padding around the UV charts
    const t = await getTarget(doc.target).catch(() => null);
    if (t) out['mesh:curv'] = t.bake.curvature;
  }
  for (const l of doc.layers) {
    if (!l.visible) continue;
    if (l.mask.kind === 'paint') {
      const p = paintCanvas(l);
      await p.ready;
      const d = p.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, PAINT_RES, PAINT_RES);
      out[`mask:${l.id}`] = { width: PAINT_RES, height: PAINT_RES, data: d.data };
    } else if (l.mask.kind === 'text' && l.mask.text) {
      const key = JSON.stringify(l.mask.text);
      let b = textCache.get(key);
      if (!b) {
        b = renderText(l.mask.text);
        if (textCache.size > 30) textCache.clear();
        textCache.set(key, b);
      }
      out[`mask:${l.id}`] = b;
    } else if (l.mask.kind === 'image' && l.mask.imageId) out[`mask:${l.id}`] = await assetBitmap(l.mask.imageId);
    if (l.content.imageId) out[`color:${l.id}`] = await assetBitmap(l.content.imageId);
    if (l.content.heightImageId) out[`height:${l.id}`] = await assetBitmap(l.content.heightImageId);
  }
  return out;
}

// ---------------------------------------------------------------- worker

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (m: TextureMaps) => void; reject: (e: Error) => void; progress?: (p: number) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; maps?: TextureMaps; progress?: number; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      if (e.data.progress !== undefined && !e.data.maps) return p.progress?.(e.data.progress);
      pending.delete(e.data.id);
      if (e.data.maps) p.resolve(e.data.maps);
      else p.reject(new Error(e.data.error ?? 'Falha ao gerar a textura'));
    };
    worker.onerror = () => {
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

/** Evaluate a document at a resolution (latest call wins for previews: older ones are dropped). */
export async function render(doc: TextureDoc, size: number, onProgress?: (p: number) => void): Promise<TextureMaps> {
  const bitmaps = await resolveBitmaps(doc);
  const w = getWorker();
  if (!w) return evaluate(doc, size, bitmaps, onProgress);
  const id = ++seq;
  return new Promise<TextureMaps>((resolve, reject) => {
    pending.set(id, { resolve, reject, progress: onProgress });
    w.postMessage({ id, doc, size, bitmaps });
  });
}
