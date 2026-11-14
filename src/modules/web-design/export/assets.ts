import { buildAssetPackage } from '@/core/assets/assetService';
import { parseAssetUri } from '@/core/assets/types';
import { docFontAssetIds, FONT_FORMATS } from '../fonts';
import type { WDScreen, WebDesignDoc } from '../model';

const frames = (doc: WebDesignDoc): WDScreen[] => [...doc.screens, ...doc.components];

/** Library asset ids referenced by image elements and font families (screens and components). */
export function docAssetIds(doc: WebDesignDoc): string[] {
  const ids = new Set<string>(docFontAssetIds(doc));
  for (const s of frames(doc)) for (const e of s.elements) {
    const id = parseAssetUri(e.src);
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Copy of the doc with "asset:<id>" image sources replaced by real URLs/paths. */
export function withAssetUrls(doc: WebDesignDoc, urlFor: (id: string) => string | undefined): WebDesignDoc {
  const map = (s: WDScreen): WDScreen => ({
    ...s,
    elements: s.elements.map((e) => {
      const id = parseAssetUri(e.src);
      return id ? { ...e, src: urlFor(id) ?? '' } : e;
    }),
  });
  return { ...doc, screens: doc.screens.map(map), components: doc.components.map(map) };
}

export interface ExportAssets {
  /** Binary files to add to the export, keyed by path inside the project. */
  files: Record<string, Uint8Array>;
  /** Asset id -> path relative to the project root (e.g. "assets/logo-abc.png"). */
  paths: Map<string, string>;
  /** Asset id -> font format, for library fonts. */
  fontFormats: Map<string, string>;
  missing: string[];
}

export async function collectExportAssets(doc: WebDesignDoc, dir: string): Promise<ExportAssets> {
  const { files, manifest, missing } = await buildAssetPackage(docAssetIds(doc), dir);
  const fontFormats = new Map(manifest.filter((m) => m.kind === 'font').map((m) => [m.id, FONT_FORMATS[m.ext] ?? 'truetype']));
  return { files, paths: new Map(manifest.map((m) => [m.id, m.file])), fontFormats, missing };
}
