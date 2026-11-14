import { createId } from '@/core/utils/id';
import { resolveConstraintBox } from './geometry';
import type { Breakpoint, ElementOverride, WDElement, WDScreen } from './model';
import { refreshGroups } from './ops';

/** All breakpoints in CSS cascade order: max-width descending, then min-width ascending (later wins). */
export function cascadeOrder(bps: Breakpoint[]): Breakpoint[] {
  const max = bps.filter((b) => b.mode === 'max').sort((a, b) => b.width - a.width);
  const min = bps.filter((b) => b.mode === 'min').sort((a, b) => a.width - b.width);
  return [...max, ...min];
}

export function matchesWidth(bp: Breakpoint, vw: number): boolean {
  return bp.mode === 'max' ? vw <= bp.width : vw >= bp.width;
}

export function matchingBreakpoints(bps: Breakpoint[], vw: number): Breakpoint[] {
  return cascadeOrder(bps).filter((b) => matchesWidth(b, vw));
}

export function mediaQuery(bp: Breakpoint): string {
  return `(${bp.mode}-width: ${bp.width}px)`;
}

export const hasGeometry = (o: ElementOverride | undefined): boolean =>
  !!o && (o.x !== undefined || o.y !== undefined || o.w !== undefined || o.h !== undefined);

/** Keep previewWidth inside the range where the breakpoint applies. */
export function normalizeBreakpoint(bp: Breakpoint): Breakpoint {
  const width = Math.max(1, Math.round(bp.width));
  let previewWidth = Math.max(100, Math.round(bp.previewWidth));
  if (bp.mode === 'max' && previewWidth > width) previewWidth = width;
  if (bp.mode === 'min' && previewWidth < width) previewWidth = width;
  return { ...bp, width, previewWidth };
}

export function createBreakpoint(): Breakpoint {
  return { id: createId('bp'), name: 'Novo breakpoint', mode: 'max', width: 767, previewWidth: 600 };
}

/**
 * Element as laid out at viewport width `vw`: geometry in pixels relative to a frame of width vw,
 * plus effective visibility and font size, after applying every matching breakpoint override.
 */
export function effectiveElement(el: WDElement, frame: Pick<WDScreen, 'width' | 'height'>, bps: Breakpoint[], vw: number): WDElement {
  let geom = { x: el.x, y: el.y, w: el.w, h: el.h };
  let frameWidth = frame.width;
  let visible = el.visible;
  let fontSize = el.style.fontSize;
  for (const bp of matchingBreakpoints(bps, vw)) {
    const o = el.overrides?.[bp.id];
    if (!o) continue;
    if (hasGeometry(o)) {
      geom = { x: o.x ?? el.x, y: o.y ?? el.y, w: o.w ?? el.w, h: o.h ?? el.h };
      frameWidth = bp.previewWidth;
    }
    if (o.visible !== undefined) visible = o.visible;
    if (o.fontSize !== undefined) fontSize = o.fontSize;
  }
  const rect = resolveConstraintBox({ ...el, ...geom }, frameWidth, frame.height, vw, frame.height);
  return { ...el, ...rect, visible, style: fontSize === el.style.fontSize ? el.style : { ...el.style, fontSize } };
}

const cache = new WeakMap<WDScreen, WeakMap<Breakpoint[], Map<string, WDScreen>>>();

/** The screen as seen (and edited) at a breakpoint's preview width. Memoised by identity. */
export function projectScreen(screen: WDScreen, bps: Breakpoint[], bpId: string): WDScreen {
  const bp = bps.find((b) => b.id === bpId);
  if (!bp) return screen;
  let byBps = cache.get(screen);
  if (!byBps) cache.set(screen, (byBps = new WeakMap()));
  let byId = byBps.get(bps);
  if (!byId) byBps.set(bps, (byId = new Map()));
  const hit = byId.get(bpId);
  if (hit) return hit;
  const projected = refreshGroups({
    ...screen,
    width: bp.previewWidth,
    elements: screen.elements.map((e) => effectiveElement(e, screen, bps, bp.previewWidth)),
  });
  byId.set(bpId, projected);
  return projected;
}

const GEOM = ['x', 'y', 'w', 'h'] as const;

/**
 * Write an edited projected screen back into the base screen: geometry, visibility and font-size
 * changes become overrides for `bpId`; every other change applies to the base element.
 */
export function writeBack(base: WDScreen, view: WDScreen, bps: Breakpoint[], bpId: string): WDScreen {
  const proj = projectScreen(base, bps, bpId);
  const baseById = new Map(base.elements.map((e) => [e.id, e]));
  const projById = new Map(proj.elements.map((e) => [e.id, e]));
  const elements = view.elements.map((v) => {
    const b = baseById.get(v.id);
    const p = projById.get(v.id);
    if (!b || !p) return v; // new element: its geometry becomes the base geometry
    const ov: ElementOverride = { ...(v.overrides?.[bpId] ?? {}) };
    if (v.type !== 'group' && GEOM.some((k) => Math.abs(v[k] - p[k]) > 1e-6)) Object.assign(ov, { x: v.x, y: v.y, w: v.w, h: v.h });
    if (v.visible !== p.visible) ov.visible = v.visible;
    if (v.style.fontSize !== p.style.fontSize) ov.fontSize = v.style.fontSize;
    const overrides = { ...(v.overrides ?? {}) };
    if (Object.keys(ov).length) overrides[bpId] = ov;
    else delete overrides[bpId];
    const next: WDElement = { ...v, x: b.x, y: b.y, w: b.w, h: b.h, visible: b.visible, style: { ...v.style, fontSize: b.style.fontSize } };
    if (Object.keys(overrides).length) next.overrides = overrides;
    else delete next.overrides;
    return next;
  });
  return refreshGroups({ ...base, name: view.name, background: view.background, guides: view.guides, elements });
}

/** Remove a breakpoint's adjustments from elements. */
export function clearOverrides(el: WDElement, bpId: string): Partial<WDElement> {
  if (!el.overrides?.[bpId]) return {};
  const overrides = { ...el.overrides };
  delete overrides[bpId];
  return { overrides: Object.keys(overrides).length ? overrides : undefined };
}
