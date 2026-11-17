import type * as OrtType from 'onnxruntime-web';
import { AI_MODELS, type AiModel } from './models';

/**
 * On-device inference with ONNX Runtime Web: WebGPU when available (fast, phones with modern browsers),
 * WebAssembly otherwise. The engine (~11–22 MB) and the models are only downloaded when AI is used.
 */

type Ort = typeof OrtType;
export type Backend = 'webgpu' | 'wasm';

export const hasWebGPU = () => typeof navigator !== 'undefined' && 'gpu' in navigator && !!(navigator as Navigator & { gpu?: unknown }).gpu;

let ortPromise: Promise<{ ort: Ort; backend: Backend }> | null = null;

async function loadOrt(): Promise<{ ort: Ort; backend: Backend }> {
  if (hasWebGPU()) {
    try {
      const [ort, mjs, wasm] = await Promise.all([
        import('onnxruntime-web/webgpu'),
        import('../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url'),
        import('../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url'),
      ]);
      ort.env.wasm.wasmPaths = { mjs: mjs.default, wasm: wasm.default };
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      // Make sure an adapter really exists (some browsers expose navigator.gpu without one).
      const adapter = await (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter();
      if (adapter) return { ort: ort as unknown as Ort, backend: 'webgpu' };
    } catch {
      /* fall back to WASM */
    }
  }
  const [ort, mjs, wasm] = await Promise.all([
    import('onnxruntime-web/wasm'),
    import('../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url'),
    import('../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'),
  ]);
  ort.env.wasm.wasmPaths = { mjs: mjs.default, wasm: wasm.default };
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  return { ort: ort as unknown as Ort, backend: 'wasm' };
}

export const getOrt = () => (ortPromise ??= loadOrt().catch((e) => {
  ortPromise = null;
  throw e;
}));

// ---------------------------------------------------------------- model files (Cache Storage)

const CACHE = 'omni-ai-models-v1';

export type Progress = (info: { model: string; loaded: number; total: number }) => void;

/** Download a model with progress, or read it from the offline cache. */
export async function fetchModel(url: string, label: string, onProgress?: Progress): Promise<Uint8Array> {
  const cache = typeof caches !== 'undefined' ? await caches.open(CACHE).catch(() => null) : null;
  const hit = await cache?.match(url);
  if (hit) {
    const buf = new Uint8Array(await hit.arrayBuffer());
    onProgress?.({ model: label, loaded: buf.byteLength, total: buf.byteLength });
    return buf;
  }
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Não foi possível baixar o modelo ${label} (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body?.getReader();
  let buf: Uint8Array;
  if (!reader) buf = new Uint8Array(await res.arrayBuffer());
  else {
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.({ model: label, loaded, total: total || loaded });
    }
    buf = new Uint8Array(loaded);
    let o = 0;
    for (const c of chunks) {
      buf.set(c, o);
      o += c.byteLength;
    }
  }
  await cache?.put(url, new Response(buf.slice().buffer, { headers: { 'content-type': 'application/octet-stream' } })).catch(() => undefined);
  return buf;
}

/** Is the model already in the offline cache? */
export async function isModelCached(id: AiModel['id']): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  const cache = await caches.open(CACHE).catch(() => null);
  const m = AI_MODELS[id];
  return !!(await cache?.match(hasWebGPU() ? m.urlGpu : m.urlCpu)) || !!(await cache?.match(m.urlCpu));
}

export async function clearModelCache() {
  if (typeof caches !== 'undefined') await caches.delete(CACHE);
  sessions.clear();
}

const sessions = new Map<string, Promise<OrtType.InferenceSession>>();

/** Inference session for a model (created once per page). */
export function getSession(id: AiModel['id'], onProgress?: Progress, forceCpu = false): Promise<OrtType.InferenceSession> {
  const key = `${id}|${forceCpu}`;
  let s = sessions.get(key);
  if (!s) {
    s = (async () => {
      const { ort, backend: b } = await getOrt();
      const backend: Backend = forceCpu ? 'wasm' : b;
      const m = AI_MODELS[id];
      const url = backend === 'webgpu' ? m.urlGpu : m.urlCpu;
      const bytes = await fetchModel(url, m.label, onProgress);
      try {
        return await ort.InferenceSession.create(bytes, { executionProviders: backend === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'], graphOptimizationLevel: 'all' });
      } catch (e) {
        if (backend !== 'webgpu') throw e;
        // fp16 model on a GPU without shader-f16: use the CPU model instead
        const cpu = await fetchModel(m.urlCpu, m.label, onProgress);
        return ort.InferenceSession.create(cpu, { executionProviders: ['wasm'] });
      }
    })();
    sessions.set(key, s);
    s.catch(() => sessions.delete(key));
  }
  return s;
}

/** Run a model; if the GPU (fp16) variant fails at run time, retry once with the CPU model. */
export async function runModel(id: AiModel['id'], feeds: (s: OrtType.InferenceSession) => Record<string, OrtType.Tensor>, onProgress?: Progress) {
  const session = await getSession(id, onProgress);
  try {
    return { session, out: await session.run(feeds(session)) };
  } catch (e) {
    const { backend } = await getOrt();
    if (backend !== 'webgpu') throw e;
    const cpu = await getSession(id, onProgress, true);
    return { session: cpu, out: await cpu.run(feeds(cpu)) };
  }
}
