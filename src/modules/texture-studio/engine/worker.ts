/// <reference lib="webworker" />
import { evaluate, type BitmapSet } from './compose';
import type { TextureDoc } from './types';

/** Evaluates texture stacks off the main thread so the UI stays fluid (phones included). */
self.onmessage = (e: MessageEvent<{ id: number; doc: TextureDoc; size: number; bitmaps: BitmapSet }>) => {
  const { id, doc, size, bitmaps } = e.data;
  try {
    const maps = evaluate(doc, size, bitmaps, (p) => (self as DedicatedWorkerGlobalScope).postMessage({ id, progress: p }));
    const transfer = [maps.baseColor, maps.roughness, maps.metallic, maps.normal, maps.height, maps.ao, maps.emissive, maps.orm].map((a) => a.buffer);
    (self as DedicatedWorkerGlobalScope).postMessage({ id, maps }, transfer);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
