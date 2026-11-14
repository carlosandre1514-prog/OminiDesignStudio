import type { AssetKind, AssetMeta } from './types';

const isTestDom = () => typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Extract metadata and a small thumbnail for a file, in the browser.
 * Never throws: failures just yield no thumbnail/metadata.
 */
export async function analyzeMedia(kind: AssetKind, blob: Blob, maxSize = 256): Promise<{ meta: AssetMeta; thumbnail?: string }> {
  if (isTestDom() || typeof document === 'undefined') return { meta: {} };
  const url = URL.createObjectURL(blob);
  try {
    if (kind === 'image' || kind === 'vector') {
      const img = await withTimeout(loadImage(url), 8000, null);
      if (!img) return { meta: {} };
      const w = img.naturalWidth || 256;
      const h = img.naturalHeight || 256;
      const scale = Math.min(1, maxSize / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return { meta: { width: w, height: h } };
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let thumbnail: string | undefined;
      try {
        thumbnail = canvas.toDataURL('image/webp', 0.82);
        if (!thumbnail.startsWith('data:image/webp')) thumbnail = canvas.toDataURL('image/png');
      } catch {
        thumbnail = undefined;
      }
      return { meta: { width: w, height: h }, thumbnail };
    }
    if (kind === 'audio') {
      const duration = await withTimeout(
        new Promise<number | undefined>((resolve) => {
          const a = new Audio();
          a.preload = 'metadata';
          a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : undefined);
          a.onerror = () => resolve(undefined);
          a.src = url;
        }),
        8000,
        undefined,
      );
      return { meta: duration ? { duration } : {} };
    }
    if (kind === 'model3d') {
      // Render a preview with the 3D engine (loaded on demand).
      const { renderModelThumbnail } = await import('@/modules/studio-3d/loaders');
      const ext = (blob as Blob & { ext?: string }).ext;
      const thumbnail = ext ? await withTimeout(renderModelThumbnail(await blob.arrayBuffer(), ext), 15000, undefined) : undefined;
      return { meta: {}, thumbnail };
    }
    return { meta: {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}
