import { buildAssetPackage } from '@/core/assets/assetService';
import { parseAssetUri } from '@/core/assets/types';
import type { WebDesignDoc } from '../model';

/** Library asset ids referenced by image elements. */
export function docAssetIds(doc: WebDesignDoc): string[] {
  const ids = new Set<string>();
  for (const s of doc.screens) for (const e of s.elements) {
    const id = parseAssetUri(e.src);
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Copy of the doc with "asset:<id>" sources replaced by real URLs/paths. */
export function withAssetUrls(doc: WebDesignDoc, urlFor: (id: string) => string | undefined): WebDesignDoc {
  return {
    ...doc,
    screens: doc.screens.map((s) => ({
      ...s,
      elements: s.elements.map((e) => {
        const id = parseAssetUri(e.src);
        return id ? { ...e, src: urlFor(id) ?? '' } : e;
      }),
    })),
  };
}

export interface ExportAssets {
  /** Binary files to add to the export, keyed by path inside the project. */
  files: Record<string, Uint8Array>;
  /** Asset id -> path relative to the project root (e.g. "assets/logo-abc.png"). */
  paths: Map<string, string>;
  missing: string[];
}

export async function collectExportAssets(doc: WebDesignDoc, dir: string): Promise<ExportAssets> {
  const { files, manifest, missing } = await buildAssetPackage(docAssetIds(doc), dir);
  return { files, paths: new Map(manifest.map((m) => [m.id, m.file])), missing };
}
