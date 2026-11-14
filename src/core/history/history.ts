/**
 * Immutable snapshot based undo/redo stack.
 * Each module keeps its document as an immutable value; `push` records the
 * previous value before a change is committed.
 */
export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export const DEFAULT_HISTORY_LIMIT = 200;

export function createHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [] };
}

/** Commit `next` as the new present. `base` (default: current present) is what undo returns to. */
export function commit<T>(h: HistoryState<T>, next: T, base: T = h.present, limit = DEFAULT_HISTORY_LIMIT): HistoryState<T> {
  if (Object.is(next, base)) return { ...h, present: next };
  const past = [...h.past, base];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, present: next, future: [] };
}

/** Replace the present without recording (used for live drags; commit at the end). */
export function replace<T>(h: HistoryState<T>, next: T): HistoryState<T> {
  return { ...h, present: next };
}

export function undo<T>(h: HistoryState<T>): HistoryState<T> {
  if (!h.past.length) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo<T>(h: HistoryState<T>): HistoryState<T> {
  if (!h.future.length) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest };
}

export const canUndo = <T>(h: HistoryState<T>) => h.past.length > 0;
export const canRedo = <T>(h: HistoryState<T>) => h.future.length > 0;
