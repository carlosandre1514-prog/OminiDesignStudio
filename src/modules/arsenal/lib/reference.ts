import type { Field, Img } from '@/core/ai/vision';
import { segmentObject } from '@/core/ai/vision';
import type { Progress } from '@/core/ai/runtime';
import type { Params, WeaponPart, WeaponType } from '@/modules/studio-3d/weapons/catalog';
import { buildWeapon, defaultParams } from '@/modules/studio-3d/weapons/catalog';
import type { Finish } from '@/modules/studio-3d/weapons/textures';
import { decodeImage } from './photo3d';
import { foregroundMask } from './silhouette';

/**
 * Reference image → faithful procedural weapon. The photo is cut out (AI on device, or plain
 * background), straightened (principal axis + barrel line) and turned muzzle-right; then the
 * weapon type and its parameters (barrel, handguard, stock, optic, magazine…) are searched so
 * that the model's side silhouette matches the photo's. The coating colour comes from the photo.
 */

/** Binary silhouette, muzzle to the right, normalised to SIL_W columns. */
export interface Silhouette {
  w: number;
  h: number;
  data: Uint8Array;
}

export const SIL_W = 220;

export interface Reference {
  sil: Silhouette;
  /** Straightened cut-out (for the comparison view), RGBA. */
  image: Img;
  /** Average colour of the weapon (sRGB 0..255). */
  color: [number, number, number];
  notes: string[];
}

// ---------------------------------------------------------------- image side

function hasAlpha(img: Img) {
  for (let i = 3; i < img.data.length; i += 4 * 7) if (img.data[i] < 250) return true;
  return false;
}

/** Bilinear sample of an RGBA image (outside = transparent). */
function sampleImg(img: Img, x: number, y: number, out: number[]) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  for (let c = 0; c < 4; c++) out[c] = 0;
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]] as const) {
    const xx = x0 + dx;
    const yy = y0 + dy;
    if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
    const i = (yy * img.width + xx) * 4;
    for (let c = 0; c < 4; c++) out[c] += img.data[i + c] * w;
  }
  return out;
}

/** Principal axis angle of the mask pixels. */
function principalAngle(m: Field): number {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++)
      if (m.data[y * m.width + x] > 0.5) {
        n++;
        sx += x;
        sy += y;
      }
  if (!n) return 0;
  const cx = sx / n;
  const cy = sy / n;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++)
      if (m.data[y * m.width + x] > 0.5) {
        xx += (x - cx) ** 2;
        yy += (y - cy) ** 2;
        xy += (x - cx) * (y - cy);
      }
  return 0.5 * Math.atan2(2 * xy, xx - yy);
}

/** Rotate image+mask by -angle around the centre, flip as asked, crop to the object. */
function straighten(img: Img, m: Field, angle: number, flipX: boolean, flipY: boolean): { img: Img; mask: Uint8Array } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const W = img.width;
  const H = img.height;
  const cx = W / 2;
  const cy = H / 2;
  const D = Math.ceil(Math.hypot(W, H));
  // pass 1: rotated mask on a D×D canvas, find its box
  const rm = new Uint8Array(D * D);
  let x0 = D;
  let y0 = D;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < D; y++)
    for (let x = 0; x < D; x++) {
      const u = (flipX ? D - 1 - x : x) - D / 2;
      const v = (flipY ? D - 1 - y : y) - D / 2;
      const sx = Math.round(cx + u * cos - v * sin);
      const sy = Math.round(cy + u * sin + v * cos);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H || m.data[sy * W + sx] <= 0.5) continue;
      rm[y * D + x] = 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  const w = Math.max(1, x1 - x0 + 1);
  const h = Math.max(1, y1 - y0 + 1);
  const out: Img = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  const mask = new Uint8Array(w * h);
  const px = [0, 0, 0, 0];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const X = x + x0;
      const Y = y + y0;
      if (!rm[Y * D + X]) continue;
      mask[y * w + x] = 1;
      const u = (flipX ? D - 1 - X : X) - D / 2;
      const v = (flipY ? D - 1 - Y : Y) - D / 2;
      sampleImg(img, cx + u * cos - v * sin, cy + u * sin + v * cos, px);
      const o = (y * w + x) * 4;
      out.data[o] = px[0];
      out.data[o + 1] = px[1];
      out.data[o + 2] = px[2];
      out.data[o + 3] = 255;
    }
  return { img: out, mask };
}

/**
 * Clean a cut-out: closing (fills speckles where highlights looked like background) and small
 * enclosed holes filled; real openings (trigger guard, stock slots) are bigger and stay.
 */
export function cleanMask(mask: Uint8Array, w: number, h: number): Uint8Array {
  const r = Math.max(1, Math.round(Math.max(w, h) / 400));
  const dil = (src: Uint8Array, v: number) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let hit = false;
        for (let dy = -r; dy <= r && !hit; dy++)
          for (let dx = -r; dx <= r && !hit; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < w && yy < h && src[yy * w + xx] === v) hit = true;
          }
        out[y * w + x] = v === 1 ? (hit ? 1 : 0) : hit ? 0 : 1;
      }
    return out;
  };
  const closed = dil(dil(mask, 1), 0);
  // enclosed background components
  const seen = new Uint8Array(w * h);
  let area = 0;
  for (let i = 0; i < closed.length; i++) area += closed[i];
  const limit = area * 0.002;
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (closed[i] || seen[i]) continue;
    const comp: number[] = [];
    let border = false;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      comp.push(j);
      const x = j % w;
      const y = (j - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1])
        if (k >= 0 && !closed[k] && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
    }
    if (!border && comp.length < limit) for (const j of comp) closed[j] = 1;
  }
  return closed;
}

/** Per-column top/bottom of a mask. */
function columns(mask: Uint8Array, w: number, h: number) {
  const top = new Float32Array(w).fill(NaN);
  const bot = new Float32Array(w).fill(NaN);
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++)
      if (mask[y * w + x]) {
        if (Number.isNaN(top[x])) top[x] = y;
        bot[x] = y;
      }
  return { top, bot };
}

/** Line fit (least squares) of the column centre over a range: slope in px/px. */
function centreSlope(top: Float32Array, bot: Float32Array, a: number, b: number) {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let x = a; x < b; x++) {
    if (Number.isNaN(top[x])) continue;
    const y = (top[x] + bot[x]) / 2;
    n++;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  return n > 2 ? (n * sxy - sx * sy) / (n * sxx - sx * sx || 1) : 0;
}

const mean = (a: Float32Array, i0: number, i1: number) => {
  let s = 0;
  let n = 0;
  for (let i = i0; i < i1; i++)
    if (!Number.isNaN(a[i])) {
      s += a[i];
      n++;
    }
  return n ? s / n : 0;
};

/** Resample a mask to SIL_W columns, keeping the aspect ratio. */
export function toSilhouette(mask: Uint8Array, w: number, h: number): Silhouette {
  const s = SIL_W / w;
  const H = Math.max(4, Math.round(h * s));
  const data = new Uint8Array(SIL_W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < SIL_W; x++) {
      const sx = Math.min(w - 1, Math.floor((x + 0.5) / s));
      const sy = Math.min(h - 1, Math.floor((y + 0.5) / s));
      data[y * SIL_W + x] = mask[sy * w + sx];
    }
  return { w: SIL_W, h: H, data };
}

export async function readReference(file: Blob, opts: { useAI: boolean; onStage?: (t: string) => void; onProgress?: Progress }): Promise<Reference> {
  const stage = opts.onStage ?? (() => undefined);
  const notes: string[] = [];
  stage('Lendo imagem de referência…');
  const img = await decodeImage(file, 768);
  let mask: Field | null = null;
  if (hasAlpha(img)) {
    const m = foregroundMask(img);
    mask = { width: img.width, height: img.height, data: Float32Array.from(m.mask) };
    notes.push('Recorte: transparência');
  } else if (opts.useAI) {
    try {
      stage('IA: recortando a arma…');
      mask = await segmentObject(img, opts.onProgress);
      notes.push('Recorte: IA no aparelho');
    } catch {
      notes.push('IA indisponível: recorte pela cor de fundo');
    }
  }
  if (!mask) {
    const m = foregroundMask(img);
    mask = { width: img.width, height: img.height, data: Float32Array.from(m.mask) };
    if (!notes.length) notes.push('Recorte: cor de fundo');
  }
  stage('Endireitando a arma…');
  // 1. principal axis → horizontal
  let angle = principalAngle(mask);
  let r = straighten(img, mask, angle, false, false);
  // 2. refine with the barrel line (the thinnest end is the muzzle side)
  let { top, bot } = columns(r.mask, r.img.width, r.img.height);
  const W = r.img.width;
  const thick = (a: number, b: number) => {
    let s = 0;
    let n = 0;
    for (let x = a; x < b; x++)
      if (!Number.isNaN(top[x])) {
        s += bot[x] - top[x];
        n++;
      }
    return n ? s / n : Infinity;
  };
  const muzzleLeft = thick(0, Math.round(W * 0.15)) < thick(Math.round(W * 0.85), W);
  // only the barrel itself (last ~12 %): front sights and handguards would bias the line
  const a0 = muzzleLeft ? Math.round(W * 0.01) : Math.round(W * 0.87);
  const a1 = muzzleLeft ? Math.round(W * 0.13) : Math.round(W * 0.99);
  angle += Math.atan(centreSlope(top, bot, a0, a1));
  r = straighten(img, mask, angle, muzzleLeft, false);
  ({ top, bot } = columns(r.mask, r.img.width, r.img.height));
  // 3. upside down? The top line (rail/receiver) is straighter than the bottom (grip, magazine, stock).
  const w2 = r.img.width;
  const i0 = Math.round(w2 * 0.2);
  const i1 = Math.round(w2 * 0.8);
  const spread = (a: Float32Array) => {
    const m = mean(a, i0, i1);
    let s = 0;
    let n = 0;
    for (let i = i0; i < i1; i++)
      if (!Number.isNaN(a[i])) {
        s += (a[i] - m) ** 2;
        n++;
      }
    return n ? Math.sqrt(s / n) : 0;
  };
  if (spread(top) > spread(bot) * 1.15) r = straighten(img, mask, angle, muzzleLeft, true);
  r.mask = cleanMask(r.mask, r.img.width, r.img.height);
  notes.push(`Arma endireitada (${Math.round((angle * 180) / Math.PI)}°)`);

  // average colour (ignore specular highlights)
  let cr = 0;
  let cg = 0;
  let cb = 0;
  let n = 0;
  for (let i = 0; i < r.mask.length; i++) {
    if (!r.mask[i]) continue;
    const o = i * 4;
    const l = r.img.data[o] + r.img.data[o + 1] + r.img.data[o + 2];
    if (l > 600) continue;
    cr += r.img.data[o];
    cg += r.img.data[o + 1];
    cb += r.img.data[o + 2];
    n++;
  }
  const color: [number, number, number] = n ? [cr / n, cg / n, cb / n] : [40, 40, 40];
  return { sil: toSilhouette(r.mask, r.img.width, r.img.height), image: r.img, color, notes };
}

// ---------------------------------------------------------------- model side

/** Side silhouette of weapon parts (projection on XY), muzzle right. */
export function modelSilhouette(parts: WeaponPart[]): Silhouette {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of parts)
    for (let i = 0; i < p.mesh.v.length; i += 3) {
      x0 = Math.min(x0, p.mesh.v[i]);
      x1 = Math.max(x1, p.mesh.v[i]);
      y0 = Math.min(y0, p.mesh.v[i + 1]);
      y1 = Math.max(y1, p.mesh.v[i + 1]);
    }
  const s = SIL_W / Math.max(1e-6, x1 - x0);
  const H = Math.max(4, Math.round((y1 - y0) * s));
  const data = new Uint8Array(SIL_W * H);
  const X = (x: number) => (x - x0) * s;
  const Y = (y: number) => (y1 - y) * s;
  for (const p of parts) {
    const v = p.mesh.v;
    for (const f of p.mesh.f)
      for (let k = 1; k < f.length - 1; k++) {
        const ax = X(v[f[0] * 3]);
        const ay = Y(v[f[0] * 3 + 1]);
        const bx = X(v[f[k] * 3]);
        const by = Y(v[f[k] * 3 + 1]);
        const cx = X(v[f[k + 1] * 3]);
        const cy = Y(v[f[k + 1] * 3 + 1]);
        const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        if (Math.abs(area) < 1e-9) continue;
        const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
        const maxX = Math.min(SIL_W - 1, Math.ceil(Math.max(ax, bx, cx)));
        const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
        const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
        for (let y = minY; y <= maxY; y++)
          for (let x = minX; x <= maxX; x++) {
            const px = x + 0.5;
            const py = y + 0.5;
            const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
            const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
            if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) data[y * SIL_W + x] = 1;
          }
      }
  }
  return { w: SIL_W, h: H, data };
}

/** Per-column top/bottom rows of a silhouette (NaN = empty column). */
function profile(sil: Silhouette) {
  const top = new Float32Array(SIL_W).fill(NaN);
  const bot = new Float32Array(SIL_W).fill(NaN);
  for (let x = 0; x < SIL_W; x++)
    for (let y = 0; y < sil.h; y++)
      if (sil.data[y * SIL_W + x]) {
        if (Number.isNaN(top[x])) top[x] = y;
        bot[x] = y;
      }
  return { top, bot };
}

/**
 * Similarity of two silhouettes, best vertical alignment. Both are length-normalised (same width).
 * Half area overlap (IoU: proportions, mass of each part), half contour agreement (top and bottom
 * profile column by column: sights, rails, stock steps, magazine and grip shapes).
 */
export function similarity(a: Silhouette, b: Silhouette): number {
  let best = 0;
  const range = Math.max(4, Math.round(Math.abs(a.h - b.h) / 2) + 6);
  const base = Math.round((a.h - b.h) / 2);
  const pa = profile(a);
  const pb = profile(b);
  const H = Math.max(a.h, b.h);
  for (let dy = base - range; dy <= base + range; dy += 2) {
    let inter = 0;
    let uni = 0;
    for (let y = Math.min(0, dy); y < Math.max(a.h, b.h + dy); y++)
      for (let x = 0; x < SIL_W; x++) {
        const va = y >= 0 && y < a.h ? a.data[y * SIL_W + x] : 0;
        const yb = y - dy;
        const vb = yb >= 0 && yb < b.h ? b.data[yb * SIL_W + x] : 0;
        if (va && vb) inter++;
        if (va || vb) uni++;
      }
    const iou = uni ? inter / uni : 0;
    let err = 0;
    for (let x = 0; x < SIL_W; x++) {
      const ta = pa.top[x];
      const tb = pb.top[x] + dy;
      if (Number.isNaN(ta) !== Number.isNaN(pb.top[x])) {
        err += 0.25;
        continue;
      }
      if (Number.isNaN(ta)) continue;
      err += Math.min(0.25, (Math.abs(ta - tb) + Math.abs(pa.bot[x] - (pb.bot[x] + dy))) / H);
    }
    const contour = 1 - (err / SIL_W) * 4;
    const sc = iou * 0.5 + Math.max(0, contour) * 0.5;
    if (sc > best) best = sc;
  }
  return best;
}

// ---------------------------------------------------------------- fitting

export interface FitResult {
  weapon: WeaponType;
  params: Params;
  score: number;
  notes: string[];
}

const frame = () => new Promise((r) => setTimeout(r, 0));

/**
 * Search the weapon type (unless fixed by the prompt) and its parameters to match the reference.
 * Parameters named in the prompt stay as written.
 */
export async function fitReference(
  ref: Silhouette,
  candidates: WeaponType[],
  start: { weapon?: WeaponType; params?: Params; locked?: string[] },
  onProgress?: (text: string) => void,
): Promise<FitResult> {
  const score = (w: WeaponType, p: Params) => similarity(ref, modelSilhouette(buildWeapon(w, p, 1, 'normal')));
  // 1. type
  let weapon = start.weapon;
  if (!weapon) {
    // rank by the default configuration, then give the 3 best a quick fit of their options
    const ranked: [number, WeaponType][] = [];
    for (const w of candidates) {
      onProgress?.(`Comparando com: ${w.name}…`);
      await frame();
      ranked.push([score(w, defaultParams(w)), w]);
    }
    ranked.sort((a, b) => b[0] - a[0]);
    let best = -1;
    for (const [s0, w] of ranked.slice(0, 3)) {
      onProgress?.(`Testando: ${w.name}…`);
      await frame();
      let s = s0;
      let p = defaultParams(w);
      for (const c of w.choices)
        for (const o of c.options) {
          if (o.id === p[c.key]) continue;
          const q = { ...p, [c.key]: o.id };
          const sq = score(w, q);
          if (sq > s) [s, p] = [sq, q];
        }
      if (s > best) [best, weapon] = [s, w];
    }
  }
  const w = weapon!;
  const locked = new Set(start.locked ?? []);
  let params: Params = { ...defaultParams(w), ...(start.weapon === w ? start.params : {}) };
  // objective: similarity with a small preference for the real-world defaults (photos have perspective)
  const def = defaultParams(w);
  const obj = (p: Params) => score(w, p) - w.nums.reduce((a, nd) => a + (0.01 * Math.abs(Number(p[nd.key]) - Number(def[nd.key]))) / (nd.max - nd.min || 1), 0);
  let cur = obj(params);
  // 2. coordinate descent: choices, then numbers (coarse grid, then fine)
  for (let pass = 0; pass < 3; pass++) {
    for (const c of w.choices) {
      if (locked.has(c.key)) continue;
      onProgress?.(`Ajustando: ${c.label}…`);
      await frame();
      for (const o of c.options) {
        if (o.id === params[c.key]) continue;
        const p = { ...params, [c.key]: o.id };
        const s = obj(p);
        if (s > cur + 0.004) [cur, params] = [s, p];
      }
    }
    for (const nd of w.nums) {
      if (locked.has(nd.key)) continue;
      onProgress?.(`Ajustando: ${nd.label}…`);
      await frame();
      const steps = pass === 0 ? 6 : 4;
      const span = pass === 0 ? nd.max - nd.min : (nd.max - nd.min) / 6;
      const c0 = Number(params[nd.key]);
      for (let i = 0; i <= steps; i++) {
        const raw = pass === 0 ? nd.min + (span * i) / steps : c0 - span / 2 + (span * i) / steps;
        const v = Math.min(nd.max, Math.max(nd.min, Math.round(raw / nd.step) * nd.step));
        if (v === Number(params[nd.key])) continue;
        const p = { ...params, [nd.key]: v };
        const s = obj(p);
        if (s > cur + 0.002) [cur, params] = [s, p];
      }
    }
  }
  const final = score(w, params);
  return { weapon: w, params, score: final, notes: [`Semelhança com a referência: ${Math.round(final * 100)}%`] };
}

/** Coating guessed from the photo's average colour. */
export function finishFromColor([r, g, b]: [number, number, number]): Partial<Finish> {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const sat = max ? (max - min) / max : 0;
  const hue = max === min ? 0 : max === r ? ((g - b) / (max - min) + 6) % 6 * 60 : max === g ? ((b - r) / (max - min) + 2) * 60 : ((r - g) / (max - min) + 4) * 60;
  if (sat > 0.18 && l > 70 && hue >= 20 && hue < 55) return { polymer: 'areia', coat: 'fde' };
  if (sat > 0.15 && hue >= 55 && hue < 160) return { polymer: 'oliva', coat: 'oliva' };
  if (l > 120 && sat < 0.15) return { polymer: 'cinza', coat: 'grafite' };
  return { polymer: 'preto', coat: 'preto-fosco' };
}

/** Comparison image: reference (cyan) and model (orange) silhouettes, overlap white. */
export function comparisonImage(a: Silhouette, b: Silhouette): Img {
  const H = Math.max(a.h, b.h);
  const out: Img = { width: SIL_W, height: H, data: new Uint8ClampedArray(SIL_W * H * 4) };
  const oa = Math.round((H - a.h) / 2);
  const ob = Math.round((H - b.h) / 2);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < SIL_W; x++) {
      const va = y - oa >= 0 && y - oa < a.h && a.data[(y - oa) * SIL_W + x];
      const vb = y - ob >= 0 && y - ob < b.h && b.data[(y - ob) * SIL_W + x];
      const o = (y * SIL_W + x) * 4;
      const c = va && vb ? [235, 235, 235] : va ? [34, 211, 238] : vb ? [251, 146, 60] : [0, 0, 0];
      out.data.set([c[0], c[1], c[2], va || vb ? 255 : 0], o);
    }
  return out;
}
