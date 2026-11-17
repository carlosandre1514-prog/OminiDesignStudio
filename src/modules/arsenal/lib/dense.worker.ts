/// <reference lib="webworker" />
import type * as P from '@/modules/studio-3d/mesh/polyMesh';
import { denseGeometry } from './dense';

/** Builds high-poly geometry off the main thread (millions of triangles without freezing the UI). */
self.onmessage = (e: MessageEvent<{ id: number; meshes: P.PolyMesh[]; levels: number }>) => {
  const { id, meshes, levels } = e.data;
  const out = [];
  const transfer: ArrayBuffer[] = [];
  for (let i = 0; i < meshes.length; i++) {
    const g = denseGeometry(meshes[i], levels);
    out.push(g);
    transfer.push(g.position.buffer as ArrayBuffer, g.normal.buffer as ArrayBuffer, g.uv.buffer as ArrayBuffer, g.curv.buffer as ArrayBuffer, g.index.buffer as ArrayBuffer);
    (self as DedicatedWorkerGlobalScope).postMessage({ id, progress: (i + 1) / meshes.length });
  }
  (self as DedicatedWorkerGlobalScope).postMessage({ id, geos: out }, transfer);
};
