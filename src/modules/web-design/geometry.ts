import type { WDElement } from './model';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const RAD = Math.PI / 180;

export function rotateVec(x: number, y: number, deg: number): { x: number; y: number } {
  if (!deg) return { x, y };
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Axis-aligned bounding box of a (possibly rotated) element. */
export function aabb(e: Pick<WDElement, 'x' | 'y' | 'w' | 'h'> & { rotation?: number }): Rect {
  const r = e.rotation ?? 0;
  if (!r) return { x: e.x, y: e.y, w: e.w, h: e.h };
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const pts = [
    [-e.w / 2, -e.h / 2],
    [e.w / 2, -e.h / 2],
    [e.w / 2, e.h / 2],
    [-e.w / 2, e.h / 2],
  ].map(([x, y]) => rotateVec(x, y, r));
  const xs = pts.map((p) => p.x + cx);
  const ys = pts.map((p) => p.y + cy);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Is the world point inside the (possibly rotated) element? */
export function containsPoint(e: Pick<WDElement, 'x' | 'y' | 'w' | 'h'> & { rotation?: number }, px: number, py: number): boolean {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const p = rotateVec(px - cx, py - cy, -(e.rotation ?? 0));
  return Math.abs(p.x) <= e.w / 2 && Math.abs(p.y) <= e.h / 2;
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/**
 * Resize a rotated rect by dragging a handle by the world delta (dx, dy).
 * The opposite edge/corner stays fixed in world space.
 */
export function resizeRotated(rect: Rect, rotation: number, handle: Handle, dx: number, dy: number, keepRatio = false): Rect {
  const l = rotateVec(dx, dy, -rotation);
  let { w, h } = rect;
  let ox = 0;
  let oy = 0;
  if (handle.includes('e')) w = rect.w + l.x;
  if (handle.includes('s')) h = rect.h + l.y;
  if (handle.includes('w')) {
    w = rect.w - l.x;
    ox = l.x;
  }
  if (handle.includes('n')) {
    h = rect.h - l.y;
    oy = l.y;
  }
  if (keepRatio && rect.w > 0 && rect.h > 0) {
    const ratio = rect.w / rect.h;
    if (handle === 'n' || handle === 's') w = h * ratio;
    else h = w / ratio;
    if (handle.includes('w')) ox = rect.w - w;
    if (handle.includes('n')) oy = rect.h - h;
  }
  w = Math.max(1, w);
  h = Math.max(1, h);
  if (handle.includes('w')) ox = rect.w - w;
  if (handle.includes('n')) oy = rect.h - h;
  // Shift of the centre in the local frame, then back to world.
  const shift = rotateVec(ox + w / 2 - rect.w / 2, oy + h / 2 - rect.h / 2, rotation);
  const cx = rect.x + rect.w / 2 + shift.x;
  const cy = rect.y + rect.h / 2 + shift.y;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Angle (deg) for the rotation handle, measured so that "up" is 0°. */
export function angleFromCenter(cx: number, cy: number, px: number, py: number): number {
  const a = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
  return ((a % 360) + 540) % 360 - 180;
}

/**
 * Numeric equivalent of the constraint CSS: where an element designed in a W×H frame
 * lands when the frame becomes W2×H2. Used for breakpoint editing and component instances.
 */
export function resolveConstraintBox(el: Pick<WDElement, 'x' | 'y' | 'w' | 'h' | 'constraintH' | 'constraintV'>, W: number, H: number, W2: number, H2: number): Rect {
  let x = el.x;
  let w = el.w;
  let y = el.y;
  let h = el.h;
  switch (el.constraintH) {
    case 'right':
      x = W2 - (W - el.x);
      break;
    case 'center':
      x = W2 / 2 + (el.x - W / 2);
      break;
    case 'stretch':
      w = Math.max(1, W2 - el.x - (W - el.x - el.w));
      break;
    case 'scale':
      x = (el.x * W2) / W;
      w = (el.w * W2) / W;
      break;
  }
  switch (el.constraintV) {
    case 'bottom':
      y = H2 - (H - el.y);
      break;
    case 'center':
      y = H2 / 2 + (el.y - H / 2);
      break;
    case 'stretch':
      h = Math.max(1, H2 - el.y - (H - el.y - el.h));
      break;
    case 'scale':
      y = (el.y * H2) / H;
      h = (el.h * H2) / H;
      break;
  }
  return { x, y, w, h };
}
