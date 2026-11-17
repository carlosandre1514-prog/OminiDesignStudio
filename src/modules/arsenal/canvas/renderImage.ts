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
  frameFor?: (aspect: number, dir?: [number, number, number]) => () => void;
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

export async function renderStill(opts: { width: number; height: number; vignette?: number; reframe?: boolean; dir?: [number, number, number]; onProgress?: (p: number) => void }): Promise<HTMLCanvasElement> {
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
  const restoreFrame = opts.reframe && b.frameFor ? b.frameFor(width / height, opts.dir) : null;
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

/** The six views of a design reference sheet (camera direction from the weapon's centre). */
export const SHEET_VIEWS: { label: string; dir: [number, number, number] }[] = [
  { label: 'RIGHT PROFILE', dir: [0, 0.0001, 1] },
  { label: 'LEFT PROFILE', dir: [0, 0.0001, -1] },
  { label: 'TOP VIEW', dir: [0, 1, 0.0001] },
  { label: 'BOTTOM VIEW', dir: [0, -1, 0.0001] },
  { label: 'FRONT VIEW', dir: [1, 0.0001, 0.0001] },
  { label: 'REAR VIEW', dir: [-1, 0.0001, 0.0001] },
];

/**
 * Design reference sheet: the weapon from all six sides in a 3 × 2 grid with labels and a title,
 * like the orthographic sheets used to model weapons. The floor and shadows are hidden.
 */
export async function renderSheet(opts: { width: number; title: string; onProgress?: (p: number) => void }): Promise<HTMLCanvasElement> {
  const b = bridge.current;
  if (!b) throw new Error('Visualizador indisponível');
  const { exportRoot } = await import('./WeaponModel');
  const W = opts.width;
  const head = Math.round(W * 0.04);
  const gap = Math.max(4, Math.round(W * 0.004));
  const pw = Math.floor((W - gap * 4) / 3);
  const ph = Math.round(pw * 0.62);
  const H = head + gap * 3 + ph * 2;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Sem memória para uma imagem deste tamanho; tente uma resolução menor.');
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f2f2f2';
  ctx.font = `600 ${Math.round(head * 0.55)}px "Oswald", "Arial Narrow", Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.title, gap * 2, head / 2 + gap / 2);
  // hide everything that is not the weapon (floor, contact shadows, helpers)
  const hidden: THREE.Object3D[] = [];
  const root = exportRoot.current;
  b.scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh || !o.visible) return;
    let p: THREE.Object3D | null = o;
    while (p && p !== root) p = p.parent;
    if (!p) {
      o.visible = false;
      hidden.push(o);
    }
  });
  try {
    for (let i = 0; i < SHEET_VIEWS.length; i++) {
      const v = SHEET_VIEWS[i];
      const tile = await renderStill({ width: pw, height: ph, reframe: true, dir: v.dir, onProgress: (p) => opts.onProgress?.((i + p) / SHEET_VIEWS.length) });
      const x = gap + (i % 3) * (pw + gap);
      const y = head + gap + Math.floor(i / 3) * (ph + gap);
      ctx.drawImage(tile, x, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = Math.max(1, Math.round(W / 1600));
      ctx.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);
      // label tag (dark, slanted end)
      const fs = Math.round(pw * 0.028);
      ctx.font = `600 ${fs}px "Oswald", "Arial Narrow", Arial, sans-serif`;
      const tw = ctx.measureText(v.label).width + fs * 1.2;
      const th = fs * 1.8;
      ctx.fillStyle = 'rgba(30,31,34,0.92)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + tw + th * 0.5, y);
      ctx.lineTo(x + tw, y + th);
      ctx.lineTo(x, y + th);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(v.label, x + fs * 0.6, y + th / 2);
    }
  } finally {
    for (const o of hidden) o.visible = true;
  }
  return out;
}
