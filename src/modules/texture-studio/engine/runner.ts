import { getAssetBlob } from '@/core/assets/assetService';
import { evaluate, type Bitmap, type BitmapSet, type TextureMaps } from './compose';
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

/** Stamp a soft round brush at UV (wraps around the edges so painting stays seamless). */
export function dab(canvas: HTMLCanvasElement, u: number, v: number, brush: { size: number; hardness: number; opacity: number; erase: boolean }) {
  const ctx = canvas.getContext('2d')!;
  const r = Math.max(1, brush.size * PAINT_RES * 0.5);
  for (const ox of [-1, 0, 1])
    for (const oy of [-1, 0, 1]) {
      const x = (u + ox) * PAINT_RES;
      const y = (v + oy) * PAINT_RES;
      if (x < -r || y < -r || x > PAINT_RES + r || y > PAINT_RES + r) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${brush.opacity})`);
      g.addColorStop(Math.min(0.99, brush.hardness), `rgba(255,255,255,${brush.opacity})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = brush.erase ? 'destination-out' : 'source-over';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.globalCompositeOperation = 'source-over';
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
