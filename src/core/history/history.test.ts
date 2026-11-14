import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, commit, createHistory, redo, replace, undo } from './history';

describe('history', () => {
  it('commits, undoes and redoes', () => {
    let h = createHistory(1);
    h = commit(h, 2);
    h = commit(h, 3);
    expect(h.present).toBe(3);
    h = undo(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toBe(3);
    h = undo(undo(h));
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);
  });

  it('new commit clears the redo stack', () => {
    let h = commit(commit(createHistory('a'), 'b'), 'c');
    h = undo(h);
    h = commit(h, 'd');
    expect(h.future).toEqual([]);
    expect(h.past).toEqual(['a', 'b']);
  });

  it('records a gesture as a single step using an explicit base', () => {
    let h = createHistory({ x: 0 });
    const base = h.present;
    h = replace(h, { x: 5 });
    h = replace(h, { x: 10 });
    h = commit(h, h.present, base);
    expect(h.past).toEqual([{ x: 0 }]);
    expect(undo(h).present).toEqual({ x: 0 });
  });

  it('respects the limit', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 10; i++) h = commit(h, i, h.present, 3);
    expect(h.past).toEqual([7, 8, 9]);
  });
});
