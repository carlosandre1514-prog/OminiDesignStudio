import type { WebDesignDoc } from './model';

export const FONT_FAMILY_PREFIX = 'omni-font-';

/** CSS font-family value for a library font asset. */
export const fontFamilyForAsset = (assetId: string) => `'${FONT_FAMILY_PREFIX}${assetId}', system-ui, sans-serif`;

export function fontAssetId(family: string | undefined): string | null {
  const m = family ? /omni-font-([A-Za-z0-9_-]+)/.exec(family) : null;
  return m ? m[1] : null;
}

/** Library fonts used anywhere in the document (screens and components). */
export function docFontAssetIds(doc: WebDesignDoc): string[] {
  const ids = new Set<string>();
  for (const f of [...doc.screens, ...doc.components]) for (const e of f.elements) {
    const id = fontAssetId(e.style.fontFamily);
    if (id) ids.add(id);
  }
  return [...ids];
}

export const FONT_FORMATS: Record<string, string> = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' };
