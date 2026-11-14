import { describe, expect, it } from 'vitest';
import { createElement, createScreen, normalizeDoc, createEmptyDoc } from './model';
import * as ops from './ops';

const screenWith = (...els: ReturnType<typeof createElement>[]) => ({ ...createScreen('S', 1000, 800), elements: els });

describe('web-design ops', () => {
  it('translates elements and group descendants, skipping locked ones', () => {
    const a = createElement('frame', 0, 0);
    const b = createElement('frame', 100, 100, { locked: true });
    let s = ops.translateElements(screenWith(a, b), [a.id, b.id], 10, 5);
    expect(s.elements[0]).toMatchObject({ x: 10, y: 5 });
    expect(s.elements[1]).toMatchObject({ x: 100, y: 100 });
    s = screenWith(a);
    expect(ops.groupElements(s, [a.id]).groupId).toBeUndefined(); // grouping needs 2+ elements
  });

  it('groups, computes bounds, moves and ungroups', () => {
    const a = createElement('frame', 10, 10, { w: 50, h: 50 });
    const b = createElement('frame', 100, 200, { w: 20, h: 30 });
    const r = ops.groupElements(screenWith(a, b), [a.id, b.id]);
    const g = r.screen.elements.find((e) => e.id === r.groupId)!;
    expect(g).toMatchObject({ type: 'group', x: 10, y: 10, w: 110, h: 220 });
    const moved = ops.translateElements(r.screen, [g.id], 5, 5);
    expect(moved.elements.find((e) => e.id === a.id)).toMatchObject({ x: 15, y: 15 });
    expect(moved.elements.find((e) => e.id === g.id)).toMatchObject({ x: 15, y: 15 });
    const u = ops.ungroupElements(moved, [g.id]);
    expect(u.screen.elements.some((e) => e.type === 'group')).toBe(false);
    expect(u.freed.sort()).toEqual([a.id, b.id].sort());
    expect(u.screen.elements.every((e) => e.parentId === null)).toBe(true);
  });

  it('resizes groups scaling children', () => {
    const a = createElement('frame', 0, 0, { w: 50, h: 50 });
    const b = createElement('frame', 50, 50, { w: 50, h: 50 });
    const r = ops.groupElements(screenWith(a, b), [a.id, b.id]);
    const s = ops.resizeElement(r.screen, r.groupId!, { x: 0, y: 0, w: 200, h: 200 });
    expect(s.elements.find((e) => e.id === b.id)).toMatchObject({ x: 100, y: 100, w: 100, h: 100 });
  });

  it('deletes descendants and clears dangling toggle interactions', () => {
    const modal = createElement('modal', 0, 0);
    const btn = createElement('button', 0, 0, { interaction: { type: 'toggle', targetId: modal.id } });
    const s = ops.deleteElements(screenWith(modal, btn), [modal.id]);
    expect(s.elements).toHaveLength(1);
    expect(s.elements[0].interaction).toBeNull();
  });

  it('duplicates with fresh ids and remapped internal references', () => {
    const a = createElement('frame', 0, 0);
    const b = createElement('frame', 100, 0);
    const g = ops.groupElements(screenWith(a, b), [a.id, b.id]);
    const d = ops.duplicateElements(g.screen, [g.groupId!]);
    expect(d.newIds).toHaveLength(1);
    expect(d.screen.elements).toHaveLength(6);
    const copyGroup = d.screen.elements.find((e) => e.id === d.newIds[0])!;
    const kids = d.screen.elements.filter((e) => e.parentId === copyGroup.id);
    expect(kids).toHaveLength(2);
    expect(kids.every((k) => k.id !== a.id && k.id !== b.id)).toBe(true);
    expect(copyGroup.x).toBe(16);
  });

  it('reorders z-index among siblings', () => {
    const a = createElement('frame', 0, 0);
    const b = createElement('frame', 0, 0);
    const c = createElement('frame', 0, 0);
    const s = screenWith(a, b, c);
    expect(ops.reorderElement(s, a.id, 'front').elements.map((e) => e.id)).toEqual([b.id, c.id, a.id]);
    expect(ops.reorderElement(s, c.id, 'back').elements.map((e) => e.id)).toEqual([c.id, a.id, b.id]);
    expect(ops.reorderElement(s, a.id, 'forward').elements.map((e) => e.id)).toEqual([b.id, a.id, c.id]);
    expect(ops.reorderElement(s, c.id, 'backward').elements.map((e) => e.id)).toEqual([a.id, c.id, b.id]);
  });

  it('aligns and distributes', () => {
    const a = createElement('frame', 0, 0, { w: 10, h: 10 });
    const b = createElement('frame', 50, 40, { w: 10, h: 10 });
    const c = createElement('frame', 200, 80, { w: 10, h: 10 });
    let s = ops.alignElements(screenWith(a, b, c), [a.id, b.id, c.id], 'top');
    expect(s.elements.map((e) => e.y)).toEqual([0, 0, 0]);
    s = ops.distributeElements(s, [a.id, b.id, c.id], 'h');
    expect(s.elements.map((e) => e.x)).toEqual([0, 100, 200]);
    const single = ops.alignElements(screenWith(a), [a.id], 'hcenter');
    expect(single.elements[0].x).toBe(495);
  });

  it('smart snap finds nearby edges', () => {
    const r = ops.smartSnap({ x: 97, y: 0, w: 20, h: 10 }, [{ x: 0, y: 300, w: 100, h: 10 }], [], [], 5);
    expect(r.dx).toBe(3);
    expect(r.guidesX).toContain(100);
    expect(ops.smartSnap({ x: 50, y: 50, w: 10, h: 10 }, [], [], [], 5)).toMatchObject({ dx: 0, dy: 0 });
  });

  it('manages screens and drops links to removed screens', () => {
    let doc = createEmptyDoc();
    const added = ops.addScreen(doc);
    doc = added.doc;
    const btn = createElement('button', 0, 0, { interaction: { type: 'navigate', screenId: added.screen.id } });
    doc = ops.updateScreen(doc, doc.screens[0].id, (s) => ops.addElements(s, [btn]));
    doc = ops.removeScreen(doc, added.screen.id);
    expect(doc.screens).toHaveLength(1);
    expect(doc.screens[0].elements[0].interaction).toBeNull();
    expect(ops.removeScreen(doc, doc.screens[0].id).screens).toHaveLength(1);
  });

  it('normalizes corrupted documents', () => {
    const d = normalizeDoc({ screens: [{ id: 's', elements: [{ id: 'e', type: 'bogus' }, { id: 'x', type: 'text', parentId: 'missing' }, null] }], grid: { size: -1 } });
    expect(d.screens[0].elements).toHaveLength(1);
    expect(d.screens[0].elements[0].parentId).toBeNull();
    expect(d.screens[0].elements[0].style.fontSize).toBeGreaterThan(0);
    expect(d.grid.size).toBe(8);
    expect(normalizeDoc('garbage').screens).toHaveLength(1);
  });
});
