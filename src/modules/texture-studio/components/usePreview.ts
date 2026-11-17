import { useEffect, useRef } from 'react';
import { render } from '../engine/runner';
import { selectDoc, useTextures } from '../store';

/**
 * Keeps `preview` up to date: evaluates the stack in the worker at preview resolution.
 * Only one evaluation runs at a time; changes made meanwhile trigger exactly one more run.
 */
export function usePreview() {
  const doc = useTextures(selectDoc);
  const tick = useTextures((s) => s.paintTick);
  const size = useTextures((s) => s.previewSize);
  const busy = useRef(false);
  const again = useRef(false);
  const latest = useRef({ doc, size });
  latest.current = { doc, size };

  useEffect(() => {
    const run = async () => {
      if (busy.current) {
        again.current = true;
        return;
      }
      busy.current = true;
      useTextures.getState().set({ evaluating: true });
      try {
        do {
          again.current = false;
          const { doc: d, size: s } = latest.current;
          const maps = await render(d, s);
          if (!again.current) useTextures.getState().set({ preview: maps });
        } while (again.current);
      } catch {
        /* keep the previous preview */
      } finally {
        busy.current = false;
        useTextures.getState().set({ evaluating: false });
      }
    };
    const t = setTimeout(run, 60);
    return () => clearTimeout(t);
  }, [doc, tick, size]);
}
