/**
 * Spatial navigation for remote controls (Smart TV D-pad) and keyboards.
 * Pure geometry so it can be tested without a browser layout engine.
 */

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const KEY_DIR: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/**
 * Pick the best candidate in a direction: it must lie beyond the current element's edge on that axis.
 * Score = gap along the axis + 2 × sideways gap between the two spans (centre offset only breaks ties),
 * plus a penalty for candidates outside the current row/column (keeps movement in lanes).
 */
export function pickNext(from: Box, candidates: Box[], dir: Dir): number {
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  let best = -1;
  let bestScore = Infinity;
  candidates.forEach((c, i) => {
    const ox = c.x + c.w / 2;
    const oy = c.y + c.h / 2;
    let main: number;
    let side: number;
    let overlap: boolean;
    switch (dir) {
      case 'right':
        main = c.x - (from.x + from.w);
        if (ox <= cx + 1 || main < -Math.min(from.w, c.w) / 2) return;
        side = Math.max(0, c.y - (from.y + from.h), from.y - (c.y + c.h)) + Math.abs(oy - cy) * 0.1;
        overlap = c.y < from.y + from.h && c.y + c.h > from.y;
        break;
      case 'left':
        main = from.x - (c.x + c.w);
        if (ox >= cx - 1 || main < -Math.min(from.w, c.w) / 2) return;
        side = Math.max(0, c.y - (from.y + from.h), from.y - (c.y + c.h)) + Math.abs(oy - cy) * 0.1;
        overlap = c.y < from.y + from.h && c.y + c.h > from.y;
        break;
      case 'down':
        main = c.y - (from.y + from.h);
        if (oy <= cy + 1 || main < -Math.min(from.h, c.h) / 2) return;
        side = Math.max(0, c.x - (from.x + from.w), from.x - (c.x + c.w)) + Math.abs(ox - cx) * 0.1;
        overlap = c.x < from.x + from.w && c.x + c.w > from.x;
        break;
      case 'up':
        main = from.y - (c.y + c.h);
        if (oy >= cy - 1 || main < -Math.min(from.h, c.h) / 2) return;
        side = Math.max(0, c.x - (from.x + from.w), from.x - (c.x + c.w)) + Math.abs(ox - cx) * 0.1;
        overlap = c.x < from.x + from.w && c.x + c.w > from.x;
        break;
    }
    const score = Math.max(0, main) + side * 2 + (overlap ? 0 : 400);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"]), [href]:not([tabindex="-1"]), input:not([disabled]):not([type=hidden]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), summary, [tabindex]:not([tabindex="-1"])';

/** Visible focusable elements inside a root (skips elements in closed panels / zero size). */
export function focusables(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.closest('[data-nav-skip]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
}

const toBox = (r: DOMRect): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height });

/**
 * Should the focused element keep this arrow key for itself?
 * - range sliders keep ←/→ (value), text fields keep ←/→ (caret) and ↑/↓ inside multi-line text,
 * - elements marked data-nav-capture="arrows" (e.g. the 3D viewport in camera mode) keep all arrows.
 */
export function keepsArrow(el: Element | null, dir: Dir): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.dataset.navCapture === 'arrows') return true;
  if (el instanceof HTMLInputElement) {
    if (el.type === 'range') return dir === 'left' || dir === 'right';
    if (['text', 'search', 'number', 'email', 'url', 'password'].includes(el.type)) {
      if (dir === 'left') return (el.selectionStart ?? 0) > 0;
      if (dir === 'right') return (el.selectionEnd ?? 0) < el.value.length;
    }
    return false;
  }
  if (el instanceof HTMLTextAreaElement) {
    if (dir === 'left') return el.selectionStart > 0;
    if (dir === 'right') return el.selectionEnd < el.value.length;
    if (dir === 'up') return el.value.slice(0, el.selectionStart).includes('\n');
    if (dir === 'down') return el.value.slice(el.selectionEnd).includes('\n');
  }
  if (el instanceof HTMLSelectElement) return dir === 'up' || dir === 'down';
  return false;
}

/** Move focus from the active element in a direction. Returns true when focus moved. */
export function moveFocus(dir: Dir, root: ParentNode = document): boolean {
  const list = focusables(root);
  if (!list.length) return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body || !list.includes(active)) {
    list[0].focus();
    return true;
  }
  // Never jump into or out to an ancestor/descendant of the current element (e.g. buttons drawn over the viewport).
  const others = list.filter((e) => e !== active && !active.contains(e) && !e.contains(active));
  const i = pickNext(toBox(active.getBoundingClientRect()), others.map((e) => toBox(e.getBoundingClientRect())), dir);
  if (i < 0) return false;
  let target = others[i];
  // Entering a tab list from outside lands on the selected tab (ARIA tabs pattern).
  const list2 = target.getAttribute('role') === 'tab' ? target.closest('[role=tablist]') : null;
  if (list2 && !list2.contains(active)) target = list2.querySelector<HTMLElement>('[role=tab][aria-selected=true]') ?? target;
  target.focus();
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}
