import { createId } from '@/core/utils/id';
import { createElement, createScreen, type WDElement, type WDScreen, type WebDesignDoc } from './model';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------- screen helpers ----------

export function getScreen(doc: WebDesignDoc, screenId: string): WDScreen | undefined {
  return doc.screens.find((s) => s.id === screenId);
}

export function updateScreen(doc: WebDesignDoc, screenId: string, fn: (s: WDScreen) => WDScreen): WebDesignDoc {
  return { ...doc, screens: doc.screens.map((s) => (s.id === screenId ? fn(s) : s)) };
}

export function addScreen(doc: WebDesignDoc, name?: string, width?: number, height?: number): { doc: WebDesignDoc; screen: WDScreen } {
  const ref = doc.screens[doc.screens.length - 1];
  const screen = createScreen(name ?? `Tela ${doc.screens.length + 1}`, width ?? ref?.width ?? 1280, height ?? ref?.height ?? 800);
  return { doc: { ...doc, screens: [...doc.screens, screen] }, screen };
}

export function duplicateScreen(doc: WebDesignDoc, screenId: string): { doc: WebDesignDoc; screen?: WDScreen } {
  const src = getScreen(doc, screenId);
  if (!src) return { doc };
  const idMap = new Map(src.elements.map((e) => [e.id, createId('el')]));
  const screen: WDScreen = {
    ...structuredClone(src),
    id: createId('scr'),
    name: `${src.name} (cópia)`,
    elements: src.elements.map((e) => remapElement(e, idMap)),
  };
  const idx = doc.screens.indexOf(src);
  const screens = [...doc.screens];
  screens.splice(idx + 1, 0, screen);
  return { doc: { ...doc, screens }, screen };
}

export function removeScreen(doc: WebDesignDoc, screenId: string): WebDesignDoc {
  if (doc.screens.length <= 1) return doc;
  const screens = doc.screens
    .filter((s) => s.id !== screenId)
    .map((s) => ({
      ...s,
      // Drop navigation links pointing to the removed screen.
      elements: s.elements.map((e) =>
        e.interaction?.type === 'navigate' && e.interaction.screenId === screenId ? { ...e, interaction: null } : e,
      ),
    }));
  return { ...doc, screens };
}

export function moveScreen(doc: WebDesignDoc, screenId: string, delta: number): WebDesignDoc {
  const i = doc.screens.findIndex((s) => s.id === screenId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= doc.screens.length) return doc;
  const screens = [...doc.screens];
  [screens[i], screens[j]] = [screens[j], screens[i]];
  return { ...doc, screens };
}

// ---------- element tree helpers ----------

export function childrenOf(screen: WDScreen, parentId: string | null): WDElement[] {
  return screen.elements.filter((e) => e.parentId === parentId);
}

export function descendantIds(screen: WDScreen, id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const e of screen.elements) if (e.parentId === pid) {
      out.push(e.id);
      walk(e.id);
    }
  };
  walk(id);
  return out;
}

/** Top-most ancestor (the element that is selected when clicking a grouped child). */
export function rootAncestor(screen: WDScreen, id: string): WDElement | undefined {
  let el = screen.elements.find((e) => e.id === id);
  while (el?.parentId) {
    const parent = screen.elements.find((e) => e.id === el!.parentId);
    if (!parent) break;
    el = parent;
  }
  return el;
}

export function boundsOf(els: Pick<WDElement, 'x' | 'y' | 'w' | 'h'>[]): Rect | null {
  if (!els.length) return null;
  const x1 = Math.min(...els.map((e) => e.x));
  const y1 = Math.min(...els.map((e) => e.y));
  const x2 = Math.max(...els.map((e) => e.x + e.w));
  const y2 = Math.max(...els.map((e) => e.y + e.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Recompute bounding boxes of every group (bottom-up). */
export function refreshGroups(screen: WDScreen): WDScreen {
  let elements = screen.elements;
  const groups = elements.filter((e) => e.type === 'group');
  if (!groups.length) return screen;
  // Process deepest groups first.
  const depth = (id: string): number => {
    const el = elements.find((e) => e.id === id);
    return el?.parentId ? 1 + depth(el.parentId) : 0;
  };
  const ordered = [...groups].sort((a, b) => depth(b.id) - depth(a.id));
  for (const g of ordered) {
    const kids = elements.filter((e) => e.parentId === g.id);
    const b = boundsOf(kids);
    elements = b
      ? elements.map((e) => (e.id === g.id ? { ...e, ...b } : e))
      : elements.filter((e) => e.id !== g.id); // empty group is removed
  }
  return { ...screen, elements };
}

// ---------- element operations ----------

export function addElements(screen: WDScreen, els: WDElement[]): WDScreen {
  return refreshGroups({ ...screen, elements: [...screen.elements, ...els] });
}

export function updateElements(screen: WDScreen, ids: string[], patch: (e: WDElement) => Partial<WDElement>): WDScreen {
  const set = new Set(ids);
  return refreshGroups({
    ...screen,
    elements: screen.elements.map((e) => {
      if (!set.has(e.id)) return e;
      const p = patch(e);
      return { ...e, ...p, style: p.style ? { ...e.style, ...p.style } : e.style };
    }),
  });
}

/** Move elements by a delta; groups move their descendants. Locked elements stay put. */
export function translateElements(screen: WDScreen, ids: string[], dx: number, dy: number): WDScreen {
  const moving = new Set<string>();
  for (const id of ids) {
    const el = screen.elements.find((e) => e.id === id);
    if (!el || el.locked) continue;
    moving.add(id);
    for (const d of descendantIds(screen, id)) moving.add(d);
  }
  return refreshGroups({
    ...screen,
    elements: screen.elements.map((e) => (moving.has(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e)),
  });
}

/** Resize an element to a new rect; groups scale their descendants proportionally. */
export function resizeElement(screen: WDScreen, id: string, rect: Rect): WDScreen {
  const el = screen.elements.find((e) => e.id === id);
  if (!el || el.locked) return screen;
  const r = { ...rect, w: Math.max(1, rect.w), h: Math.max(1, rect.h) };
  if (el.type !== 'group') return updateElements(screen, [id], () => r);
  const sx = r.w / (el.w || 1);
  const sy = r.h / (el.h || 1);
  const desc = new Set(descendantIds(screen, id));
  return refreshGroups({
    ...screen,
    elements: screen.elements.map((e) =>
      desc.has(e.id)
        ? { ...e, x: r.x + (e.x - el.x) * sx, y: r.y + (e.y - el.y) * sy, w: Math.max(1, e.w * sx), h: Math.max(1, e.h * sy) }
        : e.id === id
          ? { ...e, ...r }
          : e,
    ),
  });
}

export function deleteElements(screen: WDScreen, ids: string[]): WDScreen {
  const remove = new Set<string>();
  for (const id of ids) {
    remove.add(id);
    for (const d of descendantIds(screen, id)) remove.add(d);
  }
  return refreshGroups({
    ...screen,
    elements: screen.elements
      .filter((e) => !remove.has(e.id))
      .map((e) => (e.interaction?.type === 'toggle' && remove.has(e.interaction.targetId) ? { ...e, interaction: null } : e)),
  });
}

function remapElement(e: WDElement, idMap: Map<string, string>): WDElement {
  const copy = structuredClone(e);
  copy.id = idMap.get(e.id) ?? createId('el');
  if (copy.parentId) copy.parentId = idMap.get(copy.parentId) ?? copy.parentId;
  if (copy.interaction?.type === 'toggle' && idMap.has(copy.interaction.targetId))
    copy.interaction = { ...copy.interaction, targetId: idMap.get(copy.interaction.targetId)! };
  return copy;
}

/** Deep copy elements (with their descendants) and give them fresh ids. */
export function cloneElements(screen: WDScreen, ids: string[]): WDElement[] {
  const all = new Set<string>();
  for (const id of ids) {
    all.add(id);
    for (const d of descendantIds(screen, id)) all.add(d);
  }
  const source = screen.elements.filter((e) => all.has(e.id));
  const idMap = new Map(source.map((e) => [e.id, createId('el')]));
  return source.map((e) => {
    const c = remapElement(e, idMap);
    // A cloned root whose parent wasn't copied becomes a top-level element.
    if (e.parentId && !all.has(e.parentId)) c.parentId = null;
    return c;
  });
}

export function duplicateElements(screen: WDScreen, ids: string[], offset = 16): { screen: WDScreen; newIds: string[] } {
  const roots = ids.filter((id) => screen.elements.some((e) => e.id === id));
  let s = screen;
  const newIds: string[] = [];
  for (const id of roots) {
    const orig = screen.elements.find((e) => e.id === id)!;
    const clones = cloneElements(screen, [id]).map((e) => ({ ...e, x: e.x + offset, y: e.y + offset }));
    // The clone of the root is the first element without a parent inside the clone set.
    const root = clones.find((c) => !c.parentId || !clones.some((o) => o.id === c.parentId))!;
    root.parentId = orig.parentId; // keep duplicates inside the original group
    newIds.push(root.id);
    s = addElements(s, clones);
  }
  return { screen: s, newIds };
}

export function groupElements(screen: WDScreen, ids: string[]): { screen: WDScreen; groupId?: string } {
  const els = screen.elements.filter((e) => ids.includes(e.id));
  if (els.length < 2) return { screen };
  const parentId = els[0].parentId;
  if (!els.every((e) => e.parentId === parentId)) return { screen };
  const b = boundsOf(els)!;
  const group = createElement('group', b.x, b.y, { w: b.w, h: b.h, parentId, name: 'Grupo' });
  // Insert the group where the top-most member was, preserving z-order.
  const lastIdx = Math.max(...els.map((e) => screen.elements.indexOf(e)));
  const elements = screen.elements.map((e) => (ids.includes(e.id) ? { ...e, parentId: group.id } : e));
  elements.splice(lastIdx + 1, 0, group);
  return { screen: refreshGroups({ ...screen, elements }), groupId: group.id };
}

export function ungroupElements(screen: WDScreen, groupIds: string[]): { screen: WDScreen; freed: string[] } {
  const freed: string[] = [];
  let elements = screen.elements;
  for (const gid of groupIds) {
    const g = elements.find((e) => e.id === gid && e.type === 'group');
    if (!g) continue;
    elements = elements
      .map((e) => {
        if (e.parentId === gid) {
          freed.push(e.id);
          return { ...e, parentId: g.parentId };
        }
        return e;
      })
      .filter((e) => e.id !== gid);
  }
  return { screen: refreshGroups({ ...screen, elements }), freed };
}

/** Change z-order among siblings. mode: forward/backward one step, front/back fully. */
export function reorderElement(screen: WDScreen, id: string, mode: 'forward' | 'backward' | 'front' | 'back'): WDScreen {
  const el = screen.elements.find((e) => e.id === id);
  if (!el) return screen;
  // Treat element + descendants as one block.
  const block = new Set([id, ...descendantIds(screen, id)]);
  const blockEls = screen.elements.filter((e) => block.has(e.id));
  const rest = screen.elements.filter((e) => !block.has(e.id));
  const siblings = rest.filter((e) => e.parentId === el.parentId);
  const origIdx = screen.elements.indexOf(el);
  // Position among siblings (by first index in array).
  const siblingBefore = siblings.filter((s) => screen.elements.indexOf(s) < origIdx);
  let targetPos = siblingBefore.length;
  if (mode === 'forward') targetPos = Math.min(siblings.length, targetPos + 1);
  if (mode === 'backward') targetPos = Math.max(0, targetPos - 1);
  if (mode === 'front') targetPos = siblings.length;
  if (mode === 'back') targetPos = 0;
  let insertAt: number;
  if (targetPos >= siblings.length) {
    const last = siblings[siblings.length - 1];
    if (!last) return screen;
    const lastBlock = [last.id, ...descendantIds(screen, last.id)];
    insertAt = Math.max(...lastBlock.map((bid) => rest.findIndex((e) => e.id === bid))) + 1;
  } else {
    insertAt = rest.indexOf(siblings[targetPos]);
    if (mode === 'forward' || mode === 'front') {
      // when moving forward we insert after the sibling that was previously ahead
      const prev = siblings[targetPos - 1];
      if (prev) {
        const prevBlock = [prev.id, ...descendantIds(screen, prev.id)];
        insertAt = Math.max(...prevBlock.map((bid) => rest.findIndex((e) => e.id === bid))) + 1;
      }
    }
  }
  const elements = [...rest];
  elements.splice(insertAt, 0, ...blockEls);
  return { ...screen, elements };
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** Align elements to their common bounds, or to the screen when only one element is given. */
export function alignElements(screen: WDScreen, ids: string[], mode: AlignMode): WDScreen {
  const els = screen.elements.filter((e) => ids.includes(e.id) && !e.locked);
  if (!els.length) return screen;
  const b = els.length === 1 ? { x: 0, y: 0, w: screen.width, h: screen.height } : boundsOf(els)!;
  let s = screen;
  for (const e of els) {
    let dx = 0;
    let dy = 0;
    if (mode === 'left') dx = b.x - e.x;
    if (mode === 'right') dx = b.x + b.w - (e.x + e.w);
    if (mode === 'hcenter') dx = b.x + b.w / 2 - (e.x + e.w / 2);
    if (mode === 'top') dy = b.y - e.y;
    if (mode === 'bottom') dy = b.y + b.h - (e.y + e.h);
    if (mode === 'vcenter') dy = b.y + b.h / 2 - (e.y + e.h / 2);
    s = translateElements(s, [e.id], dx, dy);
  }
  return s;
}

export function distributeElements(screen: WDScreen, ids: string[], axis: 'h' | 'v'): WDScreen {
  const els = screen.elements.filter((e) => ids.includes(e.id) && !e.locked);
  if (els.length < 3) return screen;
  const sorted = [...els].sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const total = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y;
  const sizes = sorted.reduce((sum, e) => sum + (axis === 'h' ? e.w : e.h), 0);
  const gap = (total - sizes) / (sorted.length - 1);
  let cursor = axis === 'h' ? first.x : first.y;
  let s = screen;
  for (const e of sorted) {
    const d = cursor - (axis === 'h' ? e.x : e.y);
    s = translateElements(s, [e.id], axis === 'h' ? d : 0, axis === 'h' ? 0 : d);
    cursor += (axis === 'h' ? e.w : e.h) + gap;
  }
  return s;
}

export function snapValue(v: number, grid: number): number {
  return grid > 0 ? Math.round(v / grid) * grid : v;
}

// ---------- smart alignment ----------

export interface SnapResult {
  dx: number;
  dy: number;
  guidesX: number[];
  guidesY: number[];
}

/**
 * Snap a moving rect to other elements' edges/centres, the screen edges/centre and user guides.
 * Returns the correction to apply and the guide lines to display.
 */
export function smartSnap(rect: Rect, targets: Rect[], extraX: number[], extraY: number[], threshold: number): SnapResult {
  const xs = [...extraX];
  const ys = [...extraY];
  for (const t of targets) {
    xs.push(t.x, t.x + t.w / 2, t.x + t.w);
    ys.push(t.y, t.y + t.h / 2, t.y + t.h);
  }
  const myX = [rect.x, rect.x + rect.w / 2, rect.x + rect.w];
  const myY = [rect.y, rect.y + rect.h / 2, rect.y + rect.h];
  const best = (mine: number[], lines: number[]) => {
    let delta = Infinity;
    for (const m of mine) for (const l of lines) {
      const d = l - m;
      if (Math.abs(d) <= threshold && Math.abs(d) < Math.abs(delta)) delta = d;
    }
    return Number.isFinite(delta) ? delta : 0;
  };
  const dx = best(myX, xs);
  const dy = best(myY, ys);
  const eps = 0.5;
  const guidesX = dx || myX.some((m) => xs.some((l) => Math.abs(l - m) < eps))
    ? [...new Set(xs.filter((l) => myX.some((m) => Math.abs(l - (m + dx)) < eps)))]
    : [];
  const guidesY = dy || myY.some((m) => ys.some((l) => Math.abs(l - m) < eps))
    ? [...new Set(ys.filter((l) => myY.some((m) => Math.abs(l - (m + dy)) < eps)))]
    : [];
  return { dx, dy, guidesX, guidesY };
}
