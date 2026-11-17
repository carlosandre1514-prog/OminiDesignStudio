import { getOrt, runModel, type Progress } from './runtime';

/** RGBA image (ImageData-compatible). */
export interface Img {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** Scalar field (mask, depth) at a resolution. */
export interface Field {
  width: number;
  height: number;
  data: Float32Array;
}

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/** Bilinear resample of an RGBA image. */
export function resizeImage(src: Img, w: number, h: number): Img {
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = src.width / w;
  const sy = src.height / h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5);
      const fy = Math.max(0, (y + 0.5) * sy - 0.5);
      const x0 = Math.min(src.width - 1, Math.floor(fx));
      const y0 = Math.min(src.height - 1, Math.floor(fy));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const y1 = Math.min(src.height - 1, y0 + 1);
      const ax = fx - x0;
      const ay = fy - y0;
      for (let c = 0; c < 4; c++) {
        const a = src.data[(y0 * src.width + x0) * 4 + c] * (1 - ax) + src.data[(y0 * src.width + x1) * 4 + c] * ax;
        const b = src.data[(y1 * src.width + x0) * 4 + c] * (1 - ax) + src.data[(y1 * src.width + x1) * 4 + c] * ax;
        out[(y * w + x) * 4 + c] = a * (1 - ay) + b * ay;
      }
    }
  return { width: w, height: h, data: out };
}

/** Bilinear resample of a scalar field. */
export function resizeField(src: Field, w: number, h: number): Field {
  const out = new Float32Array(w * h);
  const sx = src.width / w;
  const sy = src.height / h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5);
      const fy = Math.max(0, (y + 0.5) * sy - 0.5);
      const x0 = Math.min(src.width - 1, Math.floor(fx));
      const y0 = Math.min(src.height - 1, Math.floor(fy));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const y1 = Math.min(src.height - 1, y0 + 1);
      const ax = fx - x0;
      const ay = fy - y0;
      const a = src.data[y0 * src.width + x0] * (1 - ax) + src.data[y0 * src.width + x1] * ax;
      const b = src.data[y1 * src.width + x0] * (1 - ax) + src.data[y1 * src.width + x1] * ax;
      out[y * w + x] = a * (1 - ay) + b * ay;
    }
  return { width: w, height: h, data: out };
}

/**
 * Image → normalised CHW float tensor data (ImageNet mean/std), resized to (w, h) and padded
 * with zeros to (padW, padH) on the right/bottom.
 */
export function toCHW(img: Img, w: number, h: number, padW = w, padH = h): Float32Array {
  const r = resizeImage(img, w, h);
  const out = new Float32Array(3 * padW * padH);
  const plane = padW * padH;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = r.data[i + 3] / 255;
      for (let c = 0; c < 3; c++) {
        // transparent pixels become white (typical product shot background)
        const v = (r.data[i + c] / 255) * a + (1 - a);
        out[c * plane + y * padW + x] = (v - MEAN[c]) / STD[c];
      }
    }
  return out;
}

/** Normalise to [0,1] with robust percentiles. */
export function normalizeField(f: Field, lo = 0.01, hi = 0.99, mask?: Float32Array): Field {
  const vals: number[] = [];
  for (let i = 0; i < f.data.length; i++) if (!mask || mask[i] > 0.5) vals.push(f.data[i]);
  if (!vals.length) return { ...f, data: new Float32Array(f.data.length) };
  vals.sort((a, b) => a - b);
  const a = vals[Math.floor((vals.length - 1) * lo)];
  const b = vals[Math.floor((vals.length - 1) * hi)];
  const span = b - a || 1;
  const out = new Float32Array(f.data.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, (f.data[i] - a) / span));
  return { ...f, data: out };
}

// ---------------------------------------------------------------- models

/** Foreground probability (0..1) for each pixel: U²-Netp salient object segmentation. */
export async function segmentObject(img: Img, onProgress?: Progress): Promise<Field> {
  const { ort } = await getOrt();
  const S = 320;
  const scale = S / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const input = new ort.Tensor('float32', toCHW(img, w, h, S, S), [1, 3, S, S]);
  const { session, out } = await runModel('segment', (ss) => ({ [ss.inputNames[0]]: input }), onProgress);
  const data = Float32Array.from(out[session.outputNames[0]].data as ArrayLike<number>);
  // crop the padding, normalise, back to image size
  const crop = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) crop[y * w + x] = data[y * S + x];
  const n = normalizeField({ width: w, height: h, data: crop }, 0, 1);
  return resizeField(n, img.width, img.height);
}

/** Relative depth (0 far … 1 near) for each pixel: Depth Anything V2. */
export async function estimateDepth(img: Img, onProgress?: Progress, longSide = 518): Promise<Field> {
  const { ort } = await getOrt();
  const scale = longSide / Math.max(img.width, img.height);
  const m14 = (v: number) => Math.max(14, Math.round((v * scale) / 14) * 14);
  const w = m14(img.width);
  const h = m14(img.height);
  const input = new ort.Tensor('float32', toCHW(img, w, h), [1, 3, h, w]);
  const { session, out } = await runModel('depth', (ss) => ({ [ss.inputNames[0]]: input }), onProgress);
  const t = out[session.outputNames[0]];
  const dims = t.dims;
  const ow = dims[dims.length - 1];
  const oh = dims[dims.length - 2];
  const raw = { width: ow, height: oh, data: Float32Array.from(t.data as ArrayLike<number>) };
  return resizeField(raw, img.width, img.height);
}
