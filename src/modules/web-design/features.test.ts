import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/database';
import { createProject } from '@/core/projects/projectService';
import { cascadeOrder, clearOverrides, effectiveElement, matchingBreakpoints, projectScreen, writeBack } from './breakpoints';
import { mergeComponents, publishComponent, readComponentAsset } from './componentAssets';
import { aabb, angleFromCenter, containsPoint, resizeRotated, resolveConstraintBox, rotateVec } from './geometry';
import { boxCss } from './layout';
import { createElement, createEmptyDoc, normalizeDoc, type Breakpoint, type WebDesignDoc } from './model';
import * as ops from './ops';
import { selectBaseScreen, selectScreen, useWebDesign } from './store';

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('geometry', () => {
  it('rotates, bounds and hit-tests rotated elements', () => {
    expect(rotateVec(1, 0, 90).y).toBeCloseTo(1);
    const el = { x: 0, y: 0, w: 100, h: 20, rotation: 90 };
    const b = aabb(el);
    expect(b.w).toBeCloseTo(20);
    expect(b.h).toBeCloseTo(100);
    expect(containsPoint(el, 50, -30)).toBe(true); // inside after rotation
    expect(containsPoint(el, 95, 10)).toBe(false); // was inside before rotation
    expect(angleFromCenter(0, 0, 0, -10)).toBeCloseTo(0);
    expect(angleFromCenter(0, 0, 10, 0)).toBeCloseTo(90);
  });

  it('resizes rotated rects keeping the opposite corner fixed', () => {
    const rect = { x: 0, y: 0, w: 100, h: 50 };
    const rot = 30;
    const corner = (r: typeof rect, sx: number, sy: number) => {
      const v = rotateVec((sx * r.w) / 2, (sy * r.h) / 2, rot);
      return { x: r.x + r.w / 2 + v.x, y: r.y + r.h / 2 + v.y };
    };
    const before = corner(rect, -1, -1); // nw stays fixed when dragging se
    const local = rotateVec(20, 10, rot);
    const r = resizeRotated(rect, rot, 'se', local.x, local.y);
    expect(r.w).toBeCloseTo(120);
    expect(r.h).toBeCloseTo(60);
    const after = corner(r, -1, -1);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('constraint resolution matches the exported CSS', () => {
    const W = 1000;
    const H = 600;
    for (const c of ['left', 'right', 'center', 'stretch', 'scale'] as const) {
      const el = createElement('frame', 100, 50, { w: 200, h: 100, constraintH: c });
      const W2 = 900;
      const r = resolveConstraintBox(el, W, H, W2, H);
      const css = boxCss(el, { width: W, height: H });
      // Evaluate the CSS at W2 px wide.
      const evalLen = (v: string | undefined) => {
        if (!v) return undefined;
        const calc = /calc\(50% \+ (-?[\d.]+)px\)/.exec(v);
        if (calc) return W2 / 2 + Number(calc[1]);
        if (v.endsWith('%')) return (Number(v.slice(0, -1)) / 100) * W2;
        return Number(v.replace('px', ''));
      };
      const left = evalLen(css.left) ?? W2 - evalLen(css.right)! - (evalLen(css.width) ?? 0);
      const width = evalLen(css.width) ?? W2 - left - evalLen(css.right)!;
      expect(close(left, r.x) && close(width, r.w)).toBe(true);
    }
  });
});

const bps: Breakpoint[] = [
  { id: 'tab', name: 'Tablet', mode: 'max', width: 1023, previewWidth: 800 },
  { id: 'mob', name: 'Celular', mode: 'max', width: 639, previewWidth: 400 },
  { id: 'xl', name: 'XL', mode: 'min', width: 1600, previewWidth: 1800 },
];

describe('breakpoints', () => {
  it('orders and matches breakpoints like CSS', () => {
    expect(cascadeOrder(bps).map((b) => b.id)).toEqual(['tab', 'mob', 'xl']);
    expect(matchingBreakpoints(bps, 500).map((b) => b.id)).toEqual(['tab', 'mob']);
    expect(matchingBreakpoints(bps, 1200)).toEqual([]);
    expect(matchingBreakpoints(bps, 1700).map((b) => b.id)).toEqual(['xl']);
  });

  it('projects, writes overrides back and clears them', () => {
    const doc = createEmptyDoc(1200, 800);
    const el = createElement('button', 1000, 100, { w: 100, h: 40, constraintH: 'right' });
    const base = ops.addElements(doc.screens[0], [el]);
    const view = projectScreen(base, bps, 'mob');
    expect(view.width).toBe(400);
    expect(view.elements[0].x).toBe(200); // right constraint: 400 - (1200 - 1000)
    expect(projectScreen(base, bps, 'mob')).toBe(view); // memoised
    // Move + resize + hide font change at "mob".
    let edited = ops.translateElements(view, [el.id], -150, 0);
    edited = ops.updateElements(edited, [el.id], () => ({ style: { fontSize: 12 } as never }));
    const written = writeBack(base, edited, bps, 'mob');
    const w = written.elements[0];
    expect(w.x).toBe(1000); // base untouched
    expect(w.style.fontSize).toBe(16);
    expect(w.overrides?.mob).toMatchObject({ x: 50, y: 100, w: 100, h: 40, fontSize: 12 });
    // Effective layout at 400px uses the override; at 800px (tablet) the constraints.
    expect(effectiveElement(w, base, bps, 400)).toMatchObject({ x: 50 });
    expect(effectiveElement(w, base, bps, 800)).toMatchObject({ x: 600 });
    expect(effectiveElement(w, base, bps, 500).style.fontSize).toBe(12);
    // Clearing goes back to constraints.
    const cleared = { ...w, ...clearOverrides(w, 'mob') };
    expect(cleared.overrides).toBeUndefined();
    // Non-geometric edits at a breakpoint apply to the base element.
    const recolored = writeBack(written, ops.updateElements(projectScreen(written, bps, 'mob'), [el.id], () => ({ style: { fill: '#ff0000' } as never })), bps, 'mob');
    expect(recolored.elements[0].style.fill).toBe('#ff0000');
    expect(recolored.elements[0].overrides?.mob?.x).toBe(50);
  });

  it('visibility override', () => {
    const doc = createEmptyDoc(1200, 800);
    const el = createElement('text', 10, 10);
    const base = ops.addElements(doc.screens[0], [el]);
    const hidden = writeBack(base, ops.updateElements(projectScreen(base, bps, 'mob'), [el.id], () => ({ visible: false })), bps, 'mob');
    expect(hidden.elements[0].visible).toBe(true);
    expect(hidden.elements[0].overrides?.mob).toEqual({ visible: false });
    expect(effectiveElement(hidden.elements[0], base, bps, 390).visible).toBe(false);
  });
});

describe('components', () => {
  function docWithTwo(): { doc: WebDesignDoc; a: string; b: string } {
    const doc = createEmptyDoc();
    const a = createElement('frame', 100, 100, { w: 200, h: 50 });
    const b = createElement('text', 110, 110, { w: 100, h: 20, text: 'Olá' });
    doc.screens[0].elements.push(a, b);
    return { doc, a: a.id, b: b.id };
  }

  it('creates a component from a selection and replaces it by an instance', () => {
    const { doc, a, b } = docWithTwo();
    const r = ops.createComponentFromSelection(doc, doc.screens[0].id, [a, b], 'Botão');
    expect(r.doc.components).toHaveLength(1);
    const comp = r.doc.components[0];
    expect(comp).toMatchObject({ name: 'Botão', width: 200, height: 50 });
    expect(comp.elements.map((e) => [e.x, e.y])).toEqual([[0, 0], [10, 10]]);
    const els = r.doc.screens[0].elements;
    expect(els).toHaveLength(1);
    expect(els[0]).toMatchObject({ type: 'instance', componentId: comp.id, x: 100, y: 100, w: 200, h: 50 });
  });

  it('prevents cycles and detaches instances with overrides', () => {
    const { doc, a, b } = docWithTwo();
    const r = ops.createComponentFromSelection(doc, doc.screens[0].id, [a, b]);
    const compId = r.componentId!;
    expect(ops.canInsertInstance(r.doc, compId, compId)).toBe(false);
    expect(ops.insertInstance(r.doc, compId, compId, 0, 0).instanceId).toBeUndefined();
    const textId = r.doc.components[0].elements[1].id;
    let d = ops.updateScreen(r.doc, r.doc.screens[0].id, (s) => ops.updateElements(s, [r.instanceId!], () => ({ textOverrides: { [textId]: 'Tchau' }, w: 400 })));
    const det = ops.detachInstance(d, d.screens[0].id, r.instanceId!);
    d = det.doc;
    const s = d.screens[0];
    expect(s.elements.some((e) => e.type === 'instance')).toBe(false);
    expect(s.elements.find((e) => e.type === 'text')?.text).toBe('Tchau');
    expect(s.elements.find((e) => e.type === 'group')).toBeDefined();
  });

  it('deleting a component keeps its instances as plain elements', () => {
    const { doc, a, b } = docWithTwo();
    const r = ops.createComponentFromSelection(doc, doc.screens[0].id, [a, b]);
    const d = ops.deleteComponent(r.doc, r.componentId!);
    expect(d.components).toHaveLength(0);
    expect(d.screens[0].elements.filter((e) => e.type !== 'group')).toHaveLength(2);
  });

  it('normalizes new fields and drops instances of missing components', () => {
    const d = normalizeDoc({
      screens: [{ id: 's', elements: [{ id: 'i', type: 'instance', componentId: 'nope' }, { id: 't', type: 'text', rotation: 'x' }] }],
    });
    expect(d.screens[0].elements.map((e) => e.id)).toEqual(['t']);
    expect(d.screens[0].elements[0]).toMatchObject({ rotation: 0, pressed: null, focus: null, disabled: false });
    expect(d.components).toEqual([]);
    expect(d.breakpoints.length).toBeGreaterThan(0);
  });
});

describe('component assets', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('publishes to the library and inserts into another document', async () => {
    const doc = createEmptyDoc();
    doc.screens[0].elements.push(createElement('button', 0, 0), createElement('icon', 150, 0, { iconName: 'House' }));
    const r = ops.createComponentFromSelection(doc, doc.screens[0].id, doc.screens[0].elements.map((e) => e.id), 'Barra');
    const res = await publishComponent(r.doc, r.componentId!, null);
    expect(res?.status).toBe('created');
    if (!res || res.status === 'error') return;
    expect(res.asset).toMatchObject({ kind: 'component', category: 'components', ext: 'omnicomp' });
    const read = await readComponentAsset(res.asset.id);
    expect(read?.rootId).toBe(r.componentId);
    const other = mergeComponents(createEmptyDoc(), read!.components);
    expect(other.components[0].elements).toHaveLength(2);
    expect(mergeComponents(other, read!.components)).toBe(other); // no duplicates
  });
});

describe('store with breakpoints', () => {
  beforeEach(async () => {
    await useWebDesign.getState().unload();
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('edits at a breakpoint become overrides; base stays intact', async () => {
    const p = await createProject({ name: 'bp', category: 'web' });
    const st = useWebDesign.getState();
    await st.load(p.id);
    const el = createElement('frame', 100, 100);
    st.applyScreen((s) => ops.addElements(s, [el]));
    const bp = useWebDesign.getState().history.present.breakpoints[0];
    st.setActiveBreakpoint(bp.id);
    expect(selectScreen(useWebDesign.getState()).width).toBe(bp.previewWidth);
    st.applyScreen((s) => ops.translateElements(s, [el.id], 10, 0));
    const base = selectBaseScreen(useWebDesign.getState()).elements[0];
    expect(base.x).toBe(100);
    expect(base.overrides?.[bp.id]?.x).toBe(110);
    st.undo();
    expect(selectBaseScreen(useWebDesign.getState()).elements[0].overrides).toBeUndefined();
    st.setActiveBreakpoint(null);
    expect(selectScreen(useWebDesign.getState()).width).toBe(1280);
  });
});
