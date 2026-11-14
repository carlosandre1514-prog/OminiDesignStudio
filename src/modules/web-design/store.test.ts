import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/database';
import { createProject, getDocument } from '@/core/projects/projectService';
import { createElement } from './model';
import * as ops from './ops';
import { copySelection, pasteClipboard, selectScreen, useWebDesign, MODULE_ID } from './store';

beforeEach(async () => {
  await useWebDesign.getState().unload();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('web design store', () => {
  it('initialises a document for a new project and persists it', async () => {
    const p = await createProject({ name: 'x', category: 'web' });
    await useWebDesign.getState().load(p.id);
    const doc = await getDocument(p.id);
    expect(doc?.modules[MODULE_ID]).toBeDefined();
    expect(useWebDesign.getState().history.present.screens).toHaveLength(1);
  });

  it('records edits, undo/redo and saves to IndexedDB', async () => {
    const p = await createProject({ name: 'x', category: 'web' });
    const st = useWebDesign.getState();
    await st.load(p.id);
    const el = createElement('button', 10, 10);
    st.applyScreen((s) => ops.addElements(s, [el]));
    expect(selectScreen(useWebDesign.getState()).elements).toHaveLength(1);
    st.undo();
    expect(selectScreen(useWebDesign.getState()).elements).toHaveLength(0);
    st.redo();
    await useWebDesign.getState().saveNow();
    const saved = (await getDocument(p.id))!.modules[MODULE_ID] as { screens: { elements: unknown[] }[] };
    expect(saved.screens[0].elements).toHaveLength(1);
    expect(useWebDesign.getState().saveStatus).toBe('saved');
  });

  it('collapses a live gesture into one undo step', async () => {
    const p = await createProject({ name: 'x', category: 'web' });
    const st = useWebDesign.getState();
    await st.load(p.id);
    const el = createElement('frame', 0, 0);
    st.applyScreen((s) => ops.addElements(s, [el]));
    const before = useWebDesign.getState().history.past.length;
    for (let i = 1; i <= 5; i++) st.live((s) => ops.translateElements(s, [el.id], 1, 0));
    st.endGesture();
    const h = useWebDesign.getState().history;
    expect(h.past.length).toBe(before + 1);
    expect(selectScreen(useWebDesign.getState()).elements[0].x).toBe(5);
    st.undo();
    expect(selectScreen(useWebDesign.getState()).elements[0].x).toBe(0);
  });

  it('copies and pastes elements with new ids', async () => {
    const p = await createProject({ name: 'x', category: 'web' });
    const st = useWebDesign.getState();
    await st.load(p.id);
    const el = createElement('card', 0, 0);
    st.applyScreen((s) => ops.addElements(s, [el]));
    st.select([el.id]);
    expect(copySelection()).toBe(1);
    pasteClipboard();
    const els = selectScreen(useWebDesign.getState()).elements;
    expect(els).toHaveLength(2);
    expect(els[1].id).not.toBe(el.id);
    expect(els[1].x).toBe(16);
    expect(useWebDesign.getState().selection).toEqual([els[1].id]);
  });

  it('reloads saved work after a restart (crash recovery)', async () => {
    const p = await createProject({ name: 'x', category: 'web' });
    let st = useWebDesign.getState();
    await st.load(p.id);
    st.applyScreen((s) => ops.addElements(s, [createElement('text', 5, 5, { text: 'persistido' })]));
    await useWebDesign.getState().unload(); // flushes pending autosave
    await new Promise((r) => setTimeout(r, 20));
    st = useWebDesign.getState();
    await st.load(p.id);
    expect(selectScreen(useWebDesign.getState()).elements[0].text).toBe('persistido');
  });
});
