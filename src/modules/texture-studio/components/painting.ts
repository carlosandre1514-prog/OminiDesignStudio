import { dab, paintCanvas, PAINT_RES, syncPaintSource } from '../engine/runner';
import type { Painter3D } from '../engine/paint3d';
import { selectDoc, useTextures } from '../store';

/** Brush strokes on the selected paint layer, shared by the 2D and 3D views. */
type Vec3 = [number, number, number];
let active: {
  layerId: string;
  last: [number, number] | null;
  dabs: number;
  /** 3D painting on a model: pixels edited in place, flushed to the canvas periodically. */
  model?: { painter: Painter3D; img: ImageData; last: Vec3 | null; lastN: Vec3 };
} | null = null;
let tickTimer: ReturnType<typeof setTimeout> | null = null;

export function canPaint(): boolean {
  const s = useTextures.getState();
  const l = selectDoc(s).layers.find((x) => x.id === s.selected);
  return !!l && l.mask.kind === 'paint' && s.painting && l.visible;
}

function selectedPaintLayer() {
  const s = useTextures.getState();
  const layer = selectDoc(s).layers.find((x) => x.id === s.selected);
  return layer && layer.mask.kind === 'paint' ? layer : null;
}

function scheduleTick() {
  if (tickTimer) return;
  tickTimer = setTimeout(() => {
    tickTimer = null;
    flushModel();
    useTextures.getState().set({ paintTick: useTextures.getState().paintTick + 1 });
  }, 90);
}

// ---------------------------------------------------------------- 2D (UV) painting

export function strokeStart(u: number, v: number) {
  const layer = selectedPaintLayer();
  if (!layer) return false;
  active = { layerId: layer.id, last: null, dabs: 0 };
  strokeMove(u, v);
  return true;
}

const fract = (x: number) => x - Math.floor(x);

export function strokeMove(u: number, v: number) {
  if (!active || active.model) return;
  const s = useTextures.getState();
  const layer = selectDoc(s).layers.find((x) => x.id === active!.layerId);
  if (!layer) return;
  const { canvas } = paintCanvas(layer);
  const b = s.brush;
  const cur: [number, number] = [fract(u), fract(v)];
  // Fill the gap between pointer events with evenly spaced dabs (no jump across the seam).
  const last = active.last;
  const dist = last ? Math.hypot(cur[0] - last[0], cur[1] - last[1]) : 0;
  const step = Math.max(0.002, b.size * 0.5 * Math.max(0.05, b.spacing));
  if (last && dist < 0.5) {
    const n = Math.ceil(dist / step);
    for (let i = 1; i <= n; i++) dab(canvas, last[0] + ((cur[0] - last[0]) * i) / n, last[1] + ((cur[1] - last[1]) * i) / n, b, active.dabs++);
  } else dab(canvas, cur[0], cur[1], b, active.dabs++);
  active.last = cur;
  scheduleTick();
}

// ---------------------------------------------------------------- 3D painting on a model

/** Start a stroke on the model at point p (model space) with surface normal n. */
export function strokeStart3D(painter: Painter3D, p: Vec3, n: Vec3) {
  const layer = selectedPaintLayer();
  if (!layer) return false;
  const { canvas } = paintCanvas(layer);
  const img = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, PAINT_RES, PAINT_RES);
  active = { layerId: layer.id, last: null, dabs: 0, model: { painter, img, last: null, lastN: n } };
  strokeMove3D(p, n);
  return true;
}

export function strokeMove3D(p: Vec3, n: Vec3) {
  const m = active?.model;
  if (!active || !m) return;
  const b = useTextures.getState().brush;
  const R = m.painter.radius(b.size);
  const step = Math.max(R * 0.02, R * Math.max(0.05, b.spacing));
  const last = m.last;
  if (last) {
    const d = Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]);
    // big jumps (pointer slid over a gap): start fresh instead of painting a line through the air
    if (d > R * 8) m.painter.dab(m.img.data, p, n, b, active.dabs++);
    else {
      const k = Math.floor(d / step);
      for (let i = 1; i <= k; i++) {
        const t = (i * step) / d;
        const q: Vec3 = [last[0] + (p[0] - last[0]) * t, last[1] + (p[1] - last[1]) * t, last[2] + (p[2] - last[2]) * t];
        const nn: Vec3 = [m.lastN[0] + (n[0] - m.lastN[0]) * t, m.lastN[1] + (n[1] - m.lastN[1]) * t, m.lastN[2] + (n[2] - m.lastN[2]) * t];
        m.painter.dab(m.img.data, q, nn, b, active.dabs++);
      }
      if (!k) return; // not far enough for the next dab yet
      const t = (k * step) / d;
      m.last = [last[0] + (p[0] - last[0]) * t, last[1] + (p[1] - last[1]) * t, last[2] + (p[2] - last[2]) * t];
      m.lastN = n;
      scheduleTick();
      return;
    }
  } else m.painter.dab(m.img.data, p, n, b, active.dabs++);
  m.last = p;
  m.lastN = n;
  scheduleTick();
}

/** Copy the edited pixels of a 3D stroke into the layer's canvas. */
function flushModel() {
  const m = active?.model;
  if (!active || !m) return;
  const layer = selectDoc(useTextures.getState()).layers.find((x) => x.id === active!.layerId);
  if (!layer) return;
  const d = m.painter.takeDirty();
  if (!d) return;
  paintCanvas(layer).canvas.getContext('2d')!.putImageData(m.img, 0, 0, d.x0, d.y0, d.x1 - d.x0 + 1, d.y1 - d.y0 + 1);
}

export function strokeEnd() {
  if (!active) return;
  flushModel();
  const id = active.layerId;
  active = null;
  const s = useTextures.getState();
  const layer = selectDoc(s).layers.find((x) => x.id === id);
  if (!layer) return;
  const url = paintCanvas(layer).canvas.toDataURL('image/png');
  syncPaintSource(id, url);
  s.updateLayer(id, (l) => ({ ...l, mask: { ...l.mask, paint: url } }));
  s.set({ paintTick: s.paintTick + 1 });
}

export const isStroking = () => !!active;
