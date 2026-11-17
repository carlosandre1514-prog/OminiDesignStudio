import { dab, paintCanvas, syncPaintSource } from '../engine/runner';
import { selectDoc, useTextures } from '../store';

/** Brush strokes on the selected paint layer, shared by the 2D and 3D views. */
let active: { layerId: string; last: [number, number] | null } | null = null;
let tickTimer: ReturnType<typeof setTimeout> | null = null;

export function canPaint(): boolean {
  const s = useTextures.getState();
  const l = selectDoc(s).layers.find((x) => x.id === s.selected);
  return !!l && l.mask.kind === 'paint' && s.painting && l.visible;
}

export function strokeStart(u: number, v: number) {
  const s = useTextures.getState();
  const layer = selectDoc(s).layers.find((x) => x.id === s.selected);
  if (!layer || layer.mask.kind !== 'paint') return false;
  active = { layerId: layer.id, last: null };
  strokeMove(u, v);
  return true;
}

const fract = (x: number) => x - Math.floor(x);

export function strokeMove(u: number, v: number) {
  if (!active) return;
  const s = useTextures.getState();
  const layer = selectDoc(s).layers.find((x) => x.id === active!.layerId);
  if (!layer) return;
  const { canvas } = paintCanvas(layer);
  const b = s.brush;
  const cur: [number, number] = [fract(u), fract(v)];
  // Fill the gap between pointer events with evenly spaced dabs (no jump across the seam).
  const last = active.last;
  const dist = last ? Math.hypot(cur[0] - last[0], cur[1] - last[1]) : 0;
  const step = Math.max(0.002, b.size * 0.25);
  if (last && dist < 0.5) {
    const n = Math.ceil(dist / step);
    for (let i = 1; i <= n; i++) dab(canvas, last[0] + ((cur[0] - last[0]) * i) / n, last[1] + ((cur[1] - last[1]) * i) / n, b);
  } else dab(canvas, cur[0], cur[1], b);
  active.last = cur;
  if (!tickTimer)
    tickTimer = setTimeout(() => {
      tickTimer = null;
      useTextures.getState().set({ paintTick: useTextures.getState().paintTick + 1 });
    }, 90);
}

export function strokeEnd() {
  if (!active) return;
  const id = active.layerId;
  active = null;
  const s = useTextures.getState();
  const layer = selectDoc(s).layers.find((x) => x.id === id);
  if (!layer) return;
  const url = paintCanvas(layer).canvas.toDataURL('image/png');
  syncPaintSource(id, url);
  s.updateLayer(id, (l) => ({ ...l, mask: { ...l.mask, paint: url } }));
}

export const isStroking = () => !!active;
