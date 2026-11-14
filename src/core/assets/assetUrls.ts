import { useEffect, useState } from 'react';
import { getAssetBlob } from './assetService';
import { parseAssetUri } from './types';

/** Object-URL cache for library assets (one URL per asset, revoked when the asset is deleted). */
const cache = new Map<string, Promise<string | null>>();

export function getAssetObjectUrl(id: string): Promise<string | null> {
  let p = cache.get(id);
  if (!p) {
    p = getAssetBlob(id).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null);
    cache.set(id, p);
    // Do not cache misses: the asset may be imported later.
    void p.then((u) => u === null && cache.delete(id));
  }
  return p;
}

export function revokeAssetUrls(ids: string[]): void {
  for (const id of ids) {
    const p = cache.get(id);
    cache.delete(id);
    void p?.then((u) => u && URL.revokeObjectURL(u));
  }
}

/**
 * Resolve an image source that may be an "asset:<id>" reference.
 * Returns: the URL to display, plus `missing` when the asset is not in the library.
 */
export function useResolvedSrc(src: string | undefined): { url: string; missing: boolean } {
  const id = parseAssetUri(src);
  const [state, setState] = useState<{ id: string | null; url: string | null }>({ id: null, url: null });
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void getAssetObjectUrl(id).then((url) => alive && setState({ id, url }));
    return () => {
      alive = false;
    };
  }, [id]);
  if (!id) return { url: src ?? '', missing: false };
  if (state.id !== id) return { url: '', missing: false };
  return { url: state.url ?? '', missing: !state.url };
}

const loadedFonts = new Map<string, Promise<string | null>>();

/** Register a font asset with the document and return its CSS family name. */
export function ensureAssetFont(id: string): Promise<string | null> {
  let p = loadedFonts.get(id);
  if (!p) {
    const family = `omni-font-${id}`;
    p = getAssetObjectUrl(id).then(async (url) => {
      if (!url || typeof FontFace === 'undefined') return null;
      try {
        const face = new FontFace(family, `url(${url})`);
        await face.load();
        document.fonts.add(face);
        return family;
      } catch {
        return null;
      }
    });
    loadedFonts.set(id, p);
  }
  return p;
}
