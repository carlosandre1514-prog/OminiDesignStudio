import * as THREE from 'three';

/**
 * Offline still renderer: renders the live scene at any resolution (up to 8K and beyond) by tiling
 * the camera frustum (camera.setViewOffset) into GPU-sized tiles and stitching them on a 2D canvas.
 * Works on phones too (tiles stay small); only the final 2D canvas must fit in memory.
 */
export interface RenderBridge {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  setFrameloop: (f: 'always' | 'demand' | 'never') => void;
  /** Re-frame the weapon for a given aspect; returns a restore function. */
  frameFor?: (aspect: number) => () => void;
}

export const bridge: { current: RenderBridge | null } = { current: null };

export const RESOLUTIONS = {
  hd: { label: 'Full HD', long: 1920 },
  '4k': { label: '4K', long: 3840 },
  '8k': { label: '8K', long: 7680 },
} as const;
export type Resolution = keyof typeof RESOLUTIONS;
export const ASPECTS = { '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '9:16': 9 / 16 } as const;
export type Aspect = keyof typeof ASPECTS;

export function renderSize(res: Resolution, aspect: Aspect): { width: number; height: number } {
  const a = ASPECTS[aspect];
  const long = RESOLUTIONS[res].long;
  return a >= 1 ? { width: long, height: Math.round(long / a) } : { width: Math.round(long * a), height: long };
}

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

export async function renderStill(opts: { width: number; height: number; vignette?: number; reframe?: boolean; onProgress?: (p: number) => void }): Promise<HTMLCanvasElement> {
  const b = bridge.current;
  if (!b) throw new Error('Visualizador indisponível');
  const { gl, scene, camera } = b;
  const { width, height } = opts;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Sem memória para uma imagem deste tamanho; tente uma resolução menor.');
  const maxTile = Math.min(2048, gl.capabilities.maxTextureSize);
  const nx = Math.ceil(width / maxTile);
  const ny = Math.ceil(height / maxTile);
  const tw = Math.ceil(width / nx);
  const th = Math.ceil(height / ny);
  const prevSize = gl.getSize(new THREE.Vector2());
  const prevRatio = gl.getPixelRatio();
  const prevAspect = camera.aspect;
  b.setFrameloop('never');
  const restoreFrame = opts.reframe && b.frameFor ? b.frameFor(width / height) : null;
  try {
    gl.setPixelRatio(1);
    gl.setSize(tw, th, false);
    camera.aspect = width / height;
    for (let iy = 0; iy < ny; iy++)
      for (let ix = 0; ix < nx; ix++) {
        const x = ix * tw;
        const y = iy * th;
        const w = Math.min(tw, width - x);
        const h = Math.min(th, height - y);
        camera.setViewOffset(width, height, x, y, tw, th);
        camera.updateProjectionMatrix();
        gl.render(scene, camera);
        ctx.drawImage(gl.domElement, 0, 0, w, h, x, y, w, h);
        opts.onProgress?.((iy * nx + ix + 1) / (nx * ny));
        await nextFrame();
      }
  } finally {
    camera.clearViewOffset();
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    restoreFrame?.();
    gl.setPixelRatio(prevRatio);
    gl.setSize(prevSize.x, prevSize.y, false);
    b.setFrameloop('always');
  }
  if (opts.vignette) {
    const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.hypot(width, height) * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${opts.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
  return out;
}

export function canvasToBlob(c: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality = 0.93): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao codificar a imagem'))), type, quality));
}
