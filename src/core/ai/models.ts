/**
 * Open AI models that run on the user's device (no server, no API key).
 * Files are downloaded once from Hugging Face and kept in the browser cache for offline use.
 */
export interface AiModel {
  id: 'segment' | 'depth';
  label: string;
  /** what it is used for, shown in the UI */
  purpose: string;
  license: string;
  /** model file for WebGPU and for the WASM (CPU) fallback */
  urlGpu: string;
  urlCpu: string;
  sizeGpuMB: number;
  sizeCpuMB: number;
}

const HF = 'https://huggingface.co';

export const AI_MODELS: Record<AiModel['id'], AiModel> = {
  segment: {
    id: 'segment',
    label: 'U²-Netp',
    purpose: 'Recorta o objeto do fundo da foto',
    license: 'Apache-2.0',
    urlGpu: `${HF}/BritishWerewolf/U-2-Netp/resolve/main/onnx/model.onnx`,
    urlCpu: `${HF}/BritishWerewolf/U-2-Netp/resolve/main/onnx/model.onnx`,
    sizeGpuMB: 4.6,
    sizeCpuMB: 4.6,
  },
  depth: {
    id: 'depth',
    label: 'Depth Anything V2 (small)',
    purpose: 'Estima a profundidade (relevo 3D) de cada pixel',
    license: 'Apache-2.0',
    urlGpu: `${HF}/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_fp16.onnx`,
    urlCpu: `${HF}/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx`,
    sizeGpuMB: 49.6,
    sizeCpuMB: 27.3,
  },
};

/** Total download for a device class. */
export const downloadSizeMB = (gpu: boolean) => Object.values(AI_MODELS).reduce((s, m) => s + (gpu ? m.sizeGpuMB : m.sizeCpuMB), 0);
