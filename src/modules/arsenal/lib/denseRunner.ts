import type * as P from '@/modules/studio-3d/mesh/polyMesh';
import { denseGeometry, type DenseGeo } from './dense';

let worker: Worker | null = null;
let seq = 0;

/** Subdivide meshes in a worker (falls back to the main thread). Latest request wins. */
export function buildDense(meshes: P.PolyMesh[], levels: number, onProgress?: (p: number) => void): Promise<DenseGeo[]> {
  if (typeof Worker === 'undefined') return Promise.resolve(meshes.map((m) => denseGeometry(m, levels)));
  if (!worker) worker = new Worker(new URL('./dense.worker.ts', import.meta.url), { type: 'module' });
  const id = ++seq;
  const w = worker;
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<{ id: number; geos?: DenseGeo[]; progress?: number }>) => {
      if (e.data.id !== id) return;
      if (e.data.geos) {
        w.removeEventListener('message', onMsg);
        resolve(e.data.geos);
      } else if (e.data.progress !== undefined) onProgress?.(e.data.progress);
    };
    w.addEventListener('message', onMsg);
    w.onerror = (err) => reject(new Error(err.message || 'Falha ao gerar a malha de alta resolução'));
    w.postMessage({ id, meshes: meshes.map((m) => ({ v: m.v, f: m.f })), levels });
  });
}
