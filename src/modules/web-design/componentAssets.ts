import { getAssetBytes, importAssetBytes, type ImportResult } from '@/core/assets/assetService';
import { slugify } from '@/core/utils/sanitize';
import { normalizeDoc, type WDComponent, type WebDesignDoc } from './model';
import { componentDependsOn } from './ops';
import { renderScreenThumbnail } from './thumbnail';

export interface ComponentFile {
  format: 'omnidesign-component';
  version: 1;
  component: WDComponent;
  /** Other components used by nested instances. */
  dependencies: WDComponent[];
}

export function buildComponentFile(doc: WebDesignDoc, compId: string): ComponentFile | null {
  const component = doc.components.find((c) => c.id === compId);
  if (!component) return null;
  const dependencies = doc.components.filter((c) => c.id !== compId && componentDependsOn(doc, compId, c.id));
  return { format: 'omnidesign-component', version: 1, component, dependencies };
}

/** Save a component master to the Asset Library (linked to the project). */
export async function publishComponent(doc: WebDesignDoc, compId: string, projectId: string | null): Promise<ImportResult | null> {
  const file = buildComponentFile(doc, compId);
  if (!file) return null;
  const bytes = new TextEncoder().encode(JSON.stringify(file));
  return importAssetBytes(`${slugify(file.component.name, 'componente')}.omnicomp`, bytes.buffer as ArrayBuffer, {
    name: file.component.name,
    projectId,
    thumbnail: renderScreenThumbnail(file.component),
  });
}

/** Read a component asset; returns the masters to add (root first) after validation/normalisation. */
export async function readComponentAsset(assetId: string): Promise<{ rootId: string; components: WDComponent[] } | null> {
  const data = await getAssetBytes(assetId);
  if (!data) return null;
  let parsed: ComponentFile;
  try {
    parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(data)));
  } catch {
    return null;
  }
  if (parsed?.format !== 'omnidesign-component' || !parsed.component) return null;
  const all = normalizeDoc({ screens: [], components: [parsed.component, ...(Array.isArray(parsed.dependencies) ? parsed.dependencies : [])] }).components;
  if (!all.some((c) => c.id === parsed.component.id)) return null;
  return { rootId: parsed.component.id, components: all };
}

/** Add component masters that the document doesn't have yet (existing ids are reused as-is). */
export function mergeComponents(doc: WebDesignDoc, comps: WDComponent[]): WebDesignDoc {
  const have = new Set(doc.components.map((c) => c.id));
  const add = comps.filter((c) => !have.has(c.id));
  return add.length ? { ...doc, components: [...doc.components, ...add] } : doc;
}
